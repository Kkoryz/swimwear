import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { BUILT_STATUSES, importSiteFactory, parseFacts, runImport } from '../import-site-factory.mjs';
import { RELATED_HEADING, placeRelated } from '../lib/page-assembly.mjs';
import { parseFaq, parseSteps, planBlocks } from '../lib/sf-sections.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';

const words = (count, seed = 'word') => Array.from({ length: count }, (_, index) => `${seed}${index}`).join(' ') + '.';

function section(id, body, heading = `Heading ${id}`) {
  return { section_id: id, heading, body, fact_ids: [] };
}

function page(overrides = {}) {
  return {
    page_id: 'sample-page',
    url: '/sample-page/',
    title: 'Sample title',
    meta_description: 'Sample description.',
    h1: 'Sample H1',
    sections: [
      section('s1', words(110, 'intro')),
      section('s2', words(130, 'long')),
      section('s3', words(100, 'shortA')),
      section('s4', words(105, 'shortB')),
      section('s5', 'Samples take 10 to 15 days. MOQ is 50 pieces. Bulk takes 35 to 40 days.'),
      section('s6', 'How do we start?\nSend us your design.\n\nCan we order small?\nYes. Our MOQ is 50 pieces per style.'),
    ],
    links: [{ link_id: 'l1', url: '/other/', anchor_text: 'Other page' }],
    cta: { target_url: '/contact/', label: 'Request a Quote' },
    structured_data: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'Sample' }],
    release_status: 'ready_for_template',
    hold_reasons: [],
    notes: ['topics_not_covered:s2:Example'],
    ...overrides,
  };
}

const plan = {
  pages: [
    { page_id: 'home', page_type: 'home', label: 'Home', url: '/' },
    { page_id: 'sample-page', page_type: 'product_manufacturer', label: 'Sample', url: '/sample-page/' },
    { page_id: 'held-page', page_type: 'product_manufacturer', label: 'Held', url: '/held-page/' },
    { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' },
    { page_id: 'privacy', page_type: 'privacy', label: 'Privacy Policy', url: '/privacy/' },
  ],
  header_nav: [
    { label: 'Products', page_id: 'sample-page', children: [{ label: 'Held', page_id: 'held-page', children: [] }] },
    { label: 'Contact', page_id: 'contact', children: [] },
  ],
  footer_nav: [{ label: 'Privacy Policy', page_id: 'privacy', children: [] }],
};

test('parseFaq splits question and answer pairs verbatim', () => {
  const items = parseFaq('How do we start?\nSend us your design.\n\nCan we order small?\nYes. Our MOQ is 50 pieces.\nSecond line.');
  assert.deepEqual(items, [
    { question: 'How do we start?', answer: 'Send us your design.' },
    { question: 'Can we order small?', answer: 'Yes. Our MOQ is 50 pieces.\nSecond line.' },
  ]);
  assert.equal(parseFaq('Only prose here. No questions.'), null);
  assert.throws(() => parseFaq('How do we start?\nSend us your design.\n\nCan we order small?\nYes.\n\nA stray paragraph without a question.'), /question/);
  assert.throws(() => parseFaq('How do we start?\n\nCan we order small?\nYes.'), /answer/);
});

test('parseSteps only accepts numbered line sequences', () => {
  assert.deepEqual(parseSteps('1. Send the design.\n2. Approve the sample.\n3. Start bulk production.'), [
    '1. Send the design.',
    '2. Approve the sample.',
    '3. Start bulk production.',
  ]);
  assert.equal(parseSteps('1. Only one step.\n2. And two.'), null);
  assert.equal(parseSteps(words(40)), null);
});

test('planBlocks maps sections by content shape and keeps order', () => {
  const { blocks, mapping } = planBlocks(page());
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'splitMedia', 'featureGrid', 'proof', 'faq', 'cta']);
  assert.deepEqual(mapping.map((entry) => [entry.sectionId, entry.blockType]), [
    ['s1', 'intro'], ['s2', 'splitMedia'], ['s3', 'featureGrid'], ['s4', 'featureGrid'], ['s5', 'proof'], ['s6', 'faq'],
  ]);
  const grid = blocks[2];
  assert.equal(grid.items.length, 2);
  assert.deepEqual(grid.sourceSectionIds, ['s3', 's4']);
  const cta = blocks.at(-1);
  assert.deepEqual(cta.cta, { label: 'Request a Quote', href: '/contact/' });
  // The page's links go to the related pages block (placeRelated), not the closing band.
  assert.deepEqual(cta.links, []);
});

test('a lone standard section becomes splitMedia and runs of four split into two grids', () => {
  const lone = planBlocks(page({ sections: [section('s1', words(50)), section('s2', words(90)), section('s3', words(140))] }));
  assert.deepEqual(lone.blocks.map((block) => block.type), ['intro', 'splitMedia', 'splitMedia', 'cta']);
  const four = planBlocks(page({ sections: [section('s1', words(50)), ...['s2', 's3', 's4', 's5'].map((id) => section(id, words(100)))] }));
  assert.deepEqual(four.blocks.map((block) => block.type), ['intro', 'featureGrid', 'featureGrid', 'cta']);
  assert.deepEqual(four.blocks.slice(1, 3).map((block) => block.items.length), [2, 2]);
  const five = planBlocks(page({ sections: [section('s1', words(50)), ...['s2', 's3', 's4', 's5', 's6'].map((id) => section(id, words(100)))] }));
  assert.deepEqual(five.blocks.slice(1, 3).map((block) => block.items.length), [3, 2]);
});

test('a numbered section becomes process and only the densest numeric section becomes proof', () => {
  const { blocks } = planBlocks(page({
    sections: [
      section('s1', words(60)),
      section('s2', '1. Send the design.\n2. Approve the sample.\n3. Start bulk production.'),
      section('s3', 'We ship in 2 days.'),
      section('s4', 'Samples take 10 to 15 days, MOQ is 50 pieces and bulk takes 35 to 40 days.'),
    ],
  }));
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'process', 'splitMedia', 'proof', 'cta']);
  assert.deepEqual(blocks[1].steps, ['1. Send the design.', '2. Approve the sample.', '3. Start bulk production.']);
});

test('importer copies every string verbatim and never invents copy', () => {
  const source = page();
  const [imported] = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [source] }, pagesPlan: plan }).pages;
  const rendered = JSON.stringify(imported.blocks) + JSON.stringify(imported.hero);
  for (const item of source.sections) {
    for (const piece of item.body.split(/\n/).filter(Boolean)) assert.ok(rendered.includes(JSON.stringify(piece).slice(1, -1)), `missing ${piece.slice(0, 30)}`);
    assert.ok(rendered.includes(item.heading));
  }
  const strings = [];
  const collect = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) if (!['id', 'type', 'sourceSectionIds', 'href', 'wordCount'].includes(key)) collect(inner);
  };
  collect(imported.blocks);
  collect(imported.hero);
  // The related pages heading is the template's label, not Site Factory's copy.
  // Related cards name planned pages by the plan's labels (Site Factory's, not invented).
  const allowed = new Set([source.h1, source.cta.label, ...source.links.map((link) => link.anchor_text), RELATED_HEADING, ...plan.pages.map((planned) => planned.label)]);
  for (const item of source.sections) {
    allowed.add(item.heading);
    for (const paragraph of item.body.split(/\n\s*\n/)) allowed.add(paragraph.trim());
    for (const line of item.body.split('\n')) allowed.add(line.trim());
    for (const pair of parseFaq(item.body) || []) { allowed.add(pair.question); allowed.add(pair.answer); }
  }
  for (const value of strings) assert.ok(allowed.has(value), `invented or rewritten copy: ${value.slice(0, 60)}`);
});

test('importer emits SEO fields, JSON-LD, page type and passes the authoring contract', () => {
  const result = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page()] }, pagesPlan: plan });
  const [imported] = result.pages;
  assert.equal(imported.route, '/sample-page/');
  assert.equal(imported.pageType, 'product_manufacturer');
  assert.equal(imported.status, 'authored');
  assert.deepEqual(imported.seo, { title: 'Sample title', description: 'Sample description.', canonical: '/sample-page/' });
  assert.deepEqual(imported.jsonLd, page().structured_data);
  assert.deepEqual(imported.hero, { heading: 'Sample H1', cta: { label: 'Request a Quote', href: '/contact/' } });
  assert.deepEqual(validateAuthoringPages(result.pages), []);
  assert.deepEqual(result.report.pages[0].unplaced, [{ field: 'notes', value: ['topics_not_covered:s2:Example'] }]);
});

test("JSON-LD is plain text: the copy's Markdown links in it keep their words and the import report names the page", () => {
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Which fabrics?', acceptedAnswer: { '@type': 'Answer', text: 'These [swimwear fabrics](/swimwear-fabrics-sourcing/) last; see [printing](/custom-swimwear-printing/).' } }] };
  const result = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page({ structured_data: [faq] })] }, pagesPlan: plan });
  assert.equal(result.pages[0].jsonLd[0].mainEntity[0].acceptedAnswer.text, 'These swimwear fabrics last; see printing.');
  assert.equal(result.pages[0].jsonLd[0]['@context'], 'https://schema.org');
  assert.deepEqual(result.report.jsonLdMarkdown, ['/sample-page/']);
  assert.deepEqual(importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page()] }, pagesPlan: plan }).report.jsonLdMarkdown, []);
});

test('an imported legal page is legal text like its placeholder: its intro sections are text blocks', () => {
  const legal = page({ page_id: 'privacy', url: '/privacy/', sections: ['s1', 's2', 's3', 's4'].map((id) => ({ ...section(id, words(45, id)), kind: 'intro', presentation: 'prose' })), structured_data: [] });
  const [imported] = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [legal] }, pagesPlan: plan }).pages;
  const intros = imported.blocks.filter((block) => block.type === 'intro');
  assert.equal(intros.length, 4);
  assert.ok(intros.every((block) => block.variant === 'text'));
  const [product] = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page()] }, pagesPlan: plan }).pages;
  assert.ok(product.blocks.filter((block) => block.type === 'intro').every((block) => block.variant !== 'text'), 'other pages keep their intro');
});

test('importer builds hold pages for review (status hold, their reasons on the report for the preflight), skips any other unreleased page and honours an explicit page filter', async () => {
  const { isIndexable } = await import('../lib/seo-head.mjs');
  const held = page({ page_id: 'held-page', url: '/held-page/', release_status: 'hold', hold_reasons: ['unsupported_claims'] });
  const pkg = { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), held] };
  const all = importSiteFactory({ authoringPackage: pkg, pagesPlan: plan });
  assert.deepEqual(all.pages.map((item) => [item.id, item.status]), [['sample-page', 'authored'], ['held-page', 'hold']]);
  assert.deepEqual(all.report.held, [{ pageId: 'held-page', route: '/held-page/', reason: 'release_status:hold', holdReasons: ['unsupported_claims'] }]);
  assert.deepEqual(all.report.skipped, []);
  assert.equal(isIndexable(all.pages[1]), false, 'a held page is noindex and out of the sitemap');
  assert.deepEqual(importSiteFactory({ authoringPackage: pkg, pagesPlan: plan, only: ['held-page'] }).pages.map((item) => item.id), ['held-page']);
  // A page Site Factory does not release at all is not built.
  const draft = { ...pkg, pages: [page(), { ...held, release_status: 'draft' }] };
  assert.deepEqual(importSiteFactory({ authoringPackage: draft, pagesPlan: plan }).report.skipped.map((item) => item.reason), ['release_status:draft']);
  assert.throws(() => importSiteFactory({ authoringPackage: draft, pagesPlan: plan, only: ['held-page'] }), /not to be built/);
  assert.throws(() => importSiteFactory({ authoringPackage: pkg, pagesPlan: plan, only: ['missing'] }), /missing/);
});

test('importer builds navigation from the site plan', () => {
  const { nav } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page()] }, pagesPlan: plan });
  assert.deepEqual(nav.header, [
    { label: 'Products', route: '/sample-page/', children: [{ label: 'Held', route: '/held-page/', children: [] }] },
    { label: 'Contact', route: '/contact/', children: [] },
  ]);
  assert.deepEqual(nav.footer, [{ label: 'Privacy Policy', route: '/privacy/', children: [] }]);
});

test('importer rejects packages it cannot place instead of dropping content', () => {
  const pkg = (pages) => ({ schema_version: 'sf/authoring/v1', project: 't', pages });
  assert.throws(() => importSiteFactory({ authoringPackage: { ...pkg([page()]), schema_version: 'sf/authoring/v9' }, pagesPlan: plan }), /schema/);
  // A page without a call to action still imports, without a closing band.
  assert.ok(!importSiteFactory({ authoringPackage: pkg([page({ cta: null })]), pagesPlan: plan }).pages[0].blocks.some((block) => block.type === 'cta'));
  assert.throws(() => importSiteFactory({ authoringPackage: pkg([page({ url: '/not-in-plan/' })]), pagesPlan: plan }), /site plan/);
  assert.throws(() => importSiteFactory({ authoringPackage: pkg([page({ sections: [] })]), pagesPlan: plan }), /sections/);
});

test('runImport writes the data files and the import report', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'seo-site-import-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ schema_version: 'sf/authoring/v1', project: 't', pages: [page()] }));
  await writeFile(join(root, 'plan.json'), JSON.stringify(plan));
  await runImport({ packagePath: join(root, 'package.json'), pagesPlanPath: join(root, 'plan.json'), root });
  const pages = JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'));
  assert.equal(pages.length, 1);
  await access(join(root, 'src/data/site-nav.json'));
  const report = JSON.parse(await readFile(join(root, 'docs/research/site-factory-import.json'), 'utf8'));
  assert.equal(report.schemaVersion, 'seo-site-factory-import-v1');
});

const SAMPLE = 'D:/korey_seo/site-factory-freeze/2026-09-24-07-sample/underwear';
test('frozen Site Factory sample imports cleanly when present', async (t) => {
  try { await access(`${SAMPLE}/authoring_package.json`); } catch { t.skip('frozen sample not available'); return; }
  const authoringPackage = JSON.parse(await readFile(`${SAMPLE}/authoring_package.json`, 'utf8'));
  const pagesPlan = JSON.parse(await readFile(`${SAMPLE}/pages.json`, 'utf8'));
  const result = importSiteFactory({ authoringPackage, pagesPlan });
  assert.deepEqual(validateAuthoringPages(result.pages), []);
  assert.equal(result.pages.length, authoringPackage.pages.filter((item) => BUILT_STATUSES.includes(item.release_status)).length);
  for (const imported of result.pages) {
    assert.equal(imported.blocks.filter((block) => block.type === 'faq').length, 1, imported.id);
    assert.equal(imported.blocks.filter((block) => block.type === 'proof').length, 1, imported.id);
  }
});

const FACTS = parseFacts(`facts:
  - fact_id: moq
    text: "Our minimum order quantity is 50 pieces per style per colour, and we accept small orders."
    verification_status: user_provided
    approved_public: true
  - fact_id: lead-time
    text: "Bulk production normally takes 35 to 40 days after sample approval and deposit."
    verification_status: user_provided
    approved_public: true
  - fact_id: internal
    text: "Internal note with 99 days."
    verification_status: user_provided
    approved_public: false
`);

const structured = {
  key_figures: [
    { value: '50 pieces per style per colour', label: 'minimum order quantity', fact_id: 'moq' },
    { value: '35 to 40 days', label: 'Bulk production', fact_id: 'lead-time' },
  ],
  process_steps: [{ text: 'Send the design.' }, { title: 'Sample', text: 'Approve the sample.' }, { text: 'Start bulk production.', fact_ids: ['lead-time'] }],
  comparison: { title: 'Custom or ready stock', columns: ['Topic', 'Custom', 'Ready stock'], rows: [['Minimum', '50 pieces', '50 pieces']], fact_ids: ['moq'] },
};

test('structured key figures, comparison and process steps are placed around the prose blocks', () => {
  const pkg = { schema_version: 'sf/authoring/v1', project: 't', pages: [{ ...page(), structured }] };
  const [imported] = importSiteFactory({ authoringPackage: pkg, pagesPlan: plan, facts: FACTS }).pages;
  assert.deepEqual(imported.blocks.map((block) => block.type), ['intro', 'stats', 'splitMedia', 'process', 'featureGrid', 'table', 'proof', 'relatedPages', 'faq', 'cta']);
  assert.deepEqual(imported.blocks[1].items, [{ value: '50 pieces per style per colour', label: 'minimum order quantity' }, { value: '35 to 40 days', label: 'Bulk production' }]);
  assert.deepEqual(imported.blocks[3].steps, ['Send the design.', { heading: 'Sample', text: 'Approve the sample.' }, 'Start bulk production.']);
  assert.deepEqual(validateAuthoringPages([imported]), []);
});

test('an overlay supplies structured data until the package carries it, and needs the facts', () => {
  const pkg = { schema_version: 'sf/authoring/v1', project: 't', pages: [page()] };
  const overlay = { schema_version: 'sf/structured/v1', origin: 'prototype', pages: { 'sample-page': { key_figures: structured.key_figures } } };
  const result = importSiteFactory({ authoringPackage: pkg, pagesPlan: plan, structuredOverlay: overlay, facts: FACTS });
  assert.equal(result.report.pages[0].structured, 'prototype');
  assert.ok(result.pages[0].blocks.some((block) => block.type === 'stats'));
  assert.throws(() => importSiteFactory({ authoringPackage: pkg, pagesPlan: plan, structuredOverlay: overlay }), /--facts/);
});

test('a key figure must be stated in the approved fact it cites', () => {
  const pkg = (figure) => ({ schema_version: 'sf/authoring/v1', project: 't', pages: [{ ...page(), structured: { key_figures: [figure, structured.key_figures[1]] } }] });
  assert.throws(() => importSiteFactory({ authoringPackage: pkg({ value: '30 pieces', label: 'MOQ', fact_id: 'moq' }), pagesPlan: plan, facts: FACTS }), /not stated in fact moq/);
  assert.throws(() => importSiteFactory({ authoringPackage: pkg({ value: '99 days', label: 'Note', fact_id: 'internal' }), pagesPlan: plan, facts: FACTS }), /not approved/);
  assert.throws(() => importSiteFactory({ authoringPackage: pkg({ value: '1', label: 'x', fact_id: 'nope' }), pagesPlan: plan, facts: FACTS }), /unknown fact/);
});

test('the key_facts section renders as a checklist, or gives way to key figures', () => {
  const facts = { ...section('s5', 'Our minimum order quantity is 50 pieces per style per colour, and we accept small orders.\nBulk production normally takes 35 to 40 days after sample approval and deposit.', 'Key facts'), key_facts: true };
  const withFacts = page({ sections: [...page().sections.slice(0, 4), facts, page().sections[5]] });
  const plain = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [withFacts] }, pagesPlan: plan }).pages[0];
  const list = plain.blocks.find((block) => block.type === 'iconList');
  assert.equal(list.items.length, 2);
  assert.equal(list.items[1].text, 'Bulk production normally takes 35 to 40 days after sample approval and deposit.');
  const replaced = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [{ ...withFacts, structured: { key_figures: structured.key_figures } }] }, pagesPlan: plan, facts: FACTS });
  assert.ok(!replaced.pages[0].blocks.some((block) => block.type === 'iconList'));
  assert.match(JSON.stringify(replaced.report.pages[0].mapping), /replaced by structured key figures/);
});

test('a section that names its blueprint slot becomes that slot block; card slots group into equal grids', () => {
  const home = page({
    page_id: 'home', url: '/',
    sections: [
      { ...section('s1', words(60, 'intro')), slot: 'intro' },
      { ...section('s2', words(20, 'cardA')), slot: 'capabilities' },
      { ...section('s3', words(20, 'cardB')), slot: 'capabilities' },
      { ...section('s4', words(20, 'cardC')), slot: 'capabilities' },
      { ...section('s5', words(90, 'story')), slot: 'story' },
      { ...section('s6', 'How do we start?\nSend us your design.\n\nCan we order small?\nYes.'), slot: 'faq' },
    ],
  });
  const { blocks } = planBlocks(home, { pageType: 'home' });
  assert.deepEqual(blocks.map((block) => `${block.type}:${block.id}`), ['intro:s1', 'featureGrid:s2+s3+s4', 'splitMedia:s5', 'faq:s6', 'cta:cta']);
  assert.throws(() => planBlocks({ ...home, sections: [{ ...section('s1', words(60)), slot: 'categories' }] }, { pageType: 'home' }), /no copy slot/);
});

test('hub and home pages get child-page cards from the site plan, never new copy', () => {
  const hubPlan = {
    pages: [
      { page_id: 'home', page_type: 'home', label: 'Home', url: '/', parent_page_id: null },
      { page_id: 'products_hub', page_type: 'products_hub', label: 'Products', url: '/products/', parent_page_id: 'home' },
      ...['Hoodies', 'Jackets', 'T-Shirts', 'Leggings'].map((label) => ({ page_id: label.toLowerCase(), page_type: 'product_manufacturer', label: `${label} Manufacturer`, url: `/${label.toLowerCase()}-manufacturer/`, parent_page_id: 'products_hub' })),
      { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' },
    ],
    header_nav: [{ label: 'Products', page_id: 'products_hub', children: ['jackets', 'hoodies', 't-shirts', 'leggings'].map((id) => ({ label: id, page_id: id, children: [] })) }],
    footer_nav: [],
  };
  const pkg = { schema_version: 'sf/authoring/v1', project: 't', pages: [page({ page_id: 'products_hub', url: '/products/' }), page({ page_id: 'home', url: '/' })] };
  const { pages } = importSiteFactory({ authoringPackage: pkg, pagesPlan: hubPlan });
  const cards = (route) => pages.find((item) => item.route === route).blocks.find((block) => block.type === 'gallery');
  assert.deepEqual(cards('/products/').items.map((item) => item.href), ['/jackets-manufacturer/', '/hoodies-manufacturer/', '/t-shirts-manufacturer/', '/leggings-manufacturer/']);
  assert.deepEqual(cards('/').items.map((item) => item.caption), ['Jackets Manufacturer', 'Hoodies Manufacturer', 'T-Shirts Manufacturer', 'Leggings Manufacturer']);
  assert.equal(pages.find((item) => item.route === '/').blocks[1].type, 'gallery');
  assert.deepEqual(validateAuthoringPages(pages), []);
});

test('the cta slot section becomes the closing band heading and text; button and links stay from page.cta', () => {
  const slotted = page({ sections: [{ ...section('s1', words(60, 'intro')), slot: 'intro' }, { ...section('s2', 'Tell us about your next order.', 'Start your order'), slot: 'cta' }] });
  const { blocks } = planBlocks(slotted, { pageType: 'product_manufacturer' });
  const cta = blocks.at(-1);
  assert.deepEqual([cta.type, cta.heading, cta.paragraphs, cta.cta.href, cta.sourceSectionIds], ['cta', 'Start your order', ['Tell us about your next order.'], '/contact/', ['s2']]);
  assert.throws(() => planBlocks({ ...slotted, cta: null, links: [] }, { pageType: 'product_manufacturer' }), /without a page cta/);
});

test('the assembly ledger rejects a section that is left out or placed twice', async () => {
  const { assertSectionsUsedOnce } = await import('../lib/page-assembly.mjs');
  const sample = { page_id: 'p', sections: [{ section_id: 's1' }, { section_id: 's2' }] };
  assert.doesNotThrow(() => assertSectionsUsedOnce(sample, [{ sectionId: 's1' }, { sectionId: 's2' }, { sectionId: 'structured.key-figures' }]));
  assert.throws(() => assertSectionsUsedOnce(sample, [{ sectionId: 's1' }]), /s2 \(0\)/);
  assert.throws(() => assertSectionsUsedOnce(sample, [{ sectionId: 's1' }, { sectionId: 's1' }, { sectionId: 's2' }]), /s1 \(2\)/);
});

test('a hub links every child: cards up to the slot maximum, the rest as links', async () => {
  const { childCards } = await import('../lib/site-plan.mjs');
  const children = Array.from({ length: 14 }, (_, n) => ({ page_id: `c${n}`, label: `Child ${n}`, url: `/c${n}/` }));
  const { items, links } = childCards({ items: [1, 12] }, children);
  assert.equal(items.length, 12);
  assert.deepEqual(links.map((link) => link.href), ['/c12/', '/c13/']);
});

test('knowledge card sources become one Sources list before the CTA; industry cards are not company facts', () => {
  const pkg = (pages) => ({ schema_version: 'sf/authoring/v1', project: 't', pages });
  const source = (url, title = 'Guide') => ({ url, title, publisher: 'Org' });
  const knowledge = [
    { card_id: 'k1', title: 'Fabric care', sources: [source('https://a.org/1'), source('https://b.org/2', 'Standard')] },
    { card_id: 'k2', title: 'Sizing', sources: [source('https://a.org/1'), { url: 'https://c.org/3', title: 'Chart' }], fact_ids: ['industry-1'] },
  ];
  const { pages, report } = importSiteFactory({ authoringPackage: pkg([page({ knowledge })]), pagesPlan: plan });
  const blocks = pages[0].blocks;
  assert.equal(blocks.at(-1).type, 'cta');
  assert.equal(blocks.at(-2).type, 'sources');
  assert.deepEqual(blocks.at(-2).items.map((item) => item.url), ['https://a.org/1', 'https://b.org/2', 'https://c.org/3'], 'each url once, in card order');
  assert.equal(blocks.at(-2).items[2].publisher, undefined);
  assert.deepEqual(validateAuthoringPages(pages), []);
  assert.ok(!report.pages[0].citedFacts.includes('industry-1'));
  assert.throws(() => importSiteFactory({ authoringPackage: pkg([page({ knowledge: [{ card_id: 'k3', sources: [{ url: 'a.org', title: 'X' }] }] })]), pagesPlan: plan }), /k3 source 1 needs a title and an http\(s\) url/);
  const without = importSiteFactory({ authoringPackage: pkg([page()]), pagesPlan: plan });
  assert.ok(!without.pages[0].blocks.some((block) => block.type === 'sources'));
});

test('a key figure keeps its conditions: the note travels with value and label', () => {
  const pkg = (pages) => ({ schema_version: 'sf/authoring/v1', project: 't', pages });
  const facts = new Map([['moq', { text: 'MOQ is 50 pieces per style per colour.', approved: true }], ['lead', { text: 'Bulk takes 35 to 40 days after sample approval.', approved: true }]]);
  const structured = { key_figures: [{ fact_id: 'moq', value: '50 pieces', label: 'Minimum order', note: 'per style per colour' }, { fact_id: 'lead', value: '35 to 40 days', label: 'Bulk production', note: '' }] };
  const { pages } = importSiteFactory({ authoringPackage: pkg([{ ...page(), structured }]), pagesPlan: plan, facts });
  const stats = pages[0].blocks.find((block) => block.type === 'stats');
  assert.deepEqual(stats.items, [{ value: '50 pieces', label: 'Minimum order', note: 'per style per colour' }, { value: '35 to 40 days', label: 'Bulk production' }]);
  assert.deepEqual(validateAuthoringPages(pages), []);
});

test('the related pages block holds the page\'s links its copy does not carry, then the plan\'s related pages, before the FAQ', () => {
  const pagesPlan = { header_nav: [], pages: [
    { page_id: 'home', page_type: 'home', label: 'Home', url: '/', parent_page_id: null },
    { page_id: 'products_hub', page_type: 'products_hub', label: 'Products', url: '/products/', parent_page_id: 'home' },
    { page_id: 'bra', page_type: 'product_manufacturer', label: 'Bra Manufacturer', url: '/bra/', parent_page_id: 'products_hub', sibling_page_id: 'wholesale-bra' },
    { page_id: 'wholesale-bra', page_type: 'product_wholesale', label: 'Wholesale Bra', url: '/wholesale-bra/', parent_page_id: 'wholesale_hub' },
    { page_id: 'socks', page_type: 'product_manufacturer', label: 'Socks Manufacturer', url: '/socks/', parent_page_id: 'products_hub' },
    { page_id: 'pajama', page_type: 'product_manufacturer', label: 'Pajama Manufacturer', url: '/pajama/', parent_page_id: 'products_hub' },
  ] };
  const blocks = [{ id: 'a', type: 'intro', paragraphs: ['We also make [pajamas](/pajama/).'] }, { id: 'faq', type: 'faq', items: [] }, { id: 'cta', type: 'cta', cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  const built = new Set(['/', '/products/', '/bra/', '/wholesale-bra/', '/socks/', '/pajama/']);
  const links = [{ link_id: 'l1', url: '/socks/', anchor_text: 'Socks manufacturing' }, { link_id: 'l2', url: '/pajama/', anchor_text: 'Pajama manufacturing' }, { link_id: 'l3', url: '/contact/', anchor_text: 'Contact us' }];
  assert.deepEqual(placeRelated(blocks, { planned: pagesPlan.pages[2], pagesPlan, built, links }), { fromPage: 1, added: 2, inCopy: 1 });
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'relatedPages', 'faq', 'cta']);
  // The copy's link and the button's page are not repeated; the plan adds the wholesale counterpart and the hub.
  assert.deepEqual(blocks[1].links, [{ label: 'Socks manufacturing', href: '/socks/' }, { label: 'Wholesale Bra', href: '/wholesale-bra/' }, { label: 'Products', href: '/products/' }]);
  assert.equal(blocks[1].heading, 'Related products and services');
  assert.equal(blocks[1].id, 'related');
  // A Site Factory section already called "related": the block 08 adds takes another id.
  const named = [{ id: 'related', type: 'featureGrid', items: [] }, { id: 'cta', type: 'cta', cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  placeRelated(named, { planned: pagesPlan.pages[2], pagesPlan, built, links });
  assert.deepEqual(named.map((block) => block.id), ['related', 'related-2', 'cta']);
  // Where the reference links its pages with photo tiles, the related pages are tiles.
  const tiled = [{ id: 'cta', type: 'cta', cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  placeRelated(tiled, { planned: pagesPlan.pages[2], pagesPlan, built, links, variant: 'tiles' });
  assert.equal(tiled[0].variant, 'tiles');
  // No more than MAX_RELATED shown.
  const many = Array.from({ length: 20 }, (_, index) => ({ url: `/p${index}/`, anchor_text: `Page ${index}` }));
  const more = [{ id: 'cta', type: 'cta', cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  placeRelated(more, { planned: pagesPlan.pages[2], pagesPlan, built: new Set(many.map((link) => link.url)), links: many });
  assert.equal(more[0].links.length, 12);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'solution', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [more[0]] }]), []);
});

test('the blog hub page Site Factory writes becomes the blog hub\'s copy, not a second page at /blog/', () => {
  const blogPlan = { ...plan, pages: [...plan.pages, { page_id: 'blog', page_type: 'blog_hub', label: 'Blog', url: '/blog/' }] };
  const hub = { page_id: 'blog', url: '/blog/', title: 'Swimwear production guides', meta_description: 'Guides for brands.', h1: 'Guides for swimwear brands', hero_lead: 'What to know before you order.', release_status: 'ready_for_template', sections: [{ section_id: 'b1', slot: 'intro', heading: 'About the guides', body: 'We write about fabrics and fit.' }] };
  const result = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), hub] }, pagesPlan: blogPlan });
  assert.ok(!result.pages.some((item) => item.route === '/blog/'));
  assert.deepEqual({ ...result.blog, source: undefined }, { title: 'Swimwear production guides', description: 'Guides for brands.', heading: 'Guides for swimwear brands', intro: 'What to know before you order.', source: undefined });
  // The hub shows a heading and one line: what of the copy it does not show is on the report, never dropped unsaid.
  const report = (pages) => importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), { ...hub, ...pages }] }, pagesPlan: blogPlan }).report.pages.find((item) => item.route === '/blog/');
  assert.deepEqual(report({}).unplaced, [{ field: 'sections', value: ['b1'] }]);
  // An empty hero lead is no lead: the intro's first paragraph heads the hub, the rest of it and the closing band are reported.
  const empty = { hero_lead: '', sections: [{ section_id: 'b1', heading: 'About', body: 'We write about fabrics.\n\nAnd about fit.' }, { section_id: 'b2', heading: 'Ask us', body: 'Send a question.' }] };
  assert.equal(importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), { ...hub, ...empty }] }, pagesPlan: blogPlan }).blog.intro, 'We write about fabrics.');
  assert.deepEqual(report(empty).unplaced, [{ field: 'sections', value: ['b1', 'b2'] }]);
  assert.equal(report({ hero_lead: '', sections: [{ section_id: 'b1', heading: 'About', body: 'One line.' }] }).unplaced, undefined);
  // A hub written by kind shows every section, as any page does (site10's hub showed one line of five intro sections).
  const byKind = { hero_lead: '', cta: { label: 'Contact', target_url: '/contact/' }, sections: [{ section_id: 'b1', kind: 'intro', presentation: 'prose', heading: 'About', body: 'We write about fabrics.\n\nAnd about fit.' }, { section_id: 'b1~2', kind: 'intro', presentation: 'prose', continuation_of: 'b1', heading: '', body: 'And about prints.' }, { section_id: 'b2', kind: 'cta', presentation: 'prose', heading: 'Ask us', body: 'Send a question.' }] };
  const kindHub = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), { ...hub, ...byKind }] }, pagesPlan: blogPlan });
  assert.equal(kindHub.blog.intro, null);
  assert.deepEqual(kindHub.blog.blocks.map((block) => [block.type, block.paragraphs]), [['intro', ['We write about fabrics.', 'And about fit.']], ['intro', ['And about prints.']], ['cta', ['Send a question.']]]);
  assert.equal(kindHub.report.pages.find((item) => item.route === '/blog/').unplaced, undefined);
});

test('a Site Factory snapshot is frozen from the project\'s stage folders with the whole site\'s plan, never overwritten', async () => {
  const { freezeSiteFactory } = await import('../freeze-site-factory.mjs');
  const { mkdtemp, mkdir: makeDir, readdir, readFile: read, writeFile: write } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const project = await mkdtemp(join(tmpdir(), 'sf-project-'));
  for (const dir of ['artifacts/07_1_draft', 'artifacts/04_1_site_tree', 'artifacts/06_1_plan', 'artifacts/05_7_facts']) await makeDir(join(project, dir), { recursive: true });
  await write(join(project, 'artifacts/07_1_draft/authoring_package.json'), JSON.stringify({ schema_version: 'sf/authoring/v1', pages: [] }));
  await write(join(project, 'artifacts/04_1_site_tree/tree.json'), JSON.stringify({ pages: [{ id: 'home', name: 'Swimwear', type: 'home', parent: null }, { id: 'site:contact', name: 'Contact Us', type: 'general', parent: 'home' }] }));
  await write(join(project, 'artifacts/06_1_plan/site_plan.json'), JSON.stringify({ routes: { home: { url: '/', page_name: 'Swimwear' }, 'site:contact': { url: '/contact-us/', page_name: 'Contact Us' } } }));
  await write(join(project, 'artifacts/05_7_facts/capabilities.json'), '{}');
  await write(join(project, 'facts.yaml'), 'facts: []\n');
  const out = await mkdtemp(join(tmpdir(), 'sf-freeze-'));
  const result = await freezeSiteFactory({ project, out });
  assert.equal(result.pages, 2);
  assert.deepEqual((await readdir(result.folder)).sort(), ['authoring_package.json', 'capabilities.json', 'facts.yaml', 'pages.json', 'site_plan.json', 'tree.json']);
  assert.deepEqual(JSON.parse(await read(join(result.folder, 'pages.json'), 'utf8')).pages.map((page) => page.page_type), ['home', 'contact']);
  // Unchanged inputs give the same snapshot back; a changed tree freezes a new one beside it.
  assert.deepEqual(await freezeSiteFactory({ project, out }), { folder: result.folder, version: result.version, existed: true });
  await write(join(project, 'artifacts/04_1_site_tree/tree.json'), JSON.stringify({ pages: [{ id: 'home', name: 'Swimwear', type: 'home', parent: null }] }));
  await write(join(project, 'artifacts/06_1_plan/site_plan.json'), JSON.stringify({ routes: { home: { url: '/', page_name: 'Swimwear' } } }));
  const changed = await freezeSiteFactory({ project, out });
  assert.notEqual(changed.folder, result.folder);
  assert.equal(changed.pages, 1);
  assert.equal(JSON.parse(await read(join(result.folder, 'pages.json'), 'utf8')).pages.length, 2);
  // A handoff's identity is frozen at its path from the handoff, which the snapshot stands for.
  await makeDir(join(project, 'identity'), { recursive: true });
  await write(join(project, 'identity/project.yaml'), '{"site_name": "Strandmill"}\n');
  const withIdentity = await freezeSiteFactory({ project, out });
  assert.equal(await read(join(withIdentity.folder, 'package/identity/project.yaml'), 'utf8'), '{"site_name": "Strandmill"}\n');
});

test('a fact reaches only the pages that cite it: their input key and output change, every other page stays byte for byte', async () => {
  const { mkdir } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'import-keys-'));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  const cites = (id, url, factId) => page({ page_id: id, url, sections: [{ ...section('s1', words(110, 'intro')), fact_ids: factId ? [factId] : [] }, section('s2', words(130, 'long'))], links: [], structured_data: [] });
  const twoPlan = { pages: [...plan.pages, { page_id: 'other-page', page_type: 'product_manufacturer', label: 'Other', url: '/other-page/' }], header_nav: [], footer_nav: [] };
  await writeFile(join(root, 'package.json'), JSON.stringify({ schema_version: 'sf/authoring/v1', project: 't', pages: [cites('sample-page', '/sample-page/', 'moq'), cites('other-page', '/other-page/', null)] }));
  await writeFile(join(root, 'plan.json'), JSON.stringify(twoPlan));
  const facts = (moq) => `facts:\n  - fact_id: moq\n    text: "${moq}"\n    verification_status: user_provided\n    approved_public: true\n`;
  await writeFile(join(root, 'facts.yaml'), facts('Orders start at 50 pieces.'));
  const runIt = () => runImport({ packagePath: join(root, 'package.json'), pagesPlanPath: join(root, 'plan.json'), factsPaths: [join(root, 'facts.yaml')], root });
  const first = (await runIt()).report;
  const pagesBefore = JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'));
  assert.deepEqual(first.changed.sort(), ['/other-page/', '/sample-page/'], 'a first import changes every page');
  assert.deepEqual((await runIt()).report.changed, [], 'the same inputs change nothing');
  // The fact the sample page cites is reworded.
  await writeFile(join(root, 'facts.yaml'), facts('Orders start at 30 pieces.'));
  const second = (await runIt()).report;
  const key = (report, route) => report.pages.find((item) => item.route === route).inputKey;
  assert.notEqual(key(second, '/sample-page/'), key(first, '/sample-page/'));
  assert.equal(key(second, '/other-page/'), key(first, '/other-page/'));
  const pagesAfter = JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'));
  assert.equal(JSON.stringify(pagesAfter.find((item) => item.route === '/other-page/')), JSON.stringify(pagesBefore.find((item) => item.route === '/other-page/')));
});

test("a fact the copy may cite (approved_public) is the company's own data only when the owner gave it or it was verified: Site Factory marks borrowed and unverified facts approved_public too", async () => {
  const { factConfirmed, factsFromFile, parseFacts } = await import('../lib/facts.mjs');
  const { pageFactsOf } = await import('../lib/sf-structured.mjs');
  const yaml = ['facts:', ...['user_provided', 'verified', 'competitor_derived', 'unverified'].map((status) => `  - fact_id: f-${status}\n    text: "A fact that is ${status}."\n    verification_status: ${status}\n    approved_public: true`), '  - fact_id: old\n    text: "An older fact."\n    approved_public: true'].join('\n');
  assert.deepEqual([...parseFacts(yaml)].map(([id, fact]) => [id, fact.approved, fact.confirmed]), [['f-user_provided', true, true], ['f-verified', true, true], ['f-competitor_derived', true, false], ['f-unverified', true, false], ['old', true, true]]);
  // facts.yaml in YAML's JSON form (Site Factory's handoff writes it so) reads the same.
  const json = JSON.stringify({ facts: [{ fact_id: 'f-user_provided', text: 'A fact that is user_provided.', verification_status: 'user_provided', approved_public: true }, { fact_id: 'f-unverified', text: 'A fact that is unverified.', verification_status: 'unverified', approved_public: true }] }, null, 2);
  assert.deepEqual([...parseFacts(json)], [...parseFacts(yaml)].filter(([id]) => ['f-user_provided', 'f-unverified'].includes(id)));
  assert.deepEqual(factsFromFile('capabilities.json', JSON.stringify({ facts: [{ fact_id: 'c', text: 'Borrowed.', verification_status: 'competitor_derived', approved_public: true }] })).get('c'), { text: 'Borrowed.', approved: true, confirmed: false });
  assert.equal(pageFactsOf({ facts: [{ fact_id: 'p', text: 'Borrowed.', verification_status: 'unverified', approved_public: true }] }, null).get('p').confirmed, false);
  assert.equal(factConfirmed({ verification_status: 'user_provided', approved_public: false }), false, 'given by the owner but not for publication');
});

test("the trust bar holds every figure the package gives, the unconfirmed ones marked and on the import report", async () => {
  const { trustBarUnconfirmed, trustFromPackage } = await import('../lib/site-trust.mjs');
  const facts = parseFacts('facts:\n  - fact_id: since\n    text: "The factory has been running since 2011."\n    verification_status: user_provided\n    approved_public: true\n');
  // site10's package: a capacity borrowed from a competitor, a founding year with a fact, one with none.
  const pkg = { pages: [{ facts: [{ fact_id: 'cap', text: 'We can produce about 30,000 pieces a month.', verification_status: 'competitor_derived', approved_public: true }] }],
    trust_bar: [{ value: '2011', label: 'Since', fact_id: 'since' }, { value: '30,000 pieces', label: 'Capacity', fact_id: 'cap' }, { value: '1998', label: 'Founded', fact_id: 'missing' }] };
  // Owner 2026-11-12: unconfirmed hard facts are written now and replaced before launch; a figure is not held back
  // for want of a fact ("不要卡这个").
  assert.deepEqual(trustFromPackage(pkg, facts).items.map((item) => [item.value, Boolean(item.unconfirmed)]), [['2011', false], ['30,000 pieces', true], ['1998', true]]);
  assert.deepEqual(trustBarUnconfirmed(pkg, facts).map((item) => item.value), ['30,000 pieces', '1998']);
});

test('the trust bar leaves out the figures the trade\'s readers gain nothing from while another is there', async () => {
  const { readerFigures } = await import('../lib/site-trust.mjs');
  const { readFile } = await import('node:fs/promises');
  const { trustBarLeaveOut } = JSON.parse(await readFile(new URL('../../config/wording.service.json', import.meta.url), 'utf8'));
  const bar = [{ value: 'since 2016', label: 'Operating since 2016' }, { value: '60 hotels and motels', label: 'Properties we work for' }, { value: '25 people', label: 'In our remote team' }];
  assert.deepEqual(readerFigures(bar, trustBarLeaveOut.patterns).map((item) => item.value), ['since 2016', '60 hotels and motels']);
  assert.deepEqual(readerFigures(bar.slice(2), trustBarLeaveOut.patterns).map((item) => item.value), ['25 people'], 'the only figure stays');
  assert.equal(readerFigures(bar).length, 3, 'a trade without the rule keeps them all');
});

test('two versions of a page are never imported together: one page per id and per route, and a page that replaces another never beside it', () => {
  const curated = page({ page_id: 'case-studies-curated', url: '/held-page/', origin: 'curated', replaces: 'held-page' });
  const native = page({ page_id: 'held-page', url: '/held-page-old/' });
  assert.throws(() => importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), native, curated] }, pagesPlan: plan }), /replaces held-page, which is still in the authoring package/);
  assert.throws(() => importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), page()] }, pagesPlan: plan }), /two pages with page_id/);
  assert.throws(() => importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), page({ page_id: 'other' })] }, pagesPlan: plan }), /two pages with url/);
  // The merged package: the curated page in the native one's place.
  assert.deepEqual(importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page(), curated] }, pagesPlan: plan }).pages.map((item) => item.id), ['sample-page', 'case-studies-curated']);
});

test('a contact page always has its form and its ways to reach the company; empty contact details take marked stand-ins', async () => {
  const { placeRequiredBlocks } = await import('../lib/page-assembly.mjs');
  const { withContactStandIns } = await import('../import-site-factory.mjs');
  const blocks = [{ id: 'overview', type: 'intro', heading: 'H', paragraphs: ['P'] }, { id: 'cta', type: 'cta', cta: { label: 'Go', href: '/quote/' }, links: [] }];
  const mapping = [];
  placeRequiredBlocks(blocks, mapping, { planned: { page_type: 'contact' } });
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'form', 'contactChannels', 'cta']);
  const other = [{ id: 'cta', type: 'cta', cta: { label: 'Go', href: '/quote/' }, links: [] }];
  placeRequiredBlocks(other, [], { planned: { page_type: 'solution' } });
  assert.equal(other.length, 1);
  const contact = withContactStandIns({ email: '', phone: '+44 20 0000 0000', address: '', hours: '', same_as: [], placeholder: true });
  assert.deepEqual([contact.email, contact.phone, contact.placeholder, contact.standIns], ['hello@example.com', '+44 20 0000 0000', true, ['email', 'address', 'hours']]);
  assert.equal(withContactStandIns({ email: 'a@b.co', phone: '1', address: 'x', hours: 'y' }).placeholder, undefined, 'real details stay as given');
});

test('a page whose own cards link every child page gets no second wall of the same pages', async () => {
  const { placePlanSlots } = await import('../lib/page-assembly.mjs');
  const pagesPlan = { pages: [{ page_id: 'hub', url: '/services/' }, { page_id: 'a', url: '/a/', label: 'A', parent_page_id: 'hub' }, { page_id: 'b', url: '/b/', label: 'B', parent_page_id: 'hub' }] };
  const blueprints = { solutions_hub: [{ id: 'children', fill: 'plan', source: 'children:self', items: [2, 12] }] };
  const planned = { page_id: 'hub', page_type: 'solutions_hub' };
  const card = (heading, href) => ({ heading, paragraphs: [`Our [${heading} service](${href}).`] });
  const own = [{ id: 'entries', type: 'featureGrid', heading: 'Services', items: [card('A', '/a/'), card('B', '/b/')] }];
  const mapping = [];
  placePlanSlots(own, mapping, { planned, pagesPlan, blueprints });
  assert.deepEqual(own.map((block) => block.id), ['entries'], 'every child already linked: no wall');
  assert.match(mapping.at(-1).rule, /links every child page/);
  const partial = [{ id: 'entries', type: 'featureGrid', heading: 'Services', items: [card('A', '/a/')] }];
  placePlanSlots(partial, [], { planned, pagesPlan, blueprints });
  assert.equal(partial.some((block) => block.type === 'gallery'), true, 'a child the copy does not reach keeps the wall');
});
