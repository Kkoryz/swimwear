// Each site's own local git repository (never pushed): site:run creates it on first use and commits after every step
// that changed something, so a step gone wrong (a plan that remade the image library, a bad import) is undone with
// git. What can be made again (dependencies, builds, captures, image masters, audit screenshots) stays out of it.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const IGNORED = [
  'node_modules/', 'dist/', '.astro/', '.pipeline/logs/', '.pipeline/audits/', '.pipeline/cache/', '.pipeline/run.lock',
  'docs/research/images/masters/', 'docs/research/reference-pages/', 'docs/research/pattern-sections/', 'docs/design-references/',
];

const git = (root, ...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

// The repository, created with its ignore list and a first commit when the site has none. Returns whether it exists.
export async function ensureSiteRepo(root) {
  const ignorePath = resolve(root, '.gitignore');
  const present = await readFile(ignorePath, 'utf8').catch(() => '');
  const missing = IGNORED.filter((line) => !present.split(/\r?\n/).includes(line));
  if (missing.length) await writeFile(ignorePath, `${present}${present && !present.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  if (!existsSync(resolve(root, '.git'))) {
    if (git(root, 'init', '--quiet').status !== 0) return false;
    // The run's own commits carry the run's name in this repository only (no global setting is touched).
    if (!git(root, 'config', 'user.email').stdout.trim()) { git(root, 'config', 'user.name', 'site-run'); git(root, 'config', 'user.email', 'site-run@localhost'); }
    commitSite(root, 'site-run: first record of the site');
  }
  return true;
}

// The files changed since the last commit, tracked and new (ignored ones left out), as repository paths.
export function changedFiles(root) {
  const status = git(root, 'status', '--porcelain=v1', '-uall', '-z');
  if (status.status !== 0) return [];
  const entries = status.stdout.split('\0').filter(Boolean);
  const files = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    files.push({ path: entry.slice(3), tracked: !entry.startsWith('??') });
    // A rename lists the old path next: it is restored with the new one.
    if (/^R/.test(entry)) index += 1;
  }
  return files;
}

// A step's own outputs: an exact path, or a folder ending in "/".
export const ownedBy = (writes) => (path) => writes.some((owned) => (owned.endsWith('/') ? path.startsWith(owned) : path === owned));

// Puts back what an agent step changed outside its own outputs (writes): a changed file from the last commit, a new
// file removed. Returns the paths put back. The run commits before the agent starts, so the last commit is the
// state the agent was given. Changed files are put back first, and a git that fails stops it before any file is
// removed: with that commit missing, every file made since the last one would look like the agent's.
export function restoreOutside(root, writes) {
  const owned = ownedBy(writes);
  if (existsSync(resolve(root, '.git/index.lock')) || git(root, 'status', '--porcelain').status !== 0) throw new Error(`git is locked or failing in ${root} (.git/index.lock): nothing put back`);
  // The run's own folder (state, logs, caches, anything a person redirected the run's output to) is never a stray.
  const strays = changedFiles(root).filter((file) => !owned(file.path) && !file.path.startsWith('.pipeline/'));
  for (const file of strays.filter((item) => item.tracked)) {
    const result = git(root, 'checkout', '--', file.path);
    if (result.status !== 0) throw new Error(`git checkout failed in ${root}, new files left in place: ${result.stderr.trim().slice(-300)}`);
  }
  for (const file of strays.filter((item) => !item.tracked)) rmSync(resolve(root, file.path), { force: true });
  return strays.map((file) => file.path);
}

// The commit the site is at.
export const headCommit = (root) => git(root, 'rev-parse', 'HEAD').stdout.trim();

// Puts the files a repair may write (writes) back as they were at a commit; one the repair added since is removed.
export function restoreFrom(root, commit, writes) {
  const owned = ownedBy(writes);
  const changed = git(root, 'diff', '--name-only', commit, '--').stdout.split('\n').filter(Boolean).filter(owned);
  for (const path of changed) {
    if (git(root, 'cat-file', '-e', `${commit}:${path}`).status === 0) git(root, 'checkout', commit, '--', path);
    else rmSync(resolve(root, path), { force: true });
  }
  return changed;
}

// The files that differ between a commit and HEAD, repository paths with forward slashes (none without the commit).
export function changedSince(root, commit) {
  if (!commit) return [];
  const result = git(root, 'diff', '--name-only', commit, 'HEAD');
  return result.status === 0 ? result.stdout.split('\n').map((line) => line.trim()).filter(Boolean) : [];
}

// Commits everything that changed (nothing when nothing did). Returns the new commit's short id, or null. A failed
// add throws: unseen, it reads as nothing to commit (site10's stale index.lock).
export function commitSite(root, message) {
  const added = git(root, 'add', '-A');
  if (added.status !== 0) throw new Error(`git add failed in ${root}: ${added.stderr.trim().slice(-300)}`);
  if (git(root, 'diff', '--cached', '--quiet').status === 0) return null;
  const result = git(root, 'commit', '--quiet', '-m', message);
  if (result.status !== 0) throw new Error(`git commit failed in ${root}: ${result.stderr.trim().slice(-300)}`);
  return git(root, 'rev-parse', '--short', 'HEAD').stdout.trim();
}
