import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { demoProof, withFacts } from '../scaffold-site-proof.mjs';
import { pageSchemas, SERVICE_PAGE_TYPES } from '../lib/seo-head.mjs';
import { pageReviewer, REVIEWED_PAGE_TYPES, sitePeople, teamItems } from '../lib/site-people.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const identity = { origin: 'https://www.strandmill.com', siteName: 'Strandmill', schemaLogo: { src: '/icon-512.png' } };
const team = [
  { name: 'Junhao Liang', role: 'Founder', years: 20, reviews: ['service', 'place', 'location'] },
  { name: 'Wenjie Deng', role: 'Head of development', years: 14, blogAuthor: true, reviews: ['product_manufacturer', 'product_wholesale', 'solution'] },
  { name: 'Yanling Peng', role: 'Quality control lead', years: 11 },
];
const about = { id: 'about', route: '/about-us/', pageType: 'about', status: 'authored', seo: { title: 'About', description: 'About us.', canonical: '/about-us/' }, hero: { heading: 'About' }, jsonLd: [], blocks: [{ id: 'owner-team', type: 'team', items: teamItems(team) }] };
const product = { id: 'bikini', route: '/bikini-manufacturer/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'Bikini Manufacturer', description: 'Bikinis made to order.', canonical: '/bikini-manufacturer/' }, hero: { heading: 'Bikini manufacturer' }, jsonLd: [], blocks: [] };

test('a product or service page names the team member who reviews its page type (four-site audit 2026-11-17, C10/G6)', () => {
  const people = sitePeople([about, product]);
  assert.deepEqual(REVIEWED_PAGE_TYPES, SERVICE_PAGE_TYPES);
  const reviewer = pageReviewer(product, people);
  assert.equal(reviewer.name, 'Wenjie Deng');
  assert.equal(reviewer.href, '/about-us/#team-wenjie-deng');
  assert.equal(pageReviewer({ ...product, pageType: 'place' }, people).name, 'Junhao Liang');
  // No guess: a page type nobody reviews, a page that is no product or service, a placeholder, a site without a team.
  assert.equal(pageReviewer(product, sitePeople([{ ...about, blocks: [{ id: 'owner-team', type: 'team', items: teamItems(team.map(({ reviews, ...person }) => person)) }] }])), null);
  assert.equal(pageReviewer(about, people), null);
  assert.equal(pageReviewer({ ...product, status: 'placeholder' }, people), null);
  assert.equal(pageReviewer(product, null), null);
});

test('the page node states the reviewer as reviewedBy, the Person by their team anchor', () => {
  const people = sitePeople([about, product]);
  const schemas = pageSchemas({ page: product, identity, nav: {}, team: people });
  const node = schemas.find((item) => item['@type'] === 'WebPage');
  assert.deepEqual(node.reviewedBy, { '@type': 'Person', '@id': 'https://www.strandmill.com/about-us/#team-wenjie-deng', name: 'Wenjie Deng', url: 'https://www.strandmill.com/about-us/#team-wenjie-deng', jobTitle: 'Head of development' });
  // The Service stays as it was; a page without a reviewer states none.
  assert.equal(schemas.find((item) => item['@type'] === 'Service').reviewedBy, undefined);
  assert.equal(pageSchemas({ page: product, identity, nav: {} }).find((item) => item['@type'] === 'WebPage').reviewedBy, undefined);
  // Site Factory's own page node gets it too.
  const own = pageSchemas({ page: { ...product, jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Bikinis' }] }, identity, nav: {}, team: people });
  assert.equal(own.filter((item) => item['@type'] === 'WebPage').length, 1);
  assert.equal(own.find((item) => item['@type'] === 'WebPage').reviewedBy.name, 'Wenjie Deng');
});

test('the line shows at the page foot with the date, and the home page is dated', async () => {
  const view = await source('src/components/blocks/PageView.astro');
  assert.match(view, /const reviewer = pageReviewer\(page, people\);/);
  assert.match(view, /Reviewed by <a href=\{reviewer\.href\}>\{reviewer\.name\}<\/a>, \{reviewer\.role\}/);
  assert.match(await source('src/layouts/BaseLayout.astro'), /dates: pageDates, team: people \}\)/);
  const { UNDATED_PAGE_TYPES } = await import('../lib/page-dates.mjs');
  assert.ok(!UNDATED_PAGE_TYPES.includes('home'));
});

test('a stand-in team names who reviews what from its trade; one made before takes its roles\' page types', async () => {
  const demo = JSON.parse(await source('config/demo-proof.json'));
  const made = demoProof({ demo, facts: new Map(), products: [{ product: 'bikini', route: '/bikini-manufacturer/' }], line: 'swimwear', seed: 'Strandmill', host: 'strandmill.com' });
  assert.ok(made.team.some((person) => person.reviews?.includes('product_manufacturer')));
  assert.ok(made.team.some((person) => person.reviews?.includes('solution')));
  const existing = { ...made, team: made.team.map(({ reviews, ...person }) => person) };
  const kept = withFacts(existing, made, new Set(['/bikini-manufacturer/']));
  assert.deepEqual(kept.team.map((person) => person.name), made.team.map((person) => person.name));
  assert.deepEqual(kept.team.map((person) => person.reviews ?? null), made.team.map((person) => person.reviews ?? null));
  for (const file of ['config/demo-proof.json', 'config/demo-proof.service.json']) {
    const reviewed = JSON.parse(await source(file)).team.members.flatMap((member) => member.reviews ?? []);
    for (const type of reviewed) assert.ok(REVIEWED_PAGE_TYPES.includes(type), `${file}: ${type}`);
  }
});

test('a page whose address names a person\'s job is theirs: the quality control page by the quality control lead (aloha L-13, 2026-11-18)', () => {
  const crew = [{ name: 'Wenjie Peng', role: 'Founder', reviews: ['solution'] }, { name: 'Huimin Tang', role: 'Head of development', reviews: ['product_manufacturer'] }, { name: 'Siyu Chen', role: 'Quality control lead' }];
  const people = sitePeople([{ ...about, blocks: [{ id: 'owner-team', type: 'team', items: teamItems(crew) }] }]);
  const page = (route, pageType) => ({ ...product, route, pageType });
  assert.deepEqual(['/quality-control/', '/product-development/', '/shipping/', '/bikini-manufacturer/'].map((route, index) => pageReviewer(page(route, index === 3 ? 'product_manufacturer' : 'solution'), people).name), ['Siyu Chen', 'Huimin Tang', 'Wenjie Peng', 'Huimin Tang']);
});
