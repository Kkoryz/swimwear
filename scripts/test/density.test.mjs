import assert from 'node:assert/strict';
import test from 'node:test';

import { DENSITY_SCHEMA, densityBands, densityFailures, textRunWords } from '../lib/density.mjs';

const reference = [
  { metrics: { wordsPer1000px: 120, photoAreaPct: 28, visualAreaPct: 28, longestTextOnlyPx: 1447 } },
  { metrics: { wordsPer1000px: 187, photoAreaPct: 25, visualAreaPct: 25, longestTextOnlyPx: 1200 } },
  { metrics: { wordsPer1000px: 72, photoAreaPct: 23, visualAreaPct: 23, longestTextOnlyPx: 1753 } },
];

test('density bands come from the whole reference range with tolerance', () => {
  assert.equal(DENSITY_SCHEMA, 'seo-site-reference-density-v2');
  assert.deepEqual(densityBands(reference), {
    wordsPer1000px: { max: 215 },
    visualAreaPct: { min: 17, max: 38 },
    longestTextOnlyPx: { max: 2104 },
  });
  assert.throws(() => densityBands([]), /at least one/);
});

test("a picture-less run may hold the band's longest run at the reference's sparsest text (owner 2026-11-12)", () => {
  // Text-only heights 4060 x 0.69 and 6895 x 0.72: 0.183 and 0.199 words a pixel; the sparser one fills 2467px.
  const pages = [{ metrics: { words: 512, contentHeight: 4060, visualAreaPct: 31 } }, { metrics: { words: 990, contentHeight: 6895, visualAreaPct: 28 } }];
  assert.equal(textRunWords(pages, { longestTextOnlyPx: { max: 2467 } }), 451);
  assert.equal(textRunWords([{ metrics: { words: 0, contentHeight: 0, visualAreaPct: 0 } }], { longestTextOnlyPx: { max: 2467 } }), null);
});

test('a text wall with a single image fails, a reference-like page passes', () => {
  const bands = densityBands(reference);
  const wall = densityFailures({ wordsPer1000px: 315, photoAreaPct: 14, visualAreaPct: 14, longestTextOnlyPx: 2199 }, bands).map((failure) => failure.issue);
  assert.deepEqual(wall, ['density_text_heavy', 'density_too_few_images', 'density_long_text_run']);
  assert.deepEqual(densityFailures({ wordsPer1000px: 170, photoAreaPct: 30, visualAreaPct: 30, longestTextOnlyPx: 600 }, bands), []);
  assert.deepEqual(densityFailures({ wordsPer1000px: 90, photoAreaPct: 55, visualAreaPct: 55, longestTextOnlyPx: 300 }, bands).map((failure) => failure.issue), ['density_too_many_images']);
});

test('tables, charts and cards count with the photos (owner 2026-11-10): a page of few photos but a table and step cards passes', () => {
  // baliswim's manufacturer page: 18% photos and 16% embeds (a fabric explorer) is a 34% visual page.
  const bands = densityBands(reference);
  assert.deepEqual(densityFailures({ wordsPer1000px: 90, photoAreaPct: 12, visualAreaPct: 30, longestTextOnlyPx: 900 }, bands), []);
  assert.deepEqual(densityFailures({ wordsPer1000px: 90, photoAreaPct: 12, visualAreaPct: 12, longestTextOnlyPx: 900 }, bands).map((failure) => failure.issue), ['density_too_few_images']);
});
