import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { assertQuickViewPlaced, placeOwnerSlots } from '../lib/page-assembly.mjs';
import { proofBlock } from '../lib/site-proof.mjs';

// LLM search view sample (owner 11-19): the page's quick-view table and a held certificate's look-up link.
const proof = { schemaVersion: 'seo-site-proof-v1', standIn: true, headings: { terms: 'Order terms at a glance' }, terms: { columns: ['Order step', 'Terms'], rows: [] } };
const quickView = { columns: ['Order term', 'Our terms'], rows: [['Minimum order', 'Orders start at 50 pieces per style in each colour.'], ['Certificates', 'OEKO-TEX Standard 100 for tested fabrics.']] };

test('a page quick view fills the order terms slot in place of the site table, even with no site rows', () => {
  assert.equal(proofBlock('orderTerms', proof, { route: '/bikini/' }), null);
  const block = proofBlock('orderTerms', proof, { route: '/bikini/', quickView });
  assert.deepEqual(block, { id: 'owner-orderTerms', type: 'table', heading: 'Order terms at a glance', columns: quickView.columns, rows: quickView.rows });
  // a site with no site-proof.json still shows the package's table
  assert.equal(proofBlock('orderTerms', null, { quickView }).type, 'table');
  // an empty quick view: the site table as before
  const site = { ...proof, terms: { columns: ['A', 'B'], rows: [['x', 'y']] } };
  assert.deepEqual(proofBlock('orderTerms', site, { quickView: { columns: [], rows: [] } }).rows, [['x', 'y']]);
});

test('placeOwnerSlots puts the quick view after the written terms section', () => {
  const blocks = [{ id: 'intro', type: 'intro', sourceSectionIds: ['overview'] }, { id: 'terms', type: 'intro', sourceSectionIds: ['m4'] }, { id: 'faq', type: 'faq', sourceSectionIds: ['faq'] }];
  const mapping = [{ sectionId: 'm4', kind: 'terms' }];
  placeOwnerSlots(blocks, mapping, { planned: { url: '/bikini/', page_type: 'product_manufacturer' }, proof, blueprints: { product_manufacturer: [{ id: 'orderTerms', block: 'orderTerms', fill: 'owner' }] }, quickView });
  assert.deepEqual(blocks.map((block) => block.id), ['intro', 'terms', 'owner-orderTerms', 'faq']);
});

test('no certificate number and no look-up link reach a page (owner 2026-11-19: no number shown)', () => {
  const oeko = { name: 'OEKO-TEX Standard 100', number: '21.HCN.12345', issuer: 'Hohenstein', scope: 'Fabrics and trims', validUntil: '2027-03', lookupUrl: 'https://www.oeko-tex.com/en/label-check' };
  const block = proofBlock('certifications', { ...proof, certifications: [oeko, { name: 'GRS' }] }, {});
  assert.deepEqual(block.items[0], { name: 'OEKO-TEX Standard 100', issuer: 'Hohenstein', scope: 'Fabrics and trims', validUntil: '2027-03' });
  const page = (item) => [{ id: 'home', route: '/', pageType: 'home', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/' }, hero: { heading: 'H', lead: ['L'] }, blocks: [{ id: 'certs', type: 'certifications', items: [item] }] }];
  const errors = (item) => validateAuthoringPages(page(item)).filter((error) => /never shown/.test(error));
  assert.equal(errors({ name: 'GRS', number: 'CU123' }).length, 1);
  assert.equal(errors({ name: 'GRS', lookupUrl: 'https://textileexchange.org/x' }).length, 1);
  assert.deepEqual(errors({ name: 'GRS', issuer: 'Control Union', validUntil: '2027' }), []);
  // the block itself renders no number and no link of a certificate
  const astro = readFileSync(new URL('../../src/components/blocks/CertificationsBlock.astro', import.meta.url), 'utf8');
  assert.equal(/item\.number|lookupUrl|<a /.test(astro), false);
});

test('a service page shows its own quick view in the order terms slot, never the site terms table', () => {
  const site = { ...proof, terms: { columns: ['A', 'B'], rows: [['x', 'y']] } };
  assert.equal(proofBlock('orderTerms', site, { siteTerms: false }), null);
  assert.deepEqual(proofBlock('orderTerms', site, { siteTerms: false, quickView }).rows, quickView.rows);
  const blocks = [{ id: 'intro', type: 'intro', sourceSectionIds: ['overview'] }, { id: 'faq', type: 'faq', sourceSectionIds: ['faq'] }];
  placeOwnerSlots(blocks, [], { planned: { url: '/printing/', page_type: 'solution' }, proof: site, blueprints: { solution: [{ id: 'orderTerms', block: 'orderTerms', fill: 'owner' }] } });
  assert.deepEqual(blocks.map((block) => block.id), ['intro', 'faq']);
});

test('the import stops when a page has a quick view in its package and no order terms table', () => {
  const source = { page_id: 'p', quick_view: quickView };
  assert.throws(() => assertQuickViewPlaced(source, [{ id: 'intro', type: 'intro' }]), /quick view/);
  assert.doesNotThrow(() => assertQuickViewPlaced(source, [{ id: 'owner-orderTerms', type: 'table' }]));
  assert.doesNotThrow(() => assertQuickViewPlaced({ page_id: 'q' }, []));                      // no quick view: nothing to place
  assert.doesNotThrow(() => assertQuickViewPlaced({ page_id: 'q', quick_view: { columns: [], rows: [] } }, []));
});
