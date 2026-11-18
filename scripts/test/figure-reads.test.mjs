import assert from 'node:assert/strict';
import test from 'node:test';

import { countMatches, trustValueProblem, withoutRepeatedUnit } from '../lib/figure-reads.mjs';

test('a figure whose label opens on its unit shows the number alone, and then reads (site12 2026-11-17)', () => {
  for (const [value, label, shown] of [['5 years', 'Years experience', '5'], ['365 days', 'Days covered', '365'], ['10 properties', 'Properties per specialist', '10'], ['10 to 15 days', 'Days to a sample', '10 to 15'], ['12 people', 'Team members', '12 people'], ['since 2016', 'Years', 'since 2016']]) {
    const figure = withoutRepeatedUnit({ value, label });
    assert.equal(figure.value, shown, `${value} / ${label}`);
    assert.equal(trustValueProblem(figure), null);
  }
});

test('a number stated as a limit is no count: "no more than 10 properties" and "up to 5 properties" are left out', () => {
  const text = 'Each specialist manages no more than 10 properties. Each batch of up to 5 properties adds 10 business days. We serve 40 properties across the US.';
  assert.deepEqual(countMatches(text, String.raw`([\d,]+) (?:clients|properties|customers)\b`).map((match) => match[1]), ['40']);
  assert.deepEqual(countMatches('At most 3 clients a month; 120 clients served.', /([\d,]+) clients/i).map((match) => match[1]), ['120']);
});
