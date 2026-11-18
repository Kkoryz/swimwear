import assert from 'node:assert/strict';
import test from 'node:test';

import { ownerOf } from '../lib/issue-owners.mjs';
import { resourceFormBlock } from '../lib/lead-form.mjs';
import { formSlotProblems, promiseProblems, siteDataProblems, templatedDescriptions, trustValueProblem, trustValueProblems } from '../lib/site-data-checks.mjs';

// The four-site audit 2026-11-17's data problems, found by the early data checks (Fable's plan V-5).
const page = (route, extra = {}) => ({ id: route, route, pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: route }, hero: { heading: 'H' }, blocks: [], ...extra });

test('a trust figure cut off before its noun, or a label repeating its unit, fails and goes to Site Factory', () => {
  assert.match(trustValueProblem({ value: '65 that', label: 'Sampling team' }), /ends on "that"/);
  assert.match(trustValueProblem({ value: '5 years', label: 'Years experience' }), /repeats the unit/);
  assert.match(trustValueProblem({ value: '10 properties', label: 'Properties per specialist' }), /repeats the unit/);
  for (const fine of [{ value: '2011', label: 'Founded' }, { value: '100,000 pieces a month', label: 'Monthly capacity' }, { value: 'Up to 50', label: 'Styles a season' }, { value: '8-10 to 12-14', label: 'Age size range' }, { value: '50 pieces', label: 'Minimum per style colour' }, { value: 'XS to 5XL', label: 'Size range' }]) assert.equal(trustValueProblem(fine), null, fine.value);
  const found = trustValueProblems({ trust: { items: [{ value: '65 that', label: 'Sampling team' }] }, pageFigures: { '/bikini/': [{ value: '3 to 4 sizes', label: 'Size split per style' }], schemaVersion: 'x' } });
  assert.deepEqual(found.map((item) => [item.route, item.issue, item.level]), [['src/data/site-trust.json', 'trust_value_malformed', 'error'], ['/bikini/', 'page_figure_malformed', 'error']]);
  assert.equal(ownerOf('trust_value_malformed'), 'site-factory');
  assert.equal(ownerOf('page_figure_malformed'), 'template', "a page's own figures are labelled by 08's page-figures step");
});

test('the inquiry and contact pages carry the enquiry form in their data; a resource request form is not one', () => {
  const inquiry = page('/request-a-quote/', { id: 'site:inquiry' });
  assert.deepEqual(formSlotProblems([inquiry]).map((item) => item.issue), ['form_slot_missing']);
  assert.deepEqual(formSlotProblems([{ ...inquiry, blocks: [resourceFormBlock('resource-request')] }]).map((item) => item.issue), ['form_slot_missing']);
  assert.deepEqual(formSlotProblems([{ ...inquiry, blocks: [{ id: 'form', type: 'form', fields: [], submitLabel: 'Send' }] }]), []);
  assert.equal(ownerOf('form_slot_missing'), 'template');
});

test('a promised file needs a file link or the resource request form; the resources page always does', () => {
  const promising = page('/guides/', { blocks: [{ id: 'intro', type: 'intro', paragraphs: ['Download our free sizing guide before you order.'] }] });
  assert.deepEqual(promiseProblems([promising]).map((item) => item.issue), ['promise_without_asset']);
  assert.match(promiseProblems([promising])[0].detail, /Download our free/);
  assert.deepEqual(promiseProblems([{ ...promising, blocks: [...promising.blocks, resourceFormBlock('resource-request')] }]), []);
  assert.deepEqual(promiseProblems([{ ...promising, blocks: [{ id: 'intro', type: 'intro', paragraphs: ['[Download the sizing guide](/files/sizing.pdf).'] }] }]), [], 'a file link');
  assert.deepEqual(promiseProblems([page('/resources/', { id: 'site:resources_guides' })]).map((item) => item.issue), ['promise_without_asset']);
  assert.deepEqual(promiseProblems([{ ...promising, status: 'hold' }]), [], 'a held page is noindex');
  // A file the visitor sends, or a report a service delivers, is no promise (the four sites' product and service pages).
  assert.deepEqual(promiseProblems([page('/printing/', { blocks: [{ id: 'a', type: 'intro', paragraphs: ['Send your AI or PDF artwork. You get a PDF report within 10 days, as a file download within 5 business days.'] }] })]), []);
  assert.deepEqual(promiseProblems([page('/privacy-policy/', { pageType: 'privacy', blocks: [{ id: 'a', type: 'intro', paragraphs: ['You can download our free data export.'] }] })]), [], 'legal text');
  assert.equal(ownerOf('promise_without_asset'), 'site-factory');
});

test('descriptions from one skeleton, or naming their own page, warn for Site Factory past three pages', () => {
  const product = (name) => page(`/${name.toLowerCase()}/`, { seo: { title: `${name} Manufacturer | Knit Pace`, description: `Custom ${name.toLowerCase()} made to your spec with low minimums, fast samples and bulk production from one factory.` } });
  const skeleton = templatedDescriptions(['Leggings', 'Hoodies', 'Joggers', 'Shorts'].map(product), { siteName: 'Knit Pace' });
  assert.deepEqual(skeleton.map((item) => [item.issue, item.level]), [['description_templated', 'warning']]);
  assert.match(skeleton[0].route, /\/leggings\/ \/hoodies\/ \/joggers\/ \/shorts\//);
  assert.deepEqual(templatedDescriptions(['Leggings', 'Hoodies', 'Joggers'].map(product)), [], 'three pages are allowed');
  // The motel site's supporting pages: "<benefit>. <Page name> <verb> …".
  const support = (name, text) => page(`/${name.toLowerCase().replace(/\s+/g, '-')}/`, { seo: { title: `${name}: Something | MotelPilot`, description: text } });
  const motel = [
    support('About Us', 'Experienced remote support starts with our team of 25. About Us introduces the people behind MotelPilot.'),
    support('Contact Us', 'A reply within one business day, in English or French. Contact Us connects you with the right person.'),
    support('Case Studies', 'Before-and-after results make our work easier to assess. Case Studies shows changes at anonymised properties.'),
    support('Capabilities', 'Flexible remote support lets you hand over operations. Our Capabilities page explains what we handle.'),
    support('Resources', 'Resources for owners who plan a handover, from glossaries to checklists and rate review sheets.'),
  ];
  const named = templatedDescriptions(motel);
  assert.equal(named.length, 1);
  assert.match(named[0].detail, /4 descriptions name their own page/);
  assert.doesNotMatch(named[0].route, /\/resources\//, 'a description opening on the name is no pattern');
  assert.equal(ownerOf('description_templated'), 'site-factory');
});

test('the early data checks gather every check with its level', () => {
  const problems = siteDataProblems({ pages: [page('/request-a-quote/', { id: 'site:inquiry' }), page('/resources/', { id: 'site:resources_guides' })], trust: { items: [{ value: '65 that', label: 'Team' }] } });
  assert.deepEqual(problems.map((item) => `${item.level} ${item.issue}`), ['error form_slot_missing', 'error trust_value_malformed', 'error promise_without_asset']);
});
