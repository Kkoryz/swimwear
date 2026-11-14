import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { syncTemplateCore } from '../lib/template-core.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('a core sync brings the shared deploy files and the release workflow, and keeps the site\'s own Nginx config', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'core-sync-'));
  await mkdir(join(workspace, 'deploy/nginx'), { recursive: true });
  await writeFile(join(workspace, 'deploy/nginx/site.conf'), 'server {}');
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: () => {} });
  assert.equal(await readFile(join(workspace, 'deploy/nginx/site.conf'), 'utf8'), 'server {}', 'the workspace keeps its Nginx config');
  assert.ok(await stat(join(workspace, 'deploy/server/site-release.sh')));
  assert.ok(await stat(join(workspace, 'deploy/registry/schema.sql')));
  assert.equal(await readFile(join(workspace, '.github/workflows/release.yml'), 'utf8'), await readFile(join(repoRoot, 'deploy/github/release.yml'), 'utf8'));
});

test("a core sync brings the template's packages and installs them when they changed, not otherwise", async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'core-sync-packages-'));
  await writeFile(join(workspace, 'package.json'), '{"dependencies":{}}');
  const installed = [];
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: (root) => installed.push(root) });
  assert.equal(await readFile(join(workspace, 'package.json'), 'utf8'), await readFile(join(repoRoot, 'package.json'), 'utf8'));
  assert.deepEqual(installed, [workspace], 'a package the core imports was added: installed');
  await syncTemplateCore({ repoRoot, workspaceRoot: workspace, install: (root) => installed.push(root) });
  assert.equal(installed.length, 1, 'the same packages: no install');
});

test('a committed sync brings the files of the template commit, not edits another session has not committed yet', async () => {
  const { execFileSync } = await import('node:child_process');
  // A template repository with a committed core file, then an edit and a new file not committed.
  const template = await mkdtemp(join(tmpdir(), 'core-template-'));
  const git = (...args) => execFileSync('git', args, { cwd: template, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  await mkdir(join(template, 'scripts/lib'), { recursive: true });
  await writeFile(join(template, 'scripts/lib/rule.mjs'), 'export const rule = 1;\n');
  await writeFile(join(template, 'package.json'), '{"dependencies":{}}');
  git('add', '.');
  git('commit', '-q', '-m', 'core');
  const commit = git('rev-parse', 'HEAD').trim();
  await writeFile(join(template, 'scripts/lib/rule.mjs'), 'export const rule = 2; // half done\n');
  await writeFile(join(template, 'scripts/lib/new.mjs'), 'export const added = true;\n');
  // hotel-rm r10 and r17: the run synced another session's half-done edits.
  const workspace = await mkdtemp(join(tmpdir(), 'core-committed-'));
  // A checkout's line endings follow the machine's git settings (core.autocrlf), as the working tree's do.
  const text = async (path) => (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  const manifest = await syncTemplateCore({ repoRoot: template, workspaceRoot: workspace, install: () => {}, committed: true });
  assert.equal(await text(join(workspace, 'scripts/lib/rule.mjs')), 'export const rule = 1;\n');
  await assert.rejects(stat(join(workspace, 'scripts/lib/new.mjs')));
  assert.equal(manifest.commit, commit);
  assert.equal(manifest.from, 'commit');
  assert.deepEqual(manifest.uncommitted.sort(), ['scripts/lib/new.mjs', 'scripts/lib/rule.mjs']);
  // The repository's own index and working tree are as they were.
  assert.match(git('status', '--porcelain'), /M scripts\/lib\/rule\.mjs/);
  assert.equal(await readFile(join(template, 'scripts/lib/rule.mjs'), 'utf8'), 'export const rule = 2; // half done\n');
  // A sync by hand (iterating on a rule) still takes the working tree.
  const byHand = await syncTemplateCore({ repoRoot: template, workspaceRoot: workspace, install: () => {} });
  assert.equal(await text(join(workspace, 'scripts/lib/rule.mjs')), 'export const rule = 2; // half done\n');
  assert.equal(byHand.from, 'worktree');
});
