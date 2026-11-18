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

test('the default model knows a related block\'s text links carry no picture (measured on three sites)', async () => {
  const { DEFAULT_BLOCK_MODEL } = await import('../lib/visual-budget.mjs');
  // Staylumen 2026-11-16: before its calibration the links fell to relatedPages:* (a third picture) and seven service
  // pages failed service_card_photo for "links with photos".
  const links = estimateBlock({ type: 'relatedPages', links: [] }, 'links', 0, DEFAULT_BLOCK_MODEL);
  assert.equal(links.pictured, false);
  assert.equal(links.visual, 0);
  assert.equal(estimateBlock({ type: 'relatedPages', links: [] }, 'tiles', 0, DEFAULT_BLOCK_MODEL).pictured, true);
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
  // A section split in two is one section, never half a list; a grid without its own heading is never made a list: the
  // split section is the list, both halves in it.
  const split = [grid('m9'), { id: 'm9-2', type: 'featureGrid', continues: 'm9' }, { id: 'n', type: 'featureGrid' }];
  assert.deepEqual(varyItemRows(split, variantOf).map((block) => [block.id, variantOf(block)]), [['m9', 'bullets'], ['n', 'icons']]);
  // Steps, then a card set others go on from: the set stays cards, all of it, and the steps are a list.
  const set = [{ id: 'steps', type: 'process' }, grid('entries'), { id: 'entries-2', type: 'featureGrid', continues: 'entries' }];
  assert.deepEqual(varyItemRows(set, variantOf).map((block) => variantOf(block) ?? block.type), ['list', 'icons', 'icons']);
  // Two card sets in grids of their own, one under the other, no steps (Strandmill's women's swimwear page, 2026-11-14:
  // m4, m4-2 then m5, m5-2): the later set is one list, all its cards in it, beside its heading.
  const cards = (count) => Array.from({ length: count }, (_, index) => ({ heading: `c${index}` }));
  const sets = [{ ...grid('m4'), items: cards(3) }, { id: 'm4-2', type: 'featureGrid', continues: 'm4', items: cards(2) }, { ...grid('m5'), items: cards(3) }, { id: 'm5-2', type: 'featureGrid', continues: 'm5', items: cards(2) }];
  const joined = varyItemRows(sets, variantOf);
  assert.deepEqual(joined.map((block) => [block.id, variantOf(block), block.items.length]), [['m4', 'icons', 3], ['m4-2', 'icons', 2], ['m5', 'bullets', 5]]);
  // The later set too long for one list: the earlier one is the list; both too long, both stay cards.
  const more = (id, count) => [{ ...grid(id), items: cards(4) }, ...Array.from({ length: count - 1 }, (_, index) => ({ id: `${id}-${index + 2}`, type: 'featureGrid', continues: id, items: cards(4) }))];
  assert.deepEqual(varyItemRows([...more('a', 2), ...more('b', 3)], variantOf).map((block) => block.id), ['a', 'b', 'b-2', 'b-3']);
  assert.equal(varyItemRows([...more('a', 3), ...more('b', 3)], variantOf).length, 6);
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
  // The run between the first band and the last (s1 and g, two sections) cannot alternate: m5 is a plain row too.
  assert.deepEqual(varied.map((block) => block.variant ?? null), ['single', 'single', null, null]);
  assert.equal(varied[1].planned, true);
});

test("an even run of plain sections between two tinted split rows: the band it opens after is a plain split row (aloha's /quality-control/ 2026-11-17)", async () => {
  const { varySurfaces } = await import('../lib/visual-budget.mjs');
  const { tintedSections } = await import('../lib/section-surfaces.mjs');
  const variantOf = (block) => (block.planned ? block.variant : block.type === 'splitMedia' ? 'tinted' : 'cards');
  const blocks = [{ id: 'list', type: 'iconList' }, { id: 'b1', type: 'splitMedia' }, { id: 'single', type: 'splitMedia', variant: 'single', planned: true }, { id: 'related', type: 'iconList' }, { id: 'b2', type: 'splitMedia' }, { id: 'steps', type: 'process' }];
  const varied = varySurfaces(blocks, variantOf);
  assert.deepEqual(varied.map((block) => variantOf(block)), ['cards', 'single', 'single', 'cards', 'tinted', 'cards']);
  // No two neighbours on one grey: b2 is the only band, the run before it ends white.
  const tinted = tintedSections(varied, variantOf);
  const grey = (block) => tinted.has(block.id) || variantOf(block) === 'tinted';
  assert.ok(varied.slice(1).every((block, index) => !(grey(block) && grey(varied[index]))));
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

test('a grid is not made a list where it would be the third list in a row (Staylumen and Strandmill 2026-11-17)', async () => {
  const { varyItemRows } = await import('../lib/visual-budget.mjs');
  const { repeatedModules } = await import('../lib/visual-checks.mjs');
  const grid = (id) => ({ id, type: 'featureGrid', heading: `H ${id}`, items: [{ heading: 'a', text: 'b' }, { heading: 'c', text: 'd' }] });
  const list = (id) => ({ id, type: 'iconList', heading: `L ${id}`, items: [{ text: 'x' }] });
  const blocks = [{ id: 'intro', type: 'intro' }, grid('a'), grid('b'), list('c'), list('d'), { id: 'cta', type: 'cta' }];
  varyItemRows(blocks, (block) => block.variant ?? 'cards');
  // b beside the two icon lists stays cards; a (the pair's other grid) becomes the list instead.
  assert.deepEqual(blocks.map((block) => `${block.id}:${block.variant ?? '-'}`), ['intro:-', 'a:bullets', 'b:-', 'c:-', 'd:-', 'cta:-']);
  const rendered = blocks.map((block) => ({ id: block.id, type: block.type, pattern: block.variant === 'bullets' ? 'bullets' : undefined }));
  assert.deepEqual(repeatedModules(rendered, {}), []);
});

test("a grid the reference's pattern shows as a list keeps its cards where it would be the third list in a row (Staylumen 2026-11-17)", async () => {
  const { varyItemRows } = await import('../lib/visual-budget.mjs');
  const grid = (id) => ({ id, type: 'featureGrid', variant: 'cards', heading: `H ${id}`, items: [{ heading: 'a', text: 'b' }] });
  const list = (id) => ({ id, type: 'iconList', heading: `L ${id}`, items: [{ text: 'x' }] });
  // The reference sets its grids out as lists (designedVariant): a cards grid shows as bullets unless it keeps its cards.
  const shown = (block) => (block.type === 'featureGrid' && block.variant === 'cards' && !block.keepCards ? 'bullets' : block.variant);
  const blocks = [{ id: 'intro', type: 'intro' }, grid('a'), list('b'), list('c'), { id: 'cta', type: 'cta' }];
  varyItemRows(blocks, shown);
  assert.equal(blocks[1].keepCards, true);
  const apart = [{ id: 'intro', type: 'intro' }, grid('a'), { id: 't', type: 'table' }, list('b'), list('c')];
  varyItemRows(apart, shown);
  assert.equal(apart[1].keepCards, undefined, 'a list with no two lists beside it stays as the reference shows it');
});

test('a card set split into grids is not joined into one list where that list would be the third in a row (Staylumen 2026-11-17)', async () => {
  const { varyItemRows } = await import('../lib/visual-budget.mjs');
  const list = (id) => ({ id, type: 'iconList', heading: `L ${id}`, items: [{ text: 'x' }] });
  const set = () => [
    { id: 'g', type: 'featureGrid', variant: 'cards', heading: 'H g', items: [{ heading: 'a', text: 'b' }, { heading: 'c', text: 'd' }] },
    { id: 'g-2', type: 'featureGrid', variant: 'cards', continues: 'g', items: [{ heading: 'e', text: 'f' }] },
    { id: 'g-3', type: 'featureGrid', variant: 'cards', continues: 'g', items: [{ heading: 'h', text: 'i' }] },
  ];
  const blocks = [{ id: 'intro', type: 'intro' }, ...set(), list('r'), list('m3'), { id: 'cta', type: 'cta' }];
  varyItemRows(blocks, (block) => block.variant ?? 'cards');
  assert.deepEqual(blocks.map((block) => `${block.id}:${block.variant ?? '-'}`), ['intro:-', 'g:cards', 'g-2:cards', 'g-3:cards', 'r:-', 'm3:-', 'cta:-']);
  // With one icon list after it, the set still becomes the one list beside its heading.
  const one = [{ id: 'intro', type: 'intro' }, ...set(), list('r'), { id: 'cta', type: 'cta' }];
  varyItemRows(one, (block) => block.variant ?? 'cards');
  assert.deepEqual(one.map((block) => `${block.id}:${block.variant ?? '-'}`), ['intro:-', 'g:bullets', 'r:-', 'cta:-']);
});
