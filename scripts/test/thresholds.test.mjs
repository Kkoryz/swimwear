import assert from 'node:assert/strict';
import test from 'node:test';

import { THRESHOLDS, thresholdsToReview } from '../lib/thresholds.mjs';

test('every registered threshold is the value the code holds to', async () => {
  // Fable's 11-14 plan, item 8: the default block model was measured on one site and read another 0-12 points off;
  // the registry says where each threshold was measured, and it cannot drift from the code.
  assert.ok(THRESHOLDS.length >= 10);
  for (const entry of THRESHOLDS) {
    const module = await import(`../../${entry.module}`);
    assert.ok(entry.id in module, `${entry.module} exports ${entry.id}`);
    assert.deepEqual(JSON.parse(JSON.stringify(module[entry.id])), entry.value, entry.id);
  }
});

test('a threshold measured on fewer than two sites is to be reviewed on a new site; a safety stop is not', () => {
  const ids = thresholdsToReview().map((entry) => entry.id);
  assert.ok(ids.includes('CAPS_SPREAD'), 'measured on the motel site only');
  assert.ok(ids.includes('DENSITY_TOLERANCE'), 'no site recorded');
  assert.ok(!ids.includes('TRIAL_TOLERANCE'), 'measured on both sites');
  assert.ok(!ids.includes('MAX_BUDGET_WALLS'), 'a safety stop, not a measure');
});

test("each site's layout plan lists the thresholds to review", async () => {
  const { planMarkdown } = await import('../plan-layout.mjs');
  const markdown = planMarkdown({ madeAt: '2026-11-14T00:00:00Z', headingModel: 'none', maxWalls: 12, pages: [], photoSlots: [], gate: { items: [] } });
  assert.match(markdown, /只在一个站上量过/);
  assert.match(markdown, /CAPS_SPREAD/);
  assert.doesNotMatch(markdown, /TRIAL_TOLERANCE/);
});
