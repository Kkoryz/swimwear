import assert from 'node:assert/strict';
import test from 'node:test';

import { cardGridColumns, cardSet, cardSetColumns, cardTitleLevel, gridPlan, iconListLayout } from '../lib/block-layout.mjs';

const item = (chars, heading) => ({ ...(heading ? { heading } : {}), text: 'x'.repeat(chars) });
const card = (words, extra = {}) => ({ heading: 'Card', paragraphs: [Array.from({ length: words }, () => 'word').join(' ')], ...extra });

test('an icon list takes two columns for an even count of short items', () => {
  assert.equal(iconListLayout({ heading: 'Why us', items: [item(50), item(50)] }).columns, 2, 'beside an introduction: a few words each');
  assert.equal(iconListLayout({ heading: 'Why us', items: [item(61), item(50)] }).columns, 1, 'beside an introduction, past 60 characters');
  assert.equal(iconListLayout({ items: [item(160), item(100)] }).columns, 2, 'without one: a sentence or two each');
  assert.equal(iconListLayout({ items: [item(161), item(100)] }).columns, 1);
  assert.equal(iconListLayout({ paragraphs: ['Lead.'], items: [item(10), item(10)] }).layout, 'split', 'paragraphs alone are an introduction');
});

test('an icon list of an odd count stays one column beside an introduction', () => {
  const layout = iconListLayout({ heading: 'Why us', items: [item(20), item(20), item(20)] });
  assert.equal(layout.hasIntro, true);
  assert.equal(layout.columns, 1);
});

test('a full-width icon list of four items or more takes two columns whatever its count', () => {
  assert.equal(iconListLayout({ items: Array.from({ length: 7 }, () => item(343)) }).columns, 2, "hotel-rm's home: seven items of up to 343 characters");
  assert.equal(iconListLayout({ items: Array.from({ length: 5 }, () => item(360)) }).columns, 2);
  assert.equal(iconListLayout({ items: [item(361), item(20), item(20), item(20), item(20)] }).columns, 1, 'an item past a short paragraph keeps one column');
  assert.equal(iconListLayout({ items: [item(200), item(20), item(20)] }).columns, 1, 'three items: the even-count rule only');
  assert.equal(iconListLayout({ heading: 'Why us', items: Array.from({ length: 5 }, () => item(20)) }).columns, 1, 'not beside an introduction');
});

test('an item without a heading among headed items is a note run after them', () => {
  const layout = iconListLayout({ items: [item(20, 'A'), item(30), item(20, 'B'), item(20, 'C'), item(20, 'D'), item(20, 'E')] });
  assert.deepEqual(layout.listed.map((entry) => entry.heading), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(layout.notes.length, 1);
  assert.equal(layout.columns, 1, 'five listed items and a note: the full-width rule does not apply');
  const even = iconListLayout({ items: [item(20, 'A'), item(20, 'B'), item(400)] });
  assert.equal(even.columns, 2, 'the note does not count towards the longest item');
  assert.equal(iconListLayout({ items: [item(20), item(20), item(20)] }).notes.length, 0, 'no headings: no notes');
});

test('card titles sit one level below the grid title or the section the grid goes on from', () => {
  assert.equal(cardTitleLevel({ heading: 'Services' }), 'h3');
  assert.equal(cardTitleLevel({ continues: 'services' }), 'h3');
  assert.equal(cardTitleLevel({}), 'h2', 'without either, each card is a page section');
});

test('a card grid takes four short cards a row, three at most once a card runs to 40 words', () => {
  assert.equal(cardGridColumns({ items: [card(10), card(10), card(10), card(10)] }).columns, 4);
  const long = cardGridColumns({ items: [card(10), card(40), card(10), card(10)] });
  assert.equal(long.columns, 2, 'four cards of 40 words go two by two');
  assert.equal(long.ownColumns, 2);
  assert.equal(cardGridColumns({ items: [card(5, { wordCount: 45 }), card(5), card(5), card(5)] }).columns, 2, 'wordCount wins over the counted text');
});

test('a card grid of an odd count centres its short last row', () => {
  const grid = cardGridColumns({ items: [card(10), card(10), card(10), card(10), card(10)] });
  assert.equal(grid.columns, 3);
  assert.equal(grid.tabletColumns, 3);
  assert.equal(grid.style, '--tracks: 6; --tracks-md: 6');
  assert.equal(grid.itemStyle(3), '--start: 2; --start-md: 2');
  assert.equal(grid.itemStyle(0), undefined);
});

test("a grid of a card set takes the set's column count on a desktop, its own plan in data-columns", () => {
  const grid = cardGridColumns({ setColumns: 4, items: [card(10), card(10), card(10)] });
  assert.equal(grid.columns, 4);
  assert.equal(grid.ownColumns, 3);
  assert.equal(grid.style, '--tracks: 8; --tracks-md: 6');
  assert.equal(grid.itemStyle(0), '--start: 2');
});

test('a bullet list takes two columns past six points', () => {
  assert.deepEqual(cardGridColumns({ items: Array.from({ length: 7 }, () => card(10)) }, 'bullets'), { columns: 2 });
  assert.deepEqual(cardGridColumns({ items: Array.from({ length: 6 }, () => card(10)) }, 'bullets'), { columns: 1 });
  assert.equal(cardGridColumns({ items: Array.from({ length: 7 }, () => card(10)) }, 'cards').columns, 4, 'any other variant is a grid');
});

test("every grid of a card set takes the widest grid's count, four at most", () => {
  const blocks = [
    { type: 'featureGrid', id: 'services', items: [card(1), card(1), card(1)] },
    { type: 'featureGrid', id: 'more', continues: 'services', items: Array.from({ length: 6 }, () => card(1)) },
    { type: 'featureGrid', id: 'alone', items: [card(1), card(1)] },
    { type: 'iconList', id: 'list', items: [] },
  ];
  assert.equal(cardSet(blocks[1]), 'services');
  assert.equal(cardSet(blocks[0]), 'services');
  assert.deepEqual([...cardSetColumns(blocks)], [['services', 4]]);
  assert.deepEqual([...cardSetColumns(blocks.slice(0, 1))], [], 'a grid alone is no set');
});

test('gridPlan picks the column count leaving the fewest empty cells', () => {
  assert.equal(gridPlan(6, 4).columns, 3);
  assert.equal(gridPlan(8, 4).columns, 4);
  assert.equal(gridPlan(13, 5, 3).columns, 5, 'min: three at least');
  assert.equal(gridPlan(2).columns, 2);
  assert.equal(gridPlan(7, 4, 2, 4).columns, 4, 'fixed wins');
});

test("a card set of long cards takes the columns its cards hold, not four: four cards of 40 words and more go two by two", async () => {
  const { cardSetColumns } = await import('../lib/block-layout.mjs');
  const long = (n) => Array.from({ length: n }, () => ({ paragraphs: [Array.from({ length: 60 }, () => 'word').join(' ')] }));
  // hotel-rm 2026-11-14: a set of 60-word cards rendered --tracks: 8 on desktops, four to a row.
  const sets = cardSetColumns([{ id: 'a', type: 'featureGrid', items: long(4) }, { id: 'a-2', type: 'featureGrid', continues: 'a', items: long(4) }]);
  assert.equal(sets.get('a'), 2);
  const short = (n) => Array.from({ length: n }, () => ({ paragraphs: ['A few words.'] }));
  assert.equal(cardSetColumns([{ id: 'b', type: 'featureGrid', items: short(4) }, { id: 'b-2', type: 'featureGrid', continues: 'b', items: short(3) }]).get('b'), 4);
});

test('a card set with long cards in any of its grids keeps to three a row in all of them', async () => {
  const { cardSetColumns } = await import('../lib/block-layout.mjs');
  const cards = (n, words) => Array.from({ length: n }, () => ({ paragraphs: [Array.from({ length: words }, () => 'word').join(' ')] }));
  // hotel-rm's digital marketing page, 2026-11-14: four short cards, then four of 47 words in the set's second grid, four to a row.
  assert.equal(cardSetColumns([{ id: 'm4', type: 'featureGrid', items: cards(4, 20) }, { id: 'm4-2', type: 'featureGrid', continues: 'm4', items: cards(4, 47) }]).get('m4'), 2);
});
