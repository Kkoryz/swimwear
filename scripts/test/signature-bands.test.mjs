import assert from 'node:assert/strict';
import test from 'node:test';

import { authoredPatterns, signatureBands } from '../lib/pattern-map.mjs';
import { withMediaModules } from '../lib/media-slots.mjs';
import { estimateBlock, pageEstimate, planVisualBudget } from '../lib/visual-budget.mjs';
import { bandFor, densityBands, pageTypeBands, textRunWords } from '../lib/density.mjs';
import { densityTarget } from '../measure-reference-density.mjs';
import { densityTargets } from '../site-run.mjs';

const text = (id, words = 'P') => ({ id, type: 'intro', heading: id, paragraphs: [words] });
const split = (id) => ({ id, type: 'splitMedia', heading: id, paragraphs: ['P'] });
const cta = { id: 'cta', type: 'cta', cta: { label: 'Go', href: '/contact/' }, links: [] };
const bands = (blocks) => blocks.filter((block) => block.type === 'gallery' && block.variant === 'band');

test("a page type's floor is the competitor's full-width photo bands on its reference page", () => {
  // Concord's home: a full-width photo, then two in a row further down (one wall), after a text section.
  const home = authoredPatterns(['text', 'figure', 'split-column', 'media-cards', 'split-tinted', 'figure', 'figure', 'social', 'testimonials'].map((pattern) => ({ pattern })));
  assert.deepEqual(home.mediaModules, [{ at: 0, type: 'band' }, { at: 0.57, type: 'band' }]);
  assert.equal(signatureBands(home), 2);
  assert.equal(signatureBands({ mediaModules: [{ at: 0.5, type: 'mosaic' }] }), 0, 'a mosaic is no full-width photo');
  assert.equal(signatureBands(undefined), 0);
});

test("the competitor's signature bands go in on every page of the type: a short page, a page that alternates", () => {
  const components = { pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'band' }] } }, textRunWords: 500 };
  // Six short sections hold fewer words than a picture-less run may: a mosaic would stay out, the band does not.
  const short = { route: '/a/', pageType: 'solution', blocks: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => text(id)) };
  assert.equal(bands(withMediaModules(short, components, {})).length, 1);
  assert.equal(withMediaModules(short, { ...components, pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'mosaic' }] } } }, {}).filter((block) => block.type === 'gallery').length, 0, 'other walls keep the measure');
  // A page that alternates copy and photos has no run for it: the band goes at its place on the reference page.
  const alternating = { route: '/b/', pageType: 'solution', blocks: [split('s1'), text('t1'), split('s2'), text('t2'), split('s3'), cta] };
  const placed = withMediaModules(alternating, components, {});
  assert.deepEqual(placed.map((block) => block.id), ['s1', 't1', 's2', 'media-module-1', 't2', 's3', 'cta']);
  assert.deepEqual([placed[3].competitor, placed[3].signature], [true, true]);
  // The audit taking rows off (photoBreaks < 0) takes the other walls first and never the bands of the floor.
  const two = { pageTypes: { solution: { mediaModules: [{ at: 0.3, type: 'band' }, { at: 0.8, type: 'mosaic' }] } } };
  const long = { route: '/a/', pageType: 'solution', blocks: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => text(id)) };
  const walls = (breaks) => withMediaModules(long, { ...two, photoBreaks: { '/a/': breaks } }, {}).filter((block) => block.type === 'gallery').map((block) => block.variant).sort();
  assert.deepEqual(walls(0), ['band', 'mosaic']);
  assert.deepEqual(walls(-1), ['band']);
  assert.deepEqual(walls(-3), ['band']);
});

test("a home page of icon cards on a service site still shows the competitor home's bands, planned to the home's own band", () => {
  const cards = (id) => ({ id, type: 'featureGrid', heading: id, items: ['Revenue', 'Accounting', 'IT'].map((heading) => ({ heading, paragraphs: ['P'] })) });
  const home = { route: '/', pageType: 'home', hero: { heading: 'H' }, blocks: [text('intro'), cards('g1'), cards('g2'), cards('g3'), { id: 'faq', type: 'faq', items: [] }, cta] };
  const band = { wordsPer1000px: { max: 166 }, visualAreaPct: { min: 19, max: 43 }, longestTextOnlyPx: { max: 2467 } };
  const components = { hero: 'plain', tradePhotos: 'scenes', pageTypes: { home: { featureGrid: 'media', mediaModules: [{ at: 0, type: 'band' }, { at: 0.57, type: 'band' }] } }, densityBands: band };
  const planned = withMediaModules(home, components, {});
  assert.ok(bands(planned).filter((block) => block.signature).length >= 2, 'both of the competitor home\'s bands');
  // With a band of its own (a home that is mostly photos) the home gets more photo rows than the service pages' band asks.
  const photoHome = { ...band, visualAreaPct: { min: 60, max: 90 } };
  const own = withMediaModules(home, { ...components, densityBands: { ...band, pageTypes: { home: photoHome } } }, {});
  assert.ok(bands(own).length > bands(planned).length, `${bands(own).length} bands on its own band, ${bands(planned).length} on the service pages'`);
});

test('a crowded page gives up the walls added for it, then card photos, then tiles, then the competitor\'s walls, never its bands below the floor', () => {
  const model = {
    'intro:text': { base: 200, perWord: 0, visual: 0, before: 1, after: 1 },
    'gallery:band': { base: 700, perWord: 0, visual: 0.9, before: 0.05, after: 0.05 },
    'gallery:mosaic': { base: 700, perWord: 0, visual: 0.9, before: 0.05, after: 0.05 },
    'featureGrid:media': { base: 600, perWord: 0, visual: 0.6, before: 0.1, after: 0.3 },
    'featureGrid:icons': { base: 300, perWord: 0, visual: 0, before: 1, after: 1 },
    'relatedPages:tiles': { base: 500, perWord: 0, visual: 0.7, before: 0.2, after: 0.2 },
    'relatedPages:links': { base: 200, perWord: 0, visual: 0, before: 1, after: 1 },
    '*': { base: 200, perWord: 0, visual: 0, before: 1, after: 1 },
  };
  const band = { wordsPer1000px: { max: 166 }, visualAreaPct: { min: 5, max: 30 }, longestTextOnlyPx: { max: 5000 } };
  const variantOf = (block) => (block.type === 'gallery' ? block.variant : block.type === 'featureGrid' ? block.variant ?? 'media' : block.type === 'relatedPages' ? block.variant ?? 'tiles' : 'text');
  const wall = (id, extra = {}) => ({ id, type: 'gallery', variant: 'band', items: [{}], ...extra });
  const helpers = { bands: band, model, variantOf, wordsOf: () => 0, wall: (id) => wall(id), isWall: (block) => String(block.id).startsWith('media-module-') };
  const page = () => [text('a'), wall('media-module-1', { competitor: true, signature: true }), text('b'), wall('media-module-2', { competitor: true }), { id: 'cards', type: 'featureGrid', items: [] }, text('c'), wall('media-module-budget-1'), { id: 'related', type: 'relatedPages' }, text('d'), wall('media-module-3', { competitor: true, signature: true }), { id: 'cta', type: 'cta' }];
  const planned = planVisualBudget(page(), { ...helpers, floor: 2 });
  const ids = planned.map((block) => block.id);
  assert.ok(!ids.includes('media-module-budget-1'), 'the wall added for the page goes first');
  assert.equal(planned.find((block) => block.id === 'cards').variant, 'icons', 'the card photos give way to icons');
  assert.equal(planned.find((block) => block.id === 'related').variant, 'links');
  assert.ok(!ids.includes('media-module-2'), "the competitor's other wall");
  assert.deepEqual(planned.filter((block) => block.signature).map((block) => block.id), ['media-module-1', 'media-module-3'], 'both bands of the floor stay');
  const estimate = pageEstimate(planned.map((block) => estimateBlock(block, variantOf(block), 0, model)));
  assert.ok(estimate.visualPct > band.visualAreaPct.max, 'still over: the floor wins over the band');
  // With a floor of one, the last band may go too.
  assert.equal(planVisualBudget(page(), { ...helpers, floor: 1 }).filter((block) => block.signature).length, 1);
});

test('the density bands come by page type: the home page by the competitor\'s home, every other page type by the benchmark', () => {
  const page = (visual, pageType) => ({ ...(pageType ? { pageType } : {}), metrics: { words: 500, contentHeight: 4000, wordsPer1000px: 120, visualAreaPct: visual, longestTextOnlyPx: 1200 } });
  const pages = [page(30), page(25), page(70, 'home')];
  const bands = pageTypeBands(pages);
  assert.deepEqual(bands.visualAreaPct, densityBands(pages.slice(0, 2)).visualAreaPct, 'the benchmark leaves the home page out');
  assert.deepEqual(bands.pageTypes.home.visualAreaPct, { min: 53, max: 95 });
  assert.deepEqual(bandFor(bands, 'home'), bands.pageTypes.home);
  assert.deepEqual(bandFor(bands, 'solution'), { wordsPer1000px: bands.wordsPer1000px, visualAreaPct: bands.visualAreaPct, longestTextOnlyPx: bands.longestTextOnlyPx });
  assert.equal(bandFor(null, 'home'), null);
  assert.deepEqual(pageTypeBands([page(70, 'home')]).visualAreaPct, { min: 53, max: 95 }, 'with no benchmark the measured pages are the band');
  assert.equal(pageTypeBands(pages.slice(0, 2)).pageTypes, undefined, 'no page measured on its own: one band as before');
  assert.equal(typeof textRunWords(pages.slice(0, 2), bands), 'number');
  assert.deepEqual(densityTarget('home=https://example.com/'), { pageType: 'home', url: 'https://example.com/' });
  assert.deepEqual(densityTarget('https://example.com/a?b=c'), { url: 'https://example.com/a?b=c' });
});

test("the density step measures the benchmark and the reference's home on its own", () => {
  const site = { reference: { origin: 'https://ref.com', pages: { home: '/', solution: '/services/', contact: '/contact/' } } };
  assert.deepEqual(densityTargets(site), ['https://ref.com/services/', 'home=https://ref.com/']);
  assert.deepEqual(densityTargets({ ...site, densityPages: ['https://other.com/a'] }), ['https://other.com/a', 'home=https://ref.com/']);
  assert.deepEqual(densityTargets({ ...site, densityPageTypes: { about: ['/about/', '/team/'] } }), ['https://ref.com/', 'https://ref.com/services/', 'about=https://ref.com/about/', 'about=https://ref.com/team/']);
});

test("a band whose reference photo carries a button leads on, to the page the section before it links to; it never cuts a section", async () => {
  const { bandLink } = await import('../lib/media-slots.mjs');
  // Concord's home: its full-width photos carry EXPLORE and LEARN MORE (measured buttons).
  const home = authoredPatterns([{ pattern: 'text' }, { pattern: 'figure', shape: { buttons: 1 } }, { pattern: 'split-column' }, { pattern: 'figure', shape: { buttons: 0 } }]);
  assert.deepEqual(home.mediaModules, [{ at: 0, type: 'band', action: true }, { at: 1, type: 'band' }]);
  // Two photo rows in a row are one wall: its video photo has no button, the photo under it does (Concord's 6 and 7).
  const run = authoredPatterns([{ pattern: 'text' }, { pattern: 'text' }, { pattern: 'figure', shape: { buttons: 0 } }, { pattern: 'figure', shape: { buttons: 1 } }, { pattern: 'text' }]);
  assert.deepEqual(run.mediaModules, [{ at: 0.33, type: 'band', action: true }]);
  // The hotel home: cards going on in a second grid (continues); the band stays out of the set.
  const grid = (id, extra = {}) => ({ id, type: 'featureGrid', heading: extra.continues ? undefined : id, items: [{ heading: 'A', paragraphs: ['see [our services](/services/) and [all of them](/all/)'] }], ...extra });
  const page = { route: '/', pageType: 'home', blocks: [text('intro'), grid('g1'), grid('g2', { continues: 'g1' }), text('t1'), text('t2'), cta] };
  const placed = withMediaModules(page, { pageTypes: { home: { mediaModules: [{ at: 0.4, type: 'band', action: true }] } } }, {});
  const at = placed.findIndex((block) => block.variant === 'band');
  assert.notEqual(placed[at + 1]?.id, 'g2', `the band cut the card set: ${placed.map((block) => block.id)}`);
  assert.equal(placed[at].action, true);
  // Its button: the last link of the section before it, in that section's words; none where that section links nowhere.
  assert.deepEqual(bandLink([grid('g1'), placed[at]], 1, '/'), { label: 'All of them', href: '/all/' });
  assert.equal(bandLink([text('t'), placed[at]], 1, '/'), null);
  // Steps are a list in the section's data: the link's words are the link's, not the list around it.
  const steps = { id: 'm2', type: 'process', steps: [{ heading: 'One', text: 'Send details.' }, { heading: 'Two', text: 'Agree; [see how our process works](/our-process/).' }] };
  assert.deepEqual(bandLink([steps, placed[at]], 1, '/'), { label: 'See how our process works', href: '/our-process/' });
  assert.equal(bandLink([grid('g1'), { ...placed[at], action: undefined }], 1, '/'), null, 'a band without a button stays a photo');
});
