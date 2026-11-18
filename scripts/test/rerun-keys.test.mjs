// What a site-run step and its items are keyed on, so unchanged work is not done again (owner 2026-11-17, site13's
// 40-minute run: "不要浪费这种不该跑的地方"): source files without their comments, each page's own part of the
// stylesheet, reviews that stand for shots within a pixel share of what they judged, judgments kept by their exact
// payload, the wordmark coloured by code, one polish a run, the iteration mode and the run's summary.

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cssRules, pageCss, pageWords, selectorNeeds, sharedCss } from '../lib/css-subset.mjs';
import { plainCss, printedScript, sourceDigest } from '../lib/source-norm.mjs';

const tempRoot = (name) => mkdtemp(join(tmpdir(), `${name}-`));

test('a source file counts without its comments and layout; any change to what runs or renders counts', () => {
  const script = (text) => sourceDigest('a.mjs', Buffer.from(text));
  const base = "import { x } from './x.mjs';\nexport const url = 'https://a.test/b'; // the site\nexport const pattern = /\\/\\*/;\n";
  assert.equal(script(base), script("import { x } from './x.mjs';\n/* a new comment */\nexport const url = 'https://a.test/b';\n\n   export const pattern = /\\/\\*/; // why\n"));
  assert.notEqual(script(base), script(base.replace('https://a.test/b', 'https://a.test/c')), 'a string that looks like a comment is code');
  assert.notEqual(script(base), script(base.replace('\\/\\*', '\\/\\+')), 'so is a regular expression');
  assert.notEqual(script(base), script(base.replace("'./x.mjs'", "'./y.mjs'")), 'an import is kept as written, used or not');
  // A file that does not parse counts by its bytes: a change is never hidden.
  assert.match(script('export const = ;'), /^raw:/);
  assert.notEqual(script('export const = ;'), script('export const = ; '));
  assert.match(printedScript('a < b > (c);', 'module.mjs'), /^a < b > \(c\);/, 'a .mjs file is read as JavaScript');
  const css = (text) => sourceDigest('a.css', Buffer.from(text));
  assert.equal(css('.a .b { color: red; } /* note */'), css('/* other note */\n.a  .b {\n  color: red;\n}'));
  assert.notEqual(css('.a .b { color: red; }'), css('.a.b { color: red; }'), 'a descendant is not a compound');
  assert.equal(plainCss('.a { content: "/* kept */"; }'), '.a { content: "/* kept */"; }');
  const astro = (text) => sourceDigest('A.astro', Buffer.from(text));
  assert.equal(astro("---\nimport B from './B.astro'; // the block\nconst { a } = Astro.props;\n---\n<B a={a} />\n"), astro("---\n// props\nimport B from './B.astro';\nconst { a } = Astro.props;\n---\n<B a={a} />\n"));
  assert.notEqual(astro("---\nimport B from './B.astro';\n---\n<B />\n"), astro("---\nimport B from './C.astro';\n---\n<B />\n"));
  assert.notEqual(astro('---\n---\n<p>a</p>\n'), astro('---\n---\n<p>b</p>\n'), 'the markup counts as written');
});

test("a step's inputs hash without comments, its own digest per input; the build and the template's checks count every byte", async () => {
  const { changedInputs, inputDigests, inputsHash, rawInputsHash, upgradeLegacyHashes, steps } = await import('../site-run.mjs');
  const root = await tempRoot('rerun-inputs');
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await writeFile(join(root, 'scripts/lib/shared.mjs'), 'export const shared = 1;\n');
  await writeFile(join(root, 'scripts/step.mjs'), "import { shared } from './lib/shared.mjs';\nconsole.log(shared);\n");
  await writeFile(join(root, 'data.json'), '{"a":1}');
  const inputs = ['data.json', 'code:scripts/step.mjs'];
  const before = await inputDigests(root, inputs);
  const hash = await inputsHash(root, inputs);
  const raw = await inputsHash(root, inputs, { raw: true });
  await writeFile(join(root, 'scripts/lib/shared.mjs'), '// A comment the owner added, 2026-11-17.\nexport const shared = 1;\n');
  assert.equal(await inputsHash(root, inputs), hash, 'a comment in a library the step imports: unchanged');
  assert.notEqual(await inputsHash(root, inputs, { raw: true }), raw, 'counted by its bytes for a raw step');
  await writeFile(join(root, 'scripts/lib/shared.mjs'), 'export const shared = 2;\n');
  assert.notEqual(await inputsHash(root, inputs), hash);
  assert.deepEqual(changedInputs(inputs, before, await inputDigests(root, inputs)), ['code:scripts/step.mjs']);
  assert.deepEqual(changedInputs(inputs, null, before), ['its inputs']);
  // A state recorded with the hash of every byte moves to today's hash (and digests) without running the step.
  const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'id', line: 'activewear', port: 4381 };
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const capture = steps(site).find((step) => step.id === 'capture');
  const state = { capture: { status: 'passed', hash: await rawInputsHash(root, capture.inputs) } };
  assert.equal(await upgradeLegacyHashes(root, state, steps(site)), true);
  assert.equal(state.capture.hash, await inputsHash(root, capture.inputs));
  assert.equal(state.capture.inputs.length, capture.inputs.length);
  // The steps whose output must be of the sources' every byte.
  assert.deepEqual(steps(site).filter((step) => step.raw).map((step) => step.id), ['template-check', 'build', 'release']);
});

test("a page's part of the stylesheet: the rules whose selectors can match its HTML or its scripts; tokens and tag rules are every page's", () => {
  assert.deepEqual(selectorNeeds('.block--icon-list .icon-list__item > h3:hover::after'), ['w:block--icon-list', 'w:icon-list__item']);
  assert.deepEqual(selectorNeeds('.a:not(.b):is(.c, d) [data-layout="stacked"] #main'), ['w:a', 's:stacked', 'w:main']);
  assert.deepEqual(selectorNeeds('.md\\:grid-cols-2'), ['w:md:grid-cols-2']);
  assert.deepEqual(selectorNeeds('.\\31 0'), [], 'a hex escape requires nothing');
  assert.deepEqual(selectorNeeds(':root'), []);
  const css = ':root{--ink:#111}h1{margin:0}@media (width>=768px){.hero{padding:2rem}.cards .card{gap:1rem}}.chat__message--user{color:red}.btn,p{color:blue}[aria-label="Open menu"]{x:1}@font-face{font-family:A}@keyframes f{0%{opacity:0}}';
  const rules = cssRules(css);
  const shared = sharedCss(rules);
  for (const part of [':root{--ink:#111}', 'h1{margin:0}', '.btn,p{color:blue}', '@font-face', '@keyframes f']) assert.ok(shared.includes(part), part);
  const hero = pageCss(rules, pageWords(['<main><section class="hero">x</section></main>']));
  assert.equal(hero, '@media (width>=768px){.hero{padding:2rem}');
  const cards = pageCss(rules, pageWords(['<div class="cards"><a class="card" aria-label="Open menu">c</a></div>', "item.className = `chat__message chat__message--${who}`;"]));
  assert.match(cards, /\.cards \.card/);
  assert.match(cards, /chat__message--user/, 'a class a script builds from a literal prefix counts as present');
  assert.match(cards, /Open menu/, 'an attribute value with a space is found as text');
  assert.doesNotMatch(cards, /\.hero/);
});

test("a module's rule changed changes the keys of the pages that show it only; a token changed changes every page's", async () => {
  const { builtPageKey, sharedPageKey } = await import('../lib/page-keys.mjs');
  const root = await tempRoot('rerun-pages');
  const page = (route, block, bundle) => writeFile(join(root, 'dist', route, 'index.html'), `<html><head><link rel="stylesheet" href="/_astro/BaseLayout.${bundle}.css"></head><body><main><section class="block--${block}">x</section></main></body></html>`);
  const build = async (css, bundle) => {
    await mkdir(join(root, 'dist/_astro'), { recursive: true });
    for (const route of ['a', 'b']) await mkdir(join(root, 'dist', route), { recursive: true });
    await writeFile(join(root, 'dist/_astro', `BaseLayout.${bundle}.css`), css);
    await page('a', 'icon-list', bundle);
    await page('b', 'faq', bundle);
    const shared = await sharedPageKey(root, {});
    const keys = { a: await builtPageKey(root, '/a/', shared), b: await builtPageKey(root, '/b/', shared) };
    const { rm } = await import('node:fs/promises');
    await rm(join(root, 'dist/_astro', `BaseLayout.${bundle}.css`));
    return keys;
  };
  const first = await build(':root{--ink:#111}.block--icon-list{gap:1rem}.block--faq{gap:2rem}', 'AAAAAAAA');
  const iconList = await build(':root{--ink:#111}.block--icon-list{gap:3rem}.block--faq{gap:2rem}', 'BBBBBBBB');
  assert.notEqual(iconList.a, first.a, 'the page with the icon list');
  assert.equal(iconList.b, first.b, 'the FAQ page keeps its key under a new bundle name');
  const token = await build(':root{--ink:#000}.block--icon-list{gap:3rem}.block--faq{gap:2rem}', 'CCCCCCCC');
  assert.notEqual(token.a, iconList.a);
  assert.notEqual(token.b, iconList.b, 'a token is every page\'s');
});

test('a new shot within REVIEW_PIXEL_SHARE of the shots its review judged, measuring the same, keeps the review; held to what was reviewed', async () => {
  const { default: sharp } = await import('sharp');
  const { prepareDesignReview, reviewCurrent, REVIEW_PIXEL_SHARE, shotDifference } = await import('../design-review.mjs');
  const root = await tempRoot('rerun-near');
  await writeFile(join(root, 'site.json'), JSON.stringify({ reference: { origin: 'https://example.com', pages: { about: '/about/' } } }));
  const dir = join(root, 'docs/research/reference-pages/about/design-references');
  await mkdir(dir, { recursive: true });
  for (const [name, width] of [['desktop-1440.png', 1440], ['mobile-390.png', 390]]) await sharp({ create: { width, height: 600, channels: 3, background: '#eeeeee' } }).png().toFile(join(dir, name));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'about', route: '/about/', pageType: 'about', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/about/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [] }]));
  await mkdir(join(root, 'dist/about'), { recursive: true });
  // The page draws a dark square of the size its HTML names (pixels of our side that change).
  const shoot = async (_browser, url, viewport) => {
    const html = await readFile(join(root, 'dist/about/index.html'), 'utf8');
    const side = Number(/square-(\d+)/.exec(html)?.[1] ?? 0);
    const layers = side ? [{ input: { create: { width: side, height: side, channels: 3, background: '#000000' } }, left: 10, top: 10 }] : [];
    return { image: await sharp({ create: { width: viewport.width, height: 800, channels: 3, background: '#ffffff' } }).composite(layers).png().toBuffer(), blocks: [{ id: 'intro', type: 'intro', top: 0, height: 100 }] };
  };
  const html = (side) => writeFile(join(root, 'dist/about/index.html'), `<html><body><main class="square-${side}">about</main></body></html>`);
  await html(0);
  const first = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  const reviewed = first.pages[0];
  await writeFile(join(root, 'docs/research/design-review/about.review.json'), JSON.stringify({ shots: reviewed.shots, rules: reviewed.rules, findings: [] }));
  const review = JSON.parse(await readFile(join(root, 'docs/research/design-review/about.review.json'), 'utf8'));
  // Three pixels a side: well under the share (a letter's spacing).
  await html(3);
  const small = (await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot })).pages[0];
  assert.notEqual(small.shots, reviewed.shots);
  assert.equal(small.near?.shots, reviewed.shots);
  assert.ok(reviewCurrent(small, review), 'the review stands');
  // A change the reviewer must see: a large square.
  await html(300);
  const large = (await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot })).pages[0];
  assert.equal(large.near, undefined);
  assert.equal(reviewCurrent(large, review), false);
  // Small steps do not add up unseen: each is held to the reviewed shots, not the last near one.
  await html(3);
  assert.ok((await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot })).pages[0].near);
  // Shots reviewed when they were taken another way (an earlier SHOT_METHOD) keep no review, however near (Staylumen
  // 2026-11-17: the enquiry bar hidden from the shots, the old review of the bar over the text stood at 0.12%).
  const { readdir } = await import('node:fs/promises');
  const bases = (await readdir(root, { recursive: true })).filter((path) => path.endsWith('basis.json'));
  assert.ok(bases.length);
  for (const path of bases) { const basis = JSON.parse(await readFile(join(root, path), 'utf8')); delete basis.method; await writeFile(join(root, path), JSON.stringify(basis)); }
  await html(4);
  assert.equal((await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot })).pages[0].near, undefined);
  const one = join(root, 'one.png');
  const other = join(root, 'other.png');
  await sharp({ create: { width: 100, height: 10, channels: 3, background: '#ffffff' } }).png().toFile(one);
  await sharp({ create: { width: 100, height: 11, channels: 3, background: '#ffffff' } }).png().toFile(other);
  assert.equal(await shotDifference(sharp, [one], [other]), 1, 'a page that grew is new to the review');
  assert.ok(REVIEW_PIXEL_SHARE > 0 && REVIEW_PIXEL_SHARE < 0.01);
});

test('the library review asks no model when every photo passed an earlier review, and never asks the same sheet twice', async () => {
  const { default: sharp } = await import('sharp');
  const { reviewLibrary } = await import('../review-image-library.mjs');
  const root = await tempRoot('rerun-library');
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  for (const id of ['a', 'b']) await sharp({ create: { width: 64, height: 64, channels: 3, background: id === 'a' ? '#336699' : '#996633' } }).png().toFile(join(root, `${id}.png`));
  const entry = (id, extra = {}) => ({ id, kind: 'product', category: 'general', subject: 'a swimsuit', status: 'generated', master: `${id}.png`, ...extra });
  const plan = (entries) => writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries }));
  const asked = [];
  const judge = async ({ lastMessage, label }) => { asked.push(label); await writeFile(lastMessage, '{"lookAlike":[],"samePerson":[],"wrongColour":[],"factoryScene":[],"weakSubject":[]}'); return { code: 0, stderr: '' }; };
  await plan([entry('a', { libraryReview: { passed: true } }), entry('b', { libraryReview: { passed: true } })]);
  assert.deepEqual(await reviewLibrary({ root, judge }), { reviewed: 0, rejected: [], unchanged: 2 });
  assert.deepEqual(asked, [], 'nothing new: nothing a review could send back');
  await plan([entry('a', { libraryReview: { passed: true } }), entry('b')]);
  await reviewLibrary({ root, judge });
  assert.equal(asked.length, 1);
  await plan([entry('a', { libraryReview: { passed: true } }), entry('b')]);
  await reviewLibrary({ root, judge });
  assert.equal(asked.length, 1, 'the same sheet and instructions: the kept reply');
});

// Owner 2026-11-18: images never hold a run (site13: 26 look-alikes sent back, half an hour of remakes in the run).
test('a photo the library review flags stays in use and is reported; --send-back sends it back to be made again', async () => {
  const { default: sharp } = await import('sharp');
  const { reviewLibrary } = await import('../review-image-library.mjs');
  const root = await tempRoot('flag-library');
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  for (const id of ['a', 'b']) await sharp({ create: { width: 64, height: 64, channels: 3, background: id === 'a' ? '#336699' : '#996634' } }).png().toFile(join(root, `${id}.png`));
  const entry = (id) => ({ id, kind: 'process', category: 'general', subject: 'a worker sewing', status: 'generated', master: `${id}.png` });
  const planFile = join(root, 'docs/research/image-plan.json');
  const judge = async ({ lastMessage }) => { await writeFile(lastMessage, '{"lookAlike":[{"photos":[1,2],"reason":"same worker, same hall"}],"samePerson":[],"wrongColour":[],"factoryScene":[],"weakSubject":[]}'); return { code: 0, stderr: '' }; };
  await writeFile(planFile, JSON.stringify({ entries: [entry('a'), entry('b')] }));
  const flagged = await reviewLibrary({ root, judge });
  assert.deepEqual([flagged.sentBack, flagged.rejected.map((item) => item.id)], [false, ['b']]);
  const kept = JSON.parse(await readFile(planFile, 'utf8')).entries.find((item) => item.id === 'b');
  assert.equal(kept.status, 'generated');
  assert.match(kept.libraryReview.flagged, /looks like photo 1 on the same page: same worker/);
  await writeFile(planFile, JSON.stringify({ entries: [entry('a'), entry('b')] }));
  await reviewLibrary({ root, judge, sendBack: true });
  assert.equal(JSON.parse(await readFile(planFile, 'utf8')).entries.find((item) => item.id === 'b').status, 'rejected-review');
});

test('a model call is counted by run and step, and refused in an iteration run', async () => {
  const { MODEL_CALLS, modelCallsOf, noteModelCall } = await import('../lib/model-calls.mjs');
  const root = await tempRoot('rerun-calls');
  await noteModelCall(root, { label: 'outside a run' }, {});
  await noteModelCall(root, { label: 'review' }, { SITE_RUN_ID: 'r1', SITE_RUN_STEP: 'design-review' });
  await noteModelCall(root, { label: 'photo', kind: 'image' }, { SITE_RUN_ID: 'r1', SITE_RUN_STEP: 'images' });
  await noteModelCall(root, { label: 'other run' }, { SITE_RUN_ID: 'r2', SITE_RUN_STEP: 'images' });
  assert.deepEqual(await modelCallsOf(root, 'r1'), { 'design-review': { judge: 1, image: 0 }, images: { judge: 0, image: 1 } });
  assert.equal((await readFile(join(root, MODEL_CALLS), 'utf8')).trim().split('\n').length, 3);
  await assert.rejects(noteModelCall(root, { label: 'a review' }, { SITE_RUN_NO_MODELS: '1' }), /iteration run/);
});

test('a new ink colours the drawn wordmark by code: nothing is drawn again unless the name changes', async () => {
  const { default: sharp } = await import('sharp');
  const { makeWordmark } = await import('../make-wordmark.mjs');
  const root = await tempRoot('rerun-wordmark');
  for (const dir of ['src/styles', 'src/data', 'public', 'docs/research/brand']) await mkdir(join(root, dir), { recursive: true });
  const drawIn = (file, width) => sharp({ create: { width: 1000, height: 400, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width, height: 120, channels: 3, background: '#171717' } }, left: 200, top: 140 }]).png().toFile(join(root, file));
  await drawIn('docs/research/brand/wordmark-1.png', 600);
  await drawIn('docs/research/brand/mark.png', 100);
  await writeFile(join(root, 'docs/research/brand/wordmark.json'), JSON.stringify({ name: 'Strandmill', ink: '#171717', drawings: [], chosen: 'docs/research/brand/wordmark-1.png', mark: 'docs/research/brand/mark.png' }));
  await writeFile(join(root, 'src/styles/global.css'), ':root { --heading-color: #000000; }');
  const record = await makeWordmark({ name: 'Strandmill', domain: 'strandmill.com', root, draw: async () => assert.fail('a new ink draws nothing') });
  assert.equal(record.ink, '#171717', 'the record keeps the ink it was drawn in');
  const { data, info } = await sharp(join(root, 'public/logo.png')).raw().toBuffer({ resolveWithObject: true });
  const solid = [...Array(info.width * info.height).keys()].map((index) => index * info.channels).find((at) => data[at + 3] === 255);
  assert.deepEqual([data[solid], data[solid + 1], data[solid + 2]], [0, 0, 0], 'the strokes are the new ink, fully opaque');
  assert.equal(JSON.parse(await readFile(join(root, 'src/data/site-identity.json'), 'utf8')).generated.ink, '#000000');
  let drawn = 0;
  await makeWordmark({ name: 'Strandmill Swim', domain: 'strandmill.com', root, draw: async () => { drawn += 1; return { code: 1 }; }, designs: 1 });
  assert.ok(drawn > 0, 'another name is drawn');
});

test('an iteration run calls no model and leaves the reviews, the photos and the verified build to certification; the summary says why each step ran', async () => {
  const { siteRun, steps, certificationOnly, reportLines } = await import('../site-run.mjs');
  const root = await tempRoot('rerun-iterate');
  const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'id', line: 'activewear', port: 4381, agent: 'none' };
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const ran = [];
  const runner = async (command) => { ran.push(command.join(' ')); return 0; };
  const list = steps(site);
  const iterated = await siteRun({ root, runner, iterate: true, to: 'design-gate' });
  const skipped = iterated.summary.filter((item) => item.status === 'skipped: certification only').map((item) => item.step);
  assert.deepEqual(skipped, list.slice(0, list.findIndex((step) => step.id === 'design-gate') + 1).filter(certificationOnly).map((step) => step.id));
  for (const id of ['brand', 'images', 'style-board', 'style-board-review', 'image-fit', 'design-shots', 'design-review', 'design-gate']) assert.ok(skipped.includes(id), id);
  assert.ok(!ran.some((command) => /verified-build|design-review\.mjs (gate|board)|generate-images|site-brand/.test(command)), 'nothing verified, no review read, no photo made');
  assert.ok(ran.some((command) => /audit-authoring-layout/.test(command)), 'the deterministic checks run');
  assert.equal(iterated.report.mode, 'iterate');
  assert.equal(process.env.SITE_RUN_NO_MODELS, undefined, 'the refusal ends with the run');
  // A step that runs says why; one whose inputs are the same is unchanged.
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), '[]');
  const again = await siteRun({ root, runner, iterate: true, to: 'layout-plan' });
  const plan = again.report.ran.find((item) => item.step === 'layout-plan');
  assert.match(plan.why, /src\/data\/authoring-pages\.json/);
  assert.ok(again.report.unchanged.includes('density'));
  assert.match(reportLines(again.report)[0], /run summary \(iterate\)/);
});

test('the small findings get one repair a run, every one of them at once, even when it moved them; what is left stays in the report', async () => {
  const { siteRun } = await import('../site-run.mjs');
  const root = await tempRoot('rerun-polish');
  await writeFile(join(root, 'site.json'), JSON.stringify({ reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'id', line: 'activewear', port: 4381 }));
  await mkdir(join(root, 'docs/research/design-review'), { recursive: true });
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify({ id: 'shots', pages: [] }));
  const findings = (block) => writeFile(join(root, 'docs/research/design-review.json'), JSON.stringify({ findings: [{ pageType: 'home', viewport: 'desktop', block, severity: 'P2', issue: 'spacing' }, { pageType: 'home', viewport: 'mobile', block: `${block}-2`, severity: 'P2', issue: 'weight' }] }));
  await findings('cta');
  const ran = [];
  const runner = async (command) => { if (String(command[1]).includes('break-text-runs')) return 2; ran.push(command.slice(1).join(' ')); return command.includes('minor') ? 2 : 0; };
  const repairs = [];
  // Each repair mends what it was given and the review after it finds others (the old rounds went on: 3 × 12 minutes).
  const agent = async ({ step }) => { repairs.push(step.id); await findings(`other-${repairs.length}`); return 0; };
  const result = await siteRun({ root, runner, agent, from: 'design-shots', to: 'design-polish' });
  assert.equal(result.code, 0);
  assert.deepEqual(repairs, ['design-polish-repair'], 'one repair a run');
  assert.equal(ran.filter((line) => line.includes('design-review.mjs prepare')).length, 2, 'the repaired pages are shot again for the gate');
  assert.match(result.summary.find((item) => item.step === 'design-polish-repair' && /one repair a run/.test(item.status))?.status ?? '', /one repair a run/);
  assert.ok(result.summary.some((item) => item.step === 'design-polish' && /2 left after the repairs/.test(item.status)));
});

test('the navigation audit opens again only the pages whose built output changed, and every failing page', async () => {
  const { auditNavigationShell } = await import('../audit-navigation-shell.mjs');
  const root = await tempRoot('rerun-nav');
  const page = (route) => ({ id: route, route, pageType: 'about', status: 'placeholder', seo: { title: 'T', description: 'D', canonical: route }, jsonLd: [], hero: { heading: 'H' }, blocks: [] });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page('/a/'), page('/b/')]));
  await writeFile(join(root, 'site-template.json'), JSON.stringify({ mode: 'authoring', sourceUrl: 'https://example.com/' }));
  for (const route of ['a', 'b']) { await mkdir(join(root, 'dist', route), { recursive: true }); await writeFile(join(root, 'dist', route, 'index.html'), `<main>${route}</main>`); }
  const opened = [];
  let broken = null;
  const open = async (route) => { opened.push(route); return { route, status: 200, h1Count: route === broken ? 2 : 1, horizontalOverflow: false, sourceOriginLinks: [], unresolvedLinks: [] }; };
  const run = () => auditNavigationShell({ baseUrl: 'http://x.test/', rootDir: root, open }).then((report) => report, (error) => error.message);
  await run();
  assert.deepEqual(opened, ['/a/', '/b/']);
  opened.length = 0;
  assert.equal((await run()).cached, 2);
  assert.deepEqual(opened, [], 'nothing changed: no page opened');
  await writeFile(join(root, 'dist/b/index.html'), '<main>b, edited</main>');
  broken = '/b/';
  assert.match(await run(), /navigation shell audit failed for 1 route/);
  assert.deepEqual(opened, ['/b/']);
  opened.length = 0;
  broken = null;
  await run();
  assert.deepEqual(opened, ['/b/'], 'a failing page is opened again');
});

test("a style-board module keeps its crops and review while its own markup and rules are the same, whatever another module's rule did", async () => {
  const { default: sharp } = await import('sharp');
  const { readdir, rm } = await import('node:fs/promises');
  const { prepareStyleBoard } = await import('../design-review.mjs');
  const root = await tempRoot('rerun-board');
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/style-board.json'), JSON.stringify({ route: '/style-board/', modules: [
    { key: 'team:default', evidence: [], samples: [{ role: 'only', route: '/', blockId: 't', words: 40 }] },
    { key: 'table:grid', evidence: [], samples: [{ role: 'only', route: '/', blockId: 'g', words: 90 }] },
  ] }));
  await mkdir(join(root, 'dist/style-board'), { recursive: true });
  await mkdir(join(root, 'dist/_astro'), { recursive: true });
  const build = async (css, bundle) => {
    for (const name of await readdir(join(root, 'dist/_astro'))) await rm(join(root, 'dist/_astro', name));
    await writeFile(join(root, 'dist/_astro', `BaseLayout.${bundle}.css`), css);
    await writeFile(join(root, 'dist/style-board/index.html'), `<html><head><link rel="stylesheet" href="/_astro/BaseLayout.${bundle}.css"></head><body><main data-board-key="team:default"><ul class="team"><li class="team-card">A</li></ul></main><main data-board-key="table:grid"><table class="table-block"><td>1</td></table></main></body></html>`);
  };
  // The board as drawn: the table module darker when its rule gives it more room.
  const shoot = async (_browser, _url, viewport) => {
    const css = await readFile(join(root, 'dist/_astro', (await readdir(join(root, 'dist/_astro')))[0]), 'utf8');
    const grey = css.includes('padding:2rem') ? '#999999' : '#dddddd';
    return { image: await sharp({ create: { width: viewport.width, height: 900, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width: viewport.width, height: 400, channels: 3, background: grey } }, left: 0, top: 500 }]).png().toBuffer(), modules: { 'team:default': { top: 0, bottom: 400, blocks: [] }, 'table:grid': { top: 500, bottom: 900, blocks: [] } } };
  };
  await build(':root{--ink:#111}.team-card{padding:1rem}.table-block td{padding:1rem}', 'AAAAAAAA');
  const first = await prepareStyleBoard({ baseUrl: 'http://x.test/', root, shoot });
  const team = first.board.find((entry) => entry.key === 'board--team-default');
  const table = first.board.find((entry) => entry.key === 'board--table-grid');
  assert.ok(team.source && table.source);
  await build(':root{--ink:#111}.team-card{padding:1rem}.table-block td{padding:2rem}', 'BBBBBBBB');
  const second = await prepareStyleBoard({ baseUrl: 'http://x.test/', root, shoot });
  assert.equal(second.keptModules, 1, 'the team module is kept');
  assert.deepEqual(second.board.find((entry) => entry.key === 'board--team-default'), team);
  assert.notEqual(second.board.find((entry) => entry.key === 'board--table-grid').shots, table.shots, 'the table module is cut anew');
  assert.deepEqual(second.board.map((entry) => entry.key), ['board--team-default', 'board--table-grid'], "in the board's order");
  for (const path of team.images) assert.ok((await readFile(join(root, path))).length > 0, 'its crops are still there');
  await build(':root{--ink:#000}.team-card{padding:1rem}.table-block td{padding:2rem}', 'CCCCCCCC');
  assert.equal((await prepareStyleBoard({ baseUrl: 'http://x.test/', root, shoot })).keptModules, 0, "a token is every module's");
});
