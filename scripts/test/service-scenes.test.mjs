import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkPlanText } from '../check-photo-text.mjs';
import { planLibrary } from '../lib/image-plan.mjs';
import { HELD_TEXT, photoClassOf } from '../lib/photo-class.mjs';
import { openClasses, samplesToMake } from '../lib/photo-samples.mjs';
import service from '../../config/image-briefs.service.json' with { type: 'json' };

// site14 2026-11-17 (Staylumen, a service site): the library review sent back five old generic scenes (a rental's
// living room, a pool and patio) and two service photos after plan-images had checked the one photo it planned. The
// second generate-images queued the scenes with their old subjects, unchecked, and held the library for a "scene"
// sample, a class never made; text-check.md said one photo was checked.

// site14's own subjects (site.json imageSubjects): scenes, and one hero of the online-service class.
const own = {
  hero: [
    "a bright, well-kept short-term rental home's living room in warm late-afternoon light, freshly styled for guests, with some open space on one side for a headline",
    'the exterior of a modern single-family vacation rental at golden hour, a pool and patio in front, with some open space on one side for a headline',
    'a remote rental coordinator at a laptop in a calm home office, seen from behind so the screen cannot be read, with some open space on one side for a headline',
    'a guest couple arriving with their bags at the front door of a vacation rental home at dusk, the porch light on, with some open space on one side for a headline',
  ],
  product: ["a vacation rental's backyard patio with lounge chairs and a pool in afternoon sun", 'the living room of a short-term rental with a sofa, throw pillows and a coffee table, styled for guests'],
};
const briefs = { ...service, trade: 'service', tradeSubjects: service.subjects, subjects: { ...service.subjects, ...own }, placeholderKinds: [] };
const components = { intro: 'gallery', featureGrid: 'outlined', pageTypes: {}, hero: 'media-overlay', heroByPageType: {} };
const intro = { id: 'i', type: 'intro', heading: 'Short-term rental management', paragraphs: ['We run your listings remotely and send a monthly report.'] };
const pages = ['/', '/about/', '/pricing/', '/how-it-works/'].map((route) => ({ route, pageType: route === '/' ? 'home' : 'about', status: 'authored', hero: { heading: 'Short-term rental management and co-hosting', lead: ['Listings, pricing and guest messages run remotely, with a monthly owner report.'] }, blocks: [intro] }));
const ref = (path) => ({ path, subject: '' });
const styleRefs = { hero: [ref('h1.jpg'), ref('h2.jpg'), ref('h3.jpg'), ref('h4.jpg'), ref('h5.jpg')], product: [ref('p1.jpg'), ref('p2.jpg')] };
const line = 'short term rental management';

function site14Plan() {
  const first = planLibrary({ pages, components, line, briefs, styleRefs });
  // The library as it stood: every photo made before the classes (generic scenes among them), the last hero sent back
  // by the library review as a look-alike, still with its old scene subject.
  const scene = own.hero[0];
  const entries = first.entries.map((entry, index) => ({ ...entry, status: 'generated', master: `docs/research/images/masters/${entry.id}.png`, sha256: `sha-${index}`, ...(entry.kind === 'hero' ? { subject: index % 2 ? own.hero[1] : scene, photoClass: 'scene' } : {}) }));
  const sentBack = entries.filter((entry) => entry.kind === 'hero').at(-1);
  Object.assign(sentBack, { status: 'rejected-review', reviewNote: 'looks like photo 1' });
  return { ...first, entries };
}

test('a service site plans no generic scene: a scene sent back is planned again as the online-service class, uncapped, the made scenes kept', () => {
  const previous = site14Plan();
  const sentBack = previous.entries.find((entry) => entry.status === 'rejected-review');
  assert.equal(photoClassOf(sentBack, briefs), 'scene');
  const plan = planLibrary({ pages, components, line, briefs, styleRefs, previous });
  const redrawn = plan.entries.find((entry) => entry.id === sentBack.id);
  assert.equal(redrawn.status, 'planned');
  assert.equal(redrawn.photoClass, 'service', redrawn.subject);
  assert.notEqual(redrawn.subject, sentBack.subject, 'not drawn again on its old scene');
  // A send-back carries the scenes it tried: generate-images does not count it against the remake cap.
  assert.ok(redrawn.triedScenes.length);
  // The library's other scenes stay (no batch remake); nothing to be made is a scene.
  const made = previous.entries.filter((entry) => entry.status === 'generated').map((entry) => entry.id);
  assert.deepEqual(plan.entries.filter((entry) => entry.status === 'generated').map((entry) => entry.id), made);
  assert.deepEqual(plan.entries.filter((entry) => entry.status !== 'generated').map((entry) => [entry.id, entry.photoClass]), [[sentBack.id, 'service']]);
  // A class with fewer service subjects of the site's own than its photos is topped up with the trade's: the heroes
  // are not all planned on the one coordinator subject.
  const fresh = planLibrary({ pages, components, line, briefs, styleRefs });
  const heroes = fresh.entries.filter((entry) => entry.kind === 'hero' && !entry.phoneOf);
  assert.ok(heroes.length >= 4);
  assert.ok(heroes.every((entry) => entry.photoClass === 'service'), heroes.map((entry) => entry.subject).join('\n'));
  assert.equal(new Set(heroes.map((entry) => entry.subject)).size, heroes.length, 'each hero its own subject');
  assert.equal(heroes[0].subject, own.hero[2], "the site's own subject first");
});

test('the samples never wait for a scene, and the text check counts the photos sent back', () => {
  const previous = site14Plan();
  const sentBack = previous.entries.find((entry) => entry.status === 'rejected-review');
  const passed = previous.entries.find((entry) => entry.status === 'generated' && entry.kind === 'product');
  const record = { classes: { service: { id: passed.id, sha256: passed.sha256, label: 'fits' } } };
  // The queue as the second generate-images saw it on site14: the send-back with its old class.
  assert.deepEqual(openClasses(previous, [sentBack], record, briefs), [], 'no sample is asked of a class never made');
  assert.deepEqual(samplesToMake(previous, [sentBack], record, briefs), []);
  // Planned again it is of the service class, whose sample passed.
  const plan = planLibrary({ pages, components, line, briefs, styleRefs, previous });
  const queue = plan.entries.filter((entry) => entry.status === 'planned');
  assert.deepEqual(openClasses(plan, queue, record, briefs), []);
  // The text check reads every photo still to be made, a send-back too: planned again, it passes.
  const report = checkPlanText({ plan, pages, briefs });
  assert.equal(report.checked, 1);
  assert.deepEqual(report.flagged, []);
  // Read before it is planned again (the plan as the review left it), the send-back is counted and flagged as a scene,
  // and stays in the queue (owner 2026-11-18: reported, not held).
  const stale = structuredClone(previous);
  const held = checkPlanText({ plan: stale, pages, briefs });
  assert.equal(held.checked, 1);
  assert.deepEqual(held.flagged.map((item) => [item.id, item.problems.map((problem) => problem.code)]), [[sentBack.id, ['generic_scene']]]);
  assert.deepEqual(held.held, []);
  assert.notEqual(stale.entries.find((entry) => entry.id === sentBack.id).status, HELD_TEXT);
});

test('the images step plans the library review\'s send-backs again, and checks them, before it makes them', async () => {
  const { steps } = await import('../site-run.mjs');
  const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'brand', line, port: 4999 };
  const run = steps(site).find((step) => step.id === 'images' && step.kind === 'codex').run.map((command) => command.slice(1).join(' '));
  const review = run.findIndex((command) => command.includes('review-image-library.mjs'));
  const remake = run.findIndex((command, index) => index > review && command.includes('generate-images.mjs') && !command.includes('--samples'));
  assert.ok(review > 0 && remake > review);
  assert.ok(run.slice(review + 1, remake).some((command) => command.includes('plan-images.mjs')), run.join('\n'));
  // A sample the review sent back is made again and judged before the rest (site13 2026-11-17: its process sample,
  // a look-alike, held the library until a person ran the step again).
  const between = run.slice(review + 1, remake);
  assert.ok(between.some((command) => command.includes('generate-images.mjs --samples')) && between.some((command) => command.includes('judge-image-fit.mjs --samples')), run.join('\n'));
});

test('generate-images never makes a scene sent back, and the samples do not hold the library for one', async () => {
  const { default: sharp } = await import('sharp');
  const { generateImages } = await import('../generate-images.mjs');
  const root = await mkdtemp(join(tmpdir(), 'service-scenes-'));
  await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
  await writeFile(join(root, 'site.json'), JSON.stringify({ trade: 'service', line }));
  const refPath = join(root, 'ref.png');
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).png().toFile(refPath);
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [refPath], profile, range, shots: { framings: one('f'), poses: one('p') } } }, ideas: { poses: { site: one('p') }, scenes: one('s'), settings: one('linen'), prints: one('lemons'), details: one('ring'), childPrints: one('daisies') } }));
  const scene = { id: 'general-hero-5', category: 'general', kind: 'hero', index: 5, size: '1536x1024', subject: own.hero[0], styleRefs: [refPath], status: 'rejected-review', photoClass: 'scene' };
  const sample = { id: 'general-product-1', category: 'general', kind: 'product', index: 1, size: '1024x1024', subject: service.subjects.product[0], styleRefs: [refPath], status: 'generated', sha256: 'abc', photoClass: 'service' };
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line, routes: { '/': 'general' }, variety: {}, entries: [scene, sample] }));
  await writeFile(join(root, 'docs/research/images/samples.json'), JSON.stringify({ classes: { service: { id: sample.id, sha256: 'abc', label: 'fits' } } }));
  const made = [];
  const run = async ({ prompt }) => { made.push(prompt); return { code: 1, stderr: 'not called' }; };
  await generateImages({ root, concurrency: 1, requireSamples: true, run });
  assert.deepEqual(made, [], 'the scene is not made');
  const plan = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'));
  assert.equal(plan.entries[0].status, 'rejected-review', 'it waits for plan-images to plan it again');
});

// site11 2026-11-17 (MotelPilot): its one photo to make, human-resources-lifestyle-3, a send-back (rejected-duplicate),
// was picked as the service sample, as the gate counts it; made, it came out a look-alike of a library photo, so no
// sample was recorded (samples.json classes {}) and the run stopped on "no passed sample for service". A photo sent back
// is the sample of its class like any photo to make; a sample this run's own checks send back is made again at once.
const noise = (seed) => { let state = seed; return Buffer.from(Array.from({ length: 64 * 64 * 3 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state % 256; })); };

test('a send-back is its class\'s sample; a sample that comes out a look-alike is made again in the same run, and named when it never lands', async () => {
  const { default: sharp } = await import('sharp');
  const { generateImages, SampleHold, SAMPLE_TRIES } = await import('../generate-images.mjs');
  const root = await mkdtemp(join(tmpdir(), 'service-sample-'));
  await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
  await writeFile(join(root, 'site.json'), JSON.stringify({ trade: 'service', line: 'motel' }));
  const picture = (seed, path) => sharp(noise(seed), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(path);
  const refPath = join(root, 'ref.png');
  await picture(1, refPath);
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [refPath], profile, range, shots: { framings: one('f'), poses: one('p') } } }, ideas: { poses: { site: one('p') }, scenes: one('s'), settings: one('linen'), prints: one('lemons'), details: one('ring'), childPrints: one('daisies') } }));
  const photo = (id, status) => ({ id, category: 'human resources', kind: 'lifestyle', index: 1, size: '1536x1024', subject: service.subjects.lifestyle[0].replaceAll('{category}', 'human resources'), styleRefs: [refPath], status, photoClass: 'service' });
  const planPath = join(root, 'docs/research/image-plan.json');
  const write = (entries) => writeFile(planPath, JSON.stringify({ line: 'motel', routes: {}, variety: {}, entries }));
  const read = async () => JSON.parse(await readFile(planPath, 'utf8'));
  // The library photo it is a look-alike of, made first (the gate off).
  const seeds = { 'revenue-management-lifestyle-3': [7] };
  const made = [];
  const run = async ({ prompt, lastMessage }) => {
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    const id = master.split('/').at(-1).replace('.png', '');
    made.push(id);
    await picture(seeds[id].shift(), join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A printed summary on a desk."}`);
    return { code: 0, stderr: '' };
  };
  await write([photo('revenue-management-lifestyle-3', 'planned')]);
  await generateImages({ root, concurrency: 1, run });
  const library = (await read()).entries[0];
  assert.equal(library.status, 'generated');
  // The send-back is the one photo to make: the gate counts it, and --samples picks it.
  await write([library, photo('human-resources-lifestyle-3', 'rejected-duplicate')]);
  await assert.rejects(generateImages({ root, concurrency: 1, requireSamples: true, run }), /no passed sample for service/);
  // Its first try looks like the library photo; the next is its own: made again in the same run, recorded.
  seeds['human-resources-lifestyle-3'] = [7, 99];
  await generateImages({ root, concurrency: 1, samples: true, run });
  assert.deepEqual(made.slice(1), ['human-resources-lifestyle-3', 'human-resources-lifestyle-3']);
  assert.equal((await read()).entries[1].status, 'generated');
  const record = JSON.parse(await readFile(join(root, 'docs/research/images/samples.json'), 'utf8'));
  assert.deepEqual([record.classes.service.id, record.classes.service.label, record.missed], ['human-resources-lifestyle-3', null, undefined]);
  // Every try a look-alike: tried SAMPLE_TRIES times, then named in samples.md with why.
  await write([library, photo('human-resources-lifestyle-3', 'rejected-duplicate')]);
  await writeFile(join(root, 'docs/research/images/samples.json'), JSON.stringify({ classes: {} }));
  seeds['human-resources-lifestyle-3'] = Array(SAMPLE_TRIES).fill(7);
  made.length = 0;
  await generateImages({ root, concurrency: 1, samples: true, run });
  assert.equal(made.length, SAMPLE_TRIES);
  const missed = JSON.parse(await readFile(join(root, 'docs/research/images/samples.json'), 'utf8'));
  assert.deepEqual(missed.missed, [{ id: 'human-resources-lifestyle-3', photoClass: 'service', status: 'rejected-duplicate', duplicateOf: 'revenue-management-lifestyle-3' }]);
  await assert.rejects(generateImages({ root, concurrency: 1, requireSamples: true, run }), SampleHold);
  const note = await readFile(join(root, 'docs/research/images/samples.md'), 'utf8');
  assert.match(note, /service：human-resources-lifestyle-3，与图库里已有的照片太像（与 revenue-management-lifestyle-3 太像）/);
  assert.match(note, /还没通过的分类：service/);
});
