import assert from 'node:assert/strict';
import test from 'node:test';

import { PATTERN_DECISIONS, authoredPatterns, classifyPattern, coverage, inventory, splitSequence } from '../lib/pattern-map.mjs';

// Compact section signatures measured on gyknit.com.cn and swimwearbali.com (1440px).
const base = { top: 0, left: 0, width: 1440, height: 400, background: null, eyebrow: false, headingSize: 30, icons: 0, listItems: 0, checkItems: 0, stats: 0, numbered: 0, buttons: 0, imageWidths: [], tabs: 0, carousel: false, marquee: false, video: false, quotes: 0, words: 0, headings: 0, largeImages: 0, smallImages: 0, imagesPerRow: 0, coversSection: false, backgroundOnly: false, coverBackground: false, hasForm: false, hasTable: false, accordionItems: 0, firstHeading: '' };
const s = (overrides) => ({ ...base, ...overrides });

const gyknitHome = [
  s({ words: 16, headings: 1, largeImages: 1, imageWidths: [1440], coversSection: true, backgroundOnly: true, background: 'rgb(226, 226, 226)', buttons: 2 }),
  s({ words: 36, headings: 1, checkItems: 1, buttons: 1 }),
  s({ words: 62, headings: 1, largeImages: 2, imageWidths: [386, 386], checkItems: 4 }),
  s({ words: 45, headings: 1, largeImages: 2, imageWidths: [386, 386], listItems: 9, quotes: 3 }),
  s({ words: 123, headings: 1, listItems: 9 }),
  s({ largeImages: 8, imageWidths: [261, 479, 261, 321, 486, 359, 359, 359], height: 1037 }),
  s({ words: 7, headings: 1, largeImages: 1, imageWidths: [900] }),
  s({ words: 145, headings: 3, largeImages: 1, imageWidths: [713], hasTable: true }),
  s({ words: 15, headings: 3, stats: 3, height: 189 }),
  s({ largeImages: 1, imageWidths: [700] }),
  s({ words: 6, buttons: 1, height: 66 }),
  s({ words: 54, icons: 12, tabs: 12, accordionItems: 12 }),
  s({ words: 6, icons: 3, height: 70 }),
  s({ largeImages: 1, imageWidths: [1420], hasForm: true, height: 1013 }),
  s({ words: 46, headings: 2, largeImages: 2, imageWidths: [590, 590] }),
];
const swimHome = [
  s({ words: 27, headings: 3, largeImages: 1, imageWidths: [1440], coverBackground: true, coversSection: true, backgroundOnly: true, buttons: 2, eyebrow: true, height: 720 }),
  s({ words: 208, headings: 2, smallImages: 3, icons: 3, background: 'rgb(247, 244, 238)' }),
  s({ words: 5, headings: 1, largeImages: 12, imageWidths: [173, 161, 161], marquee: true, height: 242 }),
  s({ words: 147, headings: 3, largeImages: 1, imageWidths: [672], tabs: 16, buttons: 2, eyebrow: true }),
  s({ words: 65, headings: 2, largeImages: 1, imageWidths: [1440], coverBackground: true, buttons: 1, height: 870 }),
  s({ words: 199, headings: 6, largeImages: 6, imageWidths: [304, 183, 183, 304, 183, 183], numbered: 3, buttons: 6, height: 1154 }),
  s({ words: 95, headings: 4, buttons: 1 }),
  s({ words: 73, headings: 2, largeImages: 1, imageWidths: [680], background: 'rgb(232, 222, 210)' }),
  s({ words: 56, headings: 2, largeImages: 1, imageWidths: [700], background: 'rgb(232, 222, 210)' }),
  s({ words: 48, headings: 1, largeImages: 4, imageWidths: [330, 330, 330, 330], height: 888 }),
  s({ words: 78, headings: 2, largeImages: 1, smallImages: 5, icons: 5, imageWidths: [1440], coverBackground: true, buttons: 1 }),
  s({ words: 412, headings: 2, carousel: true, quotes: 7 }),
  s({ words: 48, headings: 2, largeImages: 1, imageWidths: [1440], coverBackground: true, buttons: 4, height: 870 }),
];
const swimManufacturer = [
  s({ largeImages: 1, imageWidths: [1440], coverBackground: true, coversSection: true, backgroundOnly: true, height: 518 }),
  s({ words: 79, headings: 1, buttons: 2 }),
  s({ words: 57, headings: 1 }),
  s({ words: 3, headings: 1, height: 95 }),
  s({ words: 100, largeImages: 1, imageWidths: [649] }),
  s({ words: 109, video: true }),
  s({ words: 77, headings: 1, largeImages: 1, imageWidths: [930] }),
  s({ words: 65, headings: 1 }),
  s({ words: 83, headings: 1, largeImages: 1, imageWidths: [930] }),
  s({ words: 64, headings: 1, largeImages: 1, imageWidths: [720] }),
];

test('reference sections are named by shape on both reference sites', () => {
  assert.deepEqual(gyknitHome.map((shape, index) => classifyPattern(shape, index)), [
    'hero-split', 'text', 'split-dual', 'split-dual', 'checklist', 'mosaic', 'figure', 'table', 'stats', 'figure', 'button-row', 'faq', 'social', 'form', 'media-cards',
  ]);
  assert.deepEqual(swimHome.map((shape, index) => classifyPattern(shape, index)), [
    'hero-overlay', 'icon-features', 'logos', 'tabs', 'band', 'numbered-cards+mosaic', 'columns', 'split-tinted', 'split-tinted', 'gallery', 'band', 'testimonials', 'band',
  ]);
  assert.deepEqual(swimManufacturer.map((shape, index) => classifyPattern(shape, index)), [
    'hero-banner', 'text', 'text', 'heading-only', 'split', 'split-video', 'figure', 'text', 'figure', 'split',
  ]);
  assert.equal(classifyPattern(s({ words: 73, headings: 4, icons: 4, smallImages: 4 }), 2, { pageType: 'contact' }), 'contact-cards');
  assert.equal(classifyPattern(s({ words: 3, headings: 1, largeImages: 1, imageWidths: [700] }), 4), 'figure');
  // gyknit's manufacturer page: two photos one above the other beside the copy; its home rows show them side by side.
  assert.equal(classifyPattern(s({ words: 131, headings: 1, largeImages: 2, imageWidths: [280, 280], imagesPerRow: 1 }), 2), 'split-column');
  assert.equal(classifyPattern(s({ words: 62, headings: 1, largeImages: 2, imageWidths: [386, 386], imagesPerRow: 2 }), 2), 'split-dual');
  assert.deepEqual(splitSequence(inventory([s({ largeImages: 1, imageWidths: [1440], height: 518 }), s({ words: 131, headings: 1, largeImages: 2, imageWidths: [280, 280], imagesPerRow: 1 })])), ['column']);
  // A section's shape at a phone's width (measurePhoneSections) goes into the inventory as measured; none, no field.
  const phone = { height: 372, words: 3, photo: { width: 370, height: 372, ratio: 0.99 } };
  const [withPhone, without] = inventory([s({ largeImages: 1, imageWidths: [1440], height: 518, phone }), s({ words: 40 })]);
  assert.deepEqual(withPhone.phone, phone);
  assert.ok(!('phone' in without));
});

test('every named pattern has a library decision', () => {
  for (const shapes of [gyknitHome, swimHome, swimManufacturer]) for (const section of inventory(shapes)) assert.ok(PATTERN_DECISIONS[section.pattern], section.pattern);
});

test('authored split rows follow the reference page split sequence', () => {
  assert.deepEqual(splitSequence(inventory(swimManufacturer)), ['single', 'single', 'wide', 'wide', 'single']);
});

test('a photo-row reference without cards gives authored cards no photos; its points as lists', () => {
  // Its full-width photos (figure) are its photo walls: bands where the copy runs long (owner 2026-11-12). It has no
  // cards, so its cards are not photo cards (owner 2026-11-12: what a card shows is the site's rule, slot-visuals.mjs).
  assert.deepEqual(authoredPatterns(inventory(swimManufacturer)), { splitSequence: ['single', 'single', 'wide', 'wide', 'single'], mediaModules: [{ at: 0.63, type: 'band' }, { at: 0.88, type: 'band' }] });
  assert.equal(authoredPatterns([{ pattern: 'split' }, { pattern: 'media-cards' }]).featureGrid, 'media', "the reference's own photo cards stay its card pattern");
  // A reference that sets its points out as bullet lists, with no cards and no process module: lists, steps numbered.
  assert.deepEqual(authoredPatterns([{ pattern: 'split' }, { pattern: 'checklist' }]), { splitSequence: ['single'], featureGrid: 'bullets', process: 'list' });
  assert.equal(authoredPatterns([{ pattern: 'checklist' }, { pattern: 'numbered-cards' }]).process, undefined, 'its own steps stay its own');
  assert.deepEqual(authoredPatterns([{ pattern: 'split' }, { pattern: 'columns' }]), { splitSequence: ['single'], featureGrid: 'columns' });
  assert.deepEqual(authoredPatterns([{ pattern: 'text' }, { pattern: 'faq' }]), {});
});

test('coverage counts skipped sections against the reference height', () => {
  assert.equal(coverage([{ pattern: 'text', height: 300 }, { pattern: 'social', height: 100 }]), 75);
  assert.equal(coverage([{ pattern: 'hero-overlay', height: 782 }, { pattern: 'map', height: 508 }]), 100, 'an excluded map embed is not part of the page height');
  assert.equal(classifyPattern({ map: true, words: 0, largeImages: 0, headings: 0, imageWidths: [] }, 1), 'map');
});

test('photo walls of the reference page type join authored pages at their relative position, without copy', async () => {
  const { authoredPatterns } = await import('../lib/pattern-map.mjs');
  const { withMediaModules, pageMediaDemand } = await import('../lib/media-slots.mjs');
  const sections = ['hero-overlay', 'text', 'columns', 'figure', 'text', 'text', 'split', 'text', 'text', 'mosaic'].map((pattern) => ({ pattern }));
  const patterns = authoredPatterns(sections);
  assert.deepEqual(patterns.mediaModules, [{ at: 0.25, type: 'band' }, { at: 1, type: 'mosaic' }], 'a full-width photo is a band wall');
  assert.equal(authoredPatterns(['hero-overlay', 'text'].map((pattern) => ({ pattern }))).mediaModules, undefined, 'none of its own');
  const rows = authoredPatterns(['hero-overlay', 'gallery', 'gallery', 'gallery', 'text', 'text', 'gallery', 'text', 'mosaic'].map((pattern) => ({ pattern }))).mediaModules;
  assert.deepEqual(rows, [{ at: 0, type: 'grid' }, { at: 0.71, type: 'grid' }], 'a run of photo rows is one wall; two at most');
  const text = (id) => ({ id, type: 'intro', heading: 'H', paragraphs: ['P'] });
  const page = { pageType: 'solution', blocks: [text('a'), text('b'), text('c'), text('d'), { id: 'cta', type: 'cta', cta: { label: 'Go', href: '/contact/' }, links: [] }] };
  const components = { pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'mosaic' }] } } };
  const blocks = withMediaModules(page, components);
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'intro', 'gallery', 'intro', 'intro', 'cta'], 'mid-page, before the closing CTA');
  assert.equal(blocks[2].items.length, 3);
  assert.ok(!blocks[2].heading && blocks[2].items.every((item) => !item.caption), 'no copy is added');
  assert.equal(page.blocks.length, 5, 'the authored page is not changed');
  assert.deepEqual(withMediaModules({ ...page, pageType: 'about' }, {}).map((block) => block.type), ['intro', 'intro', 'gallery', 'intro', 'intro', 'cta'], 'a page type without walls of its own gets one mosaic');
  assert.equal(withMediaModules({ ...page, pageType: 'contact' }, {}).length, 5, 'utility pages get none');
  assert.equal(withMediaModules({ ...page, pageType: 'home' }, components).length, 5, 'the home page keeps its blueprint');
  assert.equal(pageMediaDemand({ ...page, pageType: 'about' }, { hero: 'plain' }).product, 3, 'the image plan counts the wall');
  // A wall follows a copy section: between certificates and testimonials it has no purpose.
  const proof = (id, type) => ({ id, type, items: [] });
  const proofRun = { ...page, blocks: [text('a'), proof('c', 'certifications'), proof('t', 'testimonials'), proof('s', 'stats'), page.blocks[4]] };
  assert.deepEqual(withMediaModules(proofRun, components).map((block) => block.type), ['intro', 'gallery', 'certifications', 'testimonials', 'stats', 'cta'], 'after the copy, not inside the proof');
  assert.equal(withMediaModules({ ...proofRun, blocks: proofRun.blocks.slice(1) }, components).length, 4, 'a run of proof alone gets none');
});

test('a photo wall goes into the longest run without photos; a page that already alternates gets none', async () => {
  const { withMediaModules } = await import('../lib/media-slots.mjs');
  const text = (id) => ({ id, type: 'faq', heading: 'H', items: [{ question: 'Q?', answer: 'A' }] });
  const split = (id) => ({ id, type: 'splitMedia', heading: 'H', paragraphs: ['P'], media: null });
  const cta = { id: 'cta', type: 'cta', cta: { label: 'Go', href: '/contact/' }, links: [] };
  const components = { pageTypes: { solution: { mediaModules: [{ at: 0.1, type: 'grid' }] } } };
  const long = { pageType: 'solution', blocks: [split('s1'), text('t1'), split('s2'), text('t2'), text('t3'), text('t4'), text('t5'), cta] };
  assert.deepEqual(withMediaModules(long, components).map((block) => block.id), ['s1', 't1', 's2', 't2', 't3', 'media-module-1', 't4', 't5', 'cta'], 'in the middle of the longest photo-less run, not at the reference position');
  const alternating = { pageType: 'solution', blocks: [split('s1'), text('t1'), split('s2'), text('t2'), split('s3'), cta] };
  assert.equal(withMediaModules(alternating, components).length, alternating.blocks.length, 'no run longer than one block: no wall');
  // A slot past what the library holds stays empty: four process rows with one process photo are one photo and three
  // empty slots, the longest run without photos.
  const process = (id) => ({ ...split(id), mediaKind: 'process' });
  const scarce = { pageType: 'solution', blocks: [text('t1'), process('p1'), process('p2'), process('p3'), process('p4'), cta] };
  const library = (count) => ({ ...components, media: { origin: 'generated-library', pools: { process: Array.from({ length: count }, (_, index) => ({ src: `/p${index}.webp` })) } } });
  assert.deepEqual(withMediaModules(scarce, library(1)).map((block) => block.id), ['t1', 'p1', 'p2', 'media-module-1', 'p3', 'p4', 'cta'], 'in the middle of the three empty ones');
  assert.equal(withMediaModules(scarce, library(4)).length, scarce.blocks.length, 'with a photo for every slot the page alternates: no wall');
});

test('a short static row of four small marks with hardly any words is a logo strip, not a list of icons', () => {
  const row = { ...base, height: 180, smallImages: 4, words: 6, headings: 1 };
  assert.equal(classifyPattern(row, 3), 'logos');
  assert.notEqual(classifyPattern({ ...row, words: 80, headings: 4, icons: 4 }, 3), 'logos', 'four marked points with copy stay what they are');
});
