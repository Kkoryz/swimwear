import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { imageBriefs, tradeConfigPath } from '../lib/trade.mjs';
import { briefSlots, parseBriefs, withPhotoBriefs } from '../lib/photo-briefs.mjs';
import { articleVisualPrompt, intentPrompt, scenePrompt } from '../lib/image-prompt.mjs';
import { withPurposeWording } from '../lib/page-blueprints.mjs';
import apparel from '../../config/image-briefs.json' with { type: 'json' };
import service from '../../config/image-briefs.service.json' with { type: 'json' };

const site = async (json) => {
  const root = await mkdtemp(join(tmpdir(), 'trade-'));
  if (json) await writeFile(join(root, 'site.json'), JSON.stringify(json));
  return root;
};

test('a site without a trade keeps the clothing briefs; a service site gets its own, its siteKind and its subjects', async () => {
  const plain = await imageBriefs(await site(null));
  assert.equal(plain.trade, 'apparel');
  assert.deepEqual(plain.subjects, apparel.subjects);
  assert.equal(plain.siteKind, apparel.siteKind);
  const motel = await imageBriefs(await site({ trade: 'service', siteKind: 'a motel management company', imageSubjects: { hero: ['a motel at dusk'] } }));
  assert.equal(motel.photos, 'scenes');
  assert.equal(motel.siteKind, 'a motel management company');
  assert.deepEqual(motel.subjects.hero, ['a motel at dusk']);
  assert.deepEqual(motel.subjects.process, service.subjects.process, 'a class the site does not name keeps the trade\'s');
  assert.throws(() => tradeConfigPath('image-briefs', 'mining'), /no config\/image-briefs\.mining\.json/);
});

test('the service briefs name no garment, fabric, sewing or factory worker in what they make', () => {
  const made = JSON.stringify([service.subjects, service.prompts.worker, service.prompts.realismFabric, service.prompts.design, service.topicSubject]);
  assert.doesNotMatch(made, /garment|fabric|sewing|swim|Chinese factory|model wear/i);
});

test('a scene is made from its subject with the trade\'s people and no product or model', () => {
  const profile = { lighting: 'soft daylight', colour: 'warm neutrals', rendering: 'clean digital' };
  const entry = { id: 'general-process-1', category: 'general', kind: 'process', size: '1536x1024', subject: 'a housekeeper making a bed in a guest room of a motel' };
  const prompt = scenePrompt(entry, { master: 'm.png', profile, briefs: service, line: 'motel' });
  assert.match(prompt, /What it shows: a housekeeper making a bed/);
  assert.match(prompt, new RegExp(service.prompts.worker.slice(0, 30)), 'a housekeeper is a person of the trade');
  assert.doesNotMatch(prompt, /model wears|garment|fabric|Chinese factory worker/i);
  const intent = { content: 'a role model of good service: a manager greeting a guest', setting: 'motel lobby' };
  assert.doesNotMatch(intentPrompt({ id: 'x', category: 'general', kind: 'product', size: '1024x1024', intent }, { master: 'm.png', profile, briefs: service, line: 'motel' }), /model wears/i, 'no product is worn in a scene');
  // The clothing trade still counts its own people only.
  assert.match(articleVisualPrompt({ type: 'photo', title: 't', content: 'a worker cutting fabric', purpose: 'p', section: 's' }, { master: 'm.png', profile, briefs: apparel, article: 'a' }), /Chinese factory worker/);
});

test("a scene carries its class's profile whole: place, framing, who appears, what to avoid; an empty class's photos show the place (owner 2026-11-18)", () => {
  const profile = { settings: 'coastal houses and desert patios', background: 'detailed surroundings', framing: 'broad establishing views', lighting: 'daylight', colour: 'turquoise and rust', rendering: 'deep focus', casting: 'Spaces are unoccupied, no foreground people.', people: 'none', avoid: 'posed staff or guest groups' };
  const entry = { id: 'general-hero-1', category: 'general', kind: 'hero', size: '1536x1024', subject: 'a guest couple arriving with their bags at the front door of a vacation rental at dusk' };
  const prompt = scenePrompt(entry, { master: 'm.png', profile, briefs: service, line: 'rentals' });
  assert.match(prompt, /People as on the company's website: Spaces are unoccupied, no foreground people\./);
  assert.match(prompt, /Kind of place and framing as on the company's website: detailed surroundings broad establishing views/);
  assert.match(prompt, /Avoid: posed staff or guest groups/);
  assert.match(prompt, /What it shows: a guest couple arriving with their bags at the front door of a vacation rental at dusk, shown as the place alone, unoccupied\./);
  assert.match(prompt, /\nNo person in the image\.\n/);
  assert.doesNotMatch(prompt, new RegExp(service.prompts.worker.slice(0, 30)), 'no person of the trade is asked for');
  // A room a person word names keeps its own subject (review 2026-11-18: "guest bedroom" and "styled for guests" were
  // each made "one of the places", every such photo the same ask), and the trade's people never join it.
  const bedroom = scenePrompt({ ...entry, kind: 'product', subject: 'a freshly made guest bedroom in a vacation rental home, styled for guests' }, { master: 'm.png', profile, briefs: service, line: 'rentals' });
  assert.match(bedroom, /What it shows: a freshly made guest bedroom in a vacation rental home, styled for guests, shown as the place alone, unoccupied\./);
  assert.doesNotMatch(bedroom, new RegExp(service.prompts.worker.slice(0, 30)));
  // People only far off: said once, in place of the trade's people line.
  const far = scenePrompt(entry, { master: 'm.png', profile: { ...profile, people: 'background' }, briefs: service, line: 'rentals' });
  assert.equal(far.match(/No person in the foreground; anyone shown is small and far off\./g)?.length, 1);
  assert.doesNotMatch(far, /No person in the image\./);
  // The place and framing line needs no settings field.
  assert.match(scenePrompt(entry, { master: 'm.png', profile: { ...profile, settings: '' }, briefs: service, line: 'rentals' }), /Kind of place and framing as on the company's website: detailed surroundings broad establishing views/);
  // A profile written before the people field keeps its photo's subject, its casting now said.
  const older = scenePrompt(entry, { master: 'm.png', profile: { ...profile, people: undefined }, briefs: service, line: 'rentals' });
  assert.match(older, /What it shows: a guest couple arriving/);
  assert.match(older, /People as on the company's website:/);
});

const components = { featureGrid: 'media', pageTypes: {}, cta: 'image-band', hero: 'media-overlay' };
const pages = [
  { route: '/', pageType: 'home', status: 'placeholder', blocks: [
    { id: 'intro', type: 'intro', heading: 'Who we are', paragraphs: ['P'] },
    { id: 'team', type: 'splitMedia', heading: 'The team', paragraphs: ['P'] },
    { id: 'cards', type: 'featureGrid', heading: 'What we do', items: [{ heading: 'A', text: 'a' }, { heading: 'B', text: 'b' }] },
    { id: 'asked', type: 'splitMedia', heading: 'Asked', paragraphs: ['P'], visuals: [{ id: 'v1', type: 'photo', content: 'a front desk' }] },
    { id: 'close', type: 'cta', heading: 'Talk to us', links: [] },
  ] },
  { route: '/blog/x/', pageType: 'blog_post', blocks: [{ id: 'b', type: 'splitMedia', heading: 'H', paragraphs: ['P'] }] },
];

test('photo briefs are planned for a section\'s own photo positions only, and laid on its blocks', () => {
  const slots = briefSlots(pages, components);
  assert.deepEqual(Object.keys(slots), ['/'], 'not the blog');
  assert.deepEqual(slots['/'].map((slot) => slot.blockId), ['team', 'close'], 'not the intro, the cards or a section Site Factory gave a photo');
  const reply = JSON.stringify({ photos: [{ section: 'team', content: 'a manager briefing two housekeepers', setting: 'motel laundry room', caption: 'Morning briefing' }, { section: 'close', content: 'an owner shaking hands with a manager', setting: 'motel parking lot' }] });
  const briefs = parseBriefs(`thinking...\n${reply}`, slots['/']);
  assert.equal(briefs.team[0].id, 'brief-team-1');
  const laid = withPhotoBriefs(pages, { '/': { ...briefs, asked: [{ id: 'x', type: 'photo', content: 'other' }] } });
  assert.equal(laid[0].blocks[1].visuals[0].content, 'a manager briefing two housekeepers');
  assert.equal(laid[0].blocks[3].visuals.length, 1, 'Site Factory\'s own photo visual stays alone');
  assert.equal(withPhotoBriefs(pages, null), pages);
  assert.throws(() => parseBriefs(JSON.stringify({ photos: [{ section: 'team', content: 'x' }] }), slots['/']), /no photo for close/);
  assert.throws(() => parseBriefs(JSON.stringify({ photos: [{ section: 'cards', content: 'x' }] }), slots['/']), /no photo position: cards/);
});

test('a service site\'s photo made for a section is sent back when judged off its page; a clothing site\'s site-wide one is not', async () => {
  const { misfits } = await import('../send-back-misfits.mjs');
  const web = (id) => ({ src: `/media/photos/${id}-960.webp`, srcset: `/media/photos/${id}-960.webp 960w` });
  const plan = { routes: { '/service/': 'general' }, entries: [{ id: 'service-team', category: 'general', kind: 'process', status: 'generated', intent: { route: '/service/' }, web: web('service-team') }] };
  const fit = { pages: [{ route: '/service/', images: [{ src: '/media/photos/service-team-960.webp', fit: 'wrong_subject' }] }] };
  assert.deepEqual(misfits(plan, fit, ['process'], { scenes: true }).map(({ entry }) => entry.id), ['service-team']);
  assert.deepEqual(misfits(plan, fit, ['process']), []);
});

test('a service site\'s stand-in proof has no factory output, certificates or clothing words', async () => {
  const { demoProof } = await import('../scaffold-site-proof.mjs');
  const demo = JSON.parse(await readFile(tradeConfigPath('demo-proof', 'service'), 'utf8'));
  const facts = new Map([['founded', { text: 'We were founded in 2014.', approved: true }], ['location', { text: 'Our office is in Dallas, Texas.', approved: true }], ['contract-term', { text: 'Contracts run for 12 months.', approved: true }]]);
  const proof = demoProof({ demo, facts, products: [], services: [{ service: 'motel management', route: '/motel-management/' }], line: 'motel management company' });
  assert.deepEqual(proof.factory[0], { value: '2014', label: 'founded in Dallas' });
  assert.deepEqual(proof.terms, { columns: ['Term', 'Details'], rows: [['Contract length', 'Contracts run for 12 months.']] });
  assert.equal(proof.clients[0].note, 'Ohio, USA');
  assert.match(proof.caseStudies[0].title, /^Motel management for/);
  const { note, ...shown } = proof;
  const words = JSON.stringify(shown, (key, value) => value).match(/:"[^"]*"/g).join(' ');
  assert.doesNotMatch(words, /pcs|pieces|sewing|factory|fabric|garment|OEKO|sample/i, 'what the site shows (the group names are data keys)');
});

test('a scaffold for a new trade makes the stand-in again instead of keeping the old trade\'s', async () => {
  const { scaffoldSiteProof } = await import('../scaffold-site-proof.mjs');
  const root = await site({ trade: 'service' });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/site-proof.json'), JSON.stringify({ standIn: true, factory: [{ value: '150,000 pcs', label: 'pieces a month' }], clients: [], testimonials: [], caseStudies: [] }));
  await writeFile(join(root, 'facts.yaml'), '[]');
  await writeFile(join(root, 'package.json'), JSON.stringify({ pages: [] }));
  await writeFile(join(root, 'pages.json'), JSON.stringify({ pages: [{ page_type: 'home', url: '/', primary_query: 'motel management company' }] }));
  await scaffoldSiteProof({ root, factsPaths: [join(root, 'facts.yaml')], packagePath: join(root, 'package.json'), pagesPlanPath: join(root, 'pages.json') });
  const proof = JSON.parse(await readFile(join(root, 'src/data/site-proof.json'), 'utf8'));
  assert.equal(proof.trade, 'service');
  assert.doesNotMatch(JSON.stringify(proof.factory), /pcs/);
});

test('a trade\'s wording replaces the purposes it names and keeps the rest', async () => {
  const blueprints = { home: [{ id: 'a', purpose: 'Factory and team' }, { id: 'b', purpose: 'Something else' }] };
  const { purposes } = JSON.parse(await readFile(tradeConfigPath('blueprint-wording', 'service'), 'utf8'));
  assert.deepEqual(withPurposeWording(blueprints, purposes).home.map((slot) => slot.purpose), ['The team and how it works', 'Something else']);
  assert.equal(withPurposeWording(blueprints, null), blueprints);
});

test('a plan made for another trade is not reused without saying so', async () => {
  const { planImages } = await import('../plan-images.mjs');
  const root = await site({ trade: 'service' });
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: {} }));
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ line: 'motel', entries: [] }));
  await assert.rejects(planImages({ root }), /made for trade apparel, not service/);
});

test('a small copy edit keeps a page\'s photo plan; new positions or a rewrite plan it again', async () => {
  const { keepsReading, similarText } = await import('../plan-photo-briefs.mjs');
  const text = 'We run your motel day to day. We reply to every enquiry within one business day. Our team handles pricing, listings and reports for owners.';
  const trimmed = 'We run your motel day to day. Our team handles pricing, listings and reports for owners.';
  const slots = [{ blockId: 'a', count: 1 }, { blockId: 'b', count: 2 }];
  const photos = { a: [{ content: 'x' }], b: [{ content: 'y' }, { content: 'z' }] };
  assert.ok(similarText(text, trimmed) >= 0.6);
  assert.equal(keepsReading({ text, photos, rules: 'r' }, { text: `${text} Owners keep control.`, slots, rules: 'r' }), true, 'a sentence added');
  assert.equal(keepsReading({ text, photos, rules: 'r' }, { text: 'An entirely different page about receivership and courts, lenders and interim managers.', slots, rules: 'r' }), false, 'a rewrite');
  assert.equal(keepsReading({ text, photos, rules: 'r' }, { text, slots: [{ blockId: 'a', count: 1 }], rules: 'r' }), false, 'other positions');
  assert.equal(keepsReading({ text, photos, rules: 'r' }, { text, slots, rules: 'other' }), false, 'other instructions');
  // A reading recorded before the text was kept is held to its positions alone.
  assert.equal(keepsReading({ photos, rules: 'r' }, { text: trimmed, slots, rules: 'r' }), true);
});

test('a page read again keeps the photos of its sections that are the same', async () => {
  const { keptSections } = await import('../plan-photo-briefs.mjs');
  const prior = { text: '[hero] H\n[a] We run motels day to day for owners.\n[b] Old copy about pricing and listings.', photos: { a: [{ content: 'old a' }], b: [{ content: 'old b' }] } };
  const fresh = { a: [{ content: 'new a' }], b: [{ content: 'new b' }], c: [{ content: 'new c' }] };
  const slots = [{ blockId: 'a', count: 1 }, { blockId: 'b', count: 1 }, { blockId: 'c', count: 1 }];
  const text = '[hero] H\n[a] We run motels day to day for owners.\n[b] Entirely rewritten section on receivership courts.\n[c] A new row.';
  const kept = keptSections(prior, fresh, { text, slots, rules: 'r' });
  assert.deepEqual([kept.a[0].content, kept.b[0].content, kept.c[0].content], ['old a', 'new b', 'new c']);
  assert.equal(keptSections(prior, fresh, { text, slots, rules: null }), fresh, 'other instructions read every section anew');
});
