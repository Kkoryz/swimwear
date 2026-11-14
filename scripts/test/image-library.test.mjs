import assert from 'node:assert/strict';
import test from 'node:test';

import { differenceHash, hamming } from '../lib/image-hash.mjs';
import { pageCategory, pickReferences, planLibrary } from '../lib/image-plan.mjs';
import { fillTemplate, imagePrompt } from '../lib/image-prompt.mjs';
import { libraryMedia } from '../lib/library-media.mjs';
import briefs from '../../config/image-briefs.json' with { type: 'json' };

const components = { intro: 'gallery', featureGrid: 'outlined', pageTypes: { product_manufacturer: { splitSequence: ['single'] } }, hero: 'media-overlay', heroByPageType: { contact: 'plain' } };
const intro = { id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] };
const split = (id) => ({ id, type: 'splitMedia', heading: 'H', paragraphs: ['P'], media: null });
const pages = [
  { route: '/leggings-manufacturer/', pageType: 'product_manufacturer', blocks: [intro, split('a'), split('b'), split('c'), split('d')] },
  { route: '/wholesale-leggings/', pageType: 'product_wholesale', blocks: [intro, split('e')] },
  { route: '/t-shirts-manufacturer/', pageType: 'product_manufacturer', blocks: [intro] },
  { route: '/', pageType: 'home', blocks: [intro] },
  { route: '/contact/', pageType: 'contact', blocks: [] },
];
const ref = (path, subject = '') => ({ path, subject });
const styleRefs = { product: [ref('p1.jpg', 'Woman in black leggings'), ref('p2.jpg', 'Man in a tee'), ref('p3.jpg')], hero: [ref('h.jpg')], process: [ref('f.jpg', 'factory')] };
const allKinds = { ...briefs, placeholderKinds: [] };

test('product pages share their category library; every other page uses the site-wide one', () => {
  assert.equal(pageCategory(pages[0], briefs), 'leggings');
  assert.equal(pageCategory(pages[1], briefs), 'leggings');
  assert.equal(pageCategory(pages[2], briefs), 't-shirts');
  assert.equal(pageCategory(pages[3], briefs), 'general');
  assert.equal(pageCategory({ route: '/men-s-swimwear-manufacturer/', pageType: 'product_manufacturer' }, briefs), "men's swimwear", 'the possessive the slug lost');
  const plan = planLibrary({ pages, components, line: 'activewear', briefs: allKinds, styleRefs });
  const count = (category, kind) => plan.entries.filter((entry) => entry.category === category && entry.kind === kind).length;
  assert.equal(count('leggings', 'product'), 4);
  assert.equal(count('leggings', 'process'), 0, "process photos are the site's own set (SHARED_KINDS), not the category's");
  assert.equal(count('general', 'process'), 4, 'four split rows on one page: the cap (three) gives way, no slot stays empty (owner 2026-11-12)');
  assert.equal(count('leggings', 'hero'), 1);
  assert.equal(count('general', 'hero'), 1, 'contact has a plain hero; home still needs one');
  assert.equal(plan.routes['/wholesale-leggings/'], 'leggings');
  const find = (id) => plan.entries.find((item) => item.id === id);
  assert.equal(find('leggings-product-1').styleRefs[0], 'p1.jpg', 'a reference showing the product leads');
  assert.equal(find('leggings-product-1').scene, 'Woman in black leggings');
  assert.match(find('leggings-product-2').subject, /leggings/);
  const look = (id) => `${find(id).colour} | ${find(id).casting}`;
  assert.notEqual(look('t-shirts-product-1'), look('leggings-product-1'), 'the same slot on two product pages is not the same picture (colours come round every 14 photos; the model differs)');
  assert.doesNotMatch(find('leggings-product-2').subject, /full body|wide|close crop|two /, 'a subject names content only: framing comes from the reference');
  assert.match(find('general-product-1').subject, /activewear/);
});

test('placeholder classes are not generated; a changed brief is planned again', () => {
  const plan = planLibrary({ pages, components, line: 'activewear', briefs, styleRefs });
  assert.equal(plan.entries.filter((item) => item.kind === 'process').length, 0, 'process photos stay image slots');
  assert.deepEqual(plan.placeholders, ['process']);
  const entry = plan.entries.find((item) => item.id === 'leggings-product-2');
  const again = planLibrary({ pages, components, line: 'activewear', briefs, styleRefs, previous: { entries: [{ ...entry, status: 'generated' }] } });
  assert.equal(again.entries.find((item) => item.id === 'leggings-product-2').status, 'generated', 'a generated image with an unchanged brief is kept');
  const moved = planLibrary({ pages, components, line: 'activewear', briefs, styleRefs: { ...styleRefs, product: styleRefs.product.filter((item) => item.path !== entry.styleRefs[0]) }, previous: { entries: [{ ...entry, status: 'generated' }] } });
  assert.equal(moved.entries.find((item) => item.id === 'leggings-product-2').status, 'planned', 'a photo whose reference is gone is planned again');
  const recast = planLibrary({ pages, components, line: 'activewear', briefs: { ...briefs, garmentColours: ['teal'] }, styleRefs, previous: { entries: [{ ...entry, status: 'generated' }] } });
  assert.equal(recast.entries.find((item) => item.id === 'leggings-product-2').status, 'generated', 'new variety lists do not throw away a photo already made');
  // A photo the image-fit judge sent back is planned again with its count of send-backs, so it is sent back once only.
  const refit = planLibrary({ pages, components, line: 'activewear', briefs, styleRefs, previous: { entries: [{ ...entry, status: 'rejected-review', fitRemakes: 1 }] } }).entries.find((item) => item.id === 'leggings-product-2');
  assert.deepEqual([refit.status, refit.fitRemakes], ['planned', 1]);
  // A photo made in a workspace this one was copied from records that workspace's paths: matched by file name, it stays
  // and points at the references here (site10's 34 made photos were planned again).
  const elsewhere = { ...entry, status: 'generated', styleRefs: entry.styleRefs.map((path) => `D:/other-workspace/refs/${path}`) };
  const copied = planLibrary({ pages, components, line: 'activewear', briefs, styleRefs, previous: { entries: [elsewhere] } }).entries.find((item) => item.id === 'leggings-product-2');
  assert.deepEqual([copied.status, copied.styleRefs], ['generated', entry.styleRefs]);
});

test("a product for children is shown without a person, and a photo of it made on one is made again (site10's toddler swimwear on adult models)", () => {
  const kids = [{ route: '/toddler-swimwear-manufacturer/', pageType: 'product_manufacturer', blocks: [intro, split('a')] }, { route: "/men-s-swimwear-manufacturer/", pageType: 'product_manufacturer', blocks: [intro, split('b')] }];
  const plan = planLibrary({ pages: kids, components, line: 'swimwear', briefs, styleRefs });
  const people = (category) => plan.entries.filter((entry) => entry.category === category && ['hero', 'product'].includes(entry.kind));
  assert.ok(people('toddler swimwear').length && people('toddler swimwear').every((entry) => entry.productOnly && !entry.casting && !entry.pose));
  assert.ok(people("men's swimwear").every((entry) => !entry.productOnly && entry.casting), 'adult products stay on a person');
  const worn = plan.entries.map((entry) => (entry.category === 'toddler swimwear' ? { ...entry, productOnly: undefined, casting: 'in their twenties', status: 'generated' } : { ...entry, status: 'generated' }));
  const again = planLibrary({ pages: kids, components, line: 'swimwear', briefs, styleRefs, previous: { entries: worn } });
  assert.ok(people('toddler swimwear').every((entry) => again.entries.find((item) => item.id === entry.id).status === 'planned'));
  assert.ok(people("men's swimwear").every((entry) => again.entries.find((item) => item.id === entry.id).status === 'generated'));
  const flat = again.entries.find((entry) => entry.id === people('toddler swimwear')[0].id);
  assert.ok(flat.productOnly && !flat.casting);
  const kept = planLibrary({ pages: kids, components, line: 'swimwear', briefs, styleRefs, previous: { entries: plan.entries.map((entry) => ({ ...entry, status: 'generated' })) } });
  assert.ok(kept.entries.every((entry) => entry.status === 'generated'), 'made without a person: kept');
});

test("a page's photos take the reference's shots and settings in turn, so neighbours differ", async () => {
  const { inTurn, pickShot } = await import('../lib/image-style.mjs');
  assert.deepEqual(inTurn([{ text: 'wall', photos: 2 }, { text: 'paving', photos: 1 }, { text: 'linen', photos: 1 }]), ['wall', 'paving', 'linen', 'wall']);
  const shots = { framings: [{ text: 'f1', photos: 2 }, { text: 'f2', photos: 1 }], poses: [{ text: 'p1', photos: 1 }, { text: 'p2', photos: 1 }, { text: 'p3', photos: 1 }] };
  const page = [0, 1, 2, 3].map((turn) => pickShot(shots, turn));
  for (let index = 1; index < page.length; index += 1) {
    assert.notEqual(page[index].pose, page[index - 1].pose, 'next photo, next pose');
    assert.notDeepEqual(page[index], page[index - 1]);
  }
});

test("a process photo borrows only production scenes (site10's sewing-floor stand-ins were planned on beach references)", () => {
  const refs = { ...styleRefs, product: [...styleRefs.product, ref('beach.jpg', 'a woman in a bikini on the beach')], process: [ref('f.jpg', 'factory')], material: [ref('cutting-room.jpg', 'fabric on a cutting table in the factory')] };
  const plan = planLibrary({ pages, components, line: 'activewear', briefs: { ...allKinds, productionSceneWords: ['factory'] }, styleRefs: refs });
  const process = plan.entries.filter((item) => item.kind === 'process');
  assert.ok(process.length > 1, 'more process photos than process references: some borrow');
  assert.ok(process.every((item) => ['f.jpg', 'cutting-room.jpg'].includes(item.styleRefs[0])), JSON.stringify(process.map((item) => item.styleRefs[0])));
});

test('references spread: least used first, then relevant, never the same one twice for an entry', () => {
  const pool = [ref('a', 'Woman in a grey hoodie'), ref('b'), ref('c')];
  const usage = new Map();
  assert.deepEqual(pickReferences(pool, 'hoodies', usage).map((item) => item.path), ['a', 'b']);
  assert.deepEqual(pickReferences(pool, 'leggings', usage).map((item) => item.path), ['c', 'a']);
  assert.deepEqual(pickReferences(pool.slice(0, 1), 'x', new Map()).map((item) => item.path), ['a']);
});

test("a model photo's style has one source, the reference: its photos, profile and shot; ours adds design, colour, model and constraints", () => {
  const profile = { summary: 'S', settings: 'gyms', background: 'flat orange walls', colour: 'saturated', lighting: 'L', casting: 'C', poseAndEnergy: 'P', framing: 'wide shots', avoid: 'A' };
  const entry = { kind: 'product', category: 'leggings', subject: 'a model wearing leggings', size: '1536x1024', styleRefs: ['a.jpg', 'b.jpg'], colour: 'navy blue', casting: 'in their thirties', print: 'small scattered lemons', detail: 'a gold ring at the centre front' };
  const shot = { framing: 'Head to mid-thigh, the model fills the frame.', pose: 'Hand on hip.' };
  const garments = { prints: 'florals', fabrics: 'matte', trims: 'gold rings', cuts: 'high-leg', details: 'ruching' };
  const prompt = imagePrompt(entry, { master: 'm.png', profile, briefs, shot, garments, line: 'activewear' });
  assert.match(prompt, /style of the 2 attached photos from the reference website/);
  assert.match(prompt, /Their style: gyms flat orange walls L saturated P/);
  assert.ok(prompt.includes(`Shot: ${shot.framing} Pose: ${shot.pose}`));
  assert.doesNotMatch(prompt, /wide shots/, "the profile's framing gives way to the shot taken from its list");
  // The product language's fabrics and cuts for every product; the print and detail this photo was given, on its colour.
  assert.match(prompt, /fabrics matte\. Print: small scattered lemons, on a navy blue ground\. Detail: a gold ring at the centre front\./);
  assert.doesNotMatch(prompt, /prints florals|trims gold rings/, 'not the whole language, which every photo read the same way');
  assert.doesNotMatch(prompt, /high-leg/, "the reference's cuts are of its own products, not of this page's");
  assert.ok(prompt.includes(fillTemplate(briefs.prompts.model, { casting: 'in their thirties' })));
  assert.match(prompt, /Avoid: A/);
  assert.match(prompt, /landscape 1536x1024; tasteful and non-suggestive/);
  assert.match(prompt, /English/);
  // Nothing of the generic rules that contradicted the reference.
  assert.doesNotMatch(prompt, /Camera:|Purpose:|at least half of the frame|minimalist studio|Setting: the same kind of place/);
  assert.match(imagePrompt(entry, { master: 'm.png', profile, briefs, shot, attached: 0 }), /style of the reference website described below/, 'after a refusal no photos go with it');
  assert.throws(() => imagePrompt(entry, { master: 'm.png', briefs }), /analyze:image-style/);
  const web = { src: '/x-960.webp', srcset: '/x-960.webp 960w', width: 960, height: 640 };
  const plan = { routes: { '/leggings-manufacturer/': 'leggings', '/': 'general' }, entries: [
    { category: 'leggings', kind: 'product', status: 'generated', web, alt: 'A' },
    { category: 'leggings', kind: 'hero', status: 'generated', web, alt: 'H' },
    { category: 'general', kind: 'product', status: 'planned' },
    { category: 'general', kind: 'hero', status: 'approved', web, alt: 'G' },
  ] };
  const { pools, routePools, heroByRoute } = libraryMedia(plan);
  assert.deepEqual(pools, {});
  assert.equal(routePools['/leggings-manufacturer/'].product[0].alt, 'A');
  assert.equal(heroByRoute['/leggings-manufacturer/'].alt, 'H');
  assert.equal(heroByRoute['/'].alt, 'G');
});

test('near-copy check', () => {
  const flat = Array.from({ length: 72 }, (_, index) => index % 9);
  assert.equal(differenceHash(flat), '0'.repeat(64));
  assert.equal(hamming('0101', '0110'), 2);
});

test('a product-only entry shows the garment without a person', async () => {
  const { productOnlySubject } = await import('../lib/image-prompt.mjs');
  const entry = { kind: 'product', index: 2, category: 'bra', subject: 'a model wearing bra', size: '1024x1024', styleRefs: [], productOnly: true };
  const subjects = { product: ['{category} on an invisible mannequin', '{category} laid flat'] };
  assert.equal(productOnlySubject(entry, subjects, 'underwear'), 'bra laid flat');
  const profile = { summary: 'S', settings: 's', background: 'b', colour: 'c', lighting: 'l', casting: 'c', poseAndEnergy: 'p', framing: 'f', avoid: 'a' };
  const prompt = imagePrompt(entry, { master: 'm.png', profile, briefs, productOnlySubjects: subjects, line: 'underwear' });
  assert.match(prompt, /product photograph with no person: bra laid flat\./);
  assert.doesNotMatch(prompt, /a model wearing bra/);
  // On one of the reference's plain settings, lit, coloured and rendered like it: not its scenery, avoid list or a shot.
  const onSet = imagePrompt({ ...entry, styleRefs: ['beach.jpg'], scene: 'a beach', backdrop: 'a sunlit plaster wall' }, { master: 'm.png', profile: { ...profile, rendering: 'r' }, briefs, productOnlySubjects: subjects, line: 'underwear' });
  assert.ok(onSet.includes(fillTemplate(briefs.prompts.productOnlySetting, { backdrop: 'a sunlit plaster wall' })));
  assert.match(onSet, /Light, colour and rendering as on the reference website: l c r/);
  assert.doesNotMatch(onSet, /a beach|Their style|Avoid:|Shot:|attached/);
  assert.throws(() => imagePrompt(entry, { master: 'm.png', profile, briefs, productOnlySubjects: {}, line: 'underwear' }), /productOnlySubjects/, 'no invented fallback subject');
});

test('the product wording comes from the config: another product line brings its own', () => {
  const profile = { summary: 'S', settings: 'a sawmill yard', background: 'b', colour: 'c', lighting: 'l', casting: 'c', poseAndEnergy: 'p', framing: 'f', avoid: 'a' };
  const prompts = { ...Object.fromEntries(Object.keys(briefs.prompts).map((key) => [key, `<${key}>`])), model: '<model {casting}>' };
  const furniture = { prompts, productionSceneWords: ['sawmill'] };
  const entry = { kind: 'product', index: 1, category: 'chairs', subject: 'a person sitting on chairs', size: '1024x1024', styleRefs: ['a.jpg'], colour: 'oak', casting: 'in their thirties' };
  const prompt = imagePrompt(entry, { master: 'm.png', profile, briefs: furniture, garments: { prints: 'p', fabrics: 'f', trims: 't', cuts: 'c', details: 'd' } });
  assert.doesNotMatch(prompt, /garment/i);
  for (const line of ['<design>: fabrics f.', '<model in their thirties>', '; <notInProduction>.', 'Their style: <productionSceneReplaced>', '; <constraints>']) assert.ok(prompt.includes(line), line);
});

test("each photo gets its own colour and model; factory scenes are not staged with models; the reference's shots are taken in proportion", async () => {
  const variety = { ...allKinds, garmentColours: ['black', 'white', 'navy'], casting: ['in their twenties', 'in their thirties', 'in their forties', 'in their fifties'] };
  const refsWithFactory = { ...styleRefs, product: [ref('factory-floor.jpg', 'workers at sewing machines'), ...styleRefs.product] };
  const plan = planLibrary({ pages, components, line: 'activewear', briefs: variety, styleRefs: refsWithFactory });
  const products = plan.entries.filter((entry) => entry.kind === 'product');
  assert.ok(new Set(products.map((entry) => entry.colour)).size > 1);
  assert.ok(new Set(products.map((entry) => entry.casting)).size > 1);
  assert.ok(products.every((entry) => !entry.styleRefs.includes('factory-floor.jpg')), 'no model shot is staged in the factory');
  assert.ok(products.every((entry) => !('pose' in entry) && !('camera' in entry)), 'no generic pose or camera of our own');
  const { pickShot } = await import('../lib/image-style.mjs');
  const shots = { framings: [{ text: 'close', photos: 3 }, { text: 'wide', photos: 1 }], poses: [{ text: 'reclining', photos: 1 }, { text: 'standing', photos: 1 }] };
  const taken = Array.from({ length: 40 }, (_, n) => pickShot(shots, n).framing);
  assert.equal(taken.filter((text) => text === 'close').length, 30, 'three of four photos take the framing three of four references use');
});

test('the library review sends back every look-alike after the first, repeated people, wrong colours and factory scenes', async () => {
  const { reviewRejections } = await import('../review-image-library.mjs');
  const entries = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, colour: 'navy' }));
  const rejected = reviewRejections({ lookAlike: [{ photos: [1, 3], reason: 'same wall and pose' }], samePerson: [{ photos: [2, 4] }], wrongColour: [{ photo: 5, seen: 'teal' }], factoryScene: [] }, entries);
  assert.deepEqual([...rejected.keys()].sort(), ['c', 'd', 'e']);
  assert.match(rejected.get('c'), /looks like photo 1/);
});

test('a photo sent back as a look-alike gets the next colour, model and shot', async () => {
  const { rotateVariety } = await import('../lib/image-plan.mjs');
  const variety = { garmentColours: ['black', 'white'], casting: ['a', 'b', 'c'] };
  const rotated = rotateVariety({ id: 'x', colour: 'white', casting: 'c', shotShift: 1 }, variety);
  assert.deepEqual([rotated.colour, rotated.casting, rotated.shotShift], ['black', 'a', 12], 'a jump along the shot list, past the next photo of the page');
});

test('a class with fewer references than photos borrows the site references, so heroes do not share one scene', () => {
  const heroPages = ['leggings', 't-shirts', 'hoodies'].map((name) => ({ route: `/${name}-manufacturer/`, pageType: 'product_manufacturer', blocks: [intro] }));
  const refs = { hero: [ref('h.jpg')], product: [ref('p1.jpg'), ref('p2.jpg'), ref('p3.jpg')] };
  const plan = planLibrary({ pages: [...heroPages, pages[3]], components, line: 'activewear', briefs, styleRefs: refs });
  const scenes = plan.entries.filter((entry) => entry.kind === 'hero').map((entry) => entry.styleRefs[0]);
  assert.equal(scenes[0], 'h.jpg', 'the class reference leads');
  assert.equal(new Set(scenes).size, scenes.length, 'each hero follows its own scene');
  // Photos already made on one shared scene: the first stays, the others are planned again on unused scenes.
  const shared = plan.entries.filter((entry) => entry.kind === 'hero').map((entry) => ({ ...entry, styleRefs: ['h.jpg'], status: 'generated' }));
  const again = planLibrary({ pages: [...heroPages, pages[3]], components, line: 'activewear', briefs, styleRefs: refs, previous: { entries: shared } });
  assert.deepEqual(again.entries.filter((entry) => entry.kind === 'hero').map((entry) => entry.status), ['generated', 'planned', 'planned', 'planned']);
});

test('a photo sent back is planned again on a scene it has not tried, with the next look and flat-lay subject', () => {
  const heroPages = ['leggings', 't-shirts'].map((name) => ({ route: `/${name}-manufacturer/`, pageType: 'product_manufacturer', blocks: [intro] }));
  const refs = { hero: [ref('hall.jpg', 'an empty showroom'), ref('studio.jpg'), ref('street.jpg')], product: [ref('p1.jpg')] };
  const first = planLibrary({ pages: heroPages, components, line: 'activewear', briefs, styleRefs: refs });
  const hero = first.entries.find((entry) => entry.id === 'leggings-hero-1');
  assert.equal(hero.styleRefs[0], 'hall.jpg');
  const sentBack = { ...hero, status: 'rejected-review', productOnly: true, shotShift: 2, master: 'm.png' };
  const again = planLibrary({ pages: heroPages, components, line: 'activewear', briefs, styleRefs: refs, previous: { entries: first.entries.map((entry) => (entry.id === hero.id ? sentBack : { ...entry, status: 'generated' })) } });
  const retried = again.entries.find((entry) => entry.id === hero.id);
  assert.equal(retried.status, 'planned');
  assert.ok(!['hall.jpg', 't-shirts'].includes(retried.styleRefs[0]), 'a scene it has not tried');
  assert.notEqual(retried.styleRefs[0], again.entries.find((entry) => entry.id === 't-shirts-hero-1').styleRefs[0], 'and not the scene of another hero');
  assert.deepEqual(retried.triedScenes, ['hall.jpg']);
  assert.equal(retried.colour, rotateVarietyColour(hero.colour));
  assert.equal(retried.subjectShift, 1);
  assert.equal(retried.shotShift, 13, "a shot further along the reference's list, not one already tried or the neighbour's");
  // A photo not yet made keeps its record on the next planning run.
  const third = planLibrary({ pages: heroPages, components, line: 'activewear', briefs, styleRefs: refs, previous: again });
  assert.deepEqual(third.entries.find((entry) => entry.id === hero.id), retried);
});

const rotateVarietyColour = (colour) => briefs.garmentColours[(briefs.garmentColours.indexOf(colour) + 1) % briefs.garmentColours.length];

test("photos without a model keep the reference's framing; a section photo says what it is for; a weak photo is sent back", async () => {
  const profile = { summary: 'S', settings: 's', background: 'b', colour: 'c', lighting: 'l', casting: 'c', poseAndEnergy: 'p', framing: 'tight fabric crops', avoid: 'a' };
  const hero = { kind: 'hero', category: 'bra', index: 1, subject: 'a model wearing bra', size: '1536x1024', styleRefs: ['h.jpg'], topic: 'Lace trims' };
  assert.match(imagePrompt(hero, { master: 'm.png', profile, briefs, line: 'underwear' }), /Subject: a model wearing bra, for the page section "Lace trims"/);
  const material = imagePrompt({ ...hero, kind: 'material', topic: undefined }, { master: 'm.png', profile, briefs, line: 'underwear' });
  assert.match(material, /Their style: s b l c tight fabric crops/);
  assert.doesNotMatch(material, /Model:|Shot:/);
  const portrait = imagePrompt({ ...hero, kind: 'portrait', subject: 'a head-and-shoulders portrait of the client quoted as "Ana"' }, { master: 'm.png', profile, briefs, line: 'underwear' });
  assert.ok(portrait.includes(briefs.prompts.portrait));
  assert.doesNotMatch(portrait, /The bra:/, 'a portrait shows a person, not our product');
  const { reviewRejections } = await import('../review-image-library.mjs');
  const rejected = reviewRejections({ weakSubject: [{ photo: 1, seen: 'empty hall, bras tiny on a rail' }] }, [{ id: 'bra-hero-1' }]);
  assert.match(rejected.get('bra-hero-1'), /does not show its subject: empty hall/);
});

test('a style profile read from a production floor never sets the scene of a garment photo; colourway subjects allow other colours', () => {
  const profile = { summary: 'A garment factory interior', settings: 'A large sewing workshop with tiled floors', background: 'white columns', colour: 'c', lighting: 'soft daylight', casting: 'c', poseAndEnergy: 'p', framing: 'f', avoid: 'a' };
  const hero = { kind: 'hero', category: 'bra', index: 1, subject: 'a model wearing bra', size: '1536x1024', styleRefs: ['h.jpg'], colour: 'navy' };
  const prompt = imagePrompt(hero, { master: 'm.png', profile, briefs, line: 'underwear' });
  assert.doesNotMatch(prompt, /sewing workshop/);
  assert.match(prompt, /soft daylight/, 'its light still applies');
  assert.match(prompt, /Main colour navy\./);
  const set = imagePrompt({ ...hero, kind: 'product', productOnly: true, subject: 'x', backdrop: 'w' }, { master: 'm.png', profile, briefs, productOnlySubjects: { product: ['bra in several colourways on a rail'] }, line: 'underwear' });
  assert.match(set, /Main colour navy, with other colourways beside it\./);
  const process = imagePrompt({ ...hero, kind: 'process', subject: 'a worker sewing bra' }, { master: 'm.png', profile, briefs, line: 'underwear' });
  assert.match(process, /sewing workshop/, 'a process photo keeps the production floor');
});

test('published images carry no metadata: re-rendered from the master without XMP', async () => {
  const { mkdir, mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: sharp } = await import('sharp');
  const { renderWebImages } = await import('../render-web-images.mjs');
  const root = await mkdtemp(join(tmpdir(), 'render-'));
  await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
  await mkdir(join(root, 'public/media/generated'), { recursive: true });
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#88aacc' } }).png().toFile(join(root, 'docs/research/images/masters/a.png'));
  const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about=""/></rdf:RDF></x:xmpmeta>';
  await sharp(join(root, 'docs/research/images/masters/a.png')).resize({ width: 480 }).withXmp(xmp).webp().toFile(join(root, 'public/media/generated/a-480.webp'));
  assert.ok((await sharp(await readFile(join(root, 'public/media/generated/a-480.webp'))).metadata()).xmp, 'the old file carries XMP');
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: [{ id: 'a', master: 'docs/research/images/masters/a.png', web: { srcset: '/media/generated/a-480.webp 480w' } }] }));
  assert.equal(await renderWebImages({ root }), 1);
  const meta = await sharp(await readFile(join(root, 'public/media/generated/a-480.webp'))).metadata();
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.width, 480);
  assert.ok((await readFile(join(root, 'public/media/generated/a-480.webp'))).length > 0);
});

test('the general pages take turns over the general heroes; a product line keeps its own', () => {
  const entry = (id, category) => ({ id, category, kind: 'hero', status: 'generated', alt: id, web: { src: `/${id}.webp`, width: 10, height: 10 } });
  const plan = { routes: { '/': 'general', '/about/': 'general', '/contact/': 'general', '/bra/': 'bra' }, entries: [entry('general-hero-1', 'general'), entry('general-hero-2', 'general'), entry('bra-hero-1', 'bra')] };
  const { heroByRoute } = libraryMedia(plan);
  assert.deepEqual(Object.fromEntries(Object.entries(heroByRoute).map(([route, media]) => [route, media.alt])), { '/': 'general-hero-1', '/about/': 'general-hero-2', '/contact/': 'general-hero-1', '/bra/': 'bra-hero-1' });
  // The site-wide default hero is a usable photo: a retired one (which keeps its web files) is never chosen.
  const retiredFirst = { ...plan, entries: [{ ...entry('old-hero', 'general'), status: 'retired' }, ...plan.entries] };
  assert.equal(libraryMedia(retiredFirst).hero.alt, 'general-hero-1');
  assert.equal(libraryMedia(retiredFirst).hero.category, undefined);
});

test('a photo accepted by an earlier library review is never sent back by a later one; of a look-alike group the accepted photo stays', async () => {
  const { reviewRejections } = await import('../review-image-library.mjs');
  const entries = [{ id: 'new-1' }, { id: 'old-1', libraryReview: { passed: true } }, { id: 'new-2', colour: 'black' }, { id: 'old-2', colour: 'white', libraryReview: { passed: true } }];
  const rejected = reviewRejections({ lookAlike: [{ photos: [1, 2], reason: 'same shot' }], wrongColour: [{ photo: 3, seen: 'grey' }, { photo: 4, seen: 'pink' }], weakSubject: [{ photo: 4, seen: 'small' }] }, entries);
  assert.deepEqual([...rejected.keys()], ['new-1', 'new-2']);
  assert.match(rejected.get('new-1'), /looks like photo 2/);
});

test('a run refuses to make again more photos already made than its batch limit (photos never made are not capped)', async () => {
  const { generateImages } = await import('../generate-images.mjs');
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'gen-'));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, status: 'planned' })) }));
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [] } } }));
  await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
  for (const index of [0, 1, 2, 3]) await writeFile(join(root, `docs/research/images/masters/p${index}.png`), '');
  await assert.rejects(generateImages({ root, max: 3 }), /4 photos already made are queued again, more than 3 at once/);
  // It waits for a person (exit 2 in site-run, the images step waits) with the list: which photos and why each is to be
  // made again (Fable's plan 3.2: the remakes over the limit wait for the owner, each with its reason).
  const { RemakeHold } = await import('../generate-images.mjs');
  await assert.rejects(generateImages({ root, max: 3 }), RemakeHold);
  const { readFile } = await import('node:fs/promises');
  const hold = JSON.parse(await readFile(join(root, 'docs/research/images/remake-hold.json'), 'utf8'));
  assert.deepEqual(hold.photos.map((photo) => photo.id), ['p0', 'p1', 'p2', 'p3']);
  assert.equal(hold.max, 3);
  assert.match(await readFile(join(root, 'docs/research/images/remake-hold.md'), 'utf8'), /--max 4/);
});

test('where the competitor shows portrait heroes on phones, each hero gets a portrait twin, which phones show in its place', async () => {
  const { libraryMedia, PHONE_MEDIA } = await import('../lib/library-media.mjs');
  const plan = planLibrary({ pages, components: { ...components, phoneHeroes: true }, line: 'activewear', briefs: allKinds, styleRefs });
  const heroes = plan.entries.filter((entry) => entry.kind === 'hero');
  const twins = heroes.filter((entry) => entry.phoneOf);
  assert.ok(twins.length > 0 && twins.length === heroes.length / 2, 'one twin a hero');
  assert.ok(twins.every((twin) => twin.size === '1024x1536' && heroes.some((hero) => hero.id === twin.phoneOf)));
  assert.equal(planLibrary({ pages, components, line: 'activewear', briefs: allKinds, styleRefs }).entries.filter((entry) => entry.phoneOf).length, 0, 'no twins without the competitor\'s evidence');
  // Made: the hero carries its twin as the phone source; the twin is no photo of its own.
  const web = (id, width, height) => ({ src: `/media/photos/${id}.webp`, srcset: '', width, height });
  const made = { routes: plan.routes, entries: plan.entries.map((entry) => ({ ...entry, status: 'generated', alt: 'a photo', web: entry.phoneOf ? web(entry.id, 1024, 1536) : web(entry.id, 1536, 1024) })) };
  const media = libraryMedia(made);
  const leggingsHero = media.heroByRoute['/wholesale-leggings/'];
  assert.deepEqual(leggingsHero.sources, [{ media: PHONE_MEDIA, src: '/media/photos/leggings-hero-1-phone.webp', srcset: '', width: 1024, height: 1536 }]);
  assert.ok(!Object.values(media.pools).flat().some((item) => item.src.endsWith('-phone.webp')));
});


test("the reference's shot list and product language are read from its photos; an incomplete reading stops", async () => {
  const { parseGarments, parseShots } = await import('../lib/image-style.mjs');
  const shots = parseShots('thinking\n{"framings":[{"text":"head to thigh","photos":3}],"poses":[{"text":"reclining","photos":2}]}');
  assert.deepEqual(shots.framings, [{ text: 'head to thigh', photos: 3 }]);
  assert.throws(() => parseShots('{"framings":[],"poses":[{"text":"x","photos":1}]}'), /framings and poses/);
  assert.equal(parseShots('{"framings":[],"poses":[]}'), null);
  assert.equal(parseGarments('{"prints":"florals","fabrics":"matte","trims":"rings","cuts":"triangle","details":"ruching"}').cuts, 'triangle');
  assert.throws(() => parseGarments('{"prints":"florals"}'), /missing fabrics, trims, cuts, details/);
});

test('a photo of a model unlike the reference (CSD style score) is sent back; product-only photos and accepted ones are not', async () => {
  const { mkdir, mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { MIN_STYLE, csdInstall, scoreImageStyle } = await import('../score-image-style.mjs');
  assert.match(csdInstall('').missing, /SEO_CSD_HOME/, 'not set (an empty value: undefined would read the environment, set in a run that scores)');
  const root = await mkdtemp(join(tmpdir(), 'style-score-'));
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  const photo = (id, extra = {}) => ({ id, kind: 'product', status: 'generated', master: `m/${id}.png`, sha256: id, ...extra });
  const entries = [photo('close'), photo('far'), photo('flat', { productOnly: true }), photo('kept', { libraryReview: { passed: true } })];
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries }));
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: ['r.jpg'] } } }));
  const seen = [];
  const score = async (install, refs, images) => { seen.push(...images.map((path) => path.split(/[\\/]/).at(-1))); return images.map((path) => (path.includes('close') ? 0.7 : 0.3)); };
  const report = await scoreImageStyle({ root, install: { python: 'p', weights: 'w' }, score });
  assert.deepEqual(seen, ['close.png', 'far.png', 'kept.png'], 'product-only photos are not scored');
  assert.deepEqual(report.rejected, [{ id: 'far', csd: 0.3 }]);
  const plan = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'));
  assert.equal(plan.entries.find((entry) => entry.id === 'far').status, 'rejected-review');
  assert.equal(plan.entries.find((entry) => entry.id === 'kept').status, 'generated', 'an accepted photo stays');
  assert.ok(MIN_STYLE > 0.3 && MIN_STYLE < 0.7);
  seen.length = 0;
  await scoreImageStyle({ root, install: { python: 'p', weights: 'w' }, score });
  assert.deepEqual(seen, [], 'an unchanged photo is not scored again');
});

test("our own poses, places and settings come from one reading of the reference's lists; a model photo is set in its place", async () => {
  const { parseIdeas } = await import('../lib/image-style.mjs');
  const ideas = parseIdeas('note\n{"poses":{"site":["sit on a step"],"hero":["lean on a column"]},"scenes":["a lemon grove terrace"],"settings":["pale linen"],"prints":["tiny lemons"],"details":["a gold ring"],"childPrints":["daisies"]}', ['site', 'hero']);
  assert.equal(ideas.prints[0].text, 'tiny lemons');
  assert.deepEqual(ideas.scenes, [{ text: 'a lemon grove terrace', photos: 1 }]);
  assert.equal(ideas.poses.hero[0].text, 'lean on a column');
  assert.throws(() => parseIdeas('{"poses":{"site":["x"]},"scenes":["y"],"settings":["z"],"prints":["p"],"details":["d"],"childPrints":["c"]}', ['site', 'hero']), /poses for site, hero/);
  const profile = { summary: 'S', settings: 'beaches', background: 'b', colour: 'c', lighting: 'l', rendering: 'r', casting: 'c', poseAndEnergy: 'p', framing: 'f', avoid: 'a' };
  const entry = { kind: 'product', category: 'bikini', subject: 'a model wearing bikini', size: '1024x1024', styleRefs: ['a.jpg'], place: 'a lemon grove terrace' };
  const prompt = imagePrompt(entry, { master: 'm.png', profile, briefs, shot: { framing: 'F.', pose: 'P.' }, line: 'swimwear' });
  assert.match(prompt, /the same light, colour and camera language, with a new subject, a new composition and the setting below/);
  assert.match(prompt, /Setting: a lemon grove terrace\./);
  assert.doesNotMatch(prompt, /same kind of place/);
});

test('a refused photo of a model is made again with a cover-up; the next of its category does not start with one; it keeps its print', async () => {
  const { default: sharp } = await import('sharp');
  const { mkdir, mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { generateImages } = await import('../generate-images.mjs');
  const root = await mkdtemp(join(tmpdir(), 'cover-up-'));
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  // Photos with their own random texture: plain colours share one difference hash and pass for copies of each other.
  const noise = (seed) => { let state = seed; return Buffer.from(Array.from({ length: 64 * 64 * 3 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state % 256; })); };
  const picture = (seed, path) => sharp(noise(seed), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(path);
  const ref = join(root, 'ref.png');
  await picture(1, ref);
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [ref], profile, range, shots: { framings: one('head to thigh'), poses: one('standing') } } }, garments: { prints: 'p', fabrics: 'f', trims: 't', cuts: 'c', details: 'd' }, ideas: { poses: { site: one('leaning on a wall') }, scenes: one('a lemon grove'), settings: one('linen'), prints: one('tiny lemons'), details: one('a gold ring'), childPrints: one('daisies') } }));
  const photo = (id, index) => ({ id, category: 'bikini', kind: 'product', index, size: '1024x1024', subject: 'a model wearing bikini', colour: 'navy blue', casting: 'in their twenties', styleRefs: [ref], status: 'planned' });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', productOnlySubjects: briefs.productOnlySubjects, variety: {}, entries: [photo('bikini-product-1', 1), photo('bikini-product-2', 2)] }));
  const prompts = [];
  // Refuses the first call; makes every later one.
  const run = async ({ prompt, lastMessage }) => {
    prompts.push(prompt);
    if (prompts.length === 1) { await writeFile(lastMessage, '{"file": null, "error": "image_gen refused this request"}'); return { code: 0, stderr: '' }; }
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(prompts.length * 7919, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A woman in a navy floral bikini and a linen shirt by a lemon grove."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, run });
  const plan = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'));
  const [first, second] = plan.entries;
  assert.equal(prompts.length, 3, 'one refusal, then one call each');
  assert.deepEqual([first.status, first.coverUp, first.refusals.length, first.productOnly], ['generated', true, 1, undefined]);
  assert.ok(!prompts[0].includes(briefs.prompts.coverUp) && prompts[1].includes(briefs.prompts.coverUp), 'the cover-up comes after the refusal');
  assert.ok(!prompts[2].includes(briefs.prompts.coverUp), 'the next photo of the category starts without one');
  assert.equal(second.coverUp, undefined);
  assert.match(prompts[1], /Print: tiny lemons, on a navy blue ground\./);
  assert.match(prompts[1], /Setting: a lemon grove\./);
});

test('a category refused on a model at every try shows the rest of its products on their own at once', async () => {
  const { default: sharp } = await import('sharp');
  const { mkdir, mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { generateImages } = await import('../generate-images.mjs');
  const root = await mkdtemp(join(tmpdir(), 'refused-category-'));
  await mkdir(join(root, 'docs/research/images'), { recursive: true });
  const noise = (seed) => { let state = seed; return Buffer.from(Array.from({ length: 64 * 64 * 3 }, () => { state = (state * 1103515245 + 12345) % 2147483648; return state % 256; })); };
  const picture = (seed, path) => sharp(noise(seed), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(path);
  const ref = join(root, 'ref.png');
  await picture(1, ref);
  const range = { colourfulness: { min: 0, max: 999 }, brightness: { min: 0, max: 999 }, contrast: { min: 0, max: 999 } };
  const profile = Object.fromEntries(['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'].map((field) => [field, field]));
  const one = (text) => [{ text, photos: 1 }];
  await writeFile(join(root, 'docs/research/image-style.json'), JSON.stringify({ kinds: { site: { refs: [ref], profile, range, shots: { framings: one('f'), poses: one('p') } } }, ideas: { poses: { site: one('p') }, scenes: one('s'), settings: one('linen'), prints: one('lemons'), details: one('ring'), childPrints: one('daisies') } }));
  const refusedAll = (id, index) => ({ id, category: 'bikini', kind: 'product', index, size: '1024x1024', subject: 'a model wearing bikini', styleRefs: [ref], status: 'generated', productOnly: true, refusals: [{}, {}, {}], master: 'x.png', dhash: '0'.repeat(64) });
  const next = { id: 'bikini-product-3', category: 'bikini', kind: 'product', index: 3, size: '1024x1024', subject: 'a model wearing bikini', styleRefs: [ref], status: 'planned' };
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'swimwear', productOnlySubjects: briefs.productOnlySubjects, variety: {}, entries: [refusedAll('bikini-product-1', 1), refusedAll('bikini-product-2', 2), next] }));
  const prompts = [];
  const run = async ({ prompt, lastMessage }) => {
    prompts.push(prompt);
    const master = prompt.match(/workspace as (\S+) \(/)[1];
    await picture(99, join(root, master));
    await writeFile(lastMessage, `{"file": "${master}", "alt": "A floral bikini laid flat on pale linen in soft daylight."}`);
    return { code: 0, stderr: '' };
  };
  await generateImages({ root, concurrency: 1, only: ['bikini-product-3'], run });
  const made = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries[2];
  assert.equal(prompts.length, 1, 'no try on a model');
  assert.match(prompts[0], /product photograph with no person/);
  assert.deepEqual([made.status, made.productOnly], ['generated', true]);
});

test('the photo demand the images step works from: every position the site asks a photo for, whatever else the site sets', async () => {
  const { photoDemand } = await import('../lib/image-plan.mjs');
  const demand = photoDemand({ pages, components, briefs: allKinds });
  assert.ok(demand.length > 0);
  assert.deepEqual(Object.keys(demand[0]).sort(), ['blockId', 'category', 'intent', 'kind', 'route', 'status', 'topic']);
  // Settings that move no photo position (here the block model on a site with no density band, a heading's fit) make no
  // photo again (Fable's plan, Q12: the images step reran on any change of template-variants.json).
  assert.deepEqual(photoDemand({ pages, components: { ...components, blockModel: { 'intro:text': { base: 1 } }, heroText: { leadWords: 9 } }, briefs: allKinds }), demand);
  // A photo position more is a photo more.
  const more = pages.map((page) => (page.route === '/t-shirts-manufacturer/' ? { ...page, blocks: [...page.blocks, split('f')] } : page));
  assert.ok(photoDemand({ pages: more, components, briefs: allKinds }).length > demand.length);
  // The plan's library entries come from the same demand.
  const plan = planLibrary({ pages, components, line: 'activewear', briefs: allKinds, styleRefs });
  assert.ok(plan.entries.length > 0);
});
