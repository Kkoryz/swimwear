import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { flowSkip, launchFlowModes } from '../lib/launch-flow.mjs';
import { withSiteLock } from '../lib/audit-runtime.mjs';
import { SOURCE_PATH } from '../lib/prelaunch/conflicts.mjs';
import { auditStands, conflictsSkip, pendingPaidSteps, recheckNotDue, steps } from '../site-run.mjs';
import { siteConflicts } from '../site-conflicts.mjs';
import { publishQueued } from '../blog-publish.mjs';
import { importGeoArticle } from '../import-geo-article.mjs';
import { prelaunch } from '../prelaunch.mjs';
import { writePosts } from '../lib/blog-v2.mjs';

const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'brand', line: 'activewear', port: 4999 };
const write = async (root, files) => { for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), typeof content === 'string' ? content : JSON.stringify(content)); } };

test('the launch flow after the build is one fixed order', () => {
  const ids = steps(site).map((step) => step.id);
  const flow = ['build', 'audits', 'prelaunch', 'conflicts', 'claude-seo-audit', 'seo-recheck', 'design-shots', 'design-review', 'design-gate', 'design-polish', 'geo-blogs', 'release'];
  assert.deepEqual(ids.filter((id) => flow.includes(id)), flow);
  assert.ok(ids.indexOf('audits') - ids.indexOf('build') <= 4, 'the audits follow the build (the photo fit and the copy audit between)');
  const release = steps(site).find((step) => step.id === 'release').run.map((command) => command.join(' '));
  assert.ok(release.indexOf('node scripts/prelaunch.mjs') === release.indexOf('node scripts/preflight.mjs') - 1, 'the release: check:prelaunch, then the preflight');
  // llmAudit: false: no claude-seo audit and no recheck, as before.
  const off = steps({ ...site, llmAudit: false }).map((step) => step.id);
  assert.ok(!off.includes('claude-seo-audit') && !off.includes('seo-recheck'));
});

test('every part can be switched off in site.json, as the prelaunch checks are', async () => {
  assert.deepEqual(launchFlowModes({}), { audits: 'on', prelaunch: 'on', seo_audit: 'on', seo_recheck: 'block', design: 'on', release: 'on' });
  assert.deepEqual(launchFlowModes({ launchFlow: { design: false, seo_recheck: 'report', release: true }, llmAudit: true }), { audits: 'on', prelaunch: 'on', seo_audit: 'on', seo_recheck: 'report', design: 'off', release: 'on' });
  assert.equal(launchFlowModes({ llmAudit: false }).seo_recheck, 'off');
  assert.throws(() => launchFlowModes({ launchFlow: { conflicts: false } }), /the conflict check is prelaunch\.conflicts/);
  assert.throws(() => launchFlowModes({ launchFlow: { audits: 'block' } }), /launchFlow\.audits: "block" is not a mode \(false, true\)/);
  const switched = { ...site, launchFlow: { audits: false, prelaunch: false, seo_audit: false, seo_recheck: false, design: false, release: false } };
  const list = steps(switched);
  for (const id of ['audits', 'prelaunch', 'claude-seo-audit', 'seo-recheck', 'design-shots', 'design-review', 'design-gate', 'design-polish', 'release']) {
    assert.match(await list.find((step) => step.id === id).skip('/nowhere'), /site\.json launchFlow\.\w+ is off/, id);
  }
  assert.equal(flowSkip(site, 'build'), null, 'the build is no part of the switches');
  assert.throws(() => steps({ ...site, launchFlow: { design: 'report' } }), /launchFlow\.design/, 'a switch written wrong stops the run before its first step');
  assert.equal(await steps(site).find((step) => step.id === 'audits').skip('/nowhere'), null);
  // A step switched off calls nothing: it is not counted among the steps that call a model.
  const root = await mkdtemp(join(tmpdir(), 'flow-paid-'));
  assert.deepEqual((await pendingPaidSteps(root, list.filter((step) => ['claude-seo-audit', 'seo-recheck'].includes(step.id)), {})).map((step) => step.id), []);
});

test('the claude-seo audit runs once a site; its recheck once there is an audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-audit-'));
  assert.equal(await auditStands(root), null, 'no audit yet: it runs');
  assert.match(await recheckNotDue(root), /no claude-seo audit/);
  const dir = 'docs/research/seo-audit-1';
  const data = { schemaVersion: 'seo-site-claude-seo-audit-v1', complete: true, release: { key: 'k' }, sources: 's' };
  await write(root, { [`${dir}/audit-data.json`]: data, [`${dir}/findings.json`]: { findings: [] }, [`${dir}/findings-check.json`]: { items: [], holds: [] } });
  assert.equal(await auditStands(root), null, 'an audit whose rules were not seen retrieved stands for nothing: audited again');
  await write(root, { [`${dir}/audit-data.json`]: { ...data, rules: { retrieved: true } } });
  assert.match(await auditStands(root), /an audit stands \(docs\/research\/seo-audit-1\): one audit a site/);
  assert.equal(await recheckNotDue(root), null, 'the recheck runs; the script keeps the audit\'s check for the audited build');
});

test('the conflict step runs Site Factory\'s command on this machine and records what it found; it never judges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flow-conflicts-'));
  const config = { command: ['python', '-B', 'run_sitecheck.py', 'live', 'staylumen'], cwd: 'sf', results: 'sf/out/staylumen' };
  await write(root, {
    'site.json': { siteConflicts: config },
    'src/data/authoring-pages.json': [{ ...{ id: 'home', route: '/', pageType: 'home', status: 'authored', seo: { title: 'H', description: 'd', canonical: '/' }, hero: { heading: 'H' }, blocks: [] } }],
    'dist/index.html': '<html><main><p>H</p></main></html>',
  });
  assert.match(await conflictsSkip({ prelaunch: { conflicts: false } })(), /prelaunch\.conflicts is off/);
  assert.match(await conflictsSkip({})(), /names no command/);
  assert.equal(await conflictsSkip({ siteConflicts: config })(), null);
  const calls = [];
  const spawn = (program, args, options) => {
    calls.push([program, ...args, options.cwd]);
    return { status: 0 };
  };
  const results = { 'sf/out/staylumen/library_check.json': { confirmed: [] }, 'sf/out/staylumen/pages.json': [{ sentence: 'We answer in a week.', docs: ['home'], label: 'conflicts:F1', row: { id: 'F1', text: 'We answer within one business day.' } }], 'sf/out/staylumen/blogs.json': [] };
  // A command that wrote nothing (a dry run) over results of an earlier run, or results only in part: never a pass.
  await write(root, results);
  const old = new Date(Date.now() - 3600 * 1000);
  for (const path of Object.keys(results)) await utimes(join(root, path), old, old);
  await assert.rejects(siteConflicts({ root, env: {}, spawn }), /were not written by this run/);
  await rm(join(root, 'sf/out/staylumen/blogs.json'));
  await assert.rejects(siteConflicts({ root, env: {}, spawn, run: false }), /left no blogs\.json/);
  const writing = (program, args, options) => { calls.push([program, ...args, options.cwd]); for (const [path, content] of Object.entries(results)) writeFileSync(join(root, path), JSON.stringify(content)); return { status: 0 }; };
  calls.length = 0;
  const result = await siteConflicts({ root, env: {}, spawn: writing, now: new Date('2026-11-18T12:00:00Z') });
  assert.deepEqual(calls, [['python', '-B', 'run_sitecheck.py', 'live', 'staylumen', join(root, 'sf')]]);
  assert.deepEqual(result.source.findings.map((finding) => [finding.kind, finding.route, finding.row]), [['page', '/', 'F1']]);
  assert.equal(result.check.status, 'reported', 'report by default');
  assert.ok(existsSync(join(root, SOURCE_PATH)));
  assert.match(await readFile(join(root, 'docs/research/prelaunch/conflicts.md'), 'utf8'), /We answer in a week/);
  const summary = JSON.parse(await readFile(join(root, 'docs/research/prelaunch/summary.json'), 'utf8'));
  assert.equal(summary.checks.length, 7, 'the summary is of every check');
  await write(root, { 'site.json': { siteConflicts: config, prelaunch: { conflicts: 'block' } } });
  assert.equal((await siteConflicts({ root, env: {}, spawn: writing })).check.status, 'blocked');
  // In GitHub Actions, the pages changed since this machine's run: it needs a local run, and with "block" that holds.
  const [home] = JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'));
  await write(root, { 'src/data/authoring-pages.json': [{ ...home, hero: { heading: 'H, rewritten' } }] });
  const ci = await prelaunch({ root, env: { GITHUB_ACTIONS: 'true' } });
  assert.equal(ci.checks.find((check) => check.check === 'conflicts').status, 'blocked');
  assert.match(await readFile(join(root, 'docs/research/prelaunch/conflicts.md'), 'utf8'), /needs a run on this machine/);
  assert.deepEqual(await siteConflicts({ root, env: {}, spawn: () => ({ status: 2 }) }), { waits: 'the conflict check waits (python -B run_sitecheck.py live staylumen exit 2)' });
  await assert.rejects(siteConflicts({ root, env: {}, spawn: () => ({ status: 1 }) }), /failed/);
  assert.match((await siteConflicts({ root, env: { GITHUB_ACTIONS: 'true' }, spawn: () => assert.fail('not run') })).skipped, /GitHub Actions/);
});

test('the blog import and publishing take the site\'s run lock: never while a site-run they did not start goes on', async (t) => {
  // Run as the template-check step of a site-run, the test process inherits the run's SITE_RUN_ID: the commands here are
  // started by no run (site14 2026-11-18: the step failed on it).
  const runId = process.env.SITE_RUN_ID;
  delete process.env.SITE_RUN_ID;
  t.after(() => { if (runId !== undefined) process.env.SITE_RUN_ID = runId; });
  const root = await mkdtemp(join(tmpdir(), 'flow-lock-'));
  const lock = join(root, '.pipeline/run.lock');
  await write(root, { '.pipeline/run.lock': String(process.ppid) });
  await assert.rejects(withSiteLock(root, 'blog publishing', async () => assert.fail('ran')), /blog publishing stopped: a site-run is going on this site and would put back what this changes/);
  await assert.rejects(publishQueued({ root }), /blog publishing stopped/);
  await assert.rejects(importGeoArticle({ root, runDir: join(root, 'run') }), /the article import stopped/);
  // The blog batch stops before anything is paid for.
  await assert.rejects(writePosts({ root, site: { geoBlog: { v2: {} } }, count: 1, run: () => assert.fail('nothing asked') }), /the blog batch stopped/);
  assert.equal(await readFile(lock, 'utf8'), String(process.ppid), 'the run\'s lock is left as it was');
  // Started by the run (its geo-blogs step), it works under the run's lock.
  assert.equal(await withSiteLock(root, 'x', async () => 'done', { env: { SITE_RUN_ID: 'r' } }), 'done');
  // No run: it takes the lock while it works and gives it back; a lock of a process that is gone is taken over.
  await write(root, { '.pipeline/run.lock': '999999999' });
  assert.equal(await withSiteLock(root, 'x', async () => readFile(lock, 'utf8'), { env: {}, alive: () => false }), String(process.pid));
  assert.equal(existsSync(lock), false);
  // A process that holds the lock itself (an import that publishes) keeps it.
  await write(root, { '.pipeline/run.lock': String(process.pid) });
  assert.equal(await withSiteLock(root, 'x', async () => 'inner', { env: {} }), 'inner');
  assert.equal(await readFile(lock, 'utf8'), String(process.pid));
});
