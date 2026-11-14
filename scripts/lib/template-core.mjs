// The template core: code every workspace shares with this repository. A workspace owns only its data
// (src/data, docs/research, public), its tokens (src/styles/global.css) and its treatments (src/styles/reference.css).
// template-core.json in a workspace records which core it runs and the hash of every core file, so drift or a stale
// copy is detected instead of guessed.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { writeJson } from './json-io.mjs';

export const CORE_PATHS = Object.freeze([
  // The packages the core code imports: a sync that brings new ones installs them (syncTemplateCore).
  'package.json',
  'pnpm-lock.yaml',
  'astro.config.mjs',
  'scripts',
  'config',
  // Operations every site shares: the registry schema, the release workflow and the server release script
  // (deploy/nginx is the workspace's own, written by build:nginx-config).
  'deploy/registry',
  'deploy/github',
  'deploy/server',
  'src/components',
  'src/lib',
  'src/layouts',
  'src/pages',
  'src/styles/template.css',
  'src/styles/patterns.css',
  // The workflow the workspace follows (its tests check it).
  '.claude/skills/seo-site-template/SKILL.md',
  // The hooks a site's treatment may style (the agent steps read it).
  'docs/research/CSS_HOOKS.md',
]);
export const CORE_MANIFEST = 'template-core.json';

// The template a workspace syncs its core from (site-run.mjs adds the core step only then): the manifest's source,
// relative to the workspace, where it still holds the sync script; else null, and the run uses the workspace's own copy.
export function coreSourceOf(workspaceRoot, manifest) {
  return manifest?.source && existsSync(resolve(workspaceRoot, manifest.source, 'scripts/sync-template-core.mjs')) ? manifest.source.replaceAll('\\', '/') : null;
}
export const CORE_SCHEMA = 'seo-site-template-core-v1';

async function listFiles(root, path) {
  const full = resolve(root, path);
  const info = await stat(full).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [path];
  const files = [];
  for (const entry of await readdir(full, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    files.push(...(entry.isDirectory() ? await listFiles(root, child) : [child]));
  }
  return files;
}

async function hashFile(path) {
  // Line endings are normalised so a checkout's CRLF conversion is not reported as drift.
  const text = (await readFile(path)).toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex');
}

export async function coreHashes(root) {
  const hashes = {};
  for (const path of CORE_PATHS) for (const file of await listFiles(root, path)) hashes[file] = await hashFile(resolve(root, file));
  return hashes;
}

function coreVersion(repoRoot) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', ...CORE_PATHS], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

// The workspace's packages installed from its lockfile (the local store first). Not pnpm's optimistic repeat install:
// a copy keeps the source's modification time on Windows, older than the workspace's last install, so pnpm took the
// changed package.json for the installed one ("Already up to date") and ajv stayed missing.
function installPackages(workspaceRoot) {
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--config.optimistic-repeat-install=false'], { cwd: workspaceRoot, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`pnpm install failed in ${workspaceRoot} (exit ${result.status})`);
}

// The core files of the repository's commit (HEAD) in a folder of their own, through an index of its own: the
// repository's index and working tree are not touched. { dir, uncommitted: core files changed or added since }.
async function committedCore(repoRoot) {
  const temp = await mkdtemp(join(tmpdir(), 'template-core-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index') };
  execFileSync('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env });
  const files = execFileSync('git', ['ls-files', '--', ...CORE_PATHS], { cwd: repoRoot, env, encoding: 'utf8' });
  execFileSync('git', ['checkout-index', '-f', `--prefix=${join(temp, 'tree')}/`, '--stdin'], { cwd: repoRoot, env, input: files });
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...CORE_PATHS], { cwd: repoRoot, encoding: 'utf8' });
  const uncommitted = status.split('\n').filter(Boolean).map((line) => line.slice(3).replace(/^"|"$/g, '').split(' -> ').at(-1));
  return { dir: join(temp, 'tree'), temp, uncommitted };
}

// Copies the core from the repository into a workspace (replacing stale core files) and records the manifest; when the
// packages changed with it, they are installed (a core that imports a new package would not run otherwise: ajv).
// committed: the files of the repository's commit, not its working tree (site-run's core step: hotel-rm's runs 10 and
// 17 synced another session's half-done edits); a sync by hand while iterating on a rule takes the working tree.
export async function syncTemplateCore({ repoRoot, workspaceRoot, install = installPackages, committed = false }) {
  const packages = async () => Promise.all(['package.json', 'pnpm-lock.yaml'].map((file) => hashFile(resolve(workspaceRoot, file)).catch(() => null)));
  const before = await packages();
  const tree = committed ? await committedCore(repoRoot) : null;
  const from = tree?.dir ?? repoRoot;
  try {
    for (const path of CORE_PATHS) {
      const source = resolve(from, path);
      if (!(await stat(source).catch(() => null))) continue;
      const target = resolve(workspaceRoot, path);
      if ((await stat(source)).isDirectory()) await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true });
    }
  } finally {
    if (tree) await rm(tree.temp, { recursive: true, force: true });
  }
  // The site repository runs the shared workflows: release, and scheduled blog publishing.
  for (const name of ['release.yml', 'blog-publish.yml']) {
    const workflow = resolve(repoRoot, 'deploy/github', name);
    if (!(await stat(workflow).catch(() => null))) continue;
    await mkdir(resolve(workspaceRoot, '.github/workflows'), { recursive: true });
    await cp(workflow, resolve(workspaceRoot, '.github/workflows', name));
  }
  if (JSON.stringify(await packages()) !== JSON.stringify(before)) install(workspaceRoot);
  return writeCoreManifest({ repoRoot, workspaceRoot, from: tree ? 'commit' : 'worktree', uncommitted: tree?.uncommitted });
}

// from: whether the files are the commit's or the working tree's; uncommitted: the core files a committed sync left
// out (changed or added in the repository since its commit).
export async function writeCoreManifest({ repoRoot, workspaceRoot, from = 'worktree', uncommitted = undefined }) {
  const manifest = { schemaVersion: CORE_SCHEMA, source: relative(workspaceRoot, repoRoot).replaceAll('\\', '/'), ...coreVersion(repoRoot), from, ...(uncommitted ? { uncommitted } : {}), files: await coreHashes(workspaceRoot) };
  await writeJson(resolve(workspaceRoot, CORE_MANIFEST), manifest);
  return manifest;
}

// Core files a workspace changed or lost since its last sync, and files added to the core without a sync.
export async function coreDrift(workspaceRoot, manifest) {
  const current = await coreHashes(workspaceRoot);
  const drift = [];
  for (const [file, hash] of Object.entries(manifest.files || {})) {
    if (!(file in current)) drift.push({ file, issue: 'missing' });
    else if (current[file] !== hash) drift.push({ file, issue: 'changed' });
  }
  for (const file of Object.keys(current)) if (!(file in (manifest.files || {}))) drift.push({ file, issue: 'unrecorded' });
  return drift;
}
