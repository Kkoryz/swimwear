import assert from 'node:assert/strict';
import test from 'node:test';

import { schemaProblems } from '../lib/schema-rules.mjs';
import { companyFrom, companySignoffItems, serviceAreaEntry, WORLDWIDE } from '../lib/site-company.mjs';

// Owner 2026-11-17: "全球 所有行业默认都是全球市场".
const company = (extra = {}) => companyFrom({ market: 'us', contact: { email: 'sales@strandmill.com', address: 'Guangzhou, Guangdong, China' }, siteName: 'Strandmill', domain: 'strandmill.com', category: 'swimwear', ...extra });

test('every site serves worldwide unless Site Factory or the identity names its area; the keywords\' market is seoMarket', () => {
  const made = company();
  assert.deepEqual(made.serviceArea, [WORLDWIDE]);
  assert.equal(made.seoMarket, 'US');
  assert.ok(!made.standIns.includes('serviceArea'));
  assert.ok(!companySignoffItems(made).some((item) => item.id === 'company-service-area'), 'the default is not on the sign-off list');
  // An explicit area wins: Site Factory's package, or the identity's project.yaml company block.
  assert.deepEqual(company({ given: { service_area: ['United States', 'Canada'] } }).serviceArea.map((entry) => entry.code), ['US', 'CA']);
  assert.deepEqual(company({ project: { company: { service_area: ['Germany'] }, market: { country: 'US' } } }).serviceArea, [{ type: 'City', name: 'Germany' }]);
  // A record made before from the keywords' market (source market) is made again as the worldwide default; the
  // owner's own area is kept.
  const before = { ...made, serviceArea: [{ type: 'Country', name: 'United States', code: 'US' }], sources: { ...made.sources, serviceArea: 'market' }, standIns: ['serviceArea'] };
  assert.deepEqual(company({ previous: before }).serviceArea, [WORLDWIDE]);
  const owners = { ...made, serviceArea: [{ type: 'Country', name: 'Canada', code: 'CA' }], sources: { ...made.sources, serviceArea: 'owner' }, standIns: [] };
  assert.deepEqual(company({ previous: owners }).serviceArea, [{ type: 'Country', name: 'Canada', code: 'CA' }]);
  for (const name of ['Worldwide', 'global', 'International']) assert.deepEqual(serviceAreaEntry(name), WORLDWIDE);
});

test('areaServed is text or a named schema.org place: the worldwide Place passes, a bare or unnamed object fails', () => {
  const errors = (areaServed) => schemaProblems({ '@context': 'https://schema.org', '@type': 'Service', name: 'S', provider: { '@id': '#o' }, areaServed }, { serviceArea: true }).filter((problem) => problem.level === 'error').map((problem) => problem.issue);
  assert.deepEqual(errors([{ '@type': 'Place', name: 'Worldwide' }]), []);
  assert.deepEqual(errors([{ '@type': 'City', name: 'San Diego' }, { '@type': 'Country', name: 'Canada' }]), []);
  assert.deepEqual(errors('Worldwide'), []);
  assert.deepEqual(errors([{ '@type': 'Place' }]), ['area_served_invalid']);
  assert.deepEqual(errors([{ name: 'Worldwide' }]), ['area_served_invalid']);
});
