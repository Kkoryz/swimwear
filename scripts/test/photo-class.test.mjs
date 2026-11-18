import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkPlanText } from '../check-photo-text.mjs';
import { HELD_TEXT, photoClassOf, photoTextProblems } from '../lib/photo-class.mjs';
import { standInForReal } from '../lib/photo-sources.mjs';
import apparel from '../../config/image-briefs.json' with { type: 'json' };
import service from '../../config/image-briefs.service.json' with { type: 'json' };

// Owner 2026-11-17, via Site Factory: photos off their pages were found by the audits after four sites were built,
// and libraries were made again in batches (RateHarbor 20, MotelPilot 30). Each photo's class is planned before any is
// made, every photo to make is checked against its page's text by code, and one sample of each class is judged first.

test('each photo is in one of the owner\'s classes, decided from its trade, its class of photography and what it shows', () => {
  const goods = { kind: 'product', subject: 'a model wearing boardshorts' };
  assert.equal(photoClassOf(goods, apparel), 'goods');
  assert.equal(photoClassOf({ kind: 'material', subject: 'a close-up of the fabric used for swimwear' }, apparel), 'goods');
  assert.equal(photoClassOf({ kind: 'process', subject: 'fabric being cut for swimwear' }, apparel), 'process');
  // A section's ask: the factory at work is process, a model in the fit room is goods.
  assert.equal(photoClassOf({ kind: 'product', intent: { content: 'A Chinese female quality inspector stretches the side seam of a finished swimsuit', setting: 'Factory final inspection table' } }, apparel), 'process');
  assert.equal(photoClassOf({ kind: 'product', intent: { content: 'A model in a fitted women\'s Hawaiian shirt reaches one arm forward', setting: 'Factory fit room' } }, apparel), 'goods');
  assert.equal(photoClassOf({ kind: 'product', intent: { content: 'Folded shirts laid out in a row', setting: 'Factory packing area' } }, apparel), 'process', 'set on the factory floor, nobody wearing it');
  assert.equal(photoClassOf({ kind: 'portrait', subject: 'a client' }, apparel), 'portrait');
  // A service business: a report, a working screen, a delivered file; anything else is a generic scene.
  assert.equal(photoClassOf({ kind: 'lifestyle', subject: 'a printed weekly results sheet clipped to a board' }, service), 'service');
  assert.equal(photoClassOf({ kind: 'hero', subject: 'the exterior of a small independent city hotel at dusk' }, service), 'scene');
  // Every subject the service trade plans is of its class; every one of the clothing trade's process subjects is process.
  for (const [kind, list] of Object.entries(service.subjects)) for (const subject of list) assert.equal(photoClassOf({ kind, subject }, service), 'service', subject);
  for (const subject of apparel.subjects.process) assert.equal(photoClassOf({ kind: 'process', subject }, apparel), 'process');
  // The factory's photos go on the handoff's 必须实拍替换 list, whatever their class of photography.
  assert.equal(standInForReal({ kind: 'product', photoClass: 'process' }, '/a.webp', new Set()), true);
  assert.equal(standInForReal({ kind: 'product', photoClass: 'goods' }, '/a.webp', new Set()), false);
  assert.equal(standInForReal({ kind: 'product', photoClass: 'process' }, '/a.webp', new Set(['/a.webp'])), false, 'the owner\'s real photo');
});

test('a photo is checked against its page\'s H1 and copy before it is made: its topic, its audience, a generic scene', () => {
  const texts = ['Boardshorts manufacturer for surf brands. We cut and sew boardshorts in quick-dry fabric.'];
  assert.deepEqual(photoTextProblems({ kind: 'product', subject: 'a model wearing boardshorts' }, { texts, briefs: apparel }), []);
  assert.deepEqual(photoTextProblems({ kind: 'product', intent: { content: 'a stack of folded wedding dresses in a garden', setting: 'garden' } }, { texts, briefs: apparel }).map((problem) => problem.code), ['off_topic']);
  const men = apparel.pageThemes.find((theme) => theme.id === 'men');
  assert.deepEqual(photoTextProblems({ kind: 'product', intent: { content: 'a woman wearing boardshorts on the shore' } }, { texts, theme: men, briefs: apparel }).map((problem) => problem.code), ['wrong_audience']);
  assert.deepEqual(photoTextProblems({ kind: 'product', intent: { content: 'a man wearing boardshorts on the shore' } }, { texts, theme: men, briefs: apparel }), []);
  // A worker of either sex at the factory is no model of the page's audience.
  assert.deepEqual(photoTextProblems({ kind: 'product', intent: { content: 'a female machinist sewing boardshorts' } }, { texts, theme: men, briefs: apparel }), []);
  const children = { id: 'children', words: ['kid'], name: "children's" };
  assert.deepEqual(photoTextProblems({ kind: 'product', intent: { content: 'a woman wearing boardshorts' } }, { texts, theme: children, briefs: apparel }).map((problem) => problem.code), ['wrong_audience']);
  // A service site's generic scene.
  const rm = ['Revenue management for independent hotels: weekly pricing reports and OTA listings.'];
  assert.deepEqual(photoTextProblems({ kind: 'hero', subject: 'the lobby of a boutique hotel at dusk' }, { texts: rm, briefs: service }).map((problem) => problem.code), ['generic_scene']);
  assert.deepEqual(photoTextProblems({ kind: 'hero', subject: 'a printed hotel revenue report on a meeting table' }, { texts: rm, briefs: service }), []);
});

test('the text check flags the photos that fail and keeps them in the queue; a waiver lets one through; a made photo is never checked', () => {
  const pages = [
    { route: '/boardshorts-manufacturer/', pageType: 'product_manufacturer', hero: { heading: 'Boardshorts manufacturer' }, blocks: [{ id: 'm1', type: 'splitMedia', heading: 'Quick-dry fabric', paragraphs: ['We cut boardshorts from quick-dry fabric.'], visuals: [{ id: 'brief-m1-1', type: 'photo', content: 'a bride in a wedding dress in a garden' }] }] },
    { route: '/', pageType: 'home', hero: { heading: 'Swimwear made to order' }, blocks: [] },
  ];
  const plan = {
    routes: { '/boardshorts-manufacturer/': 'boardshorts', '/': 'general' },
    entries: [
      { id: 'boardshorts-hero-1', category: 'boardshorts', kind: 'hero', subject: 'a model wearing boardshorts, with some open space', status: 'planned' },
      { id: 'boardshorts-hero-1-phone', phoneOf: 'boardshorts-hero-1', category: 'boardshorts', kind: 'hero', subject: 'a model wearing boardshorts, with some open space', status: 'planned' },
      { id: 'brief', category: 'boardshorts', kind: 'product', intent: { route: '/boardshorts-manufacturer/', id: 'brief-m1-1', content: 'a bride in a wedding dress in a garden' }, subject: 'x', status: 'planned' },
      { id: 'general-hero-1', category: 'general', kind: 'hero', subject: 'a tractor in a field', status: 'planned' },
      { id: 'general-hero-1-phone', phoneOf: 'general-hero-1', category: 'general', kind: 'hero', subject: 'a tractor in a field', status: 'planned' },
      { id: 'made', category: 'general', kind: 'hero', subject: 'a tractor in a field', status: 'generated' },
    ],
  };
  const report = checkPlanText({ plan, pages, briefs: apparel, waivers: { 'general-hero-1': 'the owner keeps it' } });
  assert.deepEqual(report.flagged.map((item) => [item.id, item.problems.map((problem) => problem.code).join()]), [['brief', 'off_topic']]);
  assert.deepEqual(report.held, [], 'nothing is held (owner 2026-11-18: image problems are reported only)');
  assert.equal(report.checked, 3, 'phone twins go with their hero; made photos are not checked');
  // Every photo stays in the queue; the flagged one carries its problems.
  const status = Object.fromEntries(plan.entries.map((entry) => [entry.id, entry.status]));
  assert.deepEqual(status, { 'boardshorts-hero-1': 'planned', 'boardshorts-hero-1-phone': 'planned', brief: 'planned', 'general-hero-1': 'planned', 'general-hero-1-phone': 'planned', made: 'generated' });
  assert.equal(plan.entries.find((entry) => entry.id === 'brief').textCheck[0].code, 'off_topic');
  // Without the waiver the tractor is flagged too; a photo an earlier run held goes back to the queue.
  const again = { ...plan, entries: plan.entries.map((entry) => (entry.id === 'brief' ? { ...entry, status: HELD_TEXT } : { ...entry })) };
  const second = checkPlanText({ plan: again, pages, briefs: apparel });
  assert.deepEqual(second.flagged.map((item) => item.id), ['brief', 'general-hero-1']);
  assert.equal(again.entries.find((entry) => entry.id === 'brief').status, 'planned');
  // A page whose copy is not written yet has nothing to check a photo's topic against.
  assert.deepEqual(checkPlanText({ plan: structuredClone(plan), pages: pages.map((page) => ({ ...page, status: 'placeholder' })), briefs: apparel }).flagged, []);
});

// Photos with their own random texture: plain colours share one difference hash and pass for copies of each other.
const noise = (seed) => { let state = seed; return Buffer.from(Array.from({ length: 64 * 64 * 3 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state % 256; })); };

test('one sample of each class is made and judged first; while one has not passed, the library is not made', async () => {
  const { default: sharp } = await import('sharp');
  const { generateImages, SampleHold } = await import('../generate-images.mjs');
  const { judgeSamples } = await import('../judge-image-fit.mjs');
  const root = await mkdtemp(join(tmpdir(), 'samples-'));
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  const picture = (seed, path) => sharp(noise(seed), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(path);
  const ref = join(root, 'ref.png');
  await picture(1, ref);
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [ref], profile, range, shots: { framings: one('f'), poses: one('p') } } }, ideas: { poses: { site: one('p') }, scenes: one('s'), settings: one('linen'), prints: one('lemons'), details: one('ring'), childPrints: one('daisies') } }));
  const photo = (id, kind, photoClass) => ({ id, category: 'bikini', kind, index: 1, size: '1024x1024', subject: kind === 'process' ? 'a worker sewing bikini' : 'a model wearing bikini', styleRefs: [ref], status: 'planned', photoClass });
  const entries = [photo('bikini-product-1', 'product', 'goods'), photo('bikini-product-2', 'product', 'goods'), photo('bikini-product-3', 'product', 'goods'), photo('general-process-1', 'process', 'process'), photo('general-process-2', 'process', 'process')];
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', routes: { '/bikini/': 'bikini' }, productOnlySubjects: apparel.productOnlySubjects, variety: {}, entries }));
  const made = [];
  const run = async ({ prompt, lastMessage }) => {
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    made.push(master);
    await picture(made.length * 7919, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A floral bikini on pale linen."}`);
    return { code: 0, stderr: '' };
  };
  const plan = async () => JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'));
  const status = async () => Object.fromEntries((await plan()).entries.map((entry) => [entry.id, entry.status]));

  await generateImages({ root, concurrency: 1, samples: true, run });
  assert.equal(made.length, 2, 'one photo of each class');
  assert.deepEqual(await status(), { 'bikini-product-1': 'generated', 'bikini-product-2': 'planned', 'bikini-product-3': 'planned', 'general-process-1': 'generated', 'general-process-2': 'planned' });
  // Not judged yet: the library waits.
  await assert.rejects(generateImages({ root, concurrency: 1, requireSamples: true, run }), SampleHold);
  // The goods sample is off its page: sent back, and the library still waits (no photo made).
  const verdict = (labels) => async ({ images, lastMessage }) => { await writeFile(lastMessage, JSON.stringify({ label: labels(images[0]) })); return { code: 0, stderr: '' }; };
  const { judged } = await judgeSamples({ root, run: verdict((file) => (file.includes('bikini') ? 'wrong_subject' : 'fits')) });
  assert.deepEqual(judged.map((item) => [item.photoClass, item.label]), [['goods', 'wrong_subject'], ['process', 'fits']]);
  assert.equal((await status())['bikini-product-1'], 'rejected-review');
  await assert.rejects(generateImages({ root, concurrency: 1, requireSamples: true, run }), /no passed sample for goods/);
  assert.equal(made.length, 2, 'the library is not made while a sample has not passed');
  assert.match(await readFile(join(root, 'docs/research/images/samples.md'), 'utf8'), /还没通过的分类：goods/);
  // The next run makes the sent-back sample again; once it fits, the library is made.
  await generateImages({ root, concurrency: 1, samples: true, run });
  assert.deepEqual(made.slice(2).map((path) => path.split('/').at(-1)), ['bikini-product-1.png'], 'the goods sample again, the process class already passed');
  await judgeSamples({ root, run: verdict(() => 'fits') });
  await generateImages({ root, concurrency: 1, requireSamples: true, run });
  assert.deepEqual(Object.values(await status()), ['generated', 'generated', 'generated', 'generated', 'generated']);
  const record = JSON.parse(await readFile(join(root, 'docs/research/images/samples.json'), 'utf8'));
  assert.deepEqual(Object.fromEntries(Object.entries(record.classes).map(([key, sample]) => [key, [sample.id, sample.label]])), { goods: ['bikini-product-1', 'fits'], process: ['general-process-1', 'fits'] });
});

test("Site Factory's photo candidates are a section's briefs as they are; a position whose made photo fits keeps it; only the rest is read", async () => {
  const { planPhotoBriefs } = await import('../plan-photo-briefs.mjs');
  const root = await mkdtemp(join(tmpdir(), 'sf-photos-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'site.json'), JSON.stringify({ trade: 'service' }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { featureGrid: 'media', pageTypes: {}, cta: 'image-band', hero: 'media-overlay' } }));
  const candidate = { id: 'p1', type: 'photo', purpose: 'show the report', content: 'a printed weekly pricing report on a meeting table, every figure blurred', setting: 'office' };
  const pages = [{ route: '/', pageType: 'home', status: 'authored', hero: { heading: 'Revenue management' }, blocks: [
    { id: 'team', type: 'splitMedia', heading: 'Weekly reports', paragraphs: ['Every Monday you get a report.'], photoCandidates: [candidate] },
    { id: 'more', type: 'splitMedia', heading: 'Listings', paragraphs: ['We keep your OTA listings right.'] },
    { id: 'words', type: 'intro', heading: 'Who we are', paragraphs: ['P'], photoCandidates: [{ ...candidate, id: 'p2' }] },
    { id: 'close', type: 'cta', heading: 'Talk to us', links: [] },
  ] }];
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(pages));
  // The listings row's photo was judged on the page's subject at the last build: it keeps it.
  await writeFile(join(root, 'docs/research/image-fit.json'), JSON.stringify({ pages: [{ route: '/', images: [{ src: '/media/photos/general-product-1-960.webp', block: 'more', section: 'Listings', fit: 'fits' }] }] }));
  const asked = [];
  const run = async ({ prompt, lastMessage }) => {
    asked.push(prompt);
    await writeFile(lastMessage, JSON.stringify({ photos: [{ section: 'close', content: 'a signed one-page management plan on a desk, every name unreadable' }] }));
    return { code: 0, stderr: '' };
  };
  const result = await planPhotoBriefs({ root, run });
  assert.equal(asked.length, 1);
  assert.match(asked[0], /- close/);
  assert.doesNotMatch(asked[0], /- team|- more/, 'neither the position Site Factory wrote for nor the one whose photo fits is read');
  const briefs = JSON.parse(await readFile(join(root, 'src/data/photo-briefs.json'), 'utf8'));
  assert.deepEqual(Object.keys(briefs['/']).sort(), ['close', 'team']);
  assert.deepEqual([briefs['/'].team[0].content, briefs['/'].team[0].source, briefs['/'].team[0].sfId], [candidate.content, 'site-factory', 'p1']);
  assert.equal(result.kept, 1);
  assert.deepEqual(result.unused.map((item) => item.blockId), ['words'], 'a text section has no photo position: its candidate is reported, never a photo row');
  // Read again with nothing changed: no judgment.
  await planPhotoBriefs({ root, run });
  assert.equal(asked.length, 1);
});

test('a photo the text check held is named as refused and the page read again, once; the same answer is not taken from the cache (site11 2026-11-17)', async () => {
  const { planPhotoBriefs } = await import('../plan-photo-briefs.mjs');
  const root = await mkdtemp(join(tmpdir(), 'refused-photos-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  await writeFile(join(root, 'site.json'), JSON.stringify({ trade: 'service' }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { featureGrid: 'media', pageTypes: {}, cta: 'image-band', hero: 'media-overlay' } }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ route: '/rm/', pageType: 'solution', status: 'authored', hero: { heading: 'Revenue management' }, blocks: [{ id: 'close', type: 'cta', heading: 'Talk to us', links: [] }] }]));
  const scene = 'A motel owner phones a revenue manager in the courtyard.';
  const answers = [scene, 'a printed weekly rate report on a desk, every figure unreadable'];
  const asked = [];
  const run = async ({ prompt, lastMessage }) => {
    asked.push(prompt);
    await writeFile(lastMessage, JSON.stringify({ photos: [{ section: 'close', content: answers[Math.min(asked.length - 1, 1)] }] }));
    return { code: 0, stderr: '' };
  };
  await planPhotoBriefs({ root, run });
  assert.equal(asked.length, 1);
  // The text check holds the scene.
  await writeFile(join(root, 'docs/research/images/text-check.json'), JSON.stringify({ held: [{ id: 'rm-brief-close-1', routes: ['/rm/'], subject: scene, problems: [{ code: 'generic_scene', detail: 'this names no report' }] }] }));
  await planPhotoBriefs({ root, run });
  assert.equal(asked.length, 2, 'read again');
  assert.match(asked[1], /refused before they were made[\s\S]*motel owner phones a revenue manager[\s\S]*generic_scene: this names no report/);
  assert.match(JSON.parse(await readFile(join(root, 'src/data/photo-briefs.json'), 'utf8'))['/rm/'].close[0].content, /weekly rate report/);
  // Its next check passes (nothing held): the reading keeps; no third question.
  await writeFile(join(root, 'docs/research/images/text-check.json'), JSON.stringify({ held: [] }));
  await planPhotoBriefs({ root, run });
  assert.equal(asked.length, 2);
});
