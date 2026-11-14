import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_BUDGET_WALLS, estimateBlock, fitBlockModel, modelMoved, pageEstimate, planVisualBudget, varyItemRows } from '../lib/visual-budget.mjs';

const model = {
  'intro:text': { base: 200, perWord: 3, visual: 0, before: 1, after: 1 },
  'gallery:band': { base: 720, perWord: 0, visual: 0.86, before: 0.08, after: 0.08 },
  'relatedPages:tiles': { base: 480, perWord: 0, visual: 0.6, before: 0.2, after: 0.2 },
  'cta:form': { base: 750, perWord: 0, visual: 0.2, before: 0.7, after: 0.7 },
  '*': { base: 200, perWord: 4, visual: 0, before: 1, after: 1 },
};
const bands = { wordsPer1000px: { max: 166 }, visualAreaPct: { min: 19, max: 43 }, longestTextOnlyPx: { max: 2467 } };
const text = (id, words) => ({ id, type: 'intro', heading: id, words });
const helpers = (extra = {}) => ({ bands, model, variantOf: (block) => ({ intro: 'text', gallery: 'band', relatedPages: block.variant ?? 'tiles', cta: 'form' })[block.type], wordsOf: (block) => block.words ?? 0, wall: (id) => ({ id, type: 'gallery', variant: 'band', items: [{}] }), isWall: (block) => String(block.id).startsWith('media-module-'), ...extra });

test('a block\'s estimate follows its words; a page\'s run ends at a picture', () => {
  assert.equal(estimateBlock({ type: 'intro' }, 'text', 100, model).height, 500);
  assert.equal(estimateBlock({ type: 'unknown' }, null, 50, model).height, 400, 'an unknown module is text by the fallback');
  const page = pageEstimate([{ height: 1000, visual: 0, before: 1000, after: 1000, pictured: false }, { height: 720, visual: 620, before: 60, after: 60, pictured: true }, { height: 500, visual: 0, before: 500, after: 500, pictured: false }]);
  assert.deepEqual([page.height, Math.round(page.visualPct), page.longestRun], [2220, 28, 1060]);
});

test('a page is planned to its band: walls where its copy runs on, none on a short page, tiles give way on a crowded one', () => {
  // Six sections of 300 words each (1,100px apiece): one picture-less run of 6,600px gets walls until no run is too long.
  const long = [...Array.from({ length: 6 }, (_, index) => text(`s${index}`, 300)), { id: 'cta', type: 'cta' }];
  const planned = planVisualBudget(long, helpers());
  const walls = planned.filter((block) => block.type === 'gallery').length;
  assert.ok(walls >= 3, `walls: ${walls}`);
  const estimate = pageEstimate(planned.map((block) => estimateBlock(block, helpers().variantOf(block), block.words ?? 0, model)));
  assert.ok(estimate.longestRun <= bands.longestTextOnlyPx.max, `longest run ${estimate.longestRun}`);
  // The band, not a count, decides: eight such sections take more walls, within the safety stop.
  const longer = planVisualBudget([...Array.from({ length: 8 }, (_, index) => text(`s${index}`, 300)), { id: 'cta', type: 'cta' }], helpers());
  const more = longer.filter((block) => block.type === 'gallery').length;
  assert.ok(more > walls && more <= MAX_BUDGET_WALLS, `walls: ${more}`);
  // A short page with photo tiles and a photo closing band shows too much: its tiles become links, no wall goes in.
  const crowded = { ...model, 'relatedPages:tiles': { ...model['relatedPages:tiles'], visual: 0.9 }, 'cta:form': { ...model['cta:form'], visual: 0.4 } };
  const short = planVisualBudget([text('a', 20), { id: 'related', type: 'relatedPages' }, { id: 'cta', type: 'cta' }], helpers({ model: crowded }));
  assert.equal(short.filter((block) => block.type === 'gallery').length, 0);
  assert.equal(short.find((block) => block.type === 'relatedPages').variant, 'links');
});

test('the block model is fitted from measured blocks, and a moved model plans the pages again', () => {
  const samples = [100, 200, 300].map((words) => ({ key: 'intro:text', words, height: 150 + 3 * words, visualShare: 0, before: 150 + 3 * words, after: 150 + 3 * words }));
  const fitted = fitBlockModel(samples, model);
  assert.deepEqual(fitted['intro:text'], { base: 150, perWord: 3, visual: 0, before: 1, after: 1 });
  assert.equal(fitted['gallery:band'], model['gallery:band'], 'a module the site does not show keeps its default');
  assert.equal(modelMoved(model, model), false);
  assert.equal(modelMoved(model, { ...model, 'intro:text': { ...model['intro:text'], base: 400 } }), true);
});

test('a module a page type styles its own way is estimated by that page type\'s fit', () => {
  const samples = [
    ...['/a/', '/b/', '/c/'].map(() => ({ key: 'cta:form+photo', pageType: 'solution', words: 15, height: 665, visualShare: 0, before: 665, after: 665 })),
    ...['/d/', '/e/', '/f/'].map(() => ({ key: 'cta:form+photo', pageType: 'general', words: 40, height: 958, visualShare: 0.64, before: 140, after: 200 })),
  ];
  const fitted = fitBlockModel(samples, model);
  assert.equal(estimateBlock({ type: 'cta' }, 'form+photo', 15, fitted, 'solution').visual, 0);
  assert.ok(estimateBlock({ type: 'cta' }, 'form+photo', 40, fitted, 'general').visual > 600);
});

test('two rows of short items never stand together: the card grid of the pair becomes a list beside its heading', () => {
  const grid = (id) => ({ id, type: 'featureGrid', heading: id });
  // The hotel home: icon cards, a photo, icon cards, icon cards, steps.
  const blocks = [grid('a'), { id: 'photo', type: 'figure' }, grid('b'), grid('c'), { id: 'steps', type: 'process' }, { id: 'x', type: 'faq' }, { id: 'n', type: 'stats' }, grid('d')];
  const variantOf = (block) => (block.planned ? block.variant : block.type === 'featureGrid' ? 'icons' : undefined);
  assert.deepEqual(varyItemRows(blocks, variantOf).map((block) => variantOf(block) ?? block.type), ['icons', 'figure', 'icons', 'bullets', 'process', 'faq', 'stats', 'bullets']);
  // Steps right after a grid: the grid goes, unless the block before it is a list already.
  const steps = [grid('e'), { id: 's', type: 'process' }];
  assert.deepEqual(varyItemRows(steps, variantOf).map((block) => variantOf(block) ?? block.type), ['bullets', 'process']);
  // A section split in two is one section; a grid without its own heading is never made a list.
  const split = [grid('m9'), { id: 'm9-2', type: 'featureGrid', continues: 'm9' }, { id: 'n', type: 'featureGrid' }];
  assert.deepEqual(varyItemRows(split, variantOf).map((block) => variantOf(block)), ['icons', 'icons', 'icons']);
  // Steps, then a card set others go on from: the set stays cards, all of it, and the steps are a list.
  const set = [{ id: 'steps', type: 'process' }, grid('entries'), { id: 'entries-2', type: 'featureGrid', continues: 'entries' }];
  assert.deepEqual(varyItemRows(set, variantOf).map((block) => variantOf(block) ?? block.type), ['list', 'icons', 'icons']);
});

test('a page short of pictures gets walls wherever a run takes one, and a section too long for the band takes one where its module changes', () => {
  // The hotel-rm home of 2026-11-14: its longest run was one section (cards, the rest of the cards, then a list) between
  // two of the competitor's walls; with no place there the planner stopped and the page showed 10% pictures for 38%.
  const card = (id, words, extra = {}) => ({ id, type: 'featureGrid', words, ...extra });
  const wallAt = (id) => ({ id, type: 'gallery', variant: 'band', items: [{}] });
  const page = () => [
    text('intro', 120), card('set', 150), card('set-2', 150, { continues: 'set' }), wallAt('media-module-1'),
    card('svc', 200), card('svc-2', 200, { continues: 'svc' }), { id: 'svc-list', type: 'iconList', words: 300, continues: 'svc' }, wallAt('media-module-2'),
    card('more', 120), text('faq', 200), { id: 'cta', type: 'cta' },
  ];
  const tight = { ...bands, visualAreaPct: { min: 38, max: 68 }, longestTextOnlyPx: { max: 1758 } };
  const planned = planVisualBudget(page(), helpers({ bands: tight }));
  const ids = planned.map((block) => block.id);
  const added = planned.filter((block) => String(block.id).startsWith('media-module-budget'));
  assert.ok(added.length >= 2, `walls added: ${ids.join(' ')}`);
  // Never between two grids of one card set, never beside another wall.
  for (const [index, block] of planned.entries()) {
    if (!String(block.id).startsWith('media-module-')) continue;
    assert.ok(!String(planned[index - 1]?.id).startsWith('media-module-') && !String(planned[index + 1]?.id).startsWith('media-module-'), `walls side by side: ${ids.join(' ')}`);
    const next = planned[index + 1];
    if (next?.continues) assert.notEqual(next.type, planned[index - 1].type, `a wall cut a card set in two: ${ids.join(' ')}`);
  }
  assert.ok(ids.indexOf('svc-list') - ids.indexOf('svc-2') === 2, `the long section takes its wall where cards turn to a list: ${ids.join(' ')}`);
});

test('a wall never stands where the page says two blocks belong together (two proof sections)', () => {
  const proof = (id) => ({ id, type: 'testimonials', words: 400 });
  const page = [text('a', 300), proof('logos'), proof('quotes'), text('b', 300), { id: 'cta', type: 'cta' }];
  const planned = planVisualBudget(page, helpers({ bands: { ...bands, visualAreaPct: { min: 40, max: 70 } }, apart: (before, after) => !(before?.type === 'testimonials' && after?.type === 'testimonials') }));
  const ids = planned.map((block) => block.id);
  assert.equal(ids.indexOf('quotes') - ids.indexOf('logos'), 1, ids.join(' '));
  assert.ok(planned.some((block) => String(block.id).startsWith('media-module-budget')), ids.join(' '));
});

test('where neither card grid of a pair can be a list, the steps of the pair are set out as a list', () => {
  // hotel-rm's pricing page and motel's process page, 2026-11-14: a grid going on from another (no heading of its own)
  // stood over a row of steps.
  const blocks = [{ id: 'm3', type: 'featureGrid', heading: 'Plans' }, { id: 'm3-2', type: 'featureGrid', continues: 'm3' }, { id: 'm2', type: 'process', heading: 'How it works' }];
  const varied = varyItemRows(blocks, (block) => (block.type === 'featureGrid' ? 'cards' : block.variant ?? 'circles'));
  assert.equal(varied[2].variant, 'list');
  assert.equal(varied[2].planned, true);
  assert.equal(varied[1].variant, undefined);
});

test('two split rows of the tinted variant one under the other: the later one is a plain split row', async () => {
  const { varySurfaces } = await import('../lib/visual-budget.mjs');
  // hotel-rm's digital marketing page, 2026-11-14: two tinted splits ran as one grey band.
  const blocks = [{ id: 'm5', type: 'splitMedia' }, { id: 's1', type: 'splitMedia' }, { id: 'g', type: 'featureGrid' }, { id: 's2', type: 'splitMedia' }];
  const varied = varySurfaces(blocks, (block) => (block.planned ? block.variant : block.type === 'splitMedia' ? 'tinted' : 'cards'));
  assert.deepEqual(varied.map((block) => block.variant ?? null), [null, 'single', null, null]);
  assert.equal(varied[1].planned, true);
});

test('a card grid of fewer than three cards is no structured block to the measure: none of it counts as picture', () => {
  // lib/density.mjs counts a card grid as structured from three boxed cards side by side; motel /our-history/ 2026-11-14:
  // a grid going on with two cards was estimated 159px of picture and measured none.
  const grid = { 'featureGrid:cards': { base: 300, perWord: 1, visual: 0.42, before: 0.2, after: 0.2 } };
  const two = estimateBlock({ type: 'featureGrid', items: [{}, {}] }, 'cards', 80, grid);
  assert.equal(two.visual, 0);
  assert.equal(two.pictured, false);
  assert.ok(estimateBlock({ type: 'featureGrid', items: [{}, {}, {}] }, 'cards', 80, grid).visual > 0);
  // Photo cards show their photos whatever their number.
  assert.ok(estimateBlock({ type: 'featureGrid', items: [{}, {}] }, 'media', 80, { 'featureGrid:media': { ...grid['featureGrid:cards'], visual: 0.5 } }).visual > 0);
});
