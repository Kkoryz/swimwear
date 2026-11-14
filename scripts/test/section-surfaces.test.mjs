import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_LEAD, tintedSections, tintStyle } from '../lib/section-surfaces.mjs';

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
  assert.match(tintStyle(new Set(['b'])), /main \[data-block-id="b"\] \{ background: var\(--section-tint\); --surface-secondary: var\(--surface-primary\); \}/);
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

test('steps going on from a split row with a photo are a plain section of the next run; steps over a photo part the page', () => {
  const blocks = [{ id: 's', type: 'splitMedia' }, { id: 's-steps', type: 'process', continues: 's' }, block('c', 'featureGrid'), { id: 'p', type: 'process' }, block('d', 'faq')];
  // hotel-rm 2026-11-14: the steps after a split row and the grid after them were two white sections.
  assert.deepEqual([...tintedSections(blocks, (item) => (item.id === 'p' ? 'photo-cards' : undefined))], ['c']);
});

test("the hero's lead opened under the hero is the run's first plain section, so the section after it is tinted (motel's contact page)", () => {
  const blocks = [{ id: 'overview', type: 'prose' }, { id: 'grid', type: 'featureGrid' }, { id: 'faq', type: 'faq' }];
  assert.deepEqual([...tintedSections(blocks)], ['grid']);
  assert.deepEqual([...tintedSections([PAGE_LEAD, ...blocks])], ['overview', 'faq']);
});

test('a split row with its photo and the enquiry form alternate like plain sections; the closing call still parts the page (motel 2026-11-14)', () => {
  const blocks = [{ id: 'grid', type: 'featureGrid' }, { id: 'split', type: 'splitMedia' }, { id: 'related', type: 'relatedPages' }, { id: 'faq', type: 'faq' }, { id: 'form', type: 'form' }, { id: 'channels', type: 'contactChannels' }, { id: 'cta', type: 'cta' }];
  assert.deepEqual([...tintedSections(blocks, (item) => (item.id === 'split' ? 'panel' : undefined))], ['split', 'faq', 'channels']);
});
