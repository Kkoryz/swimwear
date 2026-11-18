import assert from 'node:assert/strict';
import test from 'node:test';
import { TRUST_BAR, tintedSections, tintStyle } from '../lib/section-surfaces.mjs';

const block = (id, type) => ({ id, type });

test('neighbouring plain sections alternate white and tinted; a photo, band or split row starts again', () => {
  // The hotel home after its hero: intro, grid, photo, grid, list, steps, photo, logos, cases, testimonials, related, faq, cta.
  const home = [block('intro', 'text'), block('support', 'featureGrid'), block('media-module-1', 'gallery'), block('more', 'featureGrid'), block('count', 'featureGrid'), block('steps', 'process'), block('media-module-2', 'gallery'), block('logos', 'logos'), block('cases', 'caseStudies'), block('quotes', 'testimonials'), block('related', 'relatedPages'), block('faq', 'faq'), block('cta', 'cta')];
  // The testimonials alternate with the sections round them: logos white, cases tinted, quotes white, related tinted.
  assert.deepEqual([...tintedSections(home)], ['support', 'count', 'cases', 'related']);
});

test('the testimonials are a plain section: no two white sections meet round them (swimwear, hotel-rm, motel 2026-11-15)', () => {
  // swimwear's bikini page: grid going on, testimonials, related, faq; all three treatments leave the testimonials white.
  const blocks = [block('m4', 'featureGrid'), { id: 'm4-2', type: 'featureGrid', continues: 'm4' }, block('owner-testimonials', 'testimonials'), block('related', 'relatedPages'), block('faq', 'faq'), block('cta', 'cta')];
  assert.deepEqual([...tintedSections(blocks)].sort(), ['owner-testimonials', 'faq'].sort());
});

test('the last of a run stays white before a band of its own, so two grey bands never run together', () => {
  // The run counts back from the band (a tinted split row): its last section white, the one before it tinted (it once
  // left both white: the motel about page's bullets and logos, 2026-11-14).
  const band = (item) => (item.id === 's' ? 'tinted' : undefined);
  assert.deepEqual([...tintedSections([block('a', 'text'), block('b', 'logos'), { id: 's', type: 'splitMedia' }], band)], ['a']);
  assert.deepEqual([...tintedSections([block('a', 'text'), block('b', 'logos'), block('c', 'faq'), { id: 's', type: 'splitMedia' }], band)], ['b']);
});

test('the style tints each section across the page and turns its grey cards white', () => {
  assert.equal(tintStyle(new Set()), '');
  assert.match(tintStyle(new Set(['b'])), /main \[data-block-id="b"\] \{ background: var\(--section-tint\); --surface-secondary: var\(--surface-primary\); --sticky-surface: var\(--section-tint\); --table-ground: var\(--section-tint\); \}/);
});

test('a section going on in blocks of its own keeps one surface and does not count in the alternation', () => {
  const blocks = [block('intro', 'text'), { id: 'entries', type: 'featureGrid' }, { id: 'entries-2', type: 'featureGrid', continues: 'entries' }, { id: 'more', type: 'featureGrid', continues: 'entries' }, block('faq', 'faq'), block('cta', 'cta')];
  assert.deepEqual([...tintedSections(blocks)].sort(), ['entries', 'entries-2', 'more']);
});

test('a split row of the tinted variant is a band of its own: the plain section before it stays white, its steps start the next run', () => {
  const blocks = [block('a', 'text'), block('b', 'featureGrid'), { id: 's', type: 'splitMedia' }, { id: 's-steps', type: 'process', continues: 's' }, block('c', 'featureGrid'), block('d', 'orderCase'), { id: 'q', type: 'testimonials' }];
  const variantOf = (item) => ({ s: 'tinted', 's-steps': 'list' })[item.id];
  // hotel-rm 2026-11-14: a tinted split under a tinted grid read as one grey surface; its steps tinted with it met the
  // tinted grid after them. White steps, a tinted grid, white cases, tinted testimonials.
  assert.deepEqual([...tintedSections(blocks, variantOf)].sort(), ['a', 'c', 'q']);
});

test("a section's steps are a module of their own: they alternate with the section above them (Fable's ruling, 2026-11-15)", () => {
  // hotel-rm's contact page: the FAQ white, its steps tinted, not one white surface.
  const blocks = [block('a', 'text'), block('faq', 'faq'), { id: 'faq-steps', type: 'process', continues: 'faq' }, block('cta', 'cta')];
  assert.deepEqual([...tintedSections(blocks)], ['faq']);
  assert.deepEqual([...tintedSections([block('faq', 'faq'), { id: 'faq-steps', type: 'process', continues: 'faq' }, block('cta', 'cta')])], ['faq-steps']);
  // A card set's grids going on still keep their section's surface.
  assert.deepEqual([...tintedSections([block('a', 'text'), block('g', 'featureGrid'), { id: 'g-2', type: 'featureGrid', continues: 'g' }])].sort(), ['g', 'g-2']);
});

test('a section going on in another component is a module of its own; an inline closing call alternates (swimwear 2026-11-15)', () => {
  // The terms page: the list m2 going on as two proof sections; four white modules in a row before.
  const terms = [block('overview', 'intro'), block('m3', 'iconList'), block('m2', 'iconList'), { id: 'proof-1', type: 'proof', continues: 'm2' }, { id: 'proof-2', type: 'proof', continues: 'm2' }, block('process-1', 'process'), block('cta', 'cta')];
  assert.deepEqual([...tintedSections(terms)], ['m3', 'proof-1', 'process-1']);
  // A product page's FAQ and its inline closing call: not two white sections in a row.
  const close = [block('related', 'relatedPages'), block('faq', 'faq'), block('cta', 'cta')];
  assert.deepEqual([...tintedSections(close, (item) => (item.id === 'cta' ? 'inline' : undefined))], ['faq']);
  assert.deepEqual([...tintedSections([block('related', 'relatedPages'), block('faq', 'faq'), block('more', 'iconList'), block('cta', 'cta')], (item) => (item.id === 'cta' ? 'inline' : undefined))], ['faq', 'cta']);
});

test('the trust bar opens the first run tinted, the section under it white; it is the page surface when the run counts back from a band', () => {
  assert.deepEqual([...tintedSections([TRUST_BAR, block('overview', 'text'), block('grid', 'featureGrid'), block('faq', 'faq')])], ['trust-bar', 'grid']);
  const band = (item) => (item.id === 's' ? 'tinted' : undefined);
  assert.deepEqual([...tintedSections([TRUST_BAR, block('overview', 'text'), { id: 's', type: 'splitMedia' }], band)], ['trust-bar']);
  assert.deepEqual([...tintedSections([TRUST_BAR, block('overview', 'text'), block('grid', 'featureGrid'), { id: 's', type: 'splitMedia' }], band)], ['overview']);
});

test('steps going on from a split row with a photo are a plain section of the next run; steps over a photo part the page', () => {
  const blocks = [{ id: 's', type: 'splitMedia' }, { id: 's-steps', type: 'process', continues: 's' }, block('c', 'featureGrid'), { id: 'p', type: 'process' }, block('d', 'faq')];
  // hotel-rm 2026-11-14: the steps after a split row and the grid after them were two white sections. Since the steps
  // alternate with their section (2026-11-15): the split row white, its steps tinted, the grid white.
  assert.deepEqual([...tintedSections(blocks, (item) => (item.id === 'p' ? 'photo-cards' : undefined))], ['s-steps']);
});

test('a split row with its photo and the enquiry form alternate like plain sections; the closing call still parts the page (motel 2026-11-14)', () => {
  const blocks = [{ id: 'grid', type: 'featureGrid' }, { id: 'split', type: 'splitMedia' }, { id: 'related', type: 'relatedPages' }, { id: 'faq', type: 'faq' }, { id: 'form', type: 'form' }, { id: 'channels', type: 'contactChannels' }, { id: 'cta', type: 'cta' }];
  assert.deepEqual([...tintedSections(blocks, (item) => (item.id === 'split' ? 'panel' : undefined))], ['split', 'faq', 'channels']);
});

test("a section's later parts, each after the steps of the part before, keep its surface and the steps between them alternate with it (aloha 2026-11-17: /custom-labels-hang-tags/)", () => {
  // One section in four split rows (the first plain, the rest going on from it with its surface), the steps of rows 2-4
  // after each row: the steps between two of its rows meet both, so they take the other surface.
  const split = (id, continues = null) => ({ id, type: 'splitMedia', continues });
  const steps = (id, continues) => ({ id, type: 'process', continues });
  const blocks = [block('overview', 'text'), split('s1'), split('s2', 's1'), steps('s2-steps', 's2'), split('s3', 's1'), steps('s3-steps', 's3'), split('s4', 's1'), steps('s4-steps', 's4'), block('owner-testimonials', 'testimonials'), block('related', 'relatedPages'), block('faq', 'faq'), { id: 'cta', type: 'cta' }];
  const variant = (item) => (item.id === 's1' ? 'single' : undefined);
  const tinted = tintedSections(blocks, variant);
  const order = blocks.map((item) => (tinted.has(item.id) ? 'T' : 'W'));
  assert.deepEqual(order, ['W', 'T', 'T', 'W', 'T', 'W', 'T', 'W', 'T', 'W', 'T', 'W']);
});
