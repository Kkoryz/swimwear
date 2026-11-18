import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CHECKS, runChecks } from '../preflight.mjs';
import { mergeProofItems } from '../proof-signoff.mjs';
import { projectFields, scaffoldSiteCompany } from '../scaffold-site-company.mjs';
import { pageHash } from '../lib/page-dates.mjs';
import { pageProblems } from '../lib/seo-audit.mjs';
import { pageSchemas, serializeJsonLd } from '../lib/seo-head.mjs';
import { schemaProblems } from '../lib/schema-rules.mjs';
import { companyFrom, companySignoffItems, companyStandIns, e164, parseAddress } from '../lib/site-company.mjs';

// The four-site audit 2026-11-17: a Guangzhou swimwear factory, a Canadian hotel revenue manager, a US rental manager
// with city pages and no contact details at all.
const facts = new Map([['owner:founded', { text: 'The factory has been running since 2011.', approved: true }], ['owner:location-china', { text: 'Our factory is in Guangzhou, China.', approved: true }]]);
const factory = () => companyFrom({ facts, market: 'us', contact: { email: 'sales@strandmill.com', address: 'Guangzhou, Guangdong, China', placeholder: true }, siteName: 'Strandmill', domain: 'strandmill.com', category: 'swimwear' });

test('addresses, phones: "City, Region, Country" is a PostalAddress; a phone is E.164 or nothing', () => {
  assert.deepEqual(parseAddress('Toronto, Ontario, Canada'), { addressLocality: 'Toronto', addressRegion: 'Ontario', addressCountry: 'CA' });
  assert.deepEqual(parseAddress('120 King St W, Toronto, ON M5H 1A1, Canada'), { streetAddress: '120 King St W', addressLocality: 'Toronto', addressRegion: 'ON', postalCode: 'M5H 1A1', addressCountry: 'CA' });
  assert.deepEqual(parseAddress('Austin, TX 78701, USA'), { addressLocality: 'Austin', addressRegion: 'TX', postalCode: '78701', addressCountry: 'US' });
  assert.equal(parseAddress('Office address to be confirmed'), null);
  assert.equal(e164('+1 (416) 555-0187'), '+14165550187');
  assert.equal(e164('+86 20 3888 1234'), '+862038881234');
  assert.equal(e164('+1 555 0100'), null, 'a North American number has ten digits');
  assert.equal(e164('(416) 555-0187'), null, 'no country code');
});

test('the company: what the facts and contact details give, invented stand-ins for the rest, each listed', () => {
  const company = factory();
  assert.equal(company.legalName, 'Guangzhou Strandmill Swimwear Co., Ltd.');
  assert.equal(company.legalForm, 'Limited liability company');
  assert.deepEqual(company.address, { addressLocality: 'Guangzhou', addressRegion: 'Guangdong', addressCountry: 'CN' });
  assert.equal(company.foundingDate, '2011');
  assert.equal(company.sources.foundingDate, 'fact owner:founded');
  // Owner 2026-11-17 ("全球 所有行业默认都是全球市场"): worldwide by default; the keywords' market is the SEO market only.
  assert.deepEqual(company.serviceArea, [{ type: 'Place', name: 'Worldwide' }]);
  assert.equal(company.seoMarket, 'US');
  assert.equal(company.sources.serviceArea, 'default');
  assert.deepEqual(company.sameAs, [], 'no profile is guessed: a brand handle may belong to a stranger');
  // The approved founding fact is the company's; the rest is invented or unconfirmed (the contact is Site Factory's placeholder).
  assert.deepEqual(company.standIns, ['legalName', 'legalForm', 'address'], 'the worldwide default is no stand-in');
  assert.deepEqual(factory(), company, 'the same site always gets the same stand-ins');
  // No number of any register is ever invented.
  assert.doesNotMatch(JSON.stringify(company), /registration|licen[cs]e no|\bno\.\s*\d/i);
});

test('stand-ins are made per site and fit its country; an unconfirmed founding fact is used but listed', () => {
  const rental = companyFrom({ market: 'us', contact: { email: 'hello@example.com', address: 'Office address to be confirmed', placeholder: true, standIns: ['email', 'address'] }, siteName: 'Staylumen' });
  assert.equal(rental.address.addressCountry, 'US');
  assert.match(rental.legalName, /^Staylumen (LLC|Inc\.)$/);
  assert.ok(rental.standIns.includes('address') && rental.standIns.includes('foundingDate'));
  const other = companyFrom({ market: 'us', contact: { address: 'Office address to be confirmed', placeholder: true }, siteName: 'Harborline' });
  assert.notDeepEqual([other.address, other.foundingDate], [rental.address, rental.foundingDate], 'two sites rarely share their stand-ins');
  const canadian = companyFrom({ facts: new Map([['owner:location-canada', { text: 'RateHarbor is a Canadian company.', approved: true }], ['brief:SG18', { text: 'We have been operating since 2016.', approved: false }]]), market: 'us', siteName: 'RateHarbor' });
  assert.equal(canadian.address.addressCountry, 'CA');
  assert.match(canadian.legalName, /^RateHarbor (Inc\.|Ltd\.)$/);
  assert.equal(canadian.foundingDate, '2016');
  assert.ok(canadian.standIns.includes('foundingDate'), 'an unapproved fact is a stand-in');
});

test('Site Factory\'s company block and the owner\'s own values win over stand-ins', () => {
  const given = { legal_name: 'Strandmill Garments (Guangzhou) Co., Ltd.', service_area: ['United States', 'Canada'], same_as: { value: ['https://www.linkedin.com/company/strandmill-gz'], placeholder: true } };
  const company = companyFrom({ given, facts, market: 'us', contact: { address: 'Guangzhou, Guangdong, China' }, siteName: 'Strandmill', category: 'swimwear' });
  assert.equal(company.legalName, 'Strandmill Garments (Guangzhou) Co., Ltd.');
  assert.equal(company.sources.legalName, 'site-factory');
  assert.deepEqual(company.serviceArea.map((entry) => entry.code), ['US', 'CA']);
  assert.ok(company.standIns.includes('sameAs'), 'a value Site Factory marks placeholder stays a stand-in');
  assert.ok(!company.standIns.includes('address'), 'the contact details are real here');
  // The owner replaces a stand-in and takes it out of standIns: the next run keeps it.
  const edited = { ...factory(), legalForm: 'Limited liability company', legalName: 'Guangzhou Strandmill Apparel Co., Ltd.', standIns: ['legalForm', 'address', 'serviceArea', 'sameAs'] };
  const again = companyFrom({ facts, market: 'us', contact: { address: 'Guangzhou, Guangdong, China', placeholder: true }, siteName: 'Strandmill', category: 'swimwear', previous: edited });
  assert.equal(again.legalName, 'Guangzhou Strandmill Apparel Co., Ltd.');
  assert.equal(again.sources.legalName, 'owner');
  assert.ok(!again.standIns.includes('legalName'));
});

test('project.yaml: the identity\'s JSON and Site Factory\'s YAML both give the market', () => {
  assert.equal(projectFields('{"site_name":"Strandmill","market":{"country":"us"}}').market.country, 'us');
  assert.equal(projectFields('site_name: RateHarbor   # provisional\nmarket: {country: us, language: en}\n').market.country, 'us');
  assert.deepEqual(projectFields('site_name: Strandmill\nlocations:\n- china\nmarket:\n  country: us\n  language: en\n'), { site_name: 'Strandmill', web_domain: undefined, category: undefined, market: { country: 'us' } });
});

test('scaffold: the company file from the site\'s Site Factory snapshot and identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'site-company-'));
  await mkdir(join(root, 'snap'));
  await mkdir(join(root, 'identity'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'site.json'), JSON.stringify({ identity: 'identity', siteFactory: 'snap' }));
  await writeFile(join(root, 'identity/project.yaml'), JSON.stringify({ site_name: 'RateHarbor', web_domain: 'rateharbor.com', category: 'hotel revenue management' }));
  await writeFile(join(root, 'snap/authoring_package.json'), JSON.stringify({ facts: [{ fact_id: 'owner:location-canada', text: 'RateHarbor is a Canadian company.', approved_public: true }] }));
  await writeFile(join(root, 'snap/upstream-project.yaml'), 'site_name: RateHarbor\nmarket: {country: us, language: en}\n');
  await writeFile(join(root, 'snap/manifest.json'), JSON.stringify({ inputs: [{ path: join(root, 'snap/upstream-project.yaml') }] }));
  await writeFile(join(root, 'src/data/site-contact.json'), JSON.stringify({ email: 'hello@rateharbor.com', phone: '+1 (416) 555-0187', address: 'Toronto, Ontario, Canada', placeholder: true }));
  const { company } = await scaffoldSiteCompany({ root });
  assert.equal(company.address.addressLocality, 'Toronto');
  assert.deepEqual(company.serviceArea, [{ type: 'Place', name: 'Worldwide' }]);
  assert.equal(company.seoMarket, 'US');
  assert.deepEqual(company.sameAs, []);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'src/data/site-company.json'), 'utf8')), company);
});

const identity = { siteName: 'Strandmill', origin: 'https://strandmill.com', schemaLogo: { src: '/icon-512.png' } };
const nav = { header: [{ label: 'Locations', route: '/locations/', children: [{ label: 'San Diego', route: '/san-diego/', children: [] }] }], footer: [] };
const page = (route, extra = {}) => ({ id: route, route, status: 'authored', pageType: 'general', hero: { heading: 'H1' }, seo: { title: 'Title', description: 'Description', canonical: route }, jsonLd: [], blocks: [], ...extra });
const contact = { email: 'sales@strandmill.com', phone: '+86 20 3888 1234', address: 'Guangzhou, Guangdong, China', placeholder: true };

test('T-1: the home page\'s Organization states the company, its stand-ins included', () => {
  const company = factory();
  const organization = pageSchemas({ page: page('/', { pageType: 'home' }), identity, nav, contact, company }).find((item) => item['@type'] === 'Organization');
  // The legal name is withheld for now (owner 2026-11-17); the company record keeps it.
  assert.equal(organization.legalName, undefined);
  assert.equal(organization.foundingDate, '2011');
  assert.equal(organization.description, 'Description');
  assert.equal(organization.logo, 'https://strandmill.com/icon-512.png');
  assert.deepEqual(organization.address, { '@type': 'PostalAddress', addressLocality: 'Guangzhou', addressRegion: 'Guangdong', addressCountry: 'CN' });
  assert.deepEqual(organization.areaServed, [{ '@type': 'Place', name: 'Worldwide' }]);
  assert.equal(organization.sameAs, undefined, 'no profiles, no sameAs');
  assert.equal(organization.telephone, '+862038881234');
  assert.equal(organization.contactPoint.telephone, '+862038881234');
  assert.deepEqual(schemaProblems(organization, { serviceArea: true }).filter((problem) => problem.level === 'error'), []);
  // Site Factory's own Organization keeps what it says, but a text address and a telephone that is not E.164 give way.
  const own = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Strandmill', url: '/', address: 'Office address to be confirmed', telephone: '+1 555 0100', knowsAbout: ['swimwear'] };
  const merged = pageSchemas({ page: page('/', { pageType: 'home', jsonLd: [own] }), identity, nav, contact: { email: 'a@strandmill.com' } }).find((item) => item['@type'] === 'Organization');
  assert.deepEqual([merged.address, merged.telephone, merged.knowsAbout], [undefined, undefined, ['swimwear']]);
});

test('T-2: product, service and city pages carry a Service; one of the page\'s own gets the service area', () => {
  const company = factory();
  const service = (target) => pageSchemas({ page: target, identity, nav, contact, company }).filter((item) => item['@type'] === 'Service');
  const [made] = service(page('/bikini-manufacturer/', { pageType: 'product_manufacturer', planned: { label: 'Bikini Manufacturer', primaryQuery: 'custom bikini manufacturer' } }));
  assert.deepEqual(made, { '@context': 'https://schema.org', '@type': 'Service', '@id': 'https://strandmill.com/bikini-manufacturer/#service', name: 'Custom Bikini Manufacturer', serviceType: 'Bikini Manufacturer', description: 'Description', url: 'https://strandmill.com/bikini-manufacturer/', provider: { '@id': 'https://strandmill.com/#organization' }, areaServed: [{ '@type': 'Place', name: 'Worldwide' }] });
  // A city page is offered in its city (the plan's label, else its breadcrumb).
  const [city] = service(page('/san-diego/', { pageType: 'place' }));
  assert.deepEqual(city.areaServed, [{ '@type': 'City', name: 'San Diego' }], 'a city page keeps its city');
  const american = { ...company, serviceArea: [{ type: 'Country', name: 'United States', code: 'US' }] };
  assert.deepEqual(pageSchemas({ page: page('/san-diego/', { pageType: 'place' }), identity, nav, contact, company: american }).find((item) => item['@type'] === 'Service').areaServed, [{ '@type': 'City', name: 'San Diego', containedInPlace: { '@type': 'Country', name: 'United States' } }]);
  assert.deepEqual([city.name, city.serviceType], ['H1', 'San Diego'], 'without the primary query of the plan: the H1, and the label of the breadcrumb');
  // Site Factory's own Service is kept, with the provider linked and the area it lacked; its FAQPage is untouched.
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }] };
  const schemas = pageSchemas({ page: page('/embroidery/', { pageType: 'solution', jsonLd: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'Embroidery', serviceType: 'Embroidery', provider: { '@type': 'Organization', name: 'Strandmill', url: '/' } }, faq] }), identity, nav, contact, company });
  const own = schemas.filter((item) => item['@type'] === 'Service');
  assert.equal(own.length, 1);
  assert.equal(own[0].name, 'Embroidery');
  assert.equal(own[0].provider['@id'], 'https://strandmill.com/#organization');
  assert.deepEqual(own[0].areaServed, [{ '@type': 'Place', name: 'Worldwide' }]);
  assert.equal(own[0]['@id'], 'https://strandmill.com/embroidery/#service');
  assert.deepEqual(schemas.find((item) => item['@type'] === 'WebPage').mainEntity, { '@id': 'https://strandmill.com/embroidery/#service' });
  assert.deepEqual(schemas.find((item) => item['@type'] === 'FAQPage'), faq);
  // Never Product or LocalBusiness; other page types get no Service.
  assert.ok(schemas.every((item) => !['Product', 'LocalBusiness'].includes(item['@type'])));
  assert.deepEqual(service(page('/faq/')), []);
});

test('T-3, T-4: AboutPage, ContactPage, the Blog hub and every page node with its last change', () => {
  const node = (target, dates = null) => pageSchemas({ page: target, identity, nav, dates }).find((item) => ['WebPage', 'AboutPage', 'ContactPage', 'Blog'].includes(item['@type']));
  assert.equal(node(page('/about-us/', { pageType: 'about' }))['@type'], 'AboutPage');
  assert.deepEqual(node(page('/about-us/', { pageType: 'about' })).about, { '@id': 'https://strandmill.com/#organization' });
  assert.equal(node(page('/contact-us/', { pageType: 'contact' }))['@type'], 'ContactPage');
  const hub = page('/blog/', { pageType: 'blog_hub', blocks: [{ id: 'posts', type: 'postList', items: [{ title: 'MOQ', href: '/blog/moq/', excerpt: 'x', date: '2026-11-01T09:00:00Z' }], pagination: { page: 1, pages: 1, base: '/blog/' } }] });
  const blog = node(hub);
  assert.equal(blog['@type'], 'Blog');
  assert.deepEqual(blog.blogPost, [{ '@type': 'BlogPosting', headline: 'MOQ', url: 'https://strandmill.com/blog/moq/', datePublished: '2026-11-01T09:00:00Z' }]);
  assert.equal(node(page('/blog/page/2/', { pageType: 'blog_hub' }))['@type'], 'WebPage', 'a later hub page is a page of the blog, not the blog');
  // dateModified is the page's content date (page-dates.json), only while its record matches the page.
  const about = page('/about-us/', { pageType: 'about' });
  assert.equal(node(about, { '/about-us/': { hash: pageHash(about), modified: '2026-11-10' } }).dateModified, '2026-11-10');
  assert.equal(node(about, { '/about-us/': { hash: 'stale', modified: '2026-11-10' } }).dateModified, undefined);
  // A blog post's page is its BlogPosting: no second page node.
  const post = page('/blog/moq/', { pageType: 'blog_post', article: { datePublished: '2026-11-01', dateModified: '2026-11-02' } });
  assert.deepEqual(pageSchemas({ page: post, identity, nav }).map((item) => item['@type']), ['BlogPosting', 'Organization', 'BreadcrumbList']);
});

test('schema rules: service area, dates, E.164 telephones, a thin Organization, a text address', () => {
  const issues = (node, options) => schemaProblems({ '@context': 'https://schema.org', ...node }, options).map((problem) => `${problem.level}:${problem.issue}`);
  assert.ok(issues({ '@type': 'Service', name: 'S', provider: { '@id': '#o' } }, { serviceArea: true }).includes('error:service_area_missing'));
  assert.ok(!issues({ '@type': 'Service', name: 'S', provider: { '@id': '#o' } }).includes('error:service_area_missing'), 'only once the site states its area');
  assert.ok(issues({ '@type': 'Service', name: 'S' }).includes('error:json_ld_required_missing'), 'a Service names its provider');
  assert.ok(issues({ '@type': 'WebPage', url: 'u', name: 'n', dateModified: '10/11/2026' }).includes('error:json_ld_date_invalid'));
  assert.ok(!issues({ '@type': 'WebPage', url: 'u', name: 'n', dateModified: '2026-11-10' }).some((issue) => issue.startsWith('error')));
  assert.ok(issues({ '@type': 'Organization', name: 'n', url: 'u', foundingDate: '2011', contactPoint: { '@type': 'ContactPoint', telephone: '+1 (416) 555-0187' } }).includes('error:json_ld_telephone_format'));
  assert.ok(issues({ '@type': 'Organization', name: 'n', url: 'u' }).includes('warning:organization_thin'));
  assert.ok(issues({ '@type': 'Organization', name: 'n', url: 'u', address: 'Guangzhou, China' }).includes('warning:address_not_structured'));
  assert.ok(issues({ '@type': 'AboutPage', name: 'n' }).includes('error:json_ld_required_missing'));
  assert.ok(issues({ '@type': 'Blog', url: 'u' }).includes('error:json_ld_required_missing'));
});

test('the SEO audit: a service page without a Service fails, and so does a Service without the site\'s area', () => {
  const html = (schemas) => `<html lang="en"><head><title>A title long enough for the check</title><meta name="description" content="A description long enough for the length check to pass without a warning at all."><link rel="canonical" href="https://strandmill.com/bikinis/"><meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:url" content="u"><meta property="og:image" content="i">${schemas.map((item) => `<script type="application/ld+json">${serializeJsonLd(item)}</script>`).join('')}</head><body><main><h1>Bikinis</h1></main></body></html>`;
  const target = page('/bikinis/', { pageType: 'product_manufacturer' });
  const errors = (schemas, company = null) => pageProblems({ html: html(schemas), page: target, identity, nav: { header: [], footer: [] }, company }).filter((problem) => problem.level !== 'warning').map((problem) => problem.issue);
  assert.ok(errors([]).includes('service_schema_missing'));
  const company = factory();
  const schemas = pageSchemas({ page: target, identity, nav: { header: [], footer: [] }, company });
  assert.deepEqual(errors(schemas, company).filter((issue) => issue !== 'breadcrumb_mismatch'), []);
  const withoutArea = schemas.map((item) => (item['@type'] === 'Service' ? { ...item, areaServed: undefined } : item));
  assert.ok(errors(withoutArea, company).includes('service_area_missing'));
});

test('the preflight holds every stand-in the structured data states, with the pages that state it', () => {
  const company = factory();
  const home = pageSchemas({ page: page('/', { pageType: 'home' }), identity, nav, contact, company });
  const built = new Map([['/', `<html lang="en"><head>${home.map((item) => `<script type="application/ld+json">${serializeJsonLd(item)}</script>`).join('')}</head><body><main></main></body></html>`]]);
  const ctx = { pages: [page('/', { pageType: 'home' })], built, company, contact };
  const [hold] = runChecks(ctx, CHECKS.filter((check) => check.code === 'company_stand_in')).holds;
  assert.equal(hold.code, 'company_stand_in');
  assert.deepEqual(hold.items, [
    'legalName "Guangzhou Strandmill Swimwear Co., Ltd.": not in the structured data',
    'legalForm "Limited liability company": not in the structured data',
    'address "Guangzhou, Guangdong, CN": in Organization.address on /',
    'contact.email "sales@strandmill.com": in Organization.email, ContactPoint.email on /',
    'contact.phone "+862038881234": in Organization.telephone, ContactPoint.telephone on /',
  ]);
  assert.deepEqual(companyStandIns({ ...company, standIns: [] }, { ...contact, placeholder: false }), []);
  assert.deepEqual(runChecks({ ...ctx, company: { ...company, standIns: [] }, contact: null }, CHECKS.filter((check) => check.code === 'company_stand_in')).holds, []);
});

test('the release sign-off lists each company stand-in and drops it once replaced', () => {
  const company = factory();
  assert.deepEqual(companySignoffItems(company).map((item) => item.id), ['company-legal-name', 'company-legal-form', 'company-address']);
  assert.match(companySignoffItems(company)[0].description, /stand-in company legal name "Guangzhou Strandmill Swimwear Co., Ltd." with the real one/);
  const signoff = mergeProofItems({ schemaVersion: 'x', items: [{ id: 'other', description: 'kept', status: 'pending' }] }, {}, [], null, null, company);
  assert.deepEqual(signoff.items.map((item) => item.id), ['other', 'company-legal-name', 'company-legal-form', 'company-address']);
  const replaced = mergeProofItems(signoff, {}, [], null, null, { ...company, standIns: ['address'] });
  assert.deepEqual(replaced.items.map((item) => item.id), ['other', 'company-address']);
});

test("Site Factory's project.yaml top-level service_area and seo_market are the company's service area and SEO market", () => {
  const global = companyFrom({ project: { service_area: 'global', seo_market: 'us' }, siteName: 'Strandmill' });
  assert.deepEqual(global.serviceArea, [{ type: 'Place', name: 'Worldwide' }]);
  assert.equal(global.seoMarket, 'US');
  assert.equal(global.sources.serviceArea, 'identity');
  const named = companyFrom({ project: { service_area: ['United States', 'Canada'], seo_market: 'us' }, siteName: 'MotelPilot' });
  assert.deepEqual(named.serviceArea.map((entry) => entry.code), ['US', 'CA']);
});
