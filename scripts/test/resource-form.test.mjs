import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { dataPractices } from '../lib/data-practices.mjs';
import { leadFormBlock, resourceFormBlock } from '../lib/lead-form.mjs';
import { orderBySlots, placeRequiredBlocks } from '../lib/page-assembly.mjs';
import { blueprintPage } from '../lib/page-blueprints.mjs';
import { promiseIn, resourceOptions, resourcePromise } from '../lib/resource-promise.mjs';

// The resource request form (owner 2026-11-17: "做成表单发到我们邮箱"), four-site audit 2026-11-17: hotel-rm's and
// Staylumen's resources pages offered guides and templates with no file and no way to ask for one.
const source = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const contract = async () => JSON.parse(await source('config/lead-form.json'));
const resources = () => [
  { id: 'intro', type: 'intro', heading: 'Who our resources are for', paragraphs: ['Guides for independent hotel owners.'] },
  { id: 'grid', type: 'featureGrid', heading: 'Guides, templates and checklists', items: [{ heading: 'Rate strategy guide', paragraphs: ['Base rates.'] }, { heading: 'OTA listing checklist', paragraphs: ['Titles.'] }, { heading: 'Monthly time commitment', paragraphs: ['Hours.'] }] },
  { id: 'faq', type: 'faq', heading: 'FAQ', items: [{ question: 'Do I need software?', answer: 'No.' }] },
  { id: 'cta', type: 'cta', heading: 'Talk to us', cta: { label: 'Contact', href: '/contact-us/' } },
];

test('a promise of a file is told from a file format the visitor sends or a report a service delivers', () => {
  for (const text of ['Download our free sizing guide.', 'All our templates are downloadable.', 'Free Guides, Templates & Checklists', 'Get the PDF brochure', 'Read our e-book on fabrics.']) assert.ok(promiseIn(text), text);
  for (const text of ['Send your AI or PDF artwork.', 'You get a PDF report within 10 days.', 'Files arrive as a file download within 5 business days.', 'We send you PDF and spreadsheet reports.']) assert.equal(promiseIn(text), null, text);
  assert.deepEqual(resourcePromise({ id: 'site:resources_guides', pageType: 'general', blocks: [] }), { phrase: null }, 'the site tree\'s resources page');
  assert.equal(resourcePromise({ id: 'site:about', pageType: 'about', blocks: resources().slice(0, 1) }), null);
});

test('the form names the resources the page lists, and posts to the enquiry endpoint with request_type=resource', async () => {
  const form = await contract();
  assert.deepEqual(resourceOptions({ blocks: [...resources(), { id: 't', type: 'table', table: { columns: ['Resource', 'When'], rows: [['Turnover checklist', 'Weekly'], ['Pricing', 'Daily']] } }] }), ['Rate strategy guide', 'OTA listing checklist', 'Turnover checklist']);
  const block = resourceFormBlock('resource-request', ['Rate strategy guide', 'OTA listing checklist']);
  assert.deepEqual([block.type, block.request, block.requestType, block.endpoint, block.status], ['form', 'resource', 'resource', form.endpoint, form.status], 'connected when the enquiry form is');
  assert.deepEqual(block.fields.map((field) => [field.name, field.kind, field.required]), [['name', 'text', true], ['email', 'email', true], ['resource', 'select', true], ['message', 'textarea', false]]);
  assert.deepEqual(block.fields[2].options, ['Rate strategy guide', 'OTA listing checklist', form.resourceRequest.resourceField.other]);
  assert.ok(block.fields.every((field) => field.purpose), 'each field says what it is for');
  assert.equal(block.consent.privacyRoute, form.consent.privacyRoute);
  assert.equal(resourceFormBlock('r').fields[2].kind, 'text', 'no resources named: the visitor names one');
  assert.deepEqual(validateAuthoringPages([{ id: 'site:resources_guides', route: '/resources/', pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/resources/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [block] }]), []);
  assert.match(validateAuthoringPages([{ id: 'x', route: '/x/', pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/x/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [{ ...block, fields: [{ name: 's', label: 'S', kind: 'select', options: ['one'] }] }] }]).join(' '), /two or more options/);
});

test('the importer places it on the resources page and on a page promising a file, before the FAQ, once; it keeps its place', () => {
  const blocks = resources();
  const mapping = [];
  placeRequiredBlocks(blocks, mapping, { planned: { page_id: 'site:resources_guides', page_type: 'general', url: '/resources/', label: 'Resources' } });
  assert.deepEqual(blocks.map((block) => block.id), ['intro', 'grid', 'resource-request', 'faq', 'cta']);
  assert.match(mapping.at(-1).rule, /resource request form \(2 resources named\)/);
  placeRequiredBlocks(blocks, mapping, { planned: { page_id: 'site:resources_guides', page_type: 'general', url: '/resources/', label: 'Resources' } });
  assert.equal(blocks.filter((block) => block.request === 'resource').length, 1, 'once');
  const ordered = orderBySlots(blocks, [], [{ id: 'form', block: 'form' }, { id: 'intro' }, { id: 'faq' }, { id: 'cta', block: 'cta' }]);
  assert.equal(ordered.findIndex((block) => block.id === 'resource-request') + 1, ordered.findIndex((block) => block.id === 'faq'), 'not moved to the enquiry form\'s slot');
  const service = [{ id: 'intro', type: 'intro', paragraphs: ['Download our free pricing checklist below.'] }];
  placeRequiredBlocks(service, [], { planned: { page_id: 'c-1:service', page_type: 'solution', url: '/pricing/' } });
  assert.deepEqual(service.map((block) => block.request ?? block.type), ['intro', 'resource']);
  const plain = [{ id: 'intro', type: 'intro', paragraphs: ['We price your rooms daily.'] }];
  placeRequiredBlocks(plain, [], { planned: { page_id: 'c-2:service', page_type: 'solution', url: '/rooms/' } });
  assert.equal(plain.length, 1);
  // The inquiry page's enquiry form is still placed beside a resource request form.
  const inquiry = [resourceFormBlock('resource-request')];
  placeRequiredBlocks(inquiry, [], { planned: { page_id: 'site:inquiry', page_type: 'general', url: '/request-a-quote/' } });
  assert.deepEqual(inquiry.map((block) => block.request ?? block.type), ['resource', 'form']);
  // A placeholder resources page (the blueprint builder) carries it as well.
  const placeholder = blueprintPage({ page: { page_id: 'site:resources_guides', page_type: 'general', label: 'Resources', url: '/resources/' }, pagesPlan: { pages: [] }, contactRoute: '/contact-us/' });
  assert.ok(placeholder.blocks.some((block) => block.request === 'resource'));
});

test('the privacy policy lists the resource request form when a page carries one', async () => {
  const form = leadFormBlock('form');
  assert.equal(dataPractices({ form }).rows.length, 2);
  const rows = dataPractices({ form, resourceForm: resourceFormBlock('resource-request', ['Rate strategy guide']) }).rows;
  assert.deepEqual(rows.map((row) => row[0]), ['The enquiry form', 'With each enquiry', 'The resource request form']);
  assert.match(rows[2][1], /^Your name, email and which resource; anything else you tell us, and that you agreed to this use/);
});

test('the form follows Modern Web Guidance: :user-invalid, aria-invalid in step, a polite live region, each field\'s purpose', async () => {
  const markup = await source('src/components/blocks/LeadForm.astro');
  const css = await source('src/styles/patterns.css');
  assert.match(css, /:user-invalid/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:user-invalid/g, ''), /:invalid\b/, 'never :invalid (it shows before the visitor has typed)');
  assert.match(css, /font-size: max\(1rem, 1em\)/, 'no zoom on focus on iOS');
  assert.match(markup, /'aria-invalid': 'false'/);
  assert.match(markup, /setAttribute\('aria-invalid', String\(invalid\)\)/);
  assert.match(markup, /role="status" aria-live="polite"/);
  assert.match(markup, /form-block__hint" id=\{`\$\{id\}-purpose`\}/);
  assert.match(markup, /name="request_type" value=\{block\.requestType\}/);
  assert.match(markup, /block\.requiredNote/);
  const form = await contract();
  assert.ok(form.fields.every((field) => field.purpose), 'every enquiry field says what it is for');
  assert.ok(form.requiredNote && ['invalid', 'sending', 'sent', 'failed'].every((key) => form.messages[key]));
});
