import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { pageSchemas, withheldCompanyDetails, WITHHELD_COMPANY_KEYS } from '../lib/seo-head.mjs';
import { publicAddressText } from '../lib/site-company.mjs';
import { contactChannels } from '../lib/site-contact.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const identity = { siteName: 'Strandmill', origin: 'https://strandmill.com', schemaLogo: { src: '/icon-512.png' } };
const page = (route, extra = {}) => ({ id: route, route, status: 'authored', pageType: 'home', hero: { heading: 'H1' }, seo: { title: 'Title', description: 'Description', canonical: route }, jsonLd: [], blocks: [], ...extra });

// Owner 2026-11-17: "法定名称和街道先不要放上去".
test('no JSON-LD states the legal name or the street: the Organization keeps its name and a city-level address', () => {
  assert.deepEqual(WITHHELD_COMPANY_KEYS, ['legalName', 'streetAddress', 'postalCode']);
  const company = { legalName: 'Guangzhou Strandmill Swimwear Co., Ltd.', address: { streetAddress: '18 Xingye Road', addressLocality: 'Guangzhou', addressRegion: 'Guangdong', postalCode: '510000', addressCountry: 'CN' }, foundingDate: '2011', serviceArea: [], sameAs: [], standIns: ['legalName', 'address'] };
  // Site Factory's own Organization with a legal name and a street gives them up too.
  const own = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Strandmill', legalName: 'Strandmill Ltd', address: { '@type': 'PostalAddress', streetAddress: '1 Road', addressLocality: 'Guangzhou', addressCountry: 'CN' } };
  for (const jsonLd of [[], [own]]) {
    const schemas = pageSchemas({ page: page('/', { jsonLd }), identity, nav: { header: [], footer: [] }, contact: { email: 'sales@strandmill.com' }, company });
    const text = JSON.stringify(schemas);
    assert.ok(!/legalName|streetAddress|postalCode|Co\., Ltd|Xingye|1 Road/.test(text), text);
    const organization = schemas.find((item) => item['@type'] === 'Organization');
    assert.equal(organization.name, 'Strandmill');
    assert.equal(organization.address.addressLocality, 'Guangzhou');
    assert.equal(organization.address.addressCountry, 'CN');
  }
  assert.deepEqual(withheldCompanyDetails([{ a: { legalName: 'x', b: 1 } }]), [{ a: { b: 1 } }]);
});

test('the pages show the address without its street, the footer the site name, and no certificate has a verify button', async () => {
  assert.equal(publicAddressText('120 King St W, Toronto, ON M5H 1A1, Canada'), 'Toronto, ON, Canada');
  assert.equal(publicAddressText('Guangzhou, Guangdong, China'), 'Guangzhou, Guangdong, China');
  assert.equal(contactChannels({ contact: { address: '18 Xingye Road, Guangzhou, Guangdong, China' } })[0].label, 'Guangzhou, Guangdong, China');
  assert.match(await source('src/lib/site-data.ts'), /siteLegalName = legalName\(\{ identity: siteIdentity \}\)/);
  // Owner 2026-11-17: "认证暂时不要核验按钮".
  const certificates = await source('src/components/blocks/CertificationsBlock.astro');
  assert.ok(!/item\.url|Verify certificate|certification__verify/.test(certificates.split('---')[2]));
});
