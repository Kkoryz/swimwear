import assert from 'node:assert/strict';
import test from 'node:test';

import { feasibility, fitHeadingModel, headingKey, predictHeadingLines, renderedWords } from '../lib/layout-plan.mjs';

test('the words a page renders: its copy without labels, eyebrows, tables and the closed FAQ answers', () => {
  const block = { id: 'faq', type: 'faq', eyebrow: 'Questions here', heading: 'Common questions', items: [{ question: 'How long does it take?', answer: 'About two weeks for most hotels we work with.' }], cta: { label: 'Talk to us', href: '/contact/' } };
  // Heading (2) + question (5); the eyebrow, the button and the answer under its closed summary are not counted.
  assert.equal(renderedWords(block), 7);
  assert.equal(renderedWords({ type: 'intro', heading: 'One two', paragraphs: ['Three [four](/x/) five.'] }), 5);
});

// Density is the picture area in its band (owner 2026-11-14: "文字量差没关系 关键是图片面积得对"); the copy's length is
// never budgeted from the design reference ("不应该按照单个竞品定预算啊"). rm's home: about 8,000px and 30% pictures
// without the walls added for density, a band of 47-85%.
const RM_HOME = { words: 1177, band: { wordsPer1000px: { max: 36 }, visualAreaPct: { min: 47, max: 85 }, longestTextOnlyPx: { max: 820 } }, height: 8000, visual: 2400, runs: [1300, 900, 600], wall: { height: 720, visual: 619 } };

test('a page whose pictures stay under the band with its walls used up does not fit: by how much and why, never a word count', () => {
  const result = feasibility({ ...RM_HOME, maxWalls: 3 });
  assert.equal(result.verdict, 'does_not_fit');
  assert.deepEqual(result.limits.map((limit) => limit.metric), ['visualAreaPct']);
  // Three walls lift 30% to about 42%: five points short of 47%.
  assert.equal(result.reachPct, 41.9);
  assert.equal(result.gapPct, 5.1);
  assert.ok(result.limits[0].walls > 3);
  assert.equal(result.wordsTarget, undefined, 'no copy budget');
  // The words a 1,000px and the text-only runs are no measure of whether a page fits.
  assert.equal(feasibility({ ...RM_HOME, visual: 4000, maxWalls: 3 }).verdict, 'fits');
});

test('a page already inside its band fits with no wall, one short of pictures fits with the walls it needs', () => {
  // motel's home: 7,877px, 44% pictures, band 34-61%.
  const motel = feasibility({ words: 552, band: { wordsPer1000px: { max: 74 }, visualAreaPct: { min: 34, max: 61 }, longestTextOnlyPx: { max: 1916 } }, height: 7877, visual: 3466, runs: [1786], wall: { height: 720, visual: 619 }, maxWalls: 3 });
  assert.equal(motel.verdict, 'fits');
  assert.equal(motel.walls, 0);
  const short = feasibility({ words: 900, band: { visualAreaPct: { min: 30, max: 66 } }, height: 8000, visual: 1600, runs: [2000], wall: { height: 720, visual: 619 }, maxWalls: 3 });
  assert.equal(short.verdict, 'fits_with_walls');
  assert.equal(short.walls, 2);
});

test('a wall needs a place: walls needed beyond the places a page has do not fit either', () => {
  const result = feasibility({ words: 900, band: { visualAreaPct: { min: 30, max: 66 } }, height: 8000, visual: 1600, runs: [2000], wall: { height: 720, visual: 619 }, maxWalls: 3, places: 1 });
  assert.equal(result.verdict, 'does_not_fit');
  assert.deepEqual(result.limits.map((limit) => limit.metric), ['places']);
});

test('a page type held to the ceiling only (about) is not short of pictures', () => {
  const result = feasibility({ words: 400, band: { visualAreaPct: { min: 30, max: 66 } }, height: 4000, visual: 200, runs: [1500], wall: { height: 720, visual: 619 }, maxWalls: 3, floorExempt: true });
  assert.equal(result.verdict, 'fits');
});

test('section headings: a capacity a line fitted per module and width from measured headings predicts their lines', () => {
  const samples = [
    { viewport: 'mobile', key: 'featureGrid:', text: 'Revenue Management Services for Owners', lines: 3 },
    { viewport: 'mobile', key: 'featureGrid:', text: 'What we do', lines: 1 },
    { viewport: 'mobile', key: 'featureGrid:', text: 'An Outsourced Revenue Management Company for Hotel Owners', lines: 4 },
  ];
  const model = fitHeadingModel(samples, 0.6);
  const lines = predictHeadingLines('An Outsourced Revenue Management Company for Hotel Owners', { viewport: 'mobile', key: 'featureGrid:', model, charEm: 0.6 });
  assert.equal(lines, 4);
  // An unknown module takes its width's usual capacity.
  assert.ok(predictHeadingLines('What we do', { viewport: 'mobile', key: 'faq:', model, charEm: 0.6 }) >= 1);
  // A face twice as wide fits about half the characters a line.
  assert.ok(predictHeadingLines('An Outsourced Revenue Management Company for Hotel Owners', { viewport: 'mobile', key: 'featureGrid:', model, charEm: 1.2 }) > 4);
});

test("a heading's module key: type, the variant it renders with, and whether a lead stands under it", () => {
  assert.equal(headingKey({ type: 'iconList', paragraphs: ['x'] }, 'icons'), 'iconList:icons+lead');
  assert.equal(headingKey({ type: 'faq' }, undefined), 'faq:');
});

test('a page is planned as the renderer places it: variants, columns, card title levels, surfaces, heading lines', async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const card = (heading, words = 12) => ({ heading, paragraphs: [Array.from({ length: words }, () => 'word').join(' ')] });
  const page = { route: '/contact/', pageType: 'contact', hero: { heading: 'Talk to us' }, blocks: [
    { id: 'intro', type: 'intro', heading: 'Why owners call', paragraphs: ['Short intro.'] },
    { id: 'a', type: 'featureGrid', heading: 'What we do', items: [card('One'), card('Two'), card('Three')] },
    { id: 'b', type: 'featureGrid', heading: 'How we work', items: [card('Four'), card('Five'), card('Six')] },
    { id: 'c', type: 'featureGrid', heading: 'Long cards', items: [card('L1', 45), card('L2', 45), card('L3', 45), card('L4', 45)] },
  ] };
  const plan = planPage(page, {}, { headingModel: { desktop: { '*': 30 }, mobile: { '*': 12 } }, charEm: 0.6 });
  const byId = Object.fromEntries(plan.blocks.map((block) => [block.id, block]));
  // Two rows of short items one under the other: the later one is a list beside its heading, on a page that takes no
  // photo walls too (varyItemRows runs on every page).
  assert.equal(byId.a.pattern, 'cards');
  assert.equal(byId.b.pattern, 'bullets');
  assert.equal(byId.a.columns, 3);
  assert.equal(byId.a.titleLevel, 'h3');
  // Four cards of 45 words go two by two (lib/rules.mjs cardGridMax).
  assert.equal(byId.c.columns, 2);
  assert.deepEqual(plan.blocks.map((block) => block.surface), ['white', 'tinted', 'white', 'tinted']);
  assert.equal(byId.a.heading.desktop, 1);
  assert.ok(byId.c.heading.mobile >= 1);
  assert.equal(plan.feasibility, undefined, 'a contact page has no density band');
});

test('a page with a band gets its feasibility from the plan without the walls added for density', async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const text = (id, words) => ({ id, type: 'intro', heading: id, paragraphs: [Array.from({ length: words }, () => 'word').join(' ')] });
  const page = { route: '/s/', pageType: 'solution', hero: { heading: 'A service' }, blocks: [text('a', 400), text('b', 400), text('c', 400), { id: 'cta', type: 'cta', heading: 'Call', paragraphs: ['Now.'] }] };
  const components = { densityBands: { wordsPer1000px: { max: 120 }, visualAreaPct: { min: 20, max: 60 }, longestTextOnlyPx: { max: 2000 } } };
  const plan = planPage(page, components);
  assert.ok(plan.feasibility, 'planned against its band');
  assert.ok(plan.budgetWalls <= 3);
  assert.ok(['fits', 'fits_with_walls', 'does_not_fit'].includes(plan.feasibility.verdict));
  assert.equal(plan.feasibility.estimate.words, plan.words);
});

test("a block's words as the trial build measures them: a closed answer and a table's cells are not text on the page", async () => {
  const { blockWords, modelVariant } = await import('../lib/media-slots.mjs');
  const faq = { id: 'faq', type: 'faq', heading: 'Questions', items: [{ question: 'One two', answer: 'Three four five' }, { question: 'Six', answer: 'Seven eight' }] };
  // hotel-rm /ota-optimization/, 2026-11-14: the plan counted every answer, 2,456px for an accordion measured at 832px.
  assert.equal(blockWords(faq, 'accordion', {}), 1 + 2 + 3 + 1);
  assert.equal(blockWords(faq, 'accordion', { faqFirst: 'closed' }), 1 + 2 + 1);
  assert.equal(blockWords(faq, 'open-list', {}), 1 + 2 + 3 + 1 + 2);
  assert.equal(blockWords(faq, 'cards', { faqFirst: 'closed' }), 1 + 2 + 3 + 1 + 2);
  // The model key of a list and an FAQ is the variant the renderer gives them, as the measure reads it (data-variant).
  const page = { route: '/a/', pageType: 'solution', blocks: [] };
  assert.equal(modelVariant({ id: 'i', type: 'iconList', items: [] }, page, [], {}, {}), 'checks');
  assert.equal(modelVariant(faq, page, [], { faq: 'bars' }, {}), 'bars');
});

test("the page's estimate holds what the page renders outside its blocks: the trust bar under the hero and a section's charts", async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const { trustBarContent } = await import('../lib/site-trust.mjs');
  // TrustBar.astro shows a page's own figures (page-figures.json), the site band on the home and about pages, nothing
  // on a privacy page: one function for the component and the plan.
  const trust = { items: [{ value: '120', label: 'hotels' }], certifications: [] };
  assert.equal(trustBarContent({ route: '/s/', pageType: 'solution' }, { '/s/': [{ value: '30%', label: 'more' }] }, trust).items.length, 1);
  assert.deepEqual(trustBarContent({ route: '/t/', pageType: 'solution' }, {}, trust).items, []);
  assert.equal(trustBarContent({ route: '/', pageType: 'home' }, {}, trust).items[0].label, 'hotels');
  const chart = { type: 'data', data: { shape: 'comparison', columns: ['A', 'B'], rows: [['1', '2']] } };
  const page = { route: '/s/', pageType: 'solution', hero: { heading: 'A service' }, blocks: [{ id: 'a', type: 'intro', heading: 'A', paragraphs: ['Words here.'], visuals: [chart] }] };
  const model = { 'trustBar:': { base: 270, perWord: 0, visual: 0, before: 1, after: 1 }, 'charts:': { base: 190, perWord: 0, visual: 0.8, before: 0.1, after: 0.1 }, 'intro:text': { base: 300, perWord: 0, visual: 0, before: 1, after: 1 }, 'hero:plain': { base: 400, perWord: 0, visual: 0, before: 1, after: 1 } };
  const bare = planPage(page, { blockModel: model });
  // hotel-rm /services/ 2026-11-14: its blocks matched the trial build to the pixel, the page was 391px short of it.
  const shown = planPage(page, { blockModel: model }, { trustBar: true });
  assert.equal(bare.estimate.heightPx, 400 + 300 + 190);
  assert.equal(shown.estimate.heightPx, 400 + 270 + 300 + 190);
  // A table's cells count as the block's words, as the measure counts them for the block model (lib/density.mjs
  // measureBlocks: th, td, dt, dd): a table is as tall as its rows.
  const { blockWords } = await import('../lib/media-slots.mjs');
  assert.equal(blockWords({ id: 't', type: 'table', heading: 'Rate parity', columns: ['Situation', 'What we do'], rows: [['Channel mix', 'We decide which']] }, 'cards', {}), 2 + 4 + 5);
});

test("a hero's lead set under it (page-lead) is part of the page's estimate", async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const lead = Array.from({ length: 120 }, () => 'word').join(' ');
  const page = { route: '/s/', pageType: 'solution', hero: { heading: 'A service', lead: [lead] }, blocks: [{ id: 'a', type: 'intro', heading: 'A', paragraphs: ['Words.'] }] };
  const model = { 'page-lead:': { base: 100, perWord: 1, visual: 0, before: 1, after: 1 }, 'intro:text': { base: 300, perWord: 0, visual: 0, before: 1, after: 1 }, 'hero:media-overlay': { base: 600, perWord: 0, visual: 1, before: 0, after: 0 } };
  const components = { hero: 'media-overlay', heroText: { leadWords: 20 }, blockModel: model };
  const plan = planPage(page, components);
  assert.equal(plan.hero.leadBelow, true);
  // motel /our-history/ 2026-11-14: 188px the plan did not hold.
  assert.equal(plan.estimate.heightPx, 600 + (100 + 120) + 300);
});

test("the planner counts a hero's long lead where the page sets it, under the hero as text, and plans the page into its band", async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const { leadBelowHero } = await import('../lib/heading-fit.mjs');
  const words = (count) => Array.from({ length: count }, () => 'word').join(' ');
  const page = { route: '/p/', pageType: 'general', hero: { heading: 'Our process', lead: [words(40)] }, blocks: [
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, type: 'intro', heading: id, paragraphs: [words(100)] })),
    { id: 'cta', type: 'cta', heading: 'Call', paragraphs: ['Now.'] },
  ] };
  const model = {
    'hero:media-overlay': { base: 500, perWord: 20, visual: 1, before: 0, after: 0 },
    'page-lead:': { base: 80, perWord: 3, visual: 0, before: 1, after: 1 },
    'intro:text': { base: 200, perWord: 3, visual: 0, before: 1, after: 1 },
    'gallery:band': { base: 800, perWord: 0, visual: 0.95, before: 0.02, after: 0.02 },
  };
  const components = { hero: 'media-overlay', heroText: { leadWords: 5 }, blockModel: model, densityBands: { wordsPer1000px: { max: 999 }, visualAreaPct: { min: 30, max: 80 }, longestTextOnlyPx: { max: 99999 } }, pageTypes: { general: { mediaModules: [{ at: 0.5, type: 'band' }] } } };
  assert.equal(leadBelowHero(page, 'media-overlay', components), true);
  assert.equal(leadBelowHero(page, 'plain', components), false, 'a hero without a photo keeps its lead');
  // motel /our-process/ 2026-11-14: the planner counted the 40-word lead as 800px of hero photo, planned no wall, and
  // the plan, counting the lead as the text under the hero it is, found the page at 15.6% for a band from 19%.
  const plan = planPage(page, components);
  assert.ok(plan.budgetWalls > 0, `walls: ${plan.budgetWalls}`);
  assert.ok(plan.estimate.visualAreaPct >= 30, `picture area ${plan.estimate.visualAreaPct}%`);
});

test('the visual budget plans with the variants the page renders: steps set out as a list next to a card row hold no picture', async () => {
  const { planPage } = await import('../lib/layout-plan.mjs');
  const words = (count) => Array.from({ length: count }, () => 'word').join(' ');
  const card = (heading) => ({ heading, paragraphs: [words(20)] });
  const page = { route: '/p/', pageType: 'general', hero: { heading: 'Our process' }, blocks: [
    { id: 'overview', type: 'intro', heading: 'Overview', paragraphs: [words(150)] },
    { id: 'g1', type: 'featureGrid', heading: 'What we do', items: [card('A'), card('B'), card('C')] },
    { id: 'g2', type: 'featureGrid', continues: 'g1', items: [card('D'), card('E')] },
    { id: 'steps', type: 'process', heading: 'How it works', steps: ['One.', 'Two.', 'Three.'] },
    { id: 'faq', type: 'faq', heading: 'Questions', items: [{ question: 'Q?', answer: 'A.' }] },
    { id: 'cta', type: 'cta', heading: 'Call', paragraphs: ['Now.'] },
  ] };
  const model = {
    'hero:plain': { base: 400, perWord: 0, visual: 0, before: 1, after: 1 },
    'intro:text': { base: 200, perWord: 3, visual: 0, before: 1, after: 1 },
    'featureGrid:cards': { base: 450, perWord: 0, visual: 0.4, before: 0.2, after: 0.2 },
    'process:circles': { base: 900, perWord: 0, visual: 0.7, before: 0.1, after: 0.1 },
    'process:list': { base: 600, perWord: 0, visual: 0, before: 1, after: 1 },
    'gallery:band': { base: 800, perWord: 0, visual: 0.95, before: 0.02, after: 0.02 },
  };
  const components = { hero: 'plain', blockModel: model, densityBands: { wordsPer1000px: { max: 999 }, visualAreaPct: { min: 30, max: 80 }, longestTextOnlyPx: { max: 99999 } } };
  // motel /our-process/ 2026-11-14: the budget counted the steps as circles over a photo, planned no wall, and the
  // steps were then set out as a list beside the card row (varyItemRows): 16% for a band from 19%.
  const plan = planPage(page, components);
  assert.equal(plan.blocks.find((block) => block.id === 'steps').variant, 'list');
  assert.ok(plan.budgetWalls > 0, `walls: ${plan.budgetWalls}`);
  assert.ok(plan.estimate.visualAreaPct >= 30, `picture area ${plan.estimate.visualAreaPct}%`);
});
