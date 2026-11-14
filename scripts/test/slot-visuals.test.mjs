import assert from 'node:assert/strict';
import test from 'node:test';

import { blockVisual, cardGridVariant, cardVisual, tradePhotos, VISUAL_TYPES } from '../lib/slot-visuals.mjs';
import { mediaSlots, pageVisuals, resolveVariant } from '../lib/media-slots.mjs';
import { allocateSite } from '../lib/media-allocation.mjs';
import { planLibrary } from '../lib/image-plan.mjs';
import { briefSlots } from '../lib/photo-briefs.mjs';
import serviceBriefs from '../../config/image-briefs.service.json' with { type: 'json' };
import apparelBriefs from '../../config/image-briefs.json' with { type: 'json' };

const cards = (id, ...headings) => ({ id, type: 'featureGrid', heading: 'What we do', items: headings.map((heading) => ({ heading, paragraphs: ['P'] })) });
const split = (id) => ({ id, type: 'splitMedia', heading: id, paragraphs: ['P'] });
// A home page whose reference design gives cards photos (Concord's home: two photo tiles, media-cards).
const home = { route: '/', pageType: 'home', blocks: [cards('services', 'Revenue management', 'Accounting', 'IT support'), split('story')] };
const scenes = { hero: 'plain', tradePhotos: 'scenes', pageTypes: { home: { featureGrid: 'media', mediaModules: [] } } };
const products = { ...scenes, tradePhotos: undefined };

test('a trade whose photos are scenes gives its cards icons; a product trade keeps photo cards; the site may choose', () => {
  assert.deepEqual(VISUAL_TYPES, ['photo', 'icon', 'data', 'none']);
  assert.equal(tradePhotos(serviceBriefs), 'scenes', 'the service trade photographs scenes of its work');
  assert.equal(tradePhotos(apparelBriefs), undefined, 'the clothing trade photographs its products');
  assert.equal(cardVisual({ tradePhotos: 'scenes' }), 'icon');
  assert.equal(cardVisual({}), 'photo');
  assert.equal(cardVisual({ tradePhotos: 'scenes', cardVisual: 'none' }), 'none', "the site's own choice comes first");
  assert.equal(cardVisual({ cardVisual: 'icon' }), 'icon');
  // A service business's cards stay icons whatever a treatment writes (hotel-rm 2026-11-15); the owner's choice holds.
  assert.equal(cardVisual({ tradePhotos: 'scenes', cardVisual: 'photo' }), 'icon');
  assert.equal(cardVisual({ tradePhotos: 'scenes', cardVisual: 'photo', ownerChoices: { cardVisual: 'photo' } }), 'photo');
  assert.equal(cardVisual({ cardVisual: 'photo' }), 'photo', 'a product trade keeps the photo cards it is set to');
  assert.equal(cardGridVariant('media', { tradePhotos: 'scenes' }), 'icons');
  assert.equal(cardGridVariant('media', { cardVisual: 'none' }), 'cards');
  assert.equal(cardGridVariant('media', {}), 'media');
  assert.equal(cardGridVariant('bullets', { tradePhotos: 'scenes' }), 'bullets', 'a variant without pictures is kept');
});

test("a card grid going on takes its first grid's chosen variant; steps going on from a section never take that section's", () => {
  const components = { pageTypes: { home: { blocks: { m3: { variant: 'icons' }, faq: { variant: 'accordion' } } } } };
  assert.equal(resolveVariant({ id: 'm3-2', type: 'featureGrid', continues: 'm3', items: [] }, 'home', 0, components), 'icons');
  assert.notEqual(resolveVariant({ id: 'faq-steps', type: 'process', continues: 'faq', steps: [] }, 'home', 0, components), 'accordion');
});

test("the design's photo cards render as the site's cards: icon cards on a service site, with no photo slot", () => {
  const grid = home.blocks[0];
  assert.equal(resolveVariant(grid, 'home', 0, scenes), 'icons');
  assert.equal(resolveVariant(grid, 'home', 0, products), 'media');
  assert.equal(resolveVariant({ ...grid, variant: 'media' }, 'home', 0, scenes), 'icons', 'a section given photo cards too');
  assert.equal(resolveVariant(grid, 'about', 0, { tradePhotos: 'scenes', featureGridMedia: true }), 'icons', 'the site-wide photo-card switch too');
  assert.equal(resolveVariant(grid, 'home', 0, { ...scenes, pageTypes: { home: { featureGrid: 'media', blocks: { services: { variant: 'media' } } } } }), 'media', "a section's own chosen variant stays");
  assert.deepEqual(mediaSlots(grid, 'icons', scenes), []);
  assert.equal(mediaSlots(grid, 'media', products).length, 3);
});

test('every position of a page is planned as photo, icon, data or none', () => {
  const chart = { ...split('figures'), visuals: [{ type: 'data', data: { shape: 'bars', items: [{ label: 'A', value: 1 }] } }] };
  const page = { ...home, blocks: [...home.blocks, chart, { id: 'faq', type: 'faq', items: [] }] };
  assert.deepEqual(pageVisuals(page, scenes).map((item) => [item.blockId, item.visual]), [['services', 'icon'], ['story', 'photo'], ['figures', 'data'], ['faq', 'none']]);
  assert.equal(pageVisuals(page, products)[0].visual, 'photo');
  assert.equal(blockVisual({ type: 'intro' }, 'text', []), 'none');
});

test('icon cards reach neither the allocation, the image plan nor the photo briefs', () => {
  const pages = [home];
  const requests = (components) => allocateSite({ pages, components: { ...components, media: { placeholders: [] } } }).unfilled.filter((request) => request.blockId === 'services');
  assert.equal(requests(scenes).length, 0);
  assert.equal(requests(products).length, 3);
  const plan = (components, briefs) => planLibrary({ pages, components, line: 'motel', briefs: { ...briefs, placeholderKinds: [] }, styleRefs: { product: [{ path: 'p.jpg', subject: '' }], process: [{ path: 'q.jpg', subject: '' }] } });
  assert.deepEqual(plan(scenes, serviceBriefs).entries.filter((entry) => entry.topic && /Revenue|Accounting|IT/.test(entry.topic)), [], 'no photo is planned for an icon card');
  assert.ok(plan(products, apparelBriefs).entries.some((entry) => entry.topic === 'Revenue management'), 'a photo card gets its topic photo');
  // The photo briefs describe the split row's photo only (cards are never briefed; an icon card has no position at all).
  assert.deepEqual(briefSlots(pages, scenes)['/'].map((slot) => slot.blockId), ['story']);
});

test('a wall of the site\'s own pages takes icons, no photos, where its cards do', async () => {
  const { mediaSlots, pageCardIcons } = await import('../lib/media-slots.mjs');
  const wall = { id: 'plan-children', type: 'gallery', items: [{ caption: 'Revenue Management', href: '/revenue-management/' }, { caption: 'Accounting', href: '/accounting/' }] };
  const service = { tradePhotos: 'scenes' };
  assert.equal(pageCardIcons(wall, service), true);
  assert.deepEqual(mediaSlots(wall, 'grid', service), []);
  assert.equal(mediaSlots(wall, 'grid', {}).length, 2, 'a trade whose photos are its products keeps a photo a card');
  assert.equal(pageCardIcons({ ...wall, items: [{ media: 'product' }] }, service), false, 'a photo wall stays one');
});

test('steps over a photo stay three at most: more are a list (four stacked over one photo ran 1,240px on a phone)', async () => {
  const { withSectionVisuals } = await import('../lib/media-slots.mjs');
  const section = (n) => ({ id: 's', type: 'intro', heading: 'How we work', visuals: [{ type: 'data', data: { shape: 'sequence', items: Array.from({ length: n }, (_, index) => ({ label: `Step ${index + 1}` })) } }] });
  assert.equal(withSectionVisuals([section(3)], {}, 'solution')[1].variant, 'photo-cards');
  assert.equal(withSectionVisuals([section(4)], {}, 'solution')[1].variant, 'list');
});

test("a related block's photo tiles are links on a site whose cards carry icons (cards that name services carry no photo)", async () => {
  const { resolveVariant } = await import('../lib/media-slots.mjs');
  const related = { id: 'related', type: 'relatedPages', variant: 'tiles', links: [{ label: 'Services', href: '/services/' }] };
  assert.equal(resolveVariant(related, 'solution', 0, { cardVisual: 'icon' }), 'links');
  assert.equal(resolveVariant(related, 'solution', 0, { cardVisual: 'photo' }), 'tiles');
});

test("a split row drawing its section's chart is a plain split row, as the renderer sets it, for the plan and the surfaces too", async () => {
  const { resolveVariant } = await import('../lib/media-slots.mjs');
  const split = { id: 's', type: 'splitMedia', paragraphs: ['x'], visuals: [{ type: 'data', data: { shape: 'comparison', columns: ['A', 'B'], rows: [['1', '2']] } }] };
  // hotel-rm 2026-11-14: a tinted split with a chart rendered single, while the page's surfaces counted it a grey band.
  assert.equal(resolveVariant(split, 'solution', 0, { pageTypes: { solution: { splits: ['tinted'] } } }), 'single');
});
