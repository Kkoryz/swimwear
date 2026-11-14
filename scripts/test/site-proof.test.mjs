import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { proofBlock, proofSignoffItems, withProofSlots } from '../lib/site-proof.mjs';
import { mergeProofItems } from '../proof-signoff.mjs';

const proof = {
  schemaVersion: 'seo-site-proof-v1',
  headings: { certifications: 'Certified production', clients: 'Brands we make for', caseStudies: 'Client results', testimonials: 'What buyers say', factory: 'Our factory in figures', history: 'Our story' },
  factory: [{ value: '120,000 pcs', label: 'monthly capacity' }, { value: '8', label: 'sewing lines' }, { value: '2012', label: 'founded' }],
  certifications: [{ name: 'OEKO-TEX Standard 100', number: '21.HCN.12345' }, { name: 'GOTS' }],
  clients: [{ name: 'Northline', note: 'Activewear, Canada' }, { name: 'Maré Studio', note: 'Swimwear, Portugal' }],
  testimonials: [{ quote: 'Samples matched the tech pack.', author: 'Ana', role: 'Founder', company: 'Maré Studio', pages: ['/bra/'] }, { quote: 'On time.', author: 'Ben', company: 'Northline' }],
  caseStudies: [{ client: 'Northline', title: 'A first run of leggings', summary: 'From tech pack to 1,200 pieces.', results: [{ value: '1,200', label: 'pieces in the first order' }], href: '/leggings/' }],
  history: [{ year: 2012, event: 'Factory founded' }, { year: 2018, event: 'Second building' }],
  terms: { columns: ['Order', 'Minimum', 'Lead time'], rows: [['Sample', '1 piece', '10-15 days'], ['Bulk', '50 pieces per style per colour', '35-40 days']] },
};

test('proof slots join a page type before its FAQ, except one already placed or one a person left out', () => {
  const slots = [{ id: 'intro', block: 'intro' }, { id: 'testimonials', block: 'testimonials', fill: 'owner' }, { id: 'faq', block: 'faq' }, { id: 'cta', block: 'cta' }];
  assert.deepEqual(withProofSlots('home', slots).map((slot) => slot.id), ['intro', 'orderRoutes', 'testimonials', 'factory', 'certifications', 'logos', 'caseStudies', 'faq', 'cta']);
  assert.deepEqual(withProofSlots('ordering', [{ id: 'intro', block: 'intro' }, { id: 'terms', block: 'splitMedia' }]).map((slot) => slot.id), ['intro', 'orderRoutes', 'terms']);
  assert.deepEqual(withProofSlots('home', slots, ['logos', 'orderRoutes']).map((slot) => slot.id), ['intro', 'testimonials', 'factory', 'certifications', 'caseStudies', 'faq', 'cta']);
  assert.equal(withProofSlots('contact', slots), slots);
  // The terms table follows the page's written terms.
  const product = [{ id: 'intro', block: 'intro' }, { id: 'terms', block: 'splitMedia' }, { id: 'process', block: 'process' }, { id: 'faq', block: 'faq' }];
  assert.deepEqual(withProofSlots('product_manufacturer', product).map((slot) => slot.id), ['intro', 'terms', 'orderTerms', 'process', 'certifications', 'testimonials', 'caseStudies', 'faq']);
});

test('a testimonial shows the client\'s own photo when supplied and never asks for a generated face', async () => {
  const { allocateSite } = await import('../lib/media-allocation.mjs');
  const photo = { src: '/clients/ana.webp', alt: 'Ana', width: 10, height: 10 };
  const block = { id: 'owner-testimonials', type: 'testimonials', items: [{ quote: 'Q', author: 'Ana', company: 'Maré Studio', media: photo }, { quote: 'R', author: 'Ben', company: 'Northline' }] };
  const { byRoute, unfilled } = allocateSite({ pages: [{ route: '/a/', pageType: 'product_manufacturer', blocks: [block] }], components: { hero: 'plain', pageTypes: { product_manufacturer: { mediaModules: [] } }, media: {} } });
  assert.deepEqual(byRoute['/a/'][0], [photo, null]);
  assert.deepEqual(unfilled, []);
});

test('an owner slot renders the site\'s proof as a valid block, the page\'s own items first, and nothing without data', () => {
  const blocks = ['factory', 'certifications', 'logos', 'testimonials', 'caseStudies', 'history', 'orderTerms'].map((id) => proofBlock(id, proof, { route: '/bra/' }));
  assert.deepEqual(blocks.map((block) => block.type), ['stats', 'certifications', 'logos', 'testimonials', 'caseStudies', 'process', 'table']);
  assert.equal(blocks[3].items[0].author, 'Ana');
  assert.equal(blocks[3].items[0].pages, undefined);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'home', status: 'placeholder', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  assert.equal(proofBlock('certifications', null), null);
  assert.equal(proofBlock('factory', { factory: [{ value: '1', label: 'x' }, { value: '2', label: 'y' }] }), null, 'two figures alone read as a gap');
  // A stand-in figure shows only where a fact states it (owner 2026-11-12: an invented 40 beside the copy's 60); the other
  // stand-ins show until the owner replaces them.
  const standIn = { ...proof, standIn: true, factory: [{ value: '25', label: 'people', factId: 'team' }, { value: '40', label: 'clients served' }, { value: '2016', label: 'founded', factId: 'founded' }, { value: '60', label: 'hotels', factId: 'size' }] };
  assert.deepEqual(['logos', 'testimonials', 'caseStudies', 'history'].map((id) => proofBlock(id, standIn, { route: '/bra/' })?.type), ['logos', 'testimonials', 'caseStudies', 'process']);
  assert.deepEqual(proofBlock('factory', standIn).items.map((item) => item.value), ['25', '2016', '60']);
});

test('stated proof is listed for the owner\'s sign-off; a confirmed item stays confirmed until its values change', () => {
  const items = proofSignoffItems(proof);
  assert.deepEqual(items.map((item) => item.id), ['proof-factory', 'proof-certifications', 'proof-clients', 'proof-testimonials', 'proof-caseStudies', 'proof-history']);
  assert.match(items[1].description, /OEKO-TEX Standard 100 no\. 21\.HCN\.12345; GOTS/);
  const signoff = { schemaVersion: 'seo-site-release-signoff-v1', items: [{ id: 'founded', status: 'pending', description: 'x' }, { ...items[0], status: 'confirmed' }] };
  const merged = mergeProofItems(signoff, proof);
  assert.equal(merged.items.find((item) => item.id === 'proof-factory').status, 'confirmed');
  assert.equal(merged.items[0].id, 'founded');
  const changed = mergeProofItems(signoff, { ...proof, factory: [{ value: '90,000 pcs', label: 'monthly capacity' }, { value: '8', label: 'sewing lines' }] });
  assert.equal(changed.items.find((item) => item.id === 'proof-factory').status, 'pending');
});

test('a new site\'s stand-in proof takes its certificates, founding year and terms from the approved facts', async () => {
  const { demoProof, productOf } = await import('../scaffold-site-proof.mjs');
  const demo = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../config/demo-proof.json', import.meta.url), 'utf8'));
  const facts = new Map([
    ['founded', { text: 'Our factory was founded in 2012.', approved: true }],
    ['location-china', { text: 'We are a manufacturer; our factory is in Shaoxing, Zhejiang, China.', approved: true }],
    ['certifications', { text: 'Our production holds OEKO-TEX Standard 100, GRS for recycled fabrics and a BSCI social audit.', approved: true }],
    ['moq', { text: 'Our minimum order quantity is 50 pieces per style per colour.', approved: true }],
    ['sample-fee', { text: 'Not public.', approved: false }],
  ]);
  const proof = demoProof({ demo, facts, products: [{ product: productOf('Bikini Manufacturer'), route: '/bikinis-manufacturer/' }], line: 'swimwear' });
  assert.deepEqual(proof.certifications.map((item) => item.name), ['OEKO-TEX Standard 100', 'GRS', 'amfori BSCI']);
  assert.equal(proof.factory[0].value, '2012');
  assert.equal(proof.history[0].event, 'Factory founded in Shaoxing, Zhejiang, China, with four sewing lines');
  assert.deepEqual(proof.terms.rows, [['Minimum order', 'Our minimum order quantity is 50 pieces per style per colour.']]);
  assert.equal(proof.caseStudies.length, 1);
  assert.equal(proof.caseStudies[0].href, '/bikinis-manufacturer/');
  assert.match(proof.testimonials[0].quote, /bikini samples/);
  assert.equal(proof.factory[1].value, '150,000 pcs', 'no fact states it: the stand-in figure');
  // A figure the approved facts state is theirs, and follows them into an existing stand-in (site10: 150,000 beside 30,000).
  const capacity = new Map([...facts, ['c-1', { text: 'We can produce about 30,000 pieces a month while keeping our quality checks in place.', approved: true }]]);
  const stated = demoProof({ demo, facts: capacity, products: [], line: 'swimwear' });
  assert.deepEqual(stated.factory[1], { value: '30,000 pcs', label: 'swimwear pieces a month', factId: 'c-1' });
  const { withFacts } = await import('../scaffold-site-proof.mjs');
  assert.deepEqual(withFacts(proof, stated).factory.map((item) => item.value), ['2012', '30,000 pcs', '12', '280']);
  // Cases and quotes tied to product pages the site no longer has are made again for the current ones.
  const now = demoProof({ demo, facts, products: [{ product: 'wetsuit', route: '/wetsuit-manufacturer/' }], line: 'swimwear' });
  const moved = withFacts(proof, now, new Set(['/wetsuit-manufacturer/']));
  assert.deepEqual([moved.caseStudies[0].href, moved.testimonials[0].pages], ['/wetsuit-manufacturer/', ['/wetsuit-manufacturer/']]);
  assert.equal(withFacts(proof, now, new Set(['/bikinis-manufacturer/'])).caseStudies, proof.caseStudies, 'still current: kept');
  // One case per product page, each about its product; a stand-in that leaves a product page without one is made again.
  const products = ['bikini', "men's swimwear", 'wetsuit', 'rash guard'].map((product) => ({ product, route: `/${product.replace(/\W+/g, '-')}/` }));
  const many = demoProof({ demo, facts, products, line: 'swimwear' });
  assert.deepEqual(many.caseStudies.map((item) => item.pages), products.map((item) => [item.route]));
  assert.match(many.caseStudies[1].title, /men's swimwear/i);
  assert.equal(many.caseStudies[3].title, many.caseStudies[0].title.replace('bikini', 'rash guard'), 'the case kinds taken in turn');
  assert.equal(withFacts(proof, many, new Set(products.map((item) => item.route))).caseStudies, many.caseStudies, 'one product page had no case: made again');
  const { proofBlock } = await import('../lib/site-proof.mjs');
  assert.deepEqual(proofBlock('caseStudies', many, { route: "/men-s-swimwear/" }).items.map((item) => item.href), ["/men-s-swimwear/"], 'a product page shows its own case');
  assert.equal(proofBlock('caseStudies', many, { route: '/' }).items.length, 3, 'any other page the first three');
  // A client is a role, a city and a country, never a brand name; a service page has a case about its service.
  const withServices = demoProof({ demo, facts, products, services: [{ service: 'swimwear packaging & brand labels', route: '/packaging/' }], line: 'swimwear' });
  assert.ok(withServices.caseStudies.every((item) => !demo.clients.some((client) => item.client === client.name)), 'no invented brand');
  assert.deepEqual([withServices.caseStudies[0].client, withServices.caseStudies[0].market], ['Independent swimwear label founder', 'Sydney, Australia']);
  const service = withServices.caseStudies.find((item) => item.pages.includes('/packaging/'));
  assert.match(service.title, /^Swimwear packaging & brand labels /);
  assert.deepEqual(proofBlock('caseStudies', withServices, { route: '/packaging/' }).items.map((item) => item.href), ['/packaging/']);
  // A stand-in whose cases name brands is made again.
  const branded = { ...withServices, caseStudies: withServices.caseStudies.map((item) => ({ ...item, client: 'Northfold Basics' })) };
  assert.equal(withFacts(branded, withServices, new Set([...products.map((item) => item.route), '/packaging/'])).caseStudies, withServices.caseStudies);
});

test('the trust bar takes the package\'s size facts word for word, then the founding year while there is room', async () => {
  const { trustFromPackage, trustBarItems } = await import('../lib/site-trust.mjs');
  const owner = (text) => ({ text, approved: true, confirmed: true });
  const facts = new Map([['founded', owner('Our factory was founded in 2012.')], ['location-china', owner('We are a manufacturer; our factory is in Shaoxing, Zhejiang, China.')], ['capacity', owner('We produce 22,000 pieces a month.')], ['workers', owner('Our factory employs 220 people.')]]);
  const trust = trustFromPackage({ trust_bar: [{ fact_id: 'capacity', label: 'Monthly production capacity', value: '22,000 pieces' }, { fact_id: 'workers', label: 'Number of production workers', value: '220 people' }] }, facts);
  assert.deepEqual(trust, { schemaVersion: 'seo-site-trust-v1', items: [{ value: '22,000 pieces', label: 'Monthly production capacity', factId: 'capacity' }, { value: '220 people', label: 'Number of production workers', factId: 'workers' }], founded: '2012', location: 'Shaoxing, Zhejiang, China' });
  assert.deepEqual(trustBarItems(trust).map((item) => item.value), ['22,000 pieces', '220 people', '2012']);
  assert.equal(trustBarItems({ items: Array.from({ length: 5 }, (_, index) => ({ value: `${index}`, label: 'x' })), founded: '2012' }).length, 5);
  assert.deepEqual(trustBarItems({ items: [{ value: '2011', label: 'Since' }], founded: '2011' }).map((item) => item.label), ['Since'], 'the founding year once');
  assert.equal(trustFromPackage({ trust_bar: [] }, new Map()), null);
  // Real size facts show in the trust bar: no stand-in factory figures under it; a page's own testimonials replace the
  // stand-in ones.
  assert.equal(proofBlock('factory', proof, { trust }), null);
  const quotes = proofBlock('testimonials', proof, { testimonials: [{ review_id: 'r1', text: 'Helpful service.', reviewer: 'a swimwear label in the US', placeholder: true }] });
  assert.deepEqual(quotes.items, [{ quote: 'Helpful service.', author: 'a swimwear label in the US', placeholder: true }]);
});

test('borrowed testimonials and order routes hold release until the owner confirms their sign-off items', async () => {
  const { placeholderItems } = await import('../proof-signoff.mjs');
  const { runChecks, CHECKS } = await import('../preflight.mjs');
  const pages = [{ route: '/', blocks: [{ type: 'testimonials', items: [{ quote: 'Q', author: 'a client', placeholder: true }] }] }, { route: '/how-to-order/', blocks: [{ type: 'orderRoutes', items: [{ heading: 'Ready designs', text: 'T', placeholder: true }] }] }];
  const items = placeholderItems(pages);
  assert.deepEqual(items.map((item) => item.id), ['placeholder-testimonials', 'placeholder-order-routes']);
  assert.match(items[0].description, /testimonials on \/ with real/);
  assert.match(items[1].description, /order routes borrowed from competitors on \/how-to-order\//);
  assert.deepEqual(placeholderItems([{ route: '/', blocks: [] }]), []);
  const checks = CHECKS.filter((item) => ['placeholder_testimonial', 'placeholder_order_route'].includes(item.code));
  assert.deepEqual(runChecks({ pages, signoff: { items: [] } }, checks).holds.map((hold) => [hold.code, hold.items]), [['placeholder_testimonial', ['/']], ['placeholder_order_route', ['/how-to-order/']]]);
  assert.deepEqual(runChecks({ pages, signoff: { items: [{ id: 'placeholder-testimonials', status: 'confirmed' }, { id: 'placeholder-order-routes', status: 'confirmed' }] } }, checks).holds, []);
});

test('order routes come from the package, a placeholder until the owner\'s facts hold them word for word, and open the page', async () => {
  const { trustFromPackage } = await import('../lib/site-trust.mjs');
  const { placeOwnerSlots } = await import('../lib/page-assembly.mjs');
  const pkg = { order_routes: [{ fact_id: 'order-1', label: 'Ready designs', value: 'Choose a stocked style' }, { fact_id: 'order-2', label: 'Custom designs', value: 'Start from your tech pack' }] };
  const facts = new Map([['order-2', { text: 'Custom designs: Start from your tech pack.', approved: true, confirmed: true }]]);
  const trust = trustFromPackage(pkg, facts);
  assert.deepEqual(trust.routes, [{ heading: 'Ready designs', text: 'Choose a stocked style', factId: 'order-1', placeholder: true }, { heading: 'Custom designs', text: 'Start from your tech pack', factId: 'order-2' }]);
  assert.deepEqual(trust.items, []);
  assert.equal(proofBlock('orderRoutes', null, { trust }).heading, 'Ways to start your order');
  assert.equal(proofBlock('orderRoutes', proof, {}), null);
  const blocks = [{ id: 'a', type: 'intro' }, { id: 'b', type: 'splitMedia' }, { id: 'faq', type: 'faq' }];
  placeOwnerSlots(blocks, [], { planned: { url: '/how-to-order/', page_type: 'ordering' }, proof: null, trust, blueprints: { ordering: [{ id: 'intro', block: 'intro' }, { id: 'orderRoutes', block: 'orderRoutes', fill: 'owner' }] } });
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'orderRoutes', 'splitMedia', 'faq']);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'ordering', status: 'placeholder', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [blocks[1]] }]), []);
});

test('a stand-in proof follows the facts when they change and keeps what was tailored; the owner\'s file is never touched', async () => {
  const { scaffoldSiteProof } = await import('../scaffold-site-proof.mjs');
  const { mkdtemp, readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = await mkdtemp(join((await import('node:os')).tmpdir(), 'proof-'));
  const facts = (year, town) => `facts:\n  - fact_id: founded\n    text: "Founded in ${year}."\n    approved_public: true\n  - fact_id: location-china\n    text: "Our factory is in ${town}, China."\n    approved_public: true\n`;
  await writeFile(join(root, 'facts.yaml'), facts(2012, 'Shaoxing'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ pages: [{ url: '/bikinis-manufacturer/', release_status: 'ready_for_template' }] }));
  await writeFile(join(root, 'pages.json'), JSON.stringify({ pages: [{ url: '/', page_type: 'home', primary_query: 'swimwear manufacturer' }, { url: '/bikinis-manufacturer/', page_type: 'product_manufacturer', label: 'Bikini Manufacturer' }] }));
  const args = { root, factsPaths: [join(root, 'facts.yaml')], packagePath: join(root, 'package.json'), pagesPlanPath: join(root, 'pages.json') };
  const read = async () => JSON.parse(await readFile(join(root, 'src/data/site-proof.json'), 'utf8'));
  assert.equal((await scaffoldSiteProof(args)).written, true);
  assert.equal((await read()).standIn, true);
  const edited = await read();
  edited.headings.testimonials = 'Buyers on working with us';
  edited.clients[0] = { name: 'Maré Studio', note: 'Swimwear, Portugal' };
  await writeFile(join(root, 'src/data/site-proof.json'), JSON.stringify(edited));
  await writeFile(join(root, 'facts.yaml'), facts(2011, 'Guangzhou'));
  assert.equal((await scaffoldSiteProof(args)).written, true);
  const next = await read();
  assert.deepEqual(next.factory.map((item) => item.value), ['2011', ...edited.factory.slice(1).map((item) => item.value)]);
  assert.match(next.factory[0].label, /Guangzhou/);
  assert.match(next.history[0].event, /2011|Guangzhou/);
  assert.equal(next.history[0].year, 2011);
  assert.equal(next.headings.testimonials, 'Buyers on working with us');
  assert.equal(next.clients[0].name, 'Maré Studio');
  // Real values: the owner removed standIn.
  await writeFile(join(root, 'src/data/site-proof.json'), JSON.stringify({ ...next, standIn: undefined, factory: [] }));
  assert.equal((await scaffoldSiteProof(args)).written, false);
});

test('only the stated proof some page shows is listed for sign-off', async () => {
  const { shownProof, mergeProofItems: merge } = await import('../proof-signoff.mjs');
  const pages = [{ route: '/', blocks: [{ id: 'owner-certifications', type: 'certifications', items: [{ name: 'GOTS' }] }, { id: 'owner-testimonials', type: 'testimonials', items: [{ quote: 'Q', author: 'a client', placeholder: true }] }] }];
  const shown = shownProof(proof, pages);
  assert.deepEqual(Object.entries(shown).filter(([, value]) => Array.isArray(value) && value.length).map(([key]) => key), ['certifications']);
  assert.deepEqual(merge({ items: [] }, shown, pages).items.map((item) => item.id), ['proof-certifications', 'placeholder-testimonials']);
});

test('a line page shows its style grid after the section naming the styles, and its borrowed case before the testimonials', async () => {
  const { placeStyleGrid, placeCases } = await import('../lib/page-assembly.mjs');
  const { runChecks, CHECKS } = await import('../preflight.mjs');
  const source = { page_id: 'p', cta: { label: 'Quote', target_url: '/contact/' }, sections: [{ section_id: 's1', slot: 'intro' }, { section_id: 's2', slot: 'options' }],
    style_cards: [{ name: 'Triangle bikini', intro: 'A classic top with adjustable ties and removable cups.' }], cases: [{ case_id: 'c1', product: 'Bikinis', text: 'A label in Spain ordered 300 pieces.', placeholder: true }] };
  const blocks = [{ id: 'a', type: 'intro', sourceSectionIds: ['s1'] }, { id: 'b', type: 'featureGrid', sourceSectionIds: ['s2'] }, { id: 'owner-testimonials', type: 'testimonials', items: [] }, { id: 'faq', type: 'faq' }, { id: 'cta', type: 'cta' }];
  const mapping = [];
  placeStyleGrid(blocks, mapping, { source, planned: { page_type: 'product_wholesale' } });
  placeCases(blocks, mapping, { source });
  assert.deepEqual(blocks.map((block) => block.id), ['a', 'b', 'styles', 'cases', 'owner-testimonials', 'faq', 'cta']);
  assert.deepEqual(blocks[2].cta, { label: 'Request a quote', href: '/contact/' });
  assert.equal(blocks[2].heading, 'Styles to order wholesale');
  assert.deepEqual(blocks[3].items, [{ product: 'Bikinis', text: 'A label in Spain ordered 300 pieces.', placeholder: true }]);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_wholesale', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [blocks[2], blocks[3]] }]), []);
  const check = CHECKS.filter((item) => item.code === 'placeholder_case');
  assert.deepEqual(runChecks({ pages: [{ route: '/p/', blocks }], signoff: { items: [] } }, check).holds.map((hold) => hold.items), [['/p/']]);
});

test('the trust bar names the certificates of the approved fact, word for word', async () => {
  const { trustFromPackage, certificatesIn } = await import('../lib/site-trust.mjs');
  const text = 'Our production holds OEKO-TEX Standard 100 for tested fabrics and trims, GRS and RCS for recycled fabrics, bluesign for chemistry, ISO 9001 for quality management and WRAP for social compliance.';
  assert.deepEqual(certificatesIn(text), ['OEKO-TEX Standard 100', 'GRS', 'RCS', 'bluesign', 'ISO 9001', 'WRAP']);
  assert.deepEqual(certificatesIn('Audited to amfori BSCI; GRSX is not a certificate.'), ['amfori BSCI']);
  assert.deepEqual(trustFromPackage({}, new Map([['certifications', { text, approved: true, confirmed: true }]])).certifications.length, 6);
  assert.equal(trustFromPackage({}, new Map([['certifications', { text, approved: false }]])), null);
});

test('a page with its own client case gets no stand-in case studies, and the import report says why', async () => {
  const { placeOwnerSlots } = await import('../lib/page-assembly.mjs');
  const blocks = [{ id: 'a', type: 'intro' }, { id: 'faq', type: 'faq' }];
  const mapping = [];
  placeOwnerSlots(blocks, mapping, { planned: { url: '/p/', page_type: 'solution' }, proof, blueprints: { solution: [{ id: 'caseStudies', block: 'caseStudies', fill: 'owner' }] }, cases: [{ product: 'Bikinis', text: 'T' }] });
  assert.deepEqual(blocks.map((block) => block.id), ['a', 'faq']);
  assert.match(mapping[0].rule, /own client case/);
  // A package that gives the page no case (cases: []) means none here; one that says nothing of cases gets the stand-ins.
  const none = [{ id: 'a', type: 'intro' }, { id: 'faq', type: 'faq' }];
  const noneMapping = [];
  placeOwnerSlots(none, noneMapping, { planned: { url: '/', page_type: 'solution' }, proof, blueprints: { solution: [{ id: 'caseStudies', block: 'caseStudies', fill: 'owner' }] }, cases: [] });
  assert.deepEqual(none.map((block) => block.id), ['a', 'faq']);
  assert.match(noneMapping[0].rule, /gives this page no client case/);
  const silent = [{ id: 'a', type: 'intro' }, { id: 'faq', type: 'faq' }];
  placeOwnerSlots(silent, [], { planned: { url: '/', page_type: 'solution' }, proof, blueprints: { solution: [{ id: 'caseStudies', block: 'caseStudies', fill: 'owner' }] }, cases: null });
  assert.equal(silent.length, 3, 'without cases from the package the stand-ins fill the slot');
});

test('a why_us list section becomes short selling points; borrowed points and borrowed steps hold release until confirmed', async () => {
  const { planBlocks } = await import('../lib/sf-sections.mjs');
  const { verifySectionFacts } = await import('../lib/sf-structured.mjs');
  const { runChecks, CHECKS } = await import('../preflight.mjs');
  const blueprints = { product_manufacturer: [{ id: 'intro', block: 'intro', fill: 'copy' }, { id: 'why_us', block: 'iconList', fill: 'copy', variant: 'checks' }] };
  const page = { page_id: 'p', sections: [
    { section_id: 's1', slot: 'intro', heading: 'Bikinis', body: 'We make bikinis for brands. '.repeat(8) },
    { section_id: 's2', slot: 'why_us', heading: 'Why brands work with us', body: '', items: [{ title: 'Own pattern room', text: 'Patterns are cut in house.', fact_ids: ['pattern-room'] }, { title: 'Fast samples', text: 'Samples in two weeks.', placeholder: true }] },
  ] };
  const { blocks } = planBlocks(page, { pageType: 'product_manufacturer', blueprints });
  const list = blocks.find((block) => block.type === 'iconList');
  assert.deepEqual(list.items, [{ heading: 'Own pattern room', text: 'Patterns are cut in house.' }, { heading: 'Fast samples', text: 'Samples in two weeks.', placeholder: true }]);
  assert.equal(list.variant, 'checks');
  assert.equal(list.paragraphs, undefined);
  assert.throws(() => planBlocks({ ...page, sections: [page.sections[0], { ...page.sections[1], items: [] }] }, { pageType: 'product_manufacturer', blueprints }), /no items/);
  // Cited facts must exist and be approved (the text is prose, not a figure: no word-for-word match).
  assert.doesNotThrow(() => verifySectionFacts(page, new Map([['pattern-room', { text: 'We have a pattern room.', approved: true }]])));
  assert.throws(() => verifySectionFacts(page, new Map([['pattern-room', { text: 'x', approved: false }]])), /not approved/);
  assert.throws(() => verifySectionFacts(page, null), /--facts/);
  // A stand-in item may cite a fact not approved yet (it is shown marked until the owner replaces it); the fact must exist.
  const standIn = { page_id: 'p', sections: [{ section_id: 's2', items: [{ title: 'Team', text: 'A team of 25.', fact_ids: ['team'], placeholder: true }] }] };
  assert.doesNotThrow(() => verifySectionFacts(standIn, new Map([['team', { text: 'A team of 25.', approved: false }]])));
  assert.throws(() => verifySectionFacts(standIn, new Map()), /unknown fact team/);
  const pages = [{ route: '/p/', blocks: [list] }, { route: '/q/', blocks: [{ type: 'process', steps: ['Send the brief', { heading: 'Sample', text: 'We sample.', placeholder: true }] }] }];
  const checks = CHECKS.filter((check) => ['placeholder_selling_point', 'placeholder_step'].includes(check.code));
  assert.deepEqual(runChecks({ pages, signoff: { items: [] } }, checks).holds.map((hold) => [hold.code, hold.items]), [['placeholder_selling_point', ['/p/']], ['placeholder_step', ['/q/']]]);
});

test('a competitor\'s list of short points fills the why_us slot in its module; without one it stays a grid of columns', async () => {
  const { competitorBlueprint } = await import('../lib/page-blueprints.mjs');
  const defaults = [{ id: 'intro', block: 'intro' }, { id: 'why_us', block: 'iconList' }, { id: 'options', block: 'featureGrid' }, { id: 'cta', block: 'cta' }];
  const sections = [{ decision: 'intro/proof' }, { decision: 'featureGrid:cards' }, { decision: 'iconList:icons' }, { decision: 'cta' }];
  const slots = competitorBlueprint(defaults, sections);
  assert.deepEqual(slots.map((slot) => `${slot.id}${slot.variant ? `:${slot.variant}` : ''}`), ['intro', 'options:cards', 'why_us:icons', 'cta']);
  const noWhyUs = competitorBlueprint(defaults.filter((slot) => slot.id !== 'why_us'), [{ decision: 'intro/proof' }, { decision: 'iconList:icons' }, { decision: 'cta' }]);
  assert.deepEqual(noWhyUs.map((slot) => `${slot.id}${slot.variant ? `:${slot.variant}` : ''}`), ['intro', 'options:columns', 'cta']);
});

test('a borrowed structured order step keeps its placeholder flag on the page', async () => {
  const { placeStructured } = await import('../lib/sf-structured.mjs');
  const blocks = [{ id: 'a', type: 'intro' }, { id: 'b', type: 'splitMedia' }, { id: 'faq', type: 'faq' }];
  placeStructured(blocks, [], { process_steps: [{ title: 'Brief', text: 'Send the brief.' }, { title: 'Sample', text: 'We sample.', placeholder: true }, { text: 'Ship.' }] });
  assert.deepEqual(blocks.find((block) => block.type === 'process').steps, [{ heading: 'Brief', text: 'Send the brief.' }, { heading: 'Sample', text: 'We sample.', placeholder: true }, 'Ship.']);
});

test('a trust bar item that is a sentence, not a figure, stays off the bar and is reported back', async () => {
  const { trustFromPackage, trustBarRefused } = await import('../lib/site-trust.mjs');
  const pkg = { trust_bar: [{ fact_id: 'a', label: 'Capacity', value: '30,000 pieces' }, { fact_id: 'b', label: 'Factory', value: 'We manufacture swimwear ourselves; our factory is in Guangzhou.' }, { fact_id: 'c', label: 'Samples', value: '25 to 45 pieces' }] };
  const facts = new Map([['a', { text: 'About 30,000 pieces a month.', approved: true, confirmed: true }], ['c', { text: 'Samples in runs of 25 to 45 pieces.', approved: true, confirmed: true }]]);
  assert.deepEqual(trustFromPackage(pkg, facts).items.map((item) => item.value), ['30,000 pieces', '25 to 45 pieces']);
  assert.deepEqual(trustBarRefused(pkg), [{ factId: 'b', label: 'Factory', value: 'We manufacture swimwear ourselves; our factory is in Guangzhou.' }]);
});

test("Site Factory's blocking owner to-do holds release as our own sign-off items do", async () => {
  const { ownerTodoItems } = await import('../proof-signoff.mjs');
  const todo = { schema_version: 'sf/handoff-owner-todo/v1', items: [
    { type: 'supply', text: 'hello@motelpilot.com', blocking: true, field: 'contact.email', ask: 'Provide real contact details', id: 'OT-supply-1' },
    { type: 'confirm', text: 'Read replacements.md', blocking: false, evidence: 'owner/evidence/replacements.md', id: 'OT-confirm-2' },
    { type: 'confirm', text: 'Confirm the hard facts', blocking: true, evidence: 'owner/evidence/hard_info.md', id: 'OT-confirm-3' },
  ] };
  const items = ownerTodoItems(todo);
  assert.deepEqual(items.map((item) => item.id), ['sf-OT-supply-1', 'sf-OT-confirm-3'], 'the blocking ones');
  assert.match(items[0].description, /contact\.email: hello@motelpilot\.com/);
  assert.match(items[1].description, /owner\/evidence\/hard_info\.md/);
  assert.deepEqual(ownerTodoItems(null), []);
  assert.throws(() => ownerTodoItems({ schema_version: 'other' }), /unsupported owner to-do schema/);
  // Merged into the sign-off: confirmed stays confirmed while the item reads the same; an item SF dropped goes.
  const signoff = { schemaVersion: 'seo-site-release-signoff-v1', items: [{ ...items[0], status: 'confirmed' }, { id: 'sf-OT-gone', description: 'x', status: 'pending' }, { id: 'own', description: 'kept', status: 'pending' }] };
  const merged = mergeProofItems(signoff, {}, [], todo);
  assert.deepEqual(merged.items.filter((item) => item.id.startsWith('sf-')).map((item) => [item.id, item.status]), [['sf-OT-supply-1', 'confirmed'], ['sf-OT-confirm-3', 'pending']]);
  assert.ok(merged.items.some((item) => item.id === 'own'));
});

test("the trust bar's unconfirmed figures and Site Factory's items hold release, naming where they show", async () => {
  const { trustBarItems, ownerTodoItems } = await import('../proof-signoff.mjs');
  const { CONTENT_CHECKS } = await import('../lib/preflight/content-checks.mjs');
  const { SITE_CHECKS } = await import('../lib/preflight/site-checks.mjs');
  const { runChecks } = await import('../preflight.mjs');
  const trust = trustBarItems({ trustBarUnconfirmed: [{ factId: 'brief:SG18', value: 'since 2016' }, { factId: 'brief:SG18', value: '60 hotels and motels' }] });
  assert.deepEqual(trust.map((item) => [item.id, item.factId]), [['trust-brief:SG18', 'brief:SG18']]);
  assert.match(trust[0].description, /since 2016; 60 hotels and motels/);
  assert.deepEqual(trustBarItems(null), []);
  const [about] = ownerTodoItems({ schema_version: 'sf/handoff-owner-todo/v1', items: [{ id: 'OT-1', type: 'confirm', blocking: true, page_id: 'about', section_id: 'm2', text: '15, 12 and 14 years' }] });
  const ctx = { pages: [{ id: 'about', route: '/about-us/' }, { id: 'home', route: '/' }], imported: { pages: [{ route: '/', citedFacts: ['brief:SG18'] }] }, signoff: { items: [...trust, about] } };
  const pending = runChecks(ctx, CONTENT_CHECKS.filter((check) => check.code === 'owner_signoff_pending')).holds;
  assert.deepEqual(pending.map((hold) => hold.items), [['/'], ['/about-us/ m2']]);
  // Stand-in contact details by their form, marked or not.
  const built = new Map([['/', '<p>Call +1 (416) 555-0142</p>'], ['/about-us/', '<p>Call +1 (416) 555-2042, hello@motelpilot.com</p>']]);
  const standIn = runChecks({ ...ctx, built }, SITE_CHECKS.filter((check) => check.code === 'contact_details_stand_in')).holds;
  assert.deepEqual(standIn.map((hold) => hold.items), [['/']]);
});
