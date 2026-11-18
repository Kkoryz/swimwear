#!/usr/bin/env node
// The launch flow's conflicts step (owner 2026-11-18): Site Factory's site-wide conflict check run on this machine. The
// command site.json siteConflicts names is run as it is written (Site Factory's fact library and prompts decide; the
// template judges nothing), its results folder read (lib/prelaunch/conflicts.mjs sfConflictFindings), and what it found
// recorded for the content it judged (docs/research/prelaunch/conflicts-source.json); then the prelaunch checks are
// written again (docs/research/prelaunch/; the conflict check's report or block as site.json prelaunch.conflicts
// says). It holds nothing itself: the release step and the preflight hold a blocked check.
// The three result files must all be there and, after a run, written by it (a command that wrote nothing, a dry run,
// or results named at an old folder is an error, never a pass). --no-run reads the folder as it is (a run made by hand;
// all three files still required). Not in GitHub Actions (Site Factory is not there).
// Exit code 2 when the command says it must wait (its exit code 2: a usage limit, a sign-in), 1 on an error.
// Usage: node scripts/site-conflicts.mjs [--no-run]

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { contentKey, onCi, SOURCE_PATH, SOURCE_SCHEMA, sfConflictFindings } from './lib/prelaunch/conflicts.mjs';
import { prelaunchModes } from './lib/prelaunch/config.mjs';
import { prelaunch } from './prelaunch.mjs';

export async function siteConflicts({ root = process.cwd(), run = true, env = process.env, spawn = spawnSync, now = new Date() } = {}) {
  const site = await readJson(resolve(root, 'site.json'), {});
  if (prelaunchModes(site).modes.conflicts === 'off') return { skipped: 'site.json prelaunch.conflicts is off' };
  if (onCi(env)) return { skipped: 'Site Factory does not run in GitHub Actions: the check needs a run on this machine' };
  const config = site.siteConflicts ?? {};
  if (!config.results) throw new Error('site.json siteConflicts names no results folder (siteConflicts: { command: [...], cwd?, results })');
  const content = await contentKey(root);
  const dir = resolve(root, config.results);
  const RESULT_FILES = ['library_check.json', 'pages.json', 'blogs.json'];
  // A second's slack: a file system that keeps whole seconds writes a time just before the start.
  const started = Date.now() - 1000;
  if (run) {
    if (!Array.isArray(config.command) || !config.command.length) throw new Error('site.json siteConflicts.command must be a list: the program and its arguments');
    const [program, ...args] = config.command;
    const result = spawn(program, args, { cwd: config.cwd ? resolve(root, config.cwd) : root, stdio: 'inherit', env: { ...env, PYTHONUTF8: '1' } });
    if (result.error) throw new Error(`the conflict check could not start (${program}): ${result.error.message}`);
    if (result.status === 2) return { waits: `the conflict check waits (${config.command.join(' ')} exit 2)` };
    if (result.status !== 0) throw new Error(`the conflict check failed (${config.command.join(' ')} exit ${result.status})`);
  }
  // The content the run judged: unchanged while it ran, or its result is of something else.
  if (await contentKey(root) !== content) throw new Error('the pages or articles changed while the conflict check ran: run it again');
  const missing = RESULT_FILES.filter((name) => !existsSync(resolve(dir, name)));
  if (missing.length) throw new Error(`the conflict check left no ${missing.join(', ')} in ${dir}: its results are incomplete (a dry run, or another folder?)`);
  const stale = run ? RESULT_FILES.filter((name) => statSync(resolve(dir, name)).mtimeMs < started) : [];
  if (stale.length) throw new Error(`${stale.join(', ')} in ${dir} were not written by this run (older than its start): a dry run, or another folder?`);
  const results = { library: await readJson(resolve(dir, 'library_check.json')), pages: await readJson(resolve(dir, 'pages.json')), blogs: await readJson(resolve(dir, 'blogs.json')) };
  const pages = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  const findings = sfConflictFindings(results, new Map(pages.map((page) => [page.id, page.route])));
  const source = { schemaVersion: SOURCE_SCHEMA, checkedAt: now.toISOString(), content, command: run ? config.command : null, results: config.results, findings };
  await writeJson(resolve(root, SOURCE_PATH), source);
  const summary = await prelaunch({ root, env, now });
  return { source, check: summary.checks.find((check) => check.check === 'conflicts') };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'no-run': { type: 'boolean' } });
  const result = await siteConflicts({ run: values['no-run'] !== true });
  if (result.skipped) { console.log(`conflict check skipped: ${result.skipped}`); return; }
  if (result.waits) { console.log(result.waits); process.exitCode = 2; return; }
  console.log(`conflict check: ${result.source.findings.length} conflict(s) (${result.check.status}); ${SOURCE_PATH}`);
});
