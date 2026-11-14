import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkspace } from '../create-workspace.mjs';

test('copies scaffold files, skips generated state, and binds the source URL', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'seo-site-workspace-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = join(sandbox, 'source');
  const destination = join(sandbox, 'output');
  await mkdir(join(source, 'src'), { recursive: true });
  await mkdir(join(source, 'node_modules'), { recursive: true });
  await mkdir(join(source, 'docs', 'superpowers'), { recursive: true });
  await writeFile(join(source, 'src', 'keep.txt'), 'keep');
  await writeFile(join(source, 'node_modules', 'skip.txt'), 'skip');
  await writeFile(join(source, 'docs', 'superpowers', 'skip.md'), 'skip');
  await writeFile(
    join(source, 'site-template.json'),
    JSON.stringify({ schemaVersion: 'seo-site-template-v1', sourceUrl: 'https://example.com/', route: '/', components: ['Hero'], islands: [] }),
  );

  await createWorkspace({ source, destination, sourceUrl: 'https://astro.build/' });

  assert.equal(await readFile(join(destination, 'src', 'keep.txt'), 'utf8'), 'keep');
  await assert.rejects(readFile(join(destination, 'node_modules', 'skip.txt')));
  await assert.rejects(readFile(join(destination, 'docs', 'superpowers', 'skip.md')));
  const manifest = JSON.parse(await readFile(join(destination, 'site-template.json'), 'utf8'));
  assert.equal(manifest.sourceUrl, 'https://astro.build/');
  // The new site starts with its own local repository and a first commit.
  const { spawnSync } = await import('node:child_process');
  assert.equal(spawnSync('git', ['log', '--format=%s'], { cwd: destination, encoding: 'utf8' }).stdout.trim(), 'site-run: first record of the site');
});

test('rejects invalid URLs and non-empty destinations', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'seo-site-workspace-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = join(sandbox, 'source');
  const destination = join(sandbox, 'output');
  await mkdir(source);
  await mkdir(destination);
  await writeFile(join(destination, 'occupied.txt'), 'occupied');

  await assert.rejects(createWorkspace({ source, destination, sourceUrl: 'invalid' }), /HTTP\(S\)/);
  await assert.rejects(createWorkspace({ source, destination, sourceUrl: 'https://example.com/' }), /empty/);
});
