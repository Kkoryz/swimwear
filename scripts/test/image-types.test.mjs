import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NOT_PRODUCT, allowedTypes, parseSlots, parseTypes, photoContexts, replyJson, slotsPrompt, typeOf, usedFor } from '../lib/image-types.mjs';
import { typedPrompt } from '../lib/image-prompt.mjs';
import { takeTurn } from '../lib/image-style.mjs';
import briefs from '../../config/image-briefs.json' with { type: 'json' };

const kind = (name, shows, extra = {}) => ({ name, shows, face: shows === 'worn' || shows === 'making' ? 'shown' : 'none', background: shows === 'chart' ? 'plain' : 'place', recipe: `How ${name} is made.`, jobs: [`job of ${name}`], photos: [1], ...extra });
const kinds = [kind('Banner', 'worn'), kind('Worker at a table', 'making'), kind('Swatch chart', 'chart'), kind(NOT_PRODUCT, 'chart')];

test("each reference photo is placed under the heading above it on the captured pages (a resized copy is the same photo)", () => {
  const html = '<h2>Our fabrics</h2><p>x</p><img src="https://ref.test/wp/fabric-300x200.jpg"><h2>Next</h2>';
  const [placed, unplaced] = photoContexts(['/refs/abc.jpg', '/refs/none.jpg'], [{ page: 'home', html, map: { 'https://ref.test/wp/fabric.jpg': 'assets/abc.jpg' } }]);
  assert.deepEqual(placed.uses, [{ page: 'home', heading: 'Our fabrics', next: 'Next' }]);
  assert.deepEqual(unplaced.uses, []);
  // A kind is listed for the page readings with the reference's own sections that show it.
  assert.deepEqual(usedFor({ photos: [1, 2] }, [placed, unplaced]), ['home: Our fabrics']);
  assert.match(slotsPrompt('bikini', [{ id: 'b-1', kind: 'product', topic: 'MOQs' }], [{ ...kinds[2], usedFor: ['manufacturer: MOQs'] }], 'a maker'), /"sections":\["manufacturer: MOQs"\]/);
});

test('a reply cut short by its closing brackets is read; kinds must say what they show, the face and the background', () => {
  assert.deepEqual(replyJson('note\n{"types":[{"name":"a"}'), { types: [{ name: 'a' }] });
  const types = parseTypes(`{"types":${JSON.stringify(kinds).slice(0, -2)}`, 3);
  assert.equal(types.length, 4);
  assert.throws(() => parseTypes(JSON.stringify({ types: [{ ...kinds[0], shows: 'lifestyle' }] }), 3), /shows, face, background/);
  assert.throws(() => parseTypes(JSON.stringify({ types: [{ ...kinds[0], photos: [4] }] }), 3), /photos 1-3/);
});

test('a process photo takes only a kind that shows making, a material photo only a chart, a chart only a photo of a section; logos are never a kind of ours', () => {
  assert.deepEqual(allowedTypes({ kind: 'process' }, kinds), [1]);
  assert.deepEqual(allowedTypes({ kind: 'product', topic: 'Fabric options' }, kinds), [0, 2]);
  assert.deepEqual(allowedTypes({ kind: 'product' }, kinds), [0], 'a page-wide photo is shown without its text');
  assert.deepEqual(allowedTypes({ kind: 'material' }, kinds), [2], "children's fabric photos were given model photos");
  assert.deepEqual(allowedTypes({ kind: 'material' }, kinds.slice(0, 2)), []);
  assert.deepEqual(allowedTypes({ kind: 'material' }, [{ ...kinds[2], face: 'cropped' }]), [], 'no garment drawn on a body');
  const entries = [{ id: 'p-1', kind: 'product', topic: 'Fabric options' }, { id: 'p-2', kind: 'process' }];
  assert.deepEqual(parseSlots('{"slots":[{"id":"p-1","kind":3},{"id":"p-2","kind":2}]}', entries, kinds), { 'p-1': 2, 'p-2': 1 });
  assert.throws(() => parseSlots('{"slots":[{"id":"p-1","kind":2},{"id":"p-2","kind":2}]}', entries, kinds), /p-1 was given kind 2, not one of 1, 3/);
  const imageTypes = { refs: ['r1.jpg'], types: kinds, pages: { bikini: { slots: { 'bikini-hero-1': 0 } } } };
  assert.equal(typeOf(imageTypes, { id: 'bikini-hero-1-phone', phoneOf: 'bikini-hero-1', category: 'bikini' }).name, 'Banner', 'a phone twin takes its hero\'s kind');
  assert.deepEqual(typeOf(imageTypes, { id: 'bikini-hero-1', category: 'bikini' }).refs, ['r1.jpg']);
  assert.equal(typeOf(null, { id: 'x', category: 'bikini' }), null);
  assert.equal(typeOf({ ...imageTypes, pages: { bikini: { slots: { 'bikini-material-1': 0 } } } }, { id: 'bikini-material-1', kind: 'material', category: 'bikini' }), null, 'a kind no longer allowed is not used');
});

test("a photo made as a kind: the kind's recipe and our place, pose and design; a worker for making; no realism words on a chart", () => {
  const entry = { id: 'e', kind: 'product', category: 'bikini', size: '1536x1024', topic: 'Quality control', colour: 'navy blue', print: 'tiny lemons', casting: 'in their twenties', place: 'a lemon grove', shot: { framing: 'F', pose: 'sitting on a step' } };
  const worn = typedPrompt(entry, { type: kinds[0], master: 'm.png', briefs, line: 'swimwear', attached: 2 });
  assert.match(typedPrompt({ ...entry, size: '1024x1536' }, { type: kinds[0], master: 'm.png', briefs, line: 'swimwear' }), /^Make ONE new portrait image \(1024x1536\), filling the whole frame with no borders or letterbox bars, of this kind: Banner\. How this kind is made \(recompose it for the portrait frame/m, "a phone hero's shape leads over a wide recipe");
  assert.ok(worn.includes('The model wears our bikini, for the page section "Quality control"'), 'the model wears the page\'s product');
  for (const line of ['of this kind: Banner. How this kind is made (recompose it for the landscape frame where it describes another shape): How Banner is made.', 'The 2 attached images', 'Setting: a lemon grove.', 'Pose: sitting on a step', 'Print: tiny lemons, on a navy blue ground.', 'Model: one adult in their twenties', briefs.prompts.realism, briefs.prompts.realismPerson, briefs.prompts.realismPlace, briefs.prompts.realismFabric, 'tasteful and non-suggestive']) assert.ok(worn.includes(line), line);
  const making = typedPrompt(entry, { type: kinds[1], master: 'm.png', briefs, line: 'swimwear' });
  assert.ok(making.includes(briefs.prompts.worker) && making.includes('It shows our bikini being made, for the page section "Quality control"'));
  assert.match(briefs.prompts.worker, /Chinese factory worker/, 'the factories are in China (owner 2026-10-30)');
  assert.ok(!making.includes('Model: one adult') && !making.includes('Pose:') && !making.includes('attached images'));
  // A photo of the making keeps the reference's kind of place, the production floor, not one of our places.
  assert.match(typedPrompt({ ...entry, place: undefined }, { type: kinds[1], master: 'm.png', briefs, line: 'swimwear', attached: 2 }), /kind of place \(the working production floor they show\)/);
  const chart = typedPrompt({ ...entry, place: undefined }, { type: kinds[2], master: 'm.png', briefs, line: 'swimwear' });
  assert.ok(!chart.includes(briefs.prompts.realism) && !chart.includes('photorealistic') && !chart.includes('No person'));
  assert.ok(chart.includes('no words, numbers or quantity marks anywhere in the image'), 'a board draws no counts');
  // A material chart shows fabrics, not the garments made of them.
  const swatches = typedPrompt({ ...entry, kind: 'material', topic: undefined, place: undefined, products: 'bikinis' }, { type: kinds[2], master: 'm.png', briefs, garments: { fabrics: 'recycled nylon' }, line: 'swimwear' });
  assert.ok(swatches.includes('It shows the fabrics of our bikini, as fabric only.') && swatches.includes('Fabrics: recycled nylon. Print: tiny lemons, on a navy blue ground.'));
  assert.ok(!swatches.includes('bikinis') && !swatches.includes(briefs.prompts.design));
});

test('photos take every item of a list before one comes back, whatever its length', () => {
  const prints = Array.from({ length: 20 }, (_, index) => `print ${index}`);
  assert.equal(new Set(Array.from({ length: 20 }, (_, n) => takeTurn(prints, n, 5))).size, 20, '20 prints stepped by 5 used to come back every fourth photo');
  assert.equal(new Set(Array.from({ length: 15 }, (_, n) => takeTurn(prints.slice(0, 15), n, 3))).size, 15);
  assert.equal(takeTurn([], 3, 5), undefined);
  // The models: Black, white and Hispanic only (owner 2026-10-29), every one of them in turn, neighbours of other groups.
  const group = (casting) => casting.match(/\b(Black|white|Hispanic)\b/)?.[1];
  assert.ok(briefs.casting.every(group), 'every model is Black, white or Hispanic');
  const turns = Array.from({ length: briefs.casting.length }, (_, n) => takeTurn(briefs.casting, n, 3));
  assert.equal(new Set(turns).size, briefs.casting.length);
  assert.ok(turns.slice(2).every((casting, n) => new Set([group(turns[n]), group(turns[n + 1]), group(casting)]).size === 3), 'three photos in a row show three groups');
});

async function site(prefix) {
  const { default: sharp } = await import('sharp');
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  // Photos with their own random texture: plain colours share one difference hash and pass for copies of each other.
  const noise = (seed) => { let state = seed; return Buffer.from(Array.from({ length: 64 * 64 * 3 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state % 256; })); };
  const picture = (seed, path) => sharp(noise(seed), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(path);
  const refs = [join(root, 'r1.png'), join(root, 'r2.png')];
  await picture(1, refs[0]);
  await picture(2, refs[1]);
  return { root, picture, refs };
}

test('the kinds are read once: descriptions in batches, one grouping, one reading per page; an unchanged site asks again for nothing', async () => {
  const { analyzeImageTypes } = await import('../analyze-image-types.mjs');
  const { root, refs } = await site('image-types-');
  await writeFile(join(root, 'docs/research/analysis/media.json'), JSON.stringify({ pools: { product: refs.map((localPath) => ({ localPath })) }, hero: [] }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: {} }));
  const photo = (id, entryKind, extra = {}) => ({ id, category: 'bikini', kind: entryKind, size: '1024x1024', status: 'planned', ...extra });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ siteKind: 'a swimwear maker', entries: [photo('bikini-hero-1', 'hero'), photo('bikini-process-1', 'process', { topic: 'Sampling' }), photo('bikini-portrait-1', 'portrait'), photo('bikini-hero-1-phone', 'hero', { phoneOf: 'bikini-hero-1' })] }));
  const asked = [];
  const run = async ({ prompt, images, lastMessage }) => {
    asked.push({ prompt, images });
    const reply = prompt.startsWith('The 2 attached images')
      ? '{"photos":[{"photo":1,"kind":"banner"},{"photo":2,"kind":"worker"}]}'
      : prompt.startsWith('Here are') ? JSON.stringify({ types: [kind('Banner', 'worn'), { ...kind('Worker at a table', 'making'), photos: [2] }] })
        : prompt.includes('nobody wears') ? '{"products":{"bikini":{"shows":"triangle and bandeau bikinis","worn":true}}}'
          : '{"slots":[{"id":"bikini-hero-1","kind":1},{"id":"bikini-process-1","kind":2}]}';
    await writeFile(lastMessage, reply);
    return { code: 0, stderr: '' };
  };
  const result = await analyzeImageTypes({ root, run });
  assert.equal(asked.length, 4, 'descriptions, grouping, the products, the page');
  assert.deepEqual(asked[0].images, refs);
  assert.match(asked[3].prompt, /"id":"bikini-process-1","section":"Sampling","kinds":\[2\]/);
  assert.match(asked[3].prompt, /"id":"bikini-hero-1","section":"the page hero"/);
  assert.ok(!asked[3].prompt.includes('portrait') && !asked[3].prompt.includes('phone'), 'portraits and phone twins take no kind of their own');
  assert.deepEqual(result.pages.bikini.slots, { 'bikini-hero-1': 0, 'bikini-process-1': 1 });
  assert.deepEqual([result.products.by, result.products.worn], [{ bikini: 'triangle and bandeau bikinis' }, { bikini: true }], "each category's garments named once");
  await analyzeImageTypes({ root, run });
  assert.equal(asked.length, 4, 'nothing read again');

  // A run stopped on a page (Codex's rate limit on site10) keeps what it read: the next run reads that page only.
  await writeFile(join(root, 'docs/research/image-types.json'), '{}');
  asked.length = 0;
  const limited = async (call) => (call.prompt.startsWith('The bikini page') ? { code: 1, stderr: '429 Too Many Requests' } : run(call));
  await assert.rejects(analyzeImageTypes({ root, run: limited }), /429/);
  assert.equal(asked.length, 3);
  await analyzeImageTypes({ root, run });
  assert.equal(asked.length, 4, 'only the page read again');
  assert.match(asked[3].prompt, /^The bikini page/);
});

test('a page whose photos show nothing worn (a service page of packaging or hardware) takes no kind of a model; its borrowed photos judged off its subject give it photos of its own', async () => {
  const { allowedTypes, notWornIn, parseProducts } = await import('../lib/image-types.mjs');
  const { ownPhotoRoutes, pageCategory } = await import('../lib/image-plan.mjs');
  const kinds = [{ name: 'Banner', shows: 'worn' }, { name: 'Still life', shows: 'product' }, { name: 'Board', shows: 'chart', face: 'none' }];
  const read = parseProducts('{"products":{"swimwear packaging brand labels":{"shows":"branded pouches, boxes and woven labels","worn":false},"bikini":"triangle bikinis"}}', ['swimwear packaging brand labels', 'bikini']);
  assert.deepEqual(read.worn, { 'swimwear packaging brand labels': false, bikini: true }, 'a plain string is a worn garment');
  const entry = notWornIn({ products: read }, { id: 'p-1', kind: 'product', category: 'swimwear packaging brand labels', topic: 'Pouches' });
  assert.deepEqual(allowedTypes(entry, kinds), [1, 2]);
  assert.deepEqual(allowedTypes({ ...entry, notWorn: undefined }, kinds), [0, 1, 2]);
  const pages = [{ route: '/packaging/', pageType: 'solution' }, { route: '/embroidery/', pageType: 'solution' }, { route: '/about/', pageType: 'about' }, { route: '/hardware/', pageType: 'solution' }];
  const fit = { pages: [
    { route: '/packaging/', images: [{ src: '/media/photos/general-product-7-960.webp', fit: 'wrong_subject' }] },
    { route: '/embroidery/', images: [{ src: '/media/photos/general-process-1-960.webp', fit: 'wrong_subject' }, { src: '/media/photos/general-product-2-960.webp', fit: 'fits' }] },
    { route: '/about/', images: [{ src: '/media/photos/general-product-1-960.webp', fit: 'wrong_subject' }] },
  ] };
  const own = ownPhotoRoutes(pages, fit, { placeholderKinds: ['process'] }, { routes: { '/hardware/': 'swimwear hardware' } });
  assert.deepEqual([...own].sort(), ['/hardware/', '/packaging/'], 'a misfit service page, and one that has its own already; not a factory stand-in, not an about page');
  assert.equal(pageCategory({ route: '/swimwear-packaging-custom-brand-labels/', pageType: 'solution' }, { categoryStopWords: ['custom'] }, new Set(['/swimwear-packaging-custom-brand-labels/'])), 'swimwear packaging brand labels');
  // Whether a print is carried is the reading's: hardware takes none, a plain string (an older reading) does.
  assert.deepEqual(parseProducts('{"products":{"hardware":{"shows":"rings","worn":false,"printed":false},"bikini":"bikinis"}}', ['hardware', 'bikini']).printed, { hardware: false, bikini: true });
  // No kind takes more than half of a page of four or more typed photos; the rest are made without one.
  const { spreadSlots } = await import('../lib/image-types.mjs');
  const six = Array.from({ length: 6 }, (_, index) => ({ id: `h-${index}` }));
  assert.deepEqual(spreadSlots({ 'h-0': 2, 'h-1': 2, 'h-2': 2, 'h-3': 2, 'h-4': 1, 'h-5': 2 }, six), { 'h-0': 2, 'h-1': 2, 'h-2': 2, 'h-4': 1 });
  assert.deepEqual(spreadSlots({ 'h-0': 2, 'h-1': 2, 'h-2': 2 }, six.slice(0, 3)), { 'h-0': 2, 'h-1': 2, 'h-2': 2 }, 'a page of three keeps them');
  // Photos take a print in the reference's proportion: its share of plain products is plain in ours, spread evenly.
  const { parsePlainShare, plainAt } = await import('../lib/image-style.mjs');
  assert.equal(parsePlainShare('{"plainShare":0.7}'), 0.7);
  assert.throws(() => parsePlainShare('{"plainShare":3}'), /0 to 1/);
  const plain = (share) => Array.from({ length: 100 }, (_, turn) => plainAt(turn, share)).filter(Boolean).length;
  assert.deepEqual([plain(0), plain(0.3), plain(0.7), plain(1)].map((count) => Math.round(count / 10)), [0, 3, 7, 10]);
  assert.ok(Array.from({ length: 10 }, (_, turn) => plainAt(turn, 0.5)).some(Boolean) && Array.from({ length: 10 }, (_, turn) => plainAt(turn, 0.5)).some((value) => !value), 'mixed within ten photos, not in a run');
});

test("the kinds are read from every image of the captured pages, charts included, not from the style references alone; icons are left out", async () => {
  const { default: sharp } = await import('sharp');
  const { analyzeImageTypes } = await import('../analyze-image-types.mjs');
  const { root, refs } = await site('captured-types-');
  await writeFile(join(root, 'docs/research/analysis/media.json'), JSON.stringify({ pools: { product: refs.map((localPath) => ({ localPath })) }, hero: [] }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: {} }));
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: [] }));
  const assets = join(root, 'docs/research/reference-pages/home/public/reference-assets');
  await mkdir(assets, { recursive: true });
  await sharp({ create: { width: 400, height: 320, channels: 3, background: '#ccc' } }).png().toFile(join(assets, 'swatch-chart.png'));
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toFile(join(assets, 'icon.png'));
  const asked = [];
  const run = async ({ prompt, images, lastMessage }) => {
    asked.push(images);
    await writeFile(lastMessage, prompt.startsWith('Here are') ? JSON.stringify({ types: [kind('Swatch chart', 'chart')] }) : '{"photos":[{"photo":1,"kind":"chart"}]}');
    return { code: 0, stderr: '' };
  };
  const result = await analyzeImageTypes({ root, run });
  assert.deepEqual(result.refs, [join(assets, 'swatch-chart.png')]);
  assert.deepEqual(asked[0], [join(assets, 'swatch-chart.png')]);
});

test('a photo of a model refused at every try: a cover-up, then a more covering cut in the next pose, then the product alone (owner 2026-10-29)', async () => {
  const { generateImages } = await import('../generate-images.mjs');
  const { root, picture, refs } = await site('modest-cut-');
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs, profile, range, shots: { framings: one('f'), poses: [{ text: 'standing', photos: 1 }, { text: 'sitting', photos: 1 }] } } }, ideas: { poses: { site: one('leaning') }, scenes: one('a lemon grove'), settings: one('pale linen'), prints: one('lemons'), details: one('ring'), childPrints: one('daisies') } }));
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', productOnlySubjects: briefs.productOnlySubjects, variety: {}, entries: [{ id: 'w-product-1', category: 'women', kind: 'product', index: 1, size: '1024x1024', subject: 'a model wearing women', casting: 'in their twenties', styleRefs: refs, status: 'planned' }] }));
  const prompts = [];
  const run = async ({ prompt, lastMessage }) => {
    prompts.push(prompt);
    if (!prompt.includes('with no person')) { await writeFile(lastMessage, 'image_gen refused this request (moderation_blocked)'); return { code: 0, stderr: '' }; }
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(31, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A floral one-piece swimsuit laid flat on pale linen."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, run });
  const [entry] = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries;
  assert.equal(prompts.length, 4);
  assert.deepEqual(prompts.map((prompt) => [prompt.includes(briefs.prompts.coverUp), prompt.includes(briefs.prompts.modestCut)]), [[false, false], [true, false], [true, true], [false, false]], 'the product alone needs no covering cut');
  assert.deepEqual([entry.status, entry.productOnly, entry.refusals.length], ['generated', true, 3]);
});

test("the heroes of two pages take different places, poses and prints (site10's heroes all sat on one stone terrace)", async () => {
  const { generateImages } = await import('../generate-images.mjs');
  const { root, picture, refs } = await site('hero-turns-');
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const list = (...texts) => texts.map((text) => ({ text, photos: 1 }));
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs, profile, range, shots: { framings: list('f'), poses: list('p') } } }, ideas: { poses: { site: list('sitting', 'standing', 'walking') }, scenes: list('a terrace', 'a shore', 'a garden'), settings: list('linen'), prints: list('lemons', 'palms', 'waves'), details: list('ring'), childPrints: list('daisies') } }));
  const hero = (category) => ({ id: `${category}-hero-1`, category, kind: 'hero', index: 1, size: '1536x1024', subject: `a model wearing ${category}`, casting: briefs.casting[0], styleRefs: refs, status: 'planned' });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', productOnlySubjects: briefs.productOnlySubjects, variety: {}, entries: [hero('bikini'), hero('trunks')] }));
  let n = 0;
  const run = async ({ prompt, lastMessage }) => {
    n += 1;
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(n * 7919, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A model in a printed swimsuit outdoors in warm sunlight."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, run });
  const [first, second] = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries;
  assert.notEqual(first.place, second.place);
  assert.notEqual(first.print, second.print);
  assert.notEqual(first.shot.pose, second.shot.pose);
});

test('a run rate-limited by Codex (429) stops at once: the rest of the queue stays planned, not failed one after another', async () => {
  const { generateImages } = await import('../generate-images.mjs');
  const { root, refs } = await site('rate-limited-');
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs, profile, range } } }));
  const photo = (id) => ({ id, category: 'bikini', kind: 'material', index: 1, size: '1024x1024', subject: 'fabric', styleRefs: [], status: 'planned' });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', variety: {}, entries: [photo('a'), photo('b')] }));
  let calls = 0;
  const run = async () => { calls += 1; return { code: 1, stderr: 'ERROR: exceeded retry limit, last status: 429 Too Many Requests' }; };
  await generateImages({ root, concurrency: 1, run });
  const statuses = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries.map((entry) => entry.status);
  assert.deepEqual([calls, ...statuses], [1, 'failed', 'planned']);
});

test('a chart made as one of the reference kinds is not scored against its photographs (CSD put a design board at 0.28)', async () => {
  const { scoreImageStyle } = await import('../score-image-style.mjs');
  const { root, refs } = await site('chart-score-');
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs } } }));
  const photo = (id, imageShows) => ({ id, kind: 'product', status: 'generated', master: refs[0], sha256: id, imageShows });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: [photo('board', 'chart'), photo('worn', 'worn')] }));
  const seen = [];
  await scoreImageStyle({ root, install: { python: 'p', weights: 'w' }, score: async (install, references, images) => { seen.push(...images); return images.map(() => 0.7); } });
  assert.equal(seen.length, 1);
  const entries = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries;
  assert.deepEqual(entries.map((entry) => Boolean(entry.styleScore)), [false, true]);
});

test("a photo given a kind is made from it with two of its reference photos, and published finished; a chart as made", async () => {
  const { generateImages } = await import('../generate-images.mjs');
  const { root, picture, refs } = await site('typed-generate-');
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs, profile, range, shots: { framings: one('f'), poses: one('p') } } }, ideas: { poses: { site: one('sitting on a step') }, scenes: one('a lemon grove'), settings: one('pale linen'), prints: one('tiny lemons'), details: one('a gold ring'), childPrints: one('daisies') }, props: { list: ['a straw hat'] } }));
  await writeFile(join(root, 'docs/research/image-types.json'), JSON.stringify({ refs: [...refs, refs[0]], types: [{ ...kind('Banner', 'worn'), photos: [1, 2, 3] }, { ...kind('Swatch chart', 'chart'), photos: [2] }], pages: { bikini: { slots: { 'bikini-product-1': 0, 'bikini-product-2': 1 } } } }));
  const photo = (id, index) => ({ id, category: 'bikini', kind: 'product', index, size: '1024x1024', subject: 'a model wearing bikini', colour: 'navy blue', casting: 'in their twenties', styleRefs: ['class-ref.png'], status: 'planned' });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', productOnlySubjects: briefs.productOnlySubjects, variety: {}, entries: [photo('bikini-product-1', 1), { ...photo('bikini-product-2', 2), topic: 'Fabric colours' }] }));
  const calls = [];
  const run = async ({ prompt, images, lastMessage }) => {
    calls.push({ prompt, images });
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(calls.length * 7919, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A woman in a navy floral bikini sitting on a step in a lemon grove."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, run });
  const [worn, chart] = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries;
  assert.deepEqual(calls[0].images, refs, "two of its kind's reference photos, not the class's");
  assert.match(calls[0].prompt, /this kind: Banner[\s\S]*Setting: a lemon grove\.[\s\S]*Pose: sitting on a step/);
  // Our props (owner 2026-10-29: not every photo a bare model): a photo of a model takes one; a chart none.
  assert.ok(calls[0].prompt.includes('Prop: a straw hat, used naturally') && !calls[1].prompt.includes('Prop:'));
  const { parseProps, propsPrompt } = await import('../lib/image-style.mjs');
  assert.deepEqual(parseProps('{"props":["a straw hat"," a paperback ","fruit"]}'), ['a straw hat', 'a paperback', 'fruit']);
  assert.throws(() => parseProps('{"props":[]}'), /props need/);
  assert.match(propsPrompt({ poses: ['sitting'], scenes: ['a terrace'], profile: { poseAndEnergy: 'relaxed' } }), /hold, wear or have beside them/);
  assert.match(calls[1].prompt, /this kind: Swatch chart/);
  assert.ok(!calls[1].prompt.includes('Setting:'), 'a chart has no setting');
  assert.deepEqual([worn.status, worn.imageType, chart.imageType], ['generated', 'Banner', 'Swatch chart']);
  // A model no longer in the casting is replaced by one of the list in the photo's turn in the library.
  assert.ok(briefs.casting.includes(worn.casting) && briefs.casting.includes(chart.casting) && worn.casting !== chart.casting);
  assert.match(calls[0].prompt, new RegExp(`Model: one adult ${worn.casting}`));
  assert.ok(existsSync(join(root, 'docs/research/images/masters/bikini-product-1.finished.png')), 'a photo is published finished');
  assert.ok(!existsSync(join(root, 'docs/research/images/masters/bikini-product-2.finished.png')), 'a chart is published as made');

  // A second board laid out like the first is not a look-alike: a chart shares its kind's layout.
  const plan = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'));
  plan.entries.push({ ...plan.entries[1], id: 'bikini-product-3', index: 3, status: 'planned', master: undefined, dhash: undefined });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify(plan));
  const types = JSON.parse(await readFile(join(root, 'docs/research/image-types.json'), 'utf8'));
  types.pages.bikini.slots['bikini-product-3'] = 1;
  await writeFile(join(root, 'docs/research/image-types.json'), JSON.stringify(types));
  const same = async ({ prompt, lastMessage }) => {
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(2 * 7919, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A swatch chart of navy floral fabric in six colours on white."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, only: ['bikini-product-3'], run: same });
  const board = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries.find((entry) => entry.id === 'bikini-product-3');
  assert.deepEqual([board.status, board.nearestInLibrary.distance], ['generated', 0]);
});
