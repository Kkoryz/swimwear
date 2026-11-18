import assert from 'node:assert/strict';
import test from 'node:test';

import TRUST_UNITS from '../../config/trust-units.json' with { type: 'json' };
import { trustFromPackage, trustValue, trustValueTrimmed } from '../lib/site-trust.mjs';
import { siteFactoryIssues } from '../sf-report.mjs';

// site13 blind audit: the trust bar showed "65 that" and "55 custom" (Site Factory's value pattern took the word after
// the number). A value is a number with an optional unit of config/trust-units.json.
test('a trust value keeps its number and a known unit; a word after the number that is no unit is dropped', () => {
  assert.deepEqual(trustValue('65 that'), { value: '65', dropped: 'that' });
  assert.deepEqual(trustValue('55 custom'), { value: '55', dropped: 'custom' });
  for (const kept of ['100,000 pieces', '2011', '25 to 45 pieces', '10+ years', '24/7', '98%', '5,000 m²', '12 colours', '1 million pieces', '30 day lead time', '10-day samples', '15 years', '40 countries']) assert.deepEqual(trustValue(kept), { value: kept, dropped: null }, kept);
  // A unit's first letters are no unit ("m" is not "more"); a value that does not start with a number is left alone.
  assert.deepEqual(trustValue('65 more'), { value: '65', dropped: 'more' });
  assert.deepEqual(trustValue('since 2016'), { value: 'since 2016', dropped: null });
  // The list is the closed one in config.
  assert.ok(TRUST_UNITS.units.includes('people') && TRUST_UNITS.units.includes('%') && TRUST_UNITS.units.includes('m²'));
});

test('the import shows the number alone, leaves the label as it is, and reports the drop back to Site Factory', () => {
  const pkg = { trust_bar: [{ fact_id: 'homed:SG11', label: 'Sampling team', value: '65 that' }, { fact_id: 'homed:SG11', label: 'Daily samples', value: '55 custom' }, { fact_id: 'owner:founded', label: 'Founded', value: '2011' }] };
  const trust = trustFromPackage(pkg, new Map());
  assert.deepEqual(trust.items.map((item) => [item.value, item.label]), [['65', 'Sampling team'], ['55', 'Daily samples'], ['2011', 'Founded']]);
  const trimmed = trustValueTrimmed(pkg);
  assert.deepEqual(trimmed, [
    { factId: 'homed:SG11', label: 'Sampling team', value: '65 that', kept: '65', dropped: 'that' },
    { factId: 'homed:SG11', label: 'Daily samples', value: '55 custom', kept: '55', dropped: 'custom' },
  ]);
  const issues = siteFactoryIssues({ imported: { trustValueTrimmed: trimmed } });
  assert.deepEqual(issues.map((issue) => [issue.source, issue.kind, issue.section]), [['import', 'trust_value_not_a_unit', 'trust_bar'], ['import', 'trust_value_not_a_unit', 'trust_bar']]);
  assert.match(issues[0].detail, /"65 that" shows as "65"/);
});
