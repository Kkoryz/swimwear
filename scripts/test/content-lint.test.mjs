import assert from 'node:assert/strict';
import test from 'node:test';

import { contentIssuesMarkdown, keywordList, lintContent, termsSentences } from '../lib/content-lint.mjs';

const page = (route, blocks, extra = {}) => ({ route, pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D' }, hero: { heading: 'H' }, blocks, ...extra });
const terms = 'Our minimum order quantity is 50 pieces per style per colour. Standard samples take 10 to 15 days from the approved brief. Bulk production normally takes 35 to 40 days after sample approval and deposit.';

test('content checks name leaked wording, link markup in text-only fields, keyword lists, boilerplate and study sources', () => {
  const pages = [
    page('/a/', [
      { id: 's1', type: 'intro', heading: 'Intro', paragraphs: ['Your range can include Adjustable Bandeau With Binding, Bandeau, High Waisted Bikini, Micro Bikinis, Ribbed Tie Front Bikini, Skimpy Bikinis, Women’s Bikinis and Bikini Sets.'] },
      { id: 's2', type: 'table', columns: ['Option', 'Fact basis'], rows: [['A', 'B']] },
      { id: 's3', type: 'faq', heading: 'See [our range](/b/)', items: [{ question: 'Q?', answer: 'Yes, see [the range](/b/).' }] },
      { id: 's4', type: 'splitMedia', heading: 'Terms', paragraphs: [`A hoodie order starts here. ${terms}`] },
      { id: 'sources', type: 'sources', items: [{ title: 'Study', url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }] },
      { id: 'owner-testimonials', type: 'testimonials', items: [{ quote: 'Fact basis', author: 'A' }] },
    ]),
    page('/b/', [{ id: 's4', type: 'splitMedia', heading: 'Terms', paragraphs: [`A leggings order starts here. ${terms}`] }]),
    page('/c/', [{ id: 's4', type: 'splitMedia', heading: 'Terms', paragraphs: [`A bra order starts here. ${terms}`] }]),
    page('/d/', [{ id: 's1', type: 'intro', heading: 'Fact basis', paragraphs: ['x'] }], { status: 'placeholder' }),
  ];
  const issues = lintContent(pages);
  const kinds = issues.map((issue) => `${issue.route} ${issue.kind} ${issue.field}`);
  assert.ok(kinds.includes('/a/ keyword_list s1.paragraph'));
  assert.ok(kinds.includes('/a/ leaked_wording s2.column'));
  assert.ok(kinds.includes('/a/ raw_markdown s3.heading'));
  assert.ok(!kinds.some((kind) => kind.includes('s3.item.answer')), 'an FAQ answer renders its links');
  assert.ok(kinds.includes('/a/ academic_source sources.item'));
  assert.deepEqual(issues.filter((issue) => issue.kind === 'repeated_paragraph').map((issue) => issue.route).sort(), ['/a/', '/b/', '/c/']);
  assert.ok(!issues.some((issue) => issue.route === '/d/' || issue.field.startsWith('owner-')), 'placeholders and the template\'s own blocks are not Site Factory copy');
  assert.match(contentIssuesMarkdown(issues, { site: 'X' }), /## Keyword lists \(1\)/);
  assert.equal(keywordList('We make hoodies, joggers and tees for brands.'), null);
});

test('the launch checklist groups the holds by who clears them and adds Site Factory\'s content issues', async () => {
  const { checklistMarkdown } = await import('../lib/launch-checklist.mjs');
  const gate = { status: 'blocked', checkedAt: 'now', holds: [
    { code: 'form_delivery_unconfigured', detail: 'the form posts nowhere' },
    { code: 'upstream_uncommitted', detail: 'dirty code' },
    { code: 'image_slot_present', detail: '1 slot', items: ['/a/', '/b/'] },
  ] };
  const text = checklistMarkdown(gate, { contentIssues: [{ kind: 'keyword_list' }, { kind: 'keyword_list' }], site: 'Needle Field' });
  assert.match(text, /# 上线清单：Needle Field/);
  assert.match(text, /## 站长（你来提供或确认）（1）\n\n- \[ \] 提供询盘表单的接收地址/);
  assert.match(text, /## Site Factory（内容和规划）（2）/);
  assert.match(text, /修改文案问题 2 处/);
  assert.match(text, /## 模板流程（我来处理）（1）\n\n- \[ \] image_slot_present（涉及 2 个页面/);
});

test('a hub that writes its child pages out again goes back to Site Factory; one that links to them does not', async () => {
  const { hubsRepeatingChildren } = await import('../lib/content-lint.mjs');
  const child = (route, heading) => ({ route, status: 'authored', pageType: 'solution', hero: { heading }, blocks: [] });
  const children = [child('/revenue-management/', 'Hotel Revenue Management'), child('/accounting/', 'Hotel Accounting Services'), child('/ota-optimization/', 'OTA Optimization for Motels')];
  const cards = { id: 'plan-children', type: 'gallery', items: children.map((item) => ({ caption: item.hero.heading, href: item.route })) };
  const section = (id, heading) => ({ id, type: 'featureGrid', heading, items: [] });
  const long = { route: '/services/', status: 'authored', pageType: 'solutions_hub', hero: { heading: 'Services' }, blocks: [cards, section('a', 'Revenue Strategy and Dynamic Pricing'), section('b', 'Accounting and Reporting'), section('c', 'OTA Distribution and Listing Content')] };
  const [issue] = hubsRepeatingChildren([long, ...children]);
  assert.equal(issue.kind, 'hub_repeats_children');
  assert.match(issue.text, /"Revenue Strategy and Dynamic Pricing" \(\/revenue-management\/\)/);
  const short = { ...long, blocks: [cards, { id: 'intro', type: 'intro', heading: 'Revenue, accounting and OTA support' }] };
  assert.deepEqual(hubsRepeatingChildren([short, ...children]), [], 'an introduction and the cards');
});

test("the owner's order terms, written out word for word on every product and service page (owner 2026-11-07), are not boilerplate; a writer's own sentences around them still are", () => {
  // Site Factory marks them by fact_ids (owner:<type> of AuthoringParams.terms_fact_types): an item that cites one is
  // the term itself; a prose section that cites one holds the fact's text word for word among the writer's sentences.
  const facts = new Map([
    ['owner:moq', { text: 'Our minimum order quantity is 50 pieces per style per colour.' }],
    ['owner:sample-time', { text: 'Standard samples take 10 to 15 days from the approved brief.' }],
    ['owner:lead-time', { text: 'Bulk production normally takes 35 to 40 days after sample approval and deposit.' }],
    ['owner:about', { text: 'We have sewn swimwear in Guangzhou for twenty years and more.' }],
  ]);
  const own = 'Every order on this page is checked twice before it leaves the factory floor.';
  const pkg = { pages: [
    { page_id: 'a', sections: [{ section_id: 'terms', fact_ids: ['owner:moq', 'owner:sample-time', 'owner:lead-time'], body: `${terms} ${own}` }] },
    { page_id: 'b', sections: [{ section_id: 'list', items: [{ title: 'Lead time', text: 'Once you approve the sample and we receive your deposit, bulk production takes 35 to 40 days.', fact_ids: ['owner:lead-time'] }, { title: 'About', text: 'We have sewn swimwear in Guangzhou for twenty years and more.', fact_ids: ['owner:about'] }] }] },
  ] };
  const exempt = termsSentences(pkg, facts);
  assert.equal(exempt.size, 4, 'three term facts and the term item, not the about fact');
  const pages = ['/a/', '/b/', '/c/'].map((route) => page(route, [{ id: 'terms', type: 'intro', heading: 'Terms', paragraphs: [terms] }]));
  assert.equal(lintContent(pages).filter((issue) => issue.kind === 'repeated_paragraph').length, 3);
  assert.equal(lintContent(pages, { exempt }).filter((issue) => issue.kind === 'repeated_paragraph').length, 0);
  // The writer's own sentences in a terms section are checked as before.
  const padded = ['/a/', '/b/', '/c/'].map((route) => page(route, [{ id: 'terms', type: 'intro', heading: 'Terms', paragraphs: [`${terms} ${own} ${own.replace('twice', 'three times')} ${own.replace('floor', 'gate')}`] }]));
  assert.equal(lintContent(padded, { exempt }).filter((issue) => issue.kind === 'repeated_paragraph').length, 3);
});
