import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { siteRun, steps } from '../site-run.mjs';

const site = { reference: { origin: 'https://example.com', pages: { home: '/', product_manufacturer: '/leggings/' } }, siteFactory: 'snap', identity: 'brand', line: 'activewear', port: 4999 };

// A site makes its own photos (site-run.mjs): a run that goes again from the images reads its template variants and
// the photo-focus instructions.
const seedPhotos = async (root) => { await mkdir(join(root, 'src/data'), { recursive: true }); await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: {} })); await mkdir(join(root, 'config/agent-steps'), { recursive: true }); await writeFile(join(root, 'config/agent-steps/photo-focus.md'), 'Name the subject of {{photos}}'); };

test('the steps name the competitor pages the way each script expects', () => {
  const list = steps(site);
  assert.deepEqual(list.find((step) => step.id === 'capture').run[1].slice(3), ['home=/', 'manufacturer=/leggings/']);
  assert.ok(list.find((step) => step.id === 'patterns').run[0].includes('product_manufacturer=https://example.com/leggings/'));
});

test("checks before anything costs: the inputs first, the competitor's capture checked before the analysis, the plan and its gate before the photos", () => {
  const ids = steps(site, { coreSource: '../template' }).map((step) => step.id);
  const at = (id) => ids.indexOf(id);
  // The inputs right after the template core (their checks read the site's config/), before the capture.
  assert.deepEqual(ids.slice(0, 5), ['core', 'inputs', 'capture', 'density', 'capture-check']);
  assert.equal(at('capture-check') + 1, at('analysis'), 'a capture that fails its check is never analysed');
  // Feasibility once the copy is imported, then the plan and its gate, all before the photos and the style board.
  assert.ok(at('import') < at('feasibility') && at('feasibility') < at('layout-plan') && at('layout-plan') + 1 === at('plan-gate'));
  for (const later of ['photo-briefs', 'style-board', 'images']) if (at(later) >= 0) assert.ok(at('plan-gate') < at(later), `${later} after the plan gate`);
  const inputs = steps(site).find((step) => step.id === 'inputs');
  assert.equal(inputs.always, true, 'the inputs are checked every run');
  assert.deepEqual(steps(site).find((step) => step.id === 'plan-gate').run, [['node', 'scripts/plan-layout.mjs', '.', '--gate']]);
  // The grey-frame trial build right after the gate, before any photo: it refits the block model, so the plan is made
  // and gated again from the model it leaves (Fable's plan, stage 2).
  assert.equal(at('plan-gate') + 1, at('calibrate'));
  for (const later of ['photo-briefs', 'style-board', 'images']) if (at(later) >= 0) assert.ok(at('calibrate') < at(later), `${later} after the trial build`);
  const calibrate = steps(site).find((step) => step.id === 'calibrate');
  assert.deepEqual(calibrate.run, [['node', 'scripts/calibrate-plan.mjs', '.'], ['node', 'scripts/plan-layout.mjs', '.'], ['node', 'scripts/plan-layout.mjs', '.', '--gate']]);
  // Its measure follows the site's styles and components, not only its data.
  for (const input of ['src/styles', 'src/components', 'src/data/page-figures.json', 'src/data/site-trust.json', 'code:scripts/calibrate-plan.mjs']) assert.ok(calibrate.inputs.includes(input), input);
  // The plan counts each page's trust bar from the figures.
  for (const id of ['feasibility', 'layout-plan']) assert.ok(steps(site).find((step) => step.id === id).inputs.includes('src/data/page-figures.json'), id);
});

test('the fonts are installed by code after the analysis and the treatment, before the build', () => {
  const ids = steps(site).map((step) => step.id);
  const fonts = steps(site).find((step) => step.id === 'fonts');
  assert.ok(ids.indexOf('analysis') < ids.indexOf('fonts') && ids.indexOf('treatment') < ids.indexOf('fonts') && ids.indexOf('fonts') < ids.indexOf('build'));
  assert.equal(fonts.kind, 'auto');
  assert.deepEqual(fonts.run, [['node', 'scripts/install-fonts.mjs']]);
  for (const input of ['docs/research/analysis/font-roles.json', 'docs/research/raw/font-lock.json', 'src/styles/reference.css']) assert.ok(fonts.inputs.includes(input), input);
});

test('a run stops at a step an agent must do, skips unchanged steps and stops at a failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const ran = [];
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2; ran.push(command[1]); return 0; };
  const waiting = await siteRun({ root, runner, to: 'treatment' });
  assert.equal(waiting.code, 2);
  assert.match(waiting.waits, /reference analysis/);
  // The analysis is written: the run goes on to the next agent step.
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  for (const file of ['design-lock.json', 'media.json']) await writeFile(join(root, 'docs/research/analysis', file), '{}');
  // No crops, no modules: the modules name the crops there are.
  await writeFile(join(root, 'docs/research/analysis/section-modules.json'), '[]');
  ran.length = 0;
  const next = await siteRun({ root, runner, to: 'treatment' });
  assert.equal(next.code, 2);
  assert.match(next.waits, /treatment/);
  // (The template's gaps are collected once the modules are named, before the treatment.)
  // The inputs are checked every run; the capture's density and check are unchanged with it.
  assert.deepEqual(next.summary.map((item) => `${item.step}:${item.status}`), ['inputs:passed', 'capture:unchanged', 'density:unchanged', 'capture-check:unchanged', 'analysis:done', 'apply-analysis:passed', 'brand:passed', 'patterns:passed', 'modules:done', 'template-gaps:passed', 'treatment:waiting']);
  assert.deepEqual(ran, ['scripts/check-inputs.mjs', 'scripts/apply-reference-analysis.mjs', 'scripts/site-brand.mjs', 'scripts/scaffold-placeholder-pages.mjs', 'scripts/collect-template-gaps.mjs']);
  // A failing step stops the run and names its log.
  await mkdir(join(root, 'src/styles'), { recursive: true });
  // The template's empty reference.css (a comment only) is not a treatment.
  await writeFile(join(root, 'src/styles/reference.css'), '/* the repo default is empty { } */');
  assert.match((await siteRun({ root, runner, to: 'treatment' })).waits, /treatment/);
  await writeFile(join(root, 'src/styles/reference.css'), '.cta { color: #000; }');
  // A stylesheet alone is not the treatment: the step's own record says it was done.
  assert.match((await siteRun({ root, runner, to: 'treatment' })).waits, /treatment/);
  await writeFile(join(root, 'docs/research/analysis/treatment.md'), 'Buttons: black, after the competitor.');
  const failed = await siteRun({ root, runner: async (command) => (command[1] === 'scripts/import-site-factory.mjs' ? 1 : 0), to: 'import' });
  assert.equal(failed.code, 1);
  assert.equal(failed.failed, 'import');
});

test('a step that rewrites one of its own inputs is not run again for its own output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  let runs = 0;
  // The capture step's input is site.json; this runner rewrites it the way apply-image-library rewrites variants.
  // (The inputs' check runs every run and writes nothing.)
  const runner = async (command) => { if (String(command[1]).includes('check-inputs')) return 0; runs += 1; await writeFile(join(root, 'site.json'), JSON.stringify({ ...site, touched: runs })); return 0; };
  await siteRun({ root, runner, to: 'capture' });
  const before = runs;
  await siteRun({ root, runner, to: 'capture' });
  assert.equal(runs, before);
});

test('a site makes its own photos and never shows the competitor\'s; each step that changed files is committed to the site\'s own repository', async () => {
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  assert.equal(steps(site).find((step) => step.id === 'images').kind, 'codex', 'generate is the default');
  assert.throws(() => steps({ ...site, images: 'reference' }), /never shown/);
  // The photos are installed by the image step alone: applying the analysis sets the design lock only.
  assert.deepEqual(steps(site).find((step) => step.id === 'apply-analysis').run, [['node', 'scripts/apply-reference-analysis.mjs', '--design-lock', 'docs/research/analysis/design-lock.json']]);
  // A step writes a file; the run commits it under the step's name.
  const runner = async (command) => { if (String(command[1]).includes('capture')) await writeFile(join(root, 'capture.txt'), 'captured'); return 0; };
  await siteRun({ root, runner, to: 'capture', repo: true });
  const log = spawnSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n');
  assert.deepEqual(log, ['site-run: capture', 'site-run: inputs', 'site-run: first record of the site']);
  assert.match(await readFile(join(root, '.gitignore'), 'utf8'), /node_modules\/\ndist\//);
});

test('the style board comes after the treatment and the import and before any photo: built, reviewed module by module, and held like the design gate', async () => {
  const ids = steps(site).map((step) => step.id);
  const at = (id) => ids.indexOf(id);
  assert.ok(at('treatment') < at('import') && at('import') < at('style-board'));
  assert.deepEqual(ids.slice(at('style-board'), at('style-board') + 4), ['style-board', 'style-board-review', 'style-board-gate', 'images']);
  const board = steps(site).find((step) => step.id === 'style-board');
  assert.equal(board.kind, 'preview');
  assert.deepEqual(board.run.map((command) => command.slice(1).join(' ')), ['scripts/build-style-board.mjs', ...board.run.slice(1, 2).map((command) => command.slice(1).join(' ')), 'scripts/design-review.mjs board http://127.0.0.1:4999/']);
  const gate = steps(site).find((step) => step.id === 'style-board-gate');
  assert.deepEqual([gate.repair.prompt, gate.repair.restart, gate.repair.onWaits], ['repair-design', 'style-board', true]);
  // An open finding on the board: one repair, and the run goes again from the board (rebuilt and shot again).
  const boardSite = async () => {
    const folder = await mkdtemp(join(tmpdir(), 'site-run-board-'));
    await writeFile(join(folder, 'site.json'), JSON.stringify(site));
    await mkdir(join(folder, 'docs/research/design-review'), { recursive: true });
    await writeFile(join(folder, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: null, pages: [], board: [] }));
    return folder;
  };
  const root = await boardSite();
  const ran = [];
  let gates = 0;
  const runner = async (command) => { ran.push(command.slice(1).join(' ')); return command.includes('board-gate') ? (gates++ === 0 ? 2 : 0) : 0; };
  const repairs = [];
  const result = await siteRun({ root, runner, agent: async ({ step }) => { repairs.push(step.id); return 0; }, from: 'style-board', to: 'style-board-gate' });
  assert.equal(result.code, 0);
  assert.deepEqual(repairs, ['style-board-gate-repair']);
  assert.equal(ran.filter((line) => line.startsWith('scripts/design-review.mjs board ')).length, 2, 'shot again after the repair');
  // Still open after the repair: the run waits there, before the images.
  const waiting = await siteRun({ root: await boardSite(), runner: async (command) => (command.includes('board-gate') ? 2 : 0), agent: async () => 0, from: 'style-board', to: 'images' });
  assert.equal(waiting.code, 2);
  assert.match(waiting.waits, /style board/);
});

test('a site that makes its own photos makes them right after the style board, and never shows the competitor\'s', async () => {
  const generating = { ...site, images: 'generate' };
  const ids = steps(generating).map((step) => step.id);
  assert.equal(ids.indexOf('images'), ids.indexOf('style-board-gate') + 1, 'the photos follow the style board, reviewed on grey frames');
  assert.ok(!ids.some((id) => ['placeholders', 'design-settled'].includes(id)), 'no competitor placeholders, no second pass');
  assert.ok(!steps(generating).find((step) => step.id === 'images').run.some((command) => command.join(' ').includes('use-reference-media')));
  for (const id of ['images', 'image-fit', 'image-refit']) assert.equal(steps(generating).find((step) => step.id === id).skip, undefined, `${id} waits for nothing`);
});

test('with a template repository on record, every run starts by syncing the template core', () => {
  const list = steps(site, { coreSource: '../template' });
  assert.equal(list[0].id, 'core');
  assert.equal(list[0].always, true);
  // The run syncs the template's commit, never another session's uncommitted edits (hotel-rm r10, r17).
  assert.deepEqual(list[0].run[0], ['node', '../template/scripts/sync-template-core.mjs', '--committed', '.']);
  assert.notEqual(steps(site)[0].id, 'core');
});

test('the layout audit runs again when what it compares the build with changes, not only the build', async () => {
  const { inputsHash } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'audit-inputs-'));
  const audits = steps(site).find((step) => step.id === 'audits');
  for (const path of ['docs/research/raw/reference-density.json', 'docs/research/analysis/section-modules.json', 'docs/research/analysis/design-lock.json']) {
    await mkdir(join(root, path, '..'), { recursive: true });
    const hash = await inputsHash(root, audits.inputs);
    await writeFile(join(root, path), '{}');
    assert.notEqual(await inputsHash(root, audits.inputs), hash, path);
  }
});

test('the release step judges the release build, then makes the development build again for the preview', () => {
  const release = steps(site).find((step) => step.id === 'release');
  assert.equal(release.keepGoing, true);
  // The comparison with the owner's other sites and the handoff are made by the step itself, before the preflight that
  // reads them (Fable's 11-14 plan, item 11: the preflight held until a person ran check:cross-site by hand).
  assert.deepEqual(release.run.map((command) => (command[0] === 'node' ? command.slice(1).join(' ') : command.at(-1))), ['scripts/build-release.mjs', 'scripts/build-nginx-config.mjs', 'scripts/sf-report.mjs', 'scripts/check-cross-site.mjs --hold', 'scripts/handoff.mjs', 'scripts/preflight.mjs', 'build']);
});

test("a page nearly the same as one on the owner's other sites holds the release for the owner, it does not fail it", async () => {
  const { crossSiteExit } = await import('../check-cross-site.mjs');
  assert.equal(crossSiteExit({ duplicates: [] }), 0);
  assert.equal(crossSiteExit({ duplicates: [{ route: '/a/' }] }), 1);
  assert.equal(crossSiteExit({ duplicates: [{ route: '/a/' }] }, { hold: true }), 2);
});

test('a new Site Factory snapshot does not capture the reference again, and a state from before named fields is kept', async () => {
  const { inputsHash, legacyInputsHash, upgradeLegacyHashes } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const capture = steps(site).find((step) => step.id === 'capture');
  const before = await inputsHash(root, capture.inputs);
  // A state written when capture hashed the whole site.json moves to the named fields' hash.
  const state = { capture: { status: 'passed', hash: await legacyInputsHash(root, ['site.json']) } };
  assert.equal(await upgradeLegacyHashes(root, state, steps(site)), true);
  assert.equal(state.capture.hash, before);
  await writeFile(join(root, 'site.json'), JSON.stringify({ ...site, siteFactory: 'snap-2' }));
  assert.equal(await inputsHash(root, capture.inputs), before);
  await writeFile(join(root, 'site.json'), JSON.stringify({ ...site, reference: { ...site.reference, origin: 'https://example.org' } }));
  assert.notEqual(await inputsHash(root, capture.inputs), before);
});

test('the release step waits for people only on exit code 2; a crash in any of its commands is a failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const exits = (codes) => async (command) => codes[command[1]] ?? 0;
  const waiting = await siteRun({ root, from: 'release', to: 'release', runner: exits({ 'scripts/build-release.mjs': 2, 'scripts/preflight.mjs': 2 }) });
  assert.equal(waiting.code, 2);
  assert.match(waiting.waits, /preflight/);
  const crashed = await siteRun({ root, from: 'release', to: 'release', runner: exits({ 'scripts/build-nginx-config.mjs': 1, 'scripts/preflight.mjs': 2 }) });
  assert.deepEqual([crashed.code, crashed.failed], [1, 'release']);
});

test('the launch checklist gives every hold to whoever clears it, Site Factory\'s own holds included', async () => {
  const { checklistMarkdown } = await import('../lib/launch-checklist.mjs');
  const text = checklistMarkdown({ status: 'blocked', checkedAt: 'now', holds: [{ code: 'inherited:missing_facts', detail: 'Site Factory held p1', items: ['p1'] }, { code: 'contact_path_missing', detail: 'd', items: ['/contact/'] }] });
  const section = (title) => text.split('## ').find((part) => part.startsWith(title)) ?? '';
  assert.match(section('Site Factory'), /Site Factory 自己的拦截项/);
  assert.match(section('站长'), /联系页上还没有邮箱/);
  assert.match(section('模板流程'), /- 无/);
  // Every listed code is a check the preflight runs.
  const { CHECKS } = await import('../preflight.mjs');
  const { HOLDS } = await import('../lib/launch-checklist.mjs');
  const codes = new Set(CHECKS.map((check) => check.code));
  assert.deepEqual(Object.keys(HOLDS).filter((code) => !codes.has(code)), []);
});

test('the preflight runs end to end on a bare site: it writes its report and the checklist, and says blocked', async () => {
  const { preflight } = await import('../preflight.mjs');
  const root = await mkdtemp(join(tmpdir(), 'preflight-'));
  const gate = await preflight({ root });
  assert.equal(gate.status, 'blocked');
  assert.ok(JSON.parse(await readFile(join(root, 'docs/research/launch-preflight.json'), 'utf8')).holds.length > 0);
  assert.match(await readFile(join(root, 'docs/research/launch-checklist.md'), 'utf8'), /^# 上线清单/);
});

test('a site captured before site:run tracked it keeps its capture: the step is recorded, not run again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research/raw'), { recursive: true });
  await writeFile(join(root, 'docs/research/raw/capture-summary.json'), '{}');
  const ran = [];
  const result = await siteRun({ root, to: 'capture', runner: async (command) => { ran.push(command[1]); return 0; } });
  assert.deepEqual(result.summary.map((item) => `${item.step}:${item.status}`), ['inputs:passed', 'capture:adopted']);
  assert.deepEqual(ran, ['scripts/check-inputs.mjs']);
  ran.length = 0;
  // Once recorded it is an ordinary step: a new reference captures again.
  await writeFile(join(root, 'site.json'), JSON.stringify({ ...site, reference: { ...site.reference, origin: 'https://example.org' } }));
  await siteRun({ root, to: 'capture', runner: async (command) => { ran.push(command[1]); return 0; } });
  assert.deepEqual(ran, ['scripts/check-inputs.mjs', 'scripts/capture-reference.mjs', 'scripts/capture-reference-pages.mjs']);
});

test('an agent does the judgment steps: one run per page type of crops, the step done only when its outputs are there', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-agent-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  for (const type of ['home', 'product_manufacturer']) {
    await mkdir(join(root, 'docs/research/pattern-sections', type), { recursive: true });
    await writeFile(join(root, 'docs/research/pattern-sections', type, '01-hero.png'), '');
  }
  const calls = [];
  // The agent writes the analysis but leaves the modules undone.
  const agent = async ({ step, root: at }) => {
    calls.push({ step: step.id, runs: (await step.runs(at)).map((run) => run.values.pageType ?? null) });
    if (step.id === 'analysis') {
      await mkdir(join(at, 'docs/research/analysis'), { recursive: true });
      for (const file of ['design-lock.json', 'media.json']) await writeFile(join(at, 'docs/research/analysis', file), '{}');
    }
    return 0;
  };
  const result = await siteRun({ root, runner: async () => 0, agent, to: 'treatment' });
  assert.equal(result.code, 2);
  assert.match(result.waits, /module of every competitor section/);
  assert.equal(result.summary.find((item) => item.step === 'analysis').status, 'done by agent');
  assert.deepEqual(calls, [{ step: 'analysis', runs: [null] }, { step: 'modules', runs: ['home', 'product_manufacturer'] }]);
});

test('a site that names its Site Factory project is frozen by the run and pointed at the snapshot', async () => {
  const { freezeForRun } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-run-freeze-'));
  const named = { ...site, siteFactoryProject: 'D:/sf/projects/swimwear', siteFactoryFreeze: 'D:/freeze/swimwear' };
  await writeFile(join(root, 'site.json'), JSON.stringify(named));
  const freeze = async ({ project, out }) => ({ folder: `${out}${String.fromCharCode(92)}s07-abc`, project });
  const next = await freezeForRun(root, named, freeze);
  assert.equal(next.siteFactory, 'D:/freeze/swimwear/s07-abc');
  assert.equal(JSON.parse(await readFile(join(root, 'site.json'), 'utf8')).siteFactory, 'D:/freeze/swimwear/s07-abc');
  assert.equal(await freezeForRun(root, site, freeze), site);
});

test('the design review waits for a review of the current shots and for every open P0 finding; a P1 is polished, not held', async () => {
  const { judgeReviews, representatives } = await import('../design-review.mjs');
  const pages = [{ route: '/a/', pageType: 'product_manufacturer', status: 'placeholder' }, { route: '/b/', pageType: 'product_manufacturer', status: 'authored' }, { route: '/', pageType: 'home', status: 'authored' }];
  assert.deepEqual(representatives(pages, ['home', 'product_manufacturer', 'about']).map((page) => page.route), ['/', '/b/']);
  const manifest = { id: 'all', pages: [{ pageType: 'home', route: '/', shots: 'new' }, { pageType: 'product_manufacturer', route: '/b/', shots: 'new' }] };
  assert.equal(judgeReviews(manifest, { home: { shots: 'new', findings: [] } }).status, 'missing');
  assert.equal(judgeReviews(manifest, { home: { shots: 'new', findings: [] }, product_manufacturer: { shots: 'old', findings: [] } }).status, 'stale');
  assert.equal(judgeReviews(manifest, { home: { shots: 'new', findings: [{ block: 'hero', severity: 'P1', issue: 'x' }] }, product_manufacturer: { shots: 'new', findings: [] } }).status, 'passed', 'a P1 goes to the polish repair (owner 2026-11-14)');
  const open = judgeReviews(manifest, { home: { shots: 'new', findings: [{ block: 'hero', severity: 'P0', issue: 'x' }, { block: 'cta', severity: 'P2', issue: 'y' }] }, product_manufacturer: { shots: 'new', findings: [] } });
  assert.equal(open.status, 'open');
  assert.equal(open.findings[0].route, '/');
  const resolved = judgeReviews(manifest, { home: { shots: 'new', findings: [{ block: 'hero', severity: 'P0', issue: 'x', resolution: 'accepted: the competitor does the same' }] }, product_manufacturer: { shots: 'new', findings: [] } });
  assert.equal(resolved.status, 'passed');
  // A template or content finding is for the template or Site Factory to fix: it does not hold this site.
  const elsewhere = judgeReviews(manifest, { home: { shots: 'new', findings: [{ block: 'footer', severity: 'P1', scope: 'template', issue: 'x' }, { block: 'g', severity: 'P0', scope: 'content', issue: 'y' }] }, product_manufacturer: { shots: 'new', findings: [] } });
  assert.equal(elsewhere.status, 'passed');
  assert.equal(elsewhere.findings.length, 2);
});

test('the review looks at the longest and the shortest page of every page type, a page type the competitor lacks beside its nearest; each review is named by its key', async () => {
  const { judgeReviews, representatives, standIns } = await import('../design-review.mjs');
  const words = (count) => [{ id: 'b', type: 'intro', heading: 'H', paragraphs: [Array.from({ length: count }, () => 'word').join(' ')] }];
  const page = (route, pageType, count, status = 'authored') => ({ route, pageType, status, hero: { title: 'T' }, blocks: words(count) });
  const pages = [page('/', 'home', 50), page('/a/', 'solution', 300), page('/b/', 'solution', 1400), page('/c/', 'solution', 700), page('/x/', 'general', 200), page('/y/', 'general', 90), page('/legal/', 'privacy', 400), page('/p/', 'solution', 9000, 'placeholder')];
  const chosen = representatives(pages, ['home', 'solution', 'about']);
  // The service pages' longest and shortest (a placeholder is not one of them while written pages exist); the general
  // and legal pages beside the about page, the nearest the competitor has; the competitor's about page has no page of
  // ours of its own type and is not reviewed by itself.
  assert.deepEqual(chosen.map((item) => [item.key, item.route, item.reference, item.role]), [
    ['home', '/', 'home', 'only'],
    ['solution', '/b/', 'solution', 'longest'],
    ['solution--shortest', '/a/', 'solution', 'shortest'],
    ['general', '/x/', 'about', 'longest'],
    ['general--shortest', '/y/', 'about', 'shortest'],
    ['privacy', '/legal/', 'about', 'only'],
  ]);
  // Two reviews of one page type: each is judged on its own shots, and their findings keep both the page type and the review.
  const manifest = { id: 'm', pages: chosen.slice(1, 3).map((item) => ({ key: item.key, pageType: item.pageType, route: item.route, shots: 's' })) };
  const result = judgeReviews(manifest, { solution: { shots: 's', findings: [] }, 'solution--shortest': { shots: 's', findings: [{ block: 'faq', severity: 'P0', issue: 'x' }] } });
  assert.equal(result.status, 'open');
  assert.deepEqual(result.findings.map((finding) => [finding.pageType, finding.review, finding.route]), [['solution', 'solution--shortest', '/a/']]);
  assert.equal(judgeReviews(manifest, { solution: { shots: 's', findings: [] } }).status, 'missing');
  // What the review is told is to be replaced: SF's borrowed items and the template's stand-in proof.
  assert.deepEqual(standIns({ status: 'authored', blocks: [{ id: 'cases', type: 'orderCase', items: [{ text: 'x', placeholder: true }] }, { id: 'owner-logos', type: 'logos', items: [] }] }, { proofStandIn: true }), ['Site Factory items marked placeholder: cases', 'stand-in proof (src/data/site-proof.json): owner-logos']);
});

test('agent instructions are filled per run, and a name a run does not set is an error', async () => {
  const { fillPrompt } = await import('../lib/agent-step.mjs');
  assert.equal(fillPrompt('Review {{pageType}} at {{route}}', { pageType: 'home', route: '/' }), 'Review home at /');
  assert.throws(() => fillPrompt('{{missing}}', {}), /\{\{missing\}\}/);
});

test('a failing audit gets one agent repair of the site treatment, a rebuild and a second audit; still failing, the run stops', async () => {
  // Each scenario on a fresh site (a repair is never tried twice on the same treatment).
  const runFrom = async (auditResults) => {
    const root = await mkdtemp(join(tmpdir(), 'site-run-repair-')); await seedPhotos(root);
    await writeFile(join(root, 'site.json'), JSON.stringify(site));
    const ran = [];
    const repairs = [];
    let audits = 0;
    const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2; ran.push(command.at(-1)); if (String(command[1]).includes('audit-authoring-layout')) return auditResults[audits++] ?? 0; return 0; };
    const agent = async ({ step }) => { repairs.push([step.id, (await step.runs(root))[0].values.report]); return 0; };
    const result = await siteRun({ root, runner, agent, from: 'audits', to: 'audits' });
    return { result, ran, repairs };
  };
  const fixed = await runFrom([1, 0]);
  assert.equal(fixed.result.code, 0);
  assert.deepEqual(fixed.repairs, [['audits-repair', 'docs/research/authoring-layout-audit.json']]);
  assert.ok(fixed.ran.includes('build'), 'rebuilt before the second audit');
  assert.ok(fixed.result.summary.some((item) => item.step === 'audits-repair' && item.status === 'done by agent'));
  const still = await runFrom([1, 1]);
  assert.equal(still.result.code, 1);
  assert.equal(still.repairs.length, 1, 'one repair, not a loop');
});

test('a repair that fixed what it was asked and raised other problems gets another round; repairs that end worse than their best state are undone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-best-')); await seedPhotos(root);
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/reference.css'), 'v0');
  // What the audit finds for each treatment: v1 cures the two heavy shades but leaves three texts unreadable, v2 adds
  // a fourth.
  const found = { v0: ['/a/|heavy_overlay', '/b/|heavy_overlay'], v1: ['/a/|low_contrast', '/b/|low_contrast', '/c/|low_contrast'], v2: ['/a/|low_contrast', '/b/|low_contrast', '/c/|low_contrast', '/d/|low_contrast'] };
  const runner = async (command) => {
    if (String(command[1]).includes('break-text-runs')) return 2;
    if (!String(command[1]).includes('audit-authoring-layout')) return 0;
    const failures = found[(await readFile(join(root, 'src/styles/reference.css'), 'utf8')).trim()].map((line) => ({ route: line.split('|')[0], viewport: 'mobile', issue: line.split('|')[1] }));
    await mkdir(join(root, 'docs/research'), { recursive: true });
    await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures }));
    return failures.length ? 1 : 0;
  };
  let round = 0;
  const agent = async () => { round += 1; await writeFile(join(root, 'src/styles/reference.css'), `v${round}`); return 0; };
  const result = await siteRun({ root, runner, agent, repo: true, from: 'audits', to: 'audits' });
  assert.equal(result.code, 1);
  assert.equal(round, 2, 'the second round came because the first moved the problems on');
  assert.equal((await readFile(join(root, 'src/styles/reference.css'), 'utf8')).trim(), 'v0', 'back to the state with the fewest problems');
  assert.ok(result.summary.some((item) => item.step === 'audits-repair' && /back to the state with the fewest problems \(2 open; 4/.test(item.status)));
});

test('a design repair that breaks the passing layout audit, which its own repair cannot mend, is undone: the site goes back to where the audit passed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-undo-')); await seedPhotos(root);
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/reference.css'), 'v0');
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'shots', pages: [] }));
  // The audit passes on v0; the design repair's darker shades fail it, and the audit repair cannot take them back out.
  const runner = async (command) => {
    if (String(command[1]).includes('break-text-runs')) return 2;
    if (command.includes('gate')) return 2;
    if (!String(command[1]).includes('audit-authoring-layout')) return 0;
    const css = (await readFile(join(root, 'src/styles/reference.css'), 'utf8')).trim();
    const failures = css === 'v0' ? [] : [{ route: '/', viewport: 'mobile', issue: 'heavy_overlay' }, { route: '/a/', viewport: 'mobile', issue: 'heavy_overlay' }];
    await mkdir(join(root, 'docs/research'), { recursive: true });
    await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures }));
    return failures.length ? 1 : 0;
  };
  const repairs = [];
  const agent = async ({ step }) => { repairs.push(step.id); await writeFile(join(root, 'src/styles/reference.css'), step.id === 'design-gate-repair' ? 'dark' : 'dark too'); return 0; };
  const result = await siteRun({ root, runner, agent, repo: true, from: 'audits', to: 'design-gate' });
  assert.deepEqual(repairs, ['design-gate-repair', 'audits-repair']);
  assert.equal((await readFile(join(root, 'src/styles/reference.css'), 'utf8')).trim(), 'v0', 'the design repair is undone');
  assert.equal(result.code, 2, 'the run waits at the design gate with the audit passing');
});

test('an open design finding gets one agent repair, a rebuild, and the run goes again from the layout audit (a repair that breaks contrast comes back before the review)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-design-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'shots', pages: [] }));
  const ran = [];
  let gates = 0;
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2; ran.push(command.slice(1).join(' ')); if (command.includes('gate')) return (gates++ === 0 ? 2 : 0); return 0; };
  const repairs = [];
  const agent = async ({ step }) => { repairs.push(step.id); return 0; };
  const result = await siteRun({ root, runner, agent, from: 'design-shots', to: 'design-gate' });
  assert.equal(result.code, 0);
  assert.deepEqual(repairs, ['design-gate-repair']);
  const shots = ran.filter((line) => line.includes('design-review.mjs prepare')).length;
  assert.equal(shots, 2, 'the shots are taken again after the repair');
  const repaired = ran.findIndex((line) => line.endsWith('build'));
  const audit = ran.slice(repaired).findIndex((line) => line.includes('audit-authoring-layout'));
  assert.ok(audit >= 0 && audit < ran.slice(repaired).findIndex((line) => line.includes('design-review.mjs prepare')), 'audited before it is shot again');
  assert.ok(ran.some((line) => line.endsWith('build')));
});

test('small design findings the gate lets through get the agent repair too; what it cannot mend is left in the report and the run goes on', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-polish-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'shots', pages: [] }));
  await writeFile(join(root, 'docs/research/design-review.json'), JSON.stringify({ findings: [{ pageType: 'home', viewport: 'desktop', block: 'cta', severity: 'P2', issue: 'bold button label' }] }));
  const ran = [];
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2; ran.push(command.slice(1).join(' ')); return command.includes('minor') ? 2 : 0; };
  const repairs = [];
  const agent = async ({ step }) => { repairs.push(step.id); return 0; };
  const result = await siteRun({ root, runner, agent, from: 'design-shots', to: 'design-polish' });
  assert.equal(result.code, 0, 'never a wait');
  assert.deepEqual(repairs, ['design-polish-repair'], 'one repair; the same finding still open after it is not tried again');
  assert.equal(ran.filter((line) => line.includes('design-review.mjs prepare')).length, 2, 'shot and reviewed again after the repair');
  assert.match(result.summary.find((item) => item.step === 'design-polish').status, /1 left after the repairs/);
  // A treatment rule for one block by its id is a small finding too.
  const { blockIdRules } = await import('../design-review.mjs');
  assert.deepEqual(blockIdRules('main :is([data-block-id="proof-1"], [data-block-id="proof-2"]) p {} .block--proof {} [data-block-id^="proof-1"] {}'), ['proof-1', 'proof-2']);
});

test('what an agent step changes outside its own outputs is put back: a changed file restored, a new file removed', async () => {
  const { spawnSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const { commitSite, ensureSiteRepo, restoreOutside } = await import('../lib/site-repo.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-repo-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  await writeFile(join(root, 'src/styles/reference.css'), '/* empty */\n');
  assert.ok(await ensureSiteRepo(root));
  commitSite(root, 'given');
  // The analysis writes its own file, and also the treatment and a scratch folder.
  await writeFile(join(root, 'docs/research/analysis/design-lock.json'), '{}');
  await writeFile(join(root, 'src/styles/reference.css'), ':root { --x: 1; }\n');
  await mkdir(join(root, 'tmp'), { recursive: true });
  await writeFile(join(root, 'tmp/scratch.txt'), 'x');
  // The run's own folder is the run's, not the agent's: a log a person redirected there stays.
  await mkdir(join(root, '.pipeline'), { recursive: true });
  await writeFile(join(root, '.pipeline/run.out'), 'log');
  const strays = restoreOutside(root, ['docs/research/analysis/design-lock.json']);
  assert.deepEqual(strays.sort(), ['src/styles/reference.css', 'tmp/scratch.txt']);
  assert.equal((await readFile(join(root, 'src/styles/reference.css'), 'utf8')).replace(/\r/g, ''), '/* empty */\n');
  assert.ok(!existsSync(join(root, 'tmp/scratch.txt')));
  assert.ok(existsSync(join(root, 'docs/research/analysis/design-lock.json')), 'its own output stays');
  assert.ok(existsSync(join(root, '.pipeline/run.out')), 'the run folder stays');
  assert.deepEqual(spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' }).stdout.trim().split(String.fromCharCode(10)).map((line) => line.trim()), ['?? .pipeline/run.out', '?? docs/research/analysis/design-lock.json']);
});

test('a site repository that cannot be committed stops the run before an agent step, and nothing is put back', async () => {
  const { commitSite, ensureSiteRepo, restoreOutside } = await import('../lib/site-repo.mjs');
  const { existsSync } = await import('node:fs');
  const root = await mkdtemp(join(tmpdir(), 'site-repo-lock-'));
  await writeFile(join(root, 'a.txt'), 'a');
  assert.ok(await ensureSiteRepo(root));
  // A git that died part way leaves its lock: site10's stayed two days, every commit since failed unseen, and the
  // put-back after an agent step removed every file made since the last commit that did land.
  await writeFile(join(root, 'new.txt'), 'made since');
  await writeFile(join(root, '.git/index.lock'), '');
  assert.throws(() => commitSite(root, 'before step'), /git add failed/);
  assert.throws(() => restoreOutside(root, []), /git/);
  assert.ok(existsSync(join(root, 'new.txt')), 'a file made since the last commit is kept');
});

test('the runs of an agent step go at most so many at a time and their parts are joined; the review runs only page types whose shots changed', async () => {
  const { runAgentStep } = await import('../lib/agent-step.mjs');
  const { joinSectionModules, steps: stepList } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'agent-parallel-'));
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  await writeFile(join(root, 'config/agent-steps/modules.md'), 'Name {{pageType}}');
  await mkdir(join(root, 'docs/research/analysis/section-modules'), { recursive: true });
  await writeFile(join(root, 'docs/research/analysis/section-modules.json'), JSON.stringify([{ pageType: 'about', index: 1, module: 'skip' }, { pageType: 'home', index: 9, module: 'old' }]));
  let running = 0;
  let most = 0;
  const codex = async ({ prompt }) => {
    running += 1; most = Math.max(most, running);
    await new Promise((done) => setTimeout(done, 20));
    const pageType = prompt.split(' ')[1];
    await writeFile(join(root, 'docs/research/analysis/section-modules', `${pageType}.json`), JSON.stringify([{ pageType, index: 1, module: 'splitMedia:single' }]));
    running -= 1;
    return { code: 0, stderr: '' };
  };
  const step = { prompt: 'modules', runs: async () => ['home', 'contact', 'solution', 'product_manufacturer'].map((pageType) => ({ values: { pageType }, images: [] })), join: joinSectionModules };
  assert.equal(await runAgentStep({ step, root, log: join(root, 'modules.log'), codex, concurrency: 3 }), 0);
  assert.equal(most, 3);
  const joined = JSON.parse(await readFile(join(root, 'docs/research/analysis/section-modules.json'), 'utf8'));
  assert.deepEqual(joined.map((item) => `${item.pageType}:${item.module}`).sort(), ['about:skip', 'contact:splitMedia:single', 'home:splitMedia:single', 'product_manufacturer:splitMedia:single', 'solution:splitMedia:single']);
  // Reviews: home's shots are unchanged since its review, about's changed: only about is reviewed again.
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'x', pages: [{ pageType: 'home', route: '/', shots: 'h1', images: [] }, { pageType: 'about', route: '/about/', shots: 'a2', images: [] }] }));
  await writeFile(join(root, 'docs/research/design-review/home.review.json'), JSON.stringify({ shots: 'h1', findings: [] }));
  await writeFile(join(root, 'docs/research/design-review/about.review.json'), JSON.stringify({ shots: 'a1', findings: [] }));
  const review = stepList(site).find((item) => item.id === 'design-review');
  assert.deepEqual((await review.runs(root)).map((run) => [run.values.pageType, run.values.shots]), [['about', 'a2']]);
});

test('repairs go round while the open problems go down, at most three rounds, and never twice on the same treatment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-rounds-')); await seedPhotos(root);
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await mkdir(join(root, 'src/styles'), { recursive: true });
  // Each audit reports the next count of failures; each repair changes the stylesheet (a new treatment).
  const runFrom = async (counts) => {
    let audits = 0;
    let repairsDone = 0;
    const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2;
      if (!String(command[1]).includes('audit-authoring-layout')) return 0;
      const count = counts[audits++] ?? 0;
      await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures: Array.from({ length: count }, (_, index) => ({ route: `/p${index}/`, viewport: 'desktop', issue: 'low_contrast' })) }));
      return count ? 1 : 0;
    };
    const agent = async () => { repairsDone += 1; await writeFile(join(root, 'src/styles/reference.css'), `.x { --n: ${Math.random()}; }`); return 0; };
    const result = await siteRun({ root, runner, agent, from: 'audits', to: 'audits' });
    return { result, repairsDone };
  };
  // 9 -> 5 -> 2 -> 0: three repairs, each made progress, and the run passes.
  const going = await runFrom([9, 5, 2, 0]);
  assert.equal(going.result.code, 0);
  assert.equal(going.repairsDone, 3);
  // 9 -> 9: the second round made no progress, so it stops after one repair.
  const stuck = await runFrom([9, 9, 9]);
  assert.equal(stuck.result.code, 1);
  assert.equal(stuck.repairsDone, 1);
  assert.ok(stuck.result.summary.some((item) => item.step === 'audits-repair' && /no progress/.test(item.status)));
  // The same treatment a repair was tried on before is not tried again (a later run, the stylesheet unchanged).
  await writeFile(join(root, 'src/styles/reference.css'), '.same {}');
  const once = await runFrom([3, 3]);
  assert.equal(once.repairsDone, 1);
  await writeFile(join(root, 'src/styles/reference.css'), '.same {}');
  const again = await runFrom([3]);
  assert.equal(again.repairsDone, 0);
  assert.ok(again.result.summary.some((item) => /tried on this very treatment before/.test(item.status)));
});

test('a repair the agent could not do (its usage limit) is not counted as tried: the next run tries it', async () => {
  const { AGENT_UNAVAILABLE, runAgentStep } = await import('../lib/agent-step.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-run-limit-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  await writeFile(join(root, 'config/agent-steps/repair-audits.md'), 'Repair');
  await writeFile(join(root, 'src/styles/reference.css'), '.same {}');
  const limited = async () => ({ code: 1, stderr: 'ERROR: You\'ve hit your usage limit. Visit https://chatgpt.com/codex/settings/usage' });
  assert.equal(await runAgentStep({ step: { prompt: 'repair-audits' }, root, log: join(root, 'r.log'), codex: limited }), AGENT_UNAVAILABLE);
  assert.equal(await runAgentStep({ step: { prompt: 'repair-audits' }, root, log: join(root, 'r.log'), codex: async () => ({ code: 1, stderr: 'boom' }) }), 1);
  // A run killed without an exit code (its timeout) failed: it is not done, whatever it wrote before.
  assert.equal(await runAgentStep({ step: { prompt: 'repair-audits' }, root, log: join(root, 'r.log'), codex: async () => ({ code: null, stderr: '' }) }), 1);
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2;
    if (!String(command[1]).includes('audit-authoring-layout')) return 0;
    await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures: [{ route: '/', viewport: 'desktop', issue: 'heavy_overlay' }] }));
    return 1;
  };
  let asked = 0;
  const first = await siteRun({ root, runner, agent: async () => { asked += 1; return AGENT_UNAVAILABLE; }, from: 'audits', to: 'audits' });
  assert.equal(first.code, 1);
  assert.ok(first.summary.some((item) => item.step === 'audits-repair' && /agent is unavailable/.test(item.status)));
  const second = await siteRun({ root, runner, agent: async () => { asked += 1; return AGENT_UNAVAILABLE; }, from: 'audits', to: 'audits' });
  assert.equal(asked, 2, 'the same treatment is tried again once the agent is back');
  assert.ok(!second.summary.some((item) => /tried on this very treatment before/.test(item.status)));
  // Nor is a repair whose agent run failed (it crashed or timed out): it gave no answer either.
  const failing = async () => { asked += 1; return 1; };
  const crashed = await siteRun({ root, runner, agent: failing, from: 'audits', to: 'audits' });
  assert.ok(crashed.summary.some((item) => item.step === 'audits-repair' && /agent run failed/.test(item.status)));
  const retried = await siteRun({ root, runner, agent: failing, from: 'audits', to: 'audits' });
  assert.equal(asked, 4);
  assert.ok(!retried.summary.some((item) => /tried on this very treatment before/.test(item.status)));
});

test('a judgment step asked exactly what it was asked before gets its answer back from the agent cache; a changed image asks again', async () => {
  const { rm } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'site-run-agent-cache-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  await writeFile(join(root, 'config/agent-steps/modules.md'), 'Name the modules of {{pageType}}');
  await mkdir(join(root, 'docs/research/pattern-sections/home'), { recursive: true });
  await writeFile(join(root, 'docs/research/pattern-sections/home/01-hero.png'), 'crop');
  let asked = 0;
  const agent = async ({ root: at }) => { asked += 1; await mkdir(join(at, 'docs/research/analysis'), { recursive: true }); await writeFile(join(at, 'docs/research/analysis/section-modules.json'), JSON.stringify([{ pageType: 'home', index: 1, module: 'hero:media-banner' }])); return 0; };
  const runModules = () => siteRun({ root, runner: async () => 0, agent, repo: true, from: 'modules', to: 'modules' });
  assert.equal((await runModules()).code, 0);
  assert.equal(asked, 1);
  // The output is gone, the question the same: the answer comes back without the agent.
  await rm(join(root, 'docs/research/analysis/section-modules.json'));
  const restored = await runModules();
  assert.equal(asked, 1);
  assert.ok(restored.summary.some((item) => item.status === 'answer restored from the agent cache'));
  assert.equal(JSON.parse(await readFile(join(root, 'docs/research/analysis/section-modules.json'), 'utf8'))[0].module, 'hero:media-banner');
  // The crop it would look at changed: a new question.
  await rm(join(root, 'docs/research/analysis/section-modules.json'));
  await writeFile(join(root, 'docs/research/pattern-sections/home/01-hero.png'), 'another crop');
  await runModules();
  assert.equal(asked, 2);
  // An answer that leaves a crop unnamed is not kept: the step waits, and the next run asks again.
  await writeFile(join(root, 'docs/research/pattern-sections/home/02-split.png'), 'crop');
  await rm(join(root, 'docs/research/analysis/section-modules.json'));
  assert.equal((await runModules()).code, 2);
  assert.equal(asked, 3);
  await rm(join(root, 'docs/research/analysis/section-modules.json'));
  await runModules();
  assert.equal(asked, 4);
  // A run value the instructions do not show (the rules a review is judged by) is part of the question too.
  const { agentKey } = await import('../lib/agent-cache.mjs');
  const inputsHash = async () => '';
  const review = (rules) => ({ prompt: 'modules', runs: async () => [{ values: { pageType: 'home', rules }, images: [] }] });
  assert.notEqual(await agentKey(root, review('r1'), { inputsHash }), await agentKey(root, review('r2'), { inputsHash }));
  const shown = { prompt: 'modules', runs: async () => [{ values: { pageType: 'home' }, images: [] }] };
  const filled = createHash('sha256').update('modules').update('Name the modules of {{pageType}}').update('Name the modules of home').update('');
  assert.equal(await agentKey(root, shown, { inputsHash }), filled.digest('hex').slice(0, 24), 'a step whose values all show keeps its key');
});

test('the module and review runs answer with JSON in their final message, which the run writes as UTF-8; a reply with no JSON fails the run', async () => {
  const { replyJson, runAgentStep } = await import('../lib/agent-step.mjs');
  const { moduleReply, reviewReply } = await import('../site-run.mjs');
  assert.deepEqual(replyJson('Here:\n```json\n[{"index": 1}]\n```\nDone.'), [{ index: 1 }]);
  assert.deepEqual(replyJson('{"findings": []}'), { findings: [] });
  assert.equal(replyJson('no json here'), null);
  const root = await mkdtemp(join(tmpdir(), 'agent-reply-'));
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  for (const name of ['modules', 'design-review']) await writeFile(join(root, `config/agent-steps/${name}.md`), 'Answer {{pageType}}');
  const answering = (text) => async ({ lastMessage }) => { await writeFile(lastMessage, text); return { code: 0, stderr: '' }; };
  const modules = { prompt: 'modules', reply: moduleReply, runs: async () => [{ values: { pageType: 'home' }, images: [] }] };
  assert.equal(await runAgentStep({ step: modules, root, log: join(root, 'm.log'), codex: answering('```json\n[{"index": 1, "module": "intro/proof", "why": "居中标题，浅色底"}]\n```') }), 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/research/analysis/section-modules/home.json'), 'utf8')), [{ index: 1, module: 'intro/proof', why: '居中标题，浅色底', pageType: 'home' }]);
  const review = { prompt: 'design-review', reply: reviewReply, runs: async () => [{ values: { pageType: 'about', route: '/about/', shots: 's1' }, images: [] }] };
  assert.equal(await runAgentStep({ step: review, root, log: join(root, 'r.log'), codex: answering('{"findings": [{"block": "hero", "severity": "P2"}]}') }), 0);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/research/design-review/about.review.json'), 'utf8')), { schemaVersion: 'seo-site-design-review-v1', shots: 's1', pageType: 'about', route: '/about/', findings: [{ block: 'hero', severity: 'P2' }] });
  assert.equal(await runAgentStep({ step: review, root, log: join(root, 'r.log'), codex: answering('I looked at it.') }), 1);
  assert.match(await readFile(join(root, 'r.log'), 'utf8'), /the reply holds no JSON/);
  // JSON of another shape is no empty answer: no findings (a passed gate) or no modules would be read into it.
  const { rm } = await import('node:fs/promises');
  await rm(join(root, 'docs/research/design-review/about.review.json'));
  for (const text of ['{"error": "could not open the images"}', '{"findings": [{"block": "hero", "severity": "p1"}]}', '{"findings": [{"block": "hero", "severity": "P1", "scope": "Site"}]}', '[{"severity": "P0"}]']) {
    assert.equal(await runAgentStep({ step: review, root, log: join(root, 'r.log'), codex: answering(text) }), 1, text);
  }
  assert.match(await readFile(join(root, 'r.log'), 'utf8'), /not what the step asks for/);
  assert.ok(!existsSync(join(root, 'docs/research/design-review/about.review.json')), 'no review written');
  assert.equal(await runAgentStep({ step: modules, root, log: join(root, 'm.log'), codex: answering('{"result": [{"index": 1, "module": "skip"}]}') }), 1);
});

test('a repair the site does not build with stops the run at once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-nobuild-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  let audits = 0;
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2;
    if (String(command[1]).includes('audit-authoring-layout')) {
      audits += 1;
      await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures: [{ route: '/', viewport: 'desktop', issue: 'low_contrast' }] }));
      return 1;
    }
    return command.includes('build') ? 1 : 0;
  };
  const result = await siteRun({ root, runner, agent: async () => 0, from: 'audits', to: 'audits' });
  assert.equal(result.code, 1);
  assert.equal(audits, 1, 'no second audit of a site that did not build');
  assert.ok(result.summary.some((item) => /does not build after the repair/.test(item.status)));
});

test('after a design repair the audit counts its problems afresh: more than before that repair still gets an audit repair', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-afresh-')); await seedPhotos(root);
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'shots', pages: [] }));
  // Audits: 2 failures, then 0 (after its repair), then 6 (after the design repair), then 0.
  const counts = [2, 0, 6, 0];
  let audits = 0;
  let gates = 0;
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2;
    if (String(command[1]).includes('audit-authoring-layout')) {
      const count = counts[audits++] ?? 0;
      await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures: Array.from({ length: count }, (_, index) => ({ route: `/p${index}/`, viewport: 'mobile', issue: 'boundary_gap' })) }));
      return count ? 1 : 0;
    }
    if (command.includes('gate')) return gates++ === 0 ? 2 : 0;
    return 0;
  };
  const repairs = [];
  const agent = async ({ step }) => { repairs.push(step.id); await writeFile(join(root, 'src/styles/reference.css'), `.x { --n: ${repairs.length}; }`); return 0; };
  const result = await siteRun({ root, runner, agent, from: 'audits', to: 'design-gate' });
  assert.deepEqual(repairs, ['audits-repair', 'design-gate-repair', 'audits-repair']);
  assert.equal(result.code, 0);
});

test('a review made under other rules (its instructions, the practice, the hooks and variants) is not current', async () => {
  const { reviewCurrent, reviewRules } = await import('../design-review.mjs');
  const root = await mkdtemp(join(tmpdir(), 'review-rules-'));
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  await writeFile(join(root, 'config/agent-steps/design-review.md'), 'Review v1');
  const before = await reviewRules(root);
  const page = { pageType: 'home', shots: 's1', rules: before };
  assert.ok(reviewCurrent(page, { shots: 's1', rules: before }));
  await writeFile(join(root, 'config/agent-steps/design-review.md'), 'Review v2');
  const after = await reviewRules(root);
  assert.notEqual(after, before);
  assert.ok(!reviewCurrent({ ...page, rules: after }, { shots: 's1', rules: before, findings: [{ block: 'hero', severity: 'P0', issue: 'x' }] }), 'same shots, new rules, a finding open: reviewed again');
  assert.ok(reviewCurrent({ ...page, rules: after }, { shots: 's1', rules: before, findings: [{ block: 'hero', severity: 'P2', issue: 'x' }] }), 'a review holding nothing is not sent back for new rules alone (owner 2026-11-14)');
  assert.ok(!reviewCurrent({ ...page, shots: 's2', rules: after }, { shots: 's1', rules: before, findings: [] }), 'new shots: reviewed again');
});

test('the same treatment with other problems is a new situation: a repair is tried again after the template changed', async () => {
  const { repairSituation } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'situation-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/reference.css'), '.x {}');
  const repair = { prompt: 'repair-audits', writes: ['src/styles/reference.css'] };
  const before = await repairSituation(root, repair, ['/|desktop|heavy_crop', '/a/|mobile|low_contrast']);
  assert.equal(await repairSituation(root, repair, ['/a/|mobile|low_contrast', '/|desktop|heavy_crop']), before, 'order does not matter');
  assert.notEqual(await repairSituation(root, repair, ['/a/|mobile|low_contrast']), before);
  // A template that gained a variant is a new situation too.
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'docs/research/CSS_HOOKS.md'), '| ctaForm | beside, below |');
  assert.notEqual(await repairSituation(root, repair, ['/|desktop|heavy_crop', '/a/|mobile|low_contrast']), before);
});

test('the section modules are stale once the crops they name change, and a page type the site no longer has is dropped from them', async () => {
  const { joinSectionModules, modulesCurrent } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'modules-current-'));
  for (const name of ['01-hero-banner.png', '02-split.png']) {
    await mkdir(join(root, 'docs/research/pattern-sections/home'), { recursive: true });
    await writeFile(join(root, 'docs/research/pattern-sections/home', name), '');
  }
  await mkdir(join(root, 'docs/research/analysis/section-modules'), { recursive: true });
  const modules = (items) => writeFile(join(root, 'docs/research/analysis/section-modules.json'), JSON.stringify(items));
  await modules([{ pageType: 'home', index: 1, module: 'hero:media-banner' }, { pageType: 'home', index: 2, module: 'splitMedia:single' }]);
  assert.equal(await modulesCurrent(root, ['home']), true);
  // A new capture found a third section: the modules no longer name every crop.
  await writeFile(join(root, 'docs/research/pattern-sections/home/03-faq.png'), '');
  assert.equal(await modulesCurrent(root, ['home']), false);
  // A page type the site dropped (still in the file, its crops still on disk) is stale too, and the join leaves it out.
  await modules([1, 2, 3].map((index) => ({ pageType: 'home', index, module: 'skip' })).concat({ pageType: 'about', index: 1, module: 'skip' }));
  assert.equal(await modulesCurrent(root, ['home']), false);
  await writeFile(join(root, 'docs/research/analysis/section-modules/about.json'), JSON.stringify([{ pageType: 'about', index: 1, module: 'skip' }]));
  await joinSectionModules(root, ['home']);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/research/analysis/section-modules.json'), 'utf8')).map((item) => item.pageType), ['home', 'home', 'home']);
  assert.equal(await modulesCurrent(root, ['home']), true);
  // The step's runs are the reference's page types only.
  await mkdir(join(root, 'docs/research/pattern-sections/about'), { recursive: true });
  const step = steps({ ...site, reference: { ...site.reference, pages: { home: '/' } } }).find((item) => item.id === 'modules');
  assert.deepEqual((await step.runs(root)).map((run) => run.values.pageType), ['home']);
});

test('a new capture and every blueprint write keep what the treatment and repairs chose in template-variants.json; the classifier\'s keys and the hero guess follow the competitor', async () => {
  const { withCapture, writeBlueprintPages } = await import('../scaffold-placeholder-pages.mjs');
  const chosen = { hero: 'plain', heroByPageType: { home: 'media-split', about: 'media-banner' }, pageTypes: { home: { splitSequence: ['dual'], featureGrid: 'media', blocks: { story: { variant: 'single' } }, cta: 'dark' } } };
  const previous = { pages: [{ pageType: 'home', heroVariant: 'media-overlay' }, { pageType: 'about', heroVariant: 'media-banner' }] };
  const report = { pages: [{ pageType: 'home', heroVariant: 'media-overlay', modules: { splitSequence: ['single'] } }, { pageType: 'about', heroVariant: 'plain', modules: {} }, { pageType: 'contact', heroVariant: 'plain', modules: { featureGrid: 'boxed' } }] };
  const next = withCapture(chosen, report, previous);
  // home: the site's hero (not the capture's guess) stays; about: still the old guess, so the new one; contact: none yet.
  assert.deepEqual(next.heroByPageType, { home: 'media-split', about: 'plain', contact: 'plain' });
  // The classifier's keys are this capture's (featureGrid it no longer finds is gone); the section variant and cta stay.
  assert.deepEqual(next.pageTypes.home, { splitSequence: ['single'], blocks: { story: { variant: 'single' } }, cta: 'dark' });
  assert.deepEqual(next.pageTypes.contact, { featureGrid: 'boxed' });
  // The blueprint write (every import) gives a page type the hero the analysis named only over the capture's guess.
  const root = await mkdtemp(join(tmpdir(), 'variants-merge-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ schemaVersion: 'seo-site-template-variants-v1', components: { hero: 'plain', heroByPageType: { home: 'media-split', about: 'media-overlay' }, pageTypes: { home: { blocks: { story: { variant: 'single' } } } } } }));
  await writeFile(join(root, 'docs/research/pattern-inventory.json'), JSON.stringify({ pages: ['home', 'about'].map((pageType) => ({ pageType, heroVariant: 'media-overlay', sections: [] })) }));
  await writeFile(join(root, 'docs/research/analysis/section-modules.json'), JSON.stringify(['home', 'about'].map((pageType) => ({ pageType, index: 1, module: 'hero:media-banner' }))));
  const pagesPlan = { pages: [{ page_id: 'home', page_type: 'home', label: 'Home', url: '/' }, { page_id: 'about', page_type: 'about', label: 'About', url: '/about/' }, { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' }] };
  await writeBlueprintPages({ root, pagesPlan });
  const written = JSON.parse(await readFile(join(root, 'src/data/template-variants.json'), 'utf8')).components;
  assert.deepEqual(written.heroByPageType, { home: 'media-split', about: 'media-banner' });
  assert.deepEqual(written.pageTypes.home.blocks, { story: { variant: 'single' } });
  assert.equal(written.tradePhotos, undefined, 'a clothing site photographs its products');
  // A service site (its trade's photos are scenes of its work) records it: its cards take icons (lib/slot-visuals.mjs).
  await writeFile(join(root, 'site.json'), JSON.stringify({ trade: 'service' }));
  await writeBlueprintPages({ root, pagesPlan });
  assert.equal(JSON.parse(await readFile(join(root, 'src/data/template-variants.json'), 'utf8')).components.tradePhotos, 'scenes');
});

test('a density failure at the audit is no rule fix and no agent repair: the run stops on it (the trial build calibrated the plan before the photos)', async () => {
  const { withMediaModules } = await import('../lib/media-slots.mjs');
  // A site with no density band (the template's own pages): an extra row a page's photoBreaks names (an older site's
  // data) goes in its longest run of photo-less sections.
  const text = (id) => ({ id, type: 'intro', heading: id, paragraphs: ['P'] });
  const page = { route: '/a/', pageType: 'solution', blocks: ['a', 'b', 'c', 'd', 'e', 'f'].map(text) };
  const components = { pageTypes: { solution: { mediaModules: [] } } };
  assert.equal(withMediaModules(page, components, {}).filter((block) => block.type === 'gallery').length, 0);
  assert.equal(withMediaModules(page, { ...components, photoBreaks: { '/a/': 1 } }, {}).filter((block) => block.type === 'gallery').length, 1);
  // A negative count takes the competitor's walls off (owner 2026-11-12: the photos follow the content).
  const walled = { pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'mosaic' }] } } };
  const walls = (more) => withMediaModules(page, { ...walled, ...more }, {}).filter((block) => block.type === 'gallery').length;
  assert.equal(walls({}), 1);
  assert.equal(walls({ photoBreaks: { '/a/': -1 } }), 0);
  // A competitor's wall goes only into a run holding more words than a picture-less run may (textRunWords).
  assert.equal(walls({ textRunWords: 100 }), 0, 'six short sections are no wall of text');
  // A run still holding more than the measure gets walls of its own until none does (owner 2026-11-12): six sections
  // of two words each, five words a run: the competitor's wall, then one in each half.
  assert.equal(walls({ textRunWords: 5 }), 3);
  assert.equal(walls({ textRunWords: 100, photoBreaks: { '/a/': 1 } }), 1, "the audit's extra row always goes in");
  // A reference whose walls are full-width photos gets bands: one photo across the page, and its extra rows are bands too.
  const banded = withMediaModules(page, { pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'band' }] } }, photoBreaks: { '/a/': 1 } }, {}).filter((block) => block.type === 'gallery');
  assert.deepEqual(banded.map((block) => [block.variant, block.items.length]), [['band', 1], ['band', 1]]);
  // In the run: a density failure the audit reports has no rule fix (break-text-runs.mjs refitted the model after the
  // photos were made, and the photos moved); the visual budget's failure is a rule's, so no agent patches it either:
  // the run stops on it and says so.
  const root = await mkdtemp(join(tmpdir(), 'site-run-rule-fix-')); await seedPhotos(root);
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  let audits = 0;
  const ran = [];
  const runner = async (command) => {
    ran.push(String(command[1]));
    if (String(command[1]).includes('audit-authoring-layout')) {
      audits += 1;
      await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures: [{ route: '/a/', viewport: 'desktop', issue: 'density_long_text_run' }] }));
      return 1;
    }
    return 0;
  };
  const repairs = [];
  const result = await siteRun({ root, runner, agent: async ({ step }) => { repairs.push(step.id); return 0; }, from: 'audits', to: 'audits' });
  assert.equal(result.code, 1);
  assert.equal(audits, 1, 'audited once: nothing replans the photos after they are made');
  assert.deepEqual(repairs, []);
  assert.ok(!ran.some((command) => command.includes('break-text-runs')));
  assert.ok(result.summary.some((item) => item.step === 'audits-repair' && /not given to the agent: 1 failure\(s\) .*\(density_long_text_run\)/.test(item.status)));
});

test('the agent repairs only what the site\'s stylesheet is where to fix: contrast, overflow, measure; a failure of another kind stops the run with its report', async () => {
  const { SITE_CSS_ISSUES, siteCssProblem } = await import('../site-run.mjs');
  assert.ok(['low_contrast', 'horizontal_overflow', 'long_measure'].every((issue) => SITE_CSS_ISSUES.includes(issue)));
  assert.equal(siteCssProblem('/a/|mobile|horizontal_overflow'), true);
  assert.equal(siteCssProblem('/a/||status_404'), false, 'a navigation failure of a missing page is no stylesheet\'s');
  const runFrom = async (issues) => {
    const root = await mkdtemp(join(tmpdir(), 'site-run-css-only-')); await seedPhotos(root);
    await writeFile(join(root, 'site.json'), JSON.stringify(site));
    await mkdir(join(root, 'docs/research'), { recursive: true });
    let audits = 0;
    const runner = async (command) => {
      if (String(command[1]).includes('break-text-runs')) return 2;
      if (!String(command[1]).includes('audit-authoring-layout')) return 0;
      const failures = audits++ === 0 ? issues.map((issue) => ({ route: '/a/', viewport: 'desktop', issue })) : [];
      await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures }));
      return failures.length ? 1 : 0;
    };
    const repairs = [];
    const result = await siteRun({ root, runner, agent: async ({ step }) => { repairs.push(step.id); return 0; }, from: 'audits', to: 'audits' });
    return { result, repairs };
  };
  const css = await runFrom(['low_contrast', 'long_measure']);
  assert.deepEqual([css.result.code, css.repairs], [0, ['audits-repair']]);
  // A heading off the axis and a row whose texts start apart are moved by the site's stylesheet: the agent's.
  assert.ok(['heading_off_axis', 'misaligned_row'].every((issue) => SITE_CSS_ISSUES.includes(issue)));
  // A crop or a grid's unfilled row beside a contrast failure: nothing goes to the agent.
  const rules = await runFrom(['low_contrast', 'heavy_crop', 'unfilled_row', 'heading_off_axis']);
  assert.deepEqual([rules.result.code, rules.result.failed, rules.repairs], [1, 'audits', []]);
  assert.match(rules.result.summary.find((item) => item.step === 'audits-repair').status, /not given to the agent: 2 failure\(s\) for a rule of the template \(heavy_crop, unfilled_row\); see docs\/research\/authoring-layout-audit\.json/);
});

test("the navigation audit's failures are open problems of the audit step too, one per failing check", async () => {
  const { navigationProblems } = await import('../lib/navigation-problems.mjs');
  assert.deepEqual(navigationProblems([
    { route: '/', status: 200, h1Count: 1, horizontalOverflow: false, mobileH1Count: 1, mobileHorizontalOverflow: true, sourceOriginLinks: [], unresolvedLinks: [] },
    { route: '/a/', status: 404, h1Count: 0, horizontalOverflow: false, sourceOriginLinks: [], unresolvedLinks: ['/b/'] },
  ]), ['/|mobile|horizontal_overflow', '/a/||status_404', '/a/|desktop|h1_count', '/a/||unresolved_links']);
});

test('a failing navigation audit does not keep the layout audit from running: both reports are of this build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-run-both-audits-'));
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const ran = [];
  const runner = async (command) => { ran.push(String(command[1])); if (String(command[1]).includes('break-text-runs')) return 2; return String(command[1]).includes('audit-navigation-shell') ? 1 : 0; };
  const result = await siteRun({ root, runner, from: 'audits', to: 'audits' });
  assert.equal(result.code, 1);
  assert.ok(ran.some((script) => script.includes('audit-authoring-layout')), 'the layout audit ran after the navigation audit failed');
});

test('an audit repair of the stylesheet alone goes back to the audit; one that changed the variants goes back to the images', async () => {
  const runOnce = async (writes) => {
    const root = await mkdtemp(join(tmpdir(), 'site-run-restart-')); await seedPhotos(root);
    await writeFile(join(root, 'site.json'), JSON.stringify(site));
    await mkdir(join(root, 'src/styles'), { recursive: true });
    await writeFile(join(root, 'src/styles/reference.css'), 'v0');
    const ran = [];
    let audits = 0;
    const runner = async (command) => {
      if (String(command[1]).includes('break-text-runs')) return 2;
      ran.push(String(command[1]).split('/').at(-1));
      if (String(command[1]).includes('audit-authoring-layout')) {
        await mkdir(join(root, 'docs/research'), { recursive: true });
        const failures = audits++ === 0 ? [{ route: '/a/', viewport: 'mobile', issue: 'heavy_overlay' }] : [];
        await writeFile(join(root, 'docs/research/authoring-layout-audit.json'), JSON.stringify({ failures }));
        return failures.length ? 1 : 0;
      }
      return 0;
    };
    const agent = async () => { for (const [path, text] of Object.entries(writes)) await writeFile(join(root, path), text); return 0; };
    const result = await siteRun({ root, runner, agent, repo: true, from: 'audits', to: 'audits' });
    return { result, ran };
  };
  const css = await runOnce({ 'src/styles/reference.css': 'v1' });
  assert.equal(css.result.code, 0);
  assert.ok(!css.ran.includes('plan-images.mjs'), `a stylesheet repair re-ran the images: ${css.ran.join(', ')}`);
  assert.ok(css.result.summary.every((item) => item.seconds === undefined || Number.isInteger(item.seconds)), 'each step records its seconds');
  const variants = await runOnce({ 'src/data/template-variants.json': JSON.stringify({ components: { band: 'left' } }) });
  assert.ok(variants.ran.includes('plan-images.mjs'), `a variants repair goes back to the images: ${variants.ran.join(', ')}`);
});

test('what the design repair lists as asked against the site rules or as a template gap holds nothing next round', async () => {
  const { applyListed, listedByRepair, judgeReviews } = await import('../design-review.mjs');
  const notes = ['# Notes', '## Asked against the site rules', '', '### Design-gate repair (2026-11-14)', '- `/privacy-policy/`, block `hero`, desktop and mobile: the overlay follows the site rule.', '## Template gaps', '- `/information-technology/` `m3`: two tinted sections in a row come from the alternation.', '## Excluded assets', '- `/` block `cta`: not a gap list.'].join('\n');
  const listed = listedByRepair(notes);
  assert.deepEqual(listed.map((entry) => entry.section), ['Asked against the site rules', 'Template gaps']);
  const findings = [{ route: '/privacy-policy/', block: 'hero', severity: 'P0', issue: 'x' }, { route: '/information-technology/', block: 'm3', severity: 'P0', issue: 'y' }, { route: '/', block: 'cta', severity: 'P0', issue: 'z' }, { route: '/privacy-policy/', block: 'hero-2', severity: 'P0', issue: 'w' }];
  assert.deepEqual(applyListed(findings, listed).map((finding) => Boolean(finding.resolution)), [true, true, false, false]);
  const manifest = { pages: [{ key: 'privacy', pageType: 'privacy', route: '/privacy-policy/', shots: 's' }] };
  assert.equal(judgeReviews(manifest, { privacy: { shots: 's', findings: [findings[0]] } }, [], listed).status, 'passed');
});

test('the images step runs again only when the photo demand changes, not on every change of the site\'s settings', async () => {
  const images = steps(site).find((step) => step.id === 'images' && step.kind === 'codex');
  assert.ok(images.inputs.includes('plan:photo-slots'));
  assert.ok(!images.inputs.includes('src/data/template-variants.json'), 'a setting that moves no photo position is no new photo');
  // The owner's own photos are part of what the library holds.
  assert.ok(images.inputs.includes('src/data/site-media.json'));
  // A folder with no site data still hashes (the demand is null there).
  const { inputsHash } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-run-demand-'));
  assert.equal(await inputsHash(root, ['plan:photo-slots']), await inputsHash(root, ['plan:photo-slots']));
});

test('a run says at its start which steps that call a model it will run, as far as the inputs say now', async () => {
  const { pendingPaidSteps, inputsHash } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-run-paid-'));
  const list = [
    { id: 'plan', kind: 'auto', inputs: [] },
    { id: 'board', kind: 'preview', paid: true, inputs: [] },
    { id: 'images', kind: 'codex', inputs: [] },
    { id: 'review', kind: 'agent', inputs: [], done: ['docs/review.json'] },
  ];
  // Nothing has run: every paid step is to run; a step that calls no model is not listed.
  assert.deepEqual((await pendingPaidSteps(root, list, {})).map((step) => step.id), ['board', 'images', 'review']);
  // A step that passed on these inputs is not; an agent step whose outputs are there is done.
  const hash = await inputsHash(root, []);
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs/review.json'), '{}');
  assert.deepEqual((await pendingPaidSteps(root, list, { board: { status: 'passed', hash }, images: { status: 'passed', hash: 'other' } })).map((step) => step.id), ['images']);
  // The style board's review calls a model (design-review.mjs board).
  assert.equal(steps(site).find((step) => step.id === 'style-board').paid, true);
});

test('the images step waits for a person when more photos already made are queued again than a run makes at once', () => {
  const images = steps(site).find((step) => step.id === 'images' && step.kind === 'codex');
  assert.match(images.waitsOnExit, /remake-hold\.md/);
});
