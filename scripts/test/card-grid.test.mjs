import assert from 'node:assert/strict';
import test from 'node:test';

import { CARD_GRID, cardGridMax } from '../lib/rules.mjs';

test('an equal grid sets four cards side by side only while every card is short', () => {
  assert.equal(cardGridMax(0), 4);
  assert.equal(cardGridMax(CARD_GRID.longWords - 1), 4);
  assert.equal(cardGridMax(CARD_GRID.longWords), 3, 'four cards of 40 words go two by two (gridPlan: three at most, fewest empty cells)');
  assert.equal(cardGridMax(), 4);
});
