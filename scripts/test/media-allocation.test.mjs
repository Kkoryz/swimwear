import assert from 'node:assert/strict';
import test from 'node:test';

import { allocateSite, namedCategory, topicWords } from '../lib/media-allocation.mjs';
import { mediaSlots } from '../lib/media-slots.mjs';
import { planLibrary } from '../lib/image-plan.mjs';
import briefs from '../../config/image-briefs.json' with { type: 'json' };

const photo = (src, category, extra = {}) => ({ src, alt: extra.alt ?? src, width: 10, height: 10, category, ...extra });
const cards = (...headings) => ({ id: 'cards', type: 'featureGrid', heading: 'Services', variant: 'media', items: headings.map((heading) => ({ heading, paragraphs: ['P'] })) });
const components = (media) => ({ hero: 'plain', media: { placeholders: ['process'], ...media } });

test('topic words drop plurals and filler; a text names its most specific category', () => {
  assert.deepEqual([...topicWords('Socks and the Dresses')], ['sock', 'dresse']);
  assert.equal(namedCategory('Sports Bra Styles', ['bra', 'sports bra', 'socks']), 'sports bra');
  assert.equal(namedCategory('Everyday Sock Assortments', ['bra', 'socks']), 'socks');
  assert.equal(namedCategory('Private Label', ['bra', 'socks']), null);
});

test('a card on a product page never takes the line\'s general photo of another product', () => {
  const media = {
    routeCategories: { '/bra-manufacturer/': 'bra' },
    routePools: { '/bra-manufacturer/': { product: [photo('bra-1', 'bra')] } },
    pools: { product: [photo('briefs-1', 'general'), photo('briefs-2', 'general')] },
  };
  const page = { route: '/bra-manufacturer/', pageType: 'product_manufacturer', blocks: [cards('Private Label', 'Fit Development')] };
  const { byRoute, unfilled } = allocateSite({ pages: [page], components: { ...components(media), pageTypes: { product_manufacturer: { mediaModules: [] } } } });
  const [first, second] = byRoute['/bra-manufacturer/'][0];
  assert.equal(first.src, 'bra-1');
  assert.equal(second.slot, 'product', 'no bra photo left: an image slot, not a briefs photo');
  assert.deepEqual(unfilled.map(({ category, topic }) => [category, topic]), [['bra', 'Fit Development']]);
});

test('the site\'s own product photos come before the library, on the pages they name', () => {
  const media = { routeCategories: { '/bra-manufacturer/': 'bra' }, routePools: { '/bra-manufacturer/': { product: [photo('bra-1', 'bra'), photo('bra-2', 'bra')] } } };
  const sitePhotos = [
    photo('/media/site/real-bra.webp', null, { class: 'product', alt: 'a lace bra on a table', pages: ['/bra-manufacturer/'] }),
    photo('/media/site/real-other.webp', null, { class: 'product', alt: 'a pajama set', pages: ['/pajama-manufacturer/'] }),
  ];
  const page = { route: '/bra-manufacturer/', pageType: 'product_manufacturer', blocks: [cards('Lace Bras', 'Fit Development')] };
  const { byRoute } = allocateSite({ pages: [page], components: { ...components(media), pageTypes: { product_manufacturer: { mediaModules: [] } } }, sitePhotos });
  assert.deepEqual(byRoute['/bra-manufacturer/'][0].map((item) => item.src), ['/media/site/real-bra.webp', 'bra-1']);
  assert.ok(byRoute['/bra-manufacturer/'][0].every((item) => !('origin' in item)), 'nothing on the page says where a photo came from');
});

test('a photo made for a topic goes to that topic; a card naming a category takes that category\'s photo', () => {
  const media = {
    routeCategories: { '/': 'general', '/wholesale-socks/': 'socks' },
    routePools: { '/wholesale-socks/': { product: [photo('socks-1', 'socks')] } },
    pools: { product: [photo('plain-1', 'general'), photo('qc-1', 'general', { topic: 'Quality Control' })] },
  };
  const page = { route: '/', pageType: 'home', blocks: [cards('Quality Control', 'Socks')] };
  const { byRoute } = allocateSite({ pages: [page], components: components(media) });
  assert.deepEqual(byRoute['/'][0].map((item) => item.src), ['qc-1', 'socks-1']);
});

test('factory photos follow the heading; a card for an unbuilt page gets no photo', () => {
  const sitePhotos = [photo('/media/site/warehouse.webp', null, { class: 'process', alt: 'a tidy warehouse with cartons' }), photo('/media/site/quality-inspection.webp', null, { class: 'process', alt: 'an inspector checking finished garments' })];
  const page = { route: '/about/', pageType: 'about', blocks: [
    { id: 's', type: 'splitMedia', heading: 'Quality Inspection Before Shipping', paragraphs: ['P'] },
    { id: 'g', type: 'gallery', variant: 'grid', items: [{ caption: 'Bras', href: '/bra-manufacturer/' }, { caption: 'Pajamas', href: '/pajama-manufacturer/' }] },
  ] };
  const media = { routeCategories: { '/bra-manufacturer/': 'bra' }, routePools: { '/bra-manufacturer/': { product: [photo('bra-1', 'bra')] } } };
  const isBuilt = (href) => href !== '/pajama-manufacturer/';
  const { byRoute } = allocateSite({ pages: [page], components: { ...components(media), pageTypes: { about: { mediaModules: [] } } }, sitePhotos, isBuilt });
  assert.equal(byRoute['/about/'][0][0].src, '/media/site/quality-inspection.webp');
  assert.equal(byRoute['/about/'][1][0].src, 'bra-1');
  assert.equal(byRoute['/about/'][1].length, 1, 'the unbuilt page shows no card, so no photo');
});

test('the image plan makes one photo per card topic, named after it', () => {
  const pages = [{ route: '/bra-manufacturer/', pageType: 'product_manufacturer', blocks: [cards('Private Label', 'Fit Development')] }];
  const plan = planLibrary({ pages, components: { hero: 'plain', pageTypes: { product_manufacturer: { mediaModules: [] } } }, line: 'underwear', briefs: { ...briefs, placeholderKinds: ['process'] }, styleRefs: { product: [{ path: 'p.jpg', subject: '' }] } });
  const topical = plan.entries.filter((entry) => entry.topic);
  assert.deepEqual(topical.map((entry) => [entry.id, entry.category]), [['bra-product-private-label', 'bra'], ['bra-product-fit-development', 'bra']]);
  assert.match(topical[0].subject, /bra, photographed for the page section "Private Label"/);
});

test('a gallery shows cards and links for built pages; names of unbuilt ones only when none is built, at most 12', async () => {
  const { galleryShown } = await import('../lib/gallery.mjs');
  const built = (href) => href === '/a/';
  const items = [{ caption: 'A', href: '/a/' }, ...Array.from({ length: 20 }, (_, index) => ({ caption: `P${index}`, href: `/p${index}/` }))];
  const shown = galleryShown({ items, links: [{ label: 'A', href: '/a/' }, { label: 'X', href: '/x/' }] }, built);
  assert.deepEqual([shown.cards.map((entry) => entry.item.caption), shown.names.length, shown.links.map((link) => link.label)], [['A'], 0, ['A']]);
  assert.equal(galleryShown({ items: items.slice(1) }, built).names.length, 12);
});

test('a built page the plan put among the extra links takes a card while the gallery has room', async () => {
  const { galleryShown } = await import('../lib/gallery.mjs');
  const built = (href) => ['/a/', '/b/', '/y/', '/z/'].includes(href);
  const block = { items: [{ caption: 'A', href: '/a/' }, { caption: 'B', href: '/b/' }, { caption: 'C', href: '/c/' }], links: [{ label: 'X', href: '/x/' }, { label: 'Y', href: '/y/' }, { label: 'Z', href: '/z/' }] };
  const shown = galleryShown(block, built);
  assert.deepEqual([shown.cards.map((entry) => entry.item.caption), shown.links.map((link) => link.label)], [['A', 'B', 'Y'], ['Z']]);
  const slots = mediaSlots({ type: 'gallery', ...block }, 'grid', {}, { isBuilt: built });
  assert.equal(slots.length, 3);
});

test('a reworded card heading keeps the photo made for the old wording', () => {
  const pageWith = (...headings) => [{ route: '/bra-manufacturer/', pageType: 'product_manufacturer', blocks: [cards(...headings)] }];
  const args = { components: { hero: 'plain', pageTypes: { product_manufacturer: { mediaModules: [] } } }, line: 'underwear', briefs: { ...briefs, placeholderKinds: ['process'] }, styleRefs: { product: [{ path: 'p.jpg', subject: '' }] } };
  const first = planLibrary({ pages: pageWith('Private Label Branding', 'Fit Development'), ...args });
  const made = { entries: first.entries.map((entry) => ({ ...entry, status: 'generated' })) };
  const again = planLibrary({ pages: pageWith('Private Label and Branding Options', 'Colour Matching'), ...args, previous: made });
  const status = Object.fromEntries(again.entries.filter((entry) => entry.topic).map((entry) => [entry.id, entry.status]));
  assert.equal(status['bra-product-private-label-branding'], 'generated', 'reworded: kept');
  assert.equal(status['bra-product-colour-matching'], 'planned', 'a new topic: made');
});

test('a plain photo already made stays when the categories\' order shifts its rotating subject', () => {
  const args = { components: { hero: 'plain', pageTypes: { product_manufacturer: { mediaModules: [] } } }, line: 'underwear', briefs: { ...briefs, placeholderKinds: ['process'] }, styleRefs: { product: [{ path: 'p.jpg', subject: '' }] } };
  // An intro photo row: plain product photos (no topic), their subjects rotating with the category's position.
  const page = (route) => ({ route, pageType: 'product_manufacturer', blocks: [{ id: 'intro', type: 'intro', variant: 'gallery', heading: 'Range', paragraphs: ['P'] }] });
  const first = planLibrary({ pages: [page('/bra-manufacturer/'), page('/socks-manufacturer/')], ...args });
  const made = { entries: first.entries.map((entry) => ({ ...entry, status: 'generated' })) };
  // The same pages listed the other way round: the categories' order, and so every rotating subject, changes.
  const again = planLibrary({ pages: [page('/socks-manufacturer/'), page('/bra-manufacturer/')], ...args, previous: made });
  const fresh = planLibrary({ pages: [page('/socks-manufacturer/'), page('/bra-manufacturer/')], ...args });
  assert.notDeepEqual(fresh.entries.map((entry) => entry.subject), first.entries.map((entry) => entry.subject), 'the order does shift the subjects');
  assert.ok(again.entries.length >= 8);
  assert.deepEqual(again.entries.filter((entry) => entry.status !== 'generated').map((entry) => entry.id), []);
});

test('reference placeholder photos repeat on a page once each is used; a site\'s own library never does', () => {
  const page = { route: '/a/', pageType: 'about', blocks: [{ id: 'g', type: 'gallery', variant: 'grid', items: [{}, {}, {}] }] };
  const pools = { product: [photo('r1', 'general'), photo('r2', 'general')] };
  const reference = allocateSite({ pages: [page], components: { hero: 'plain', pageTypes: { about: { mediaModules: [] } }, media: { origin: 'reference-placeholder', pools } } });
  assert.deepEqual(reference.byRoute['/a/'][0].map((media) => media.src), ['r1', 'r2', 'r1']);
  const own = allocateSite({ pages: [page], components: { hero: 'plain', pageTypes: { about: { mediaModules: [] } }, media: { origin: 'generated', pools } } });
  assert.equal(own.byRoute['/a/'][0][2].slot, 'product');
});

test('the photo-and-form module asks for one lifestyle photo; the plain form for none', async () => {
  const { mediaSlots, resolveVariant } = await import('../lib/media-slots.mjs');
  const form = { id: 'form', type: 'form', fields: [], submitLabel: 'Send' };
  assert.deepEqual(mediaSlots(form, 'media', {}), ['lifestyle']);
  assert.deepEqual(mediaSlots(form, 'plain', {}), []);
  assert.deepEqual(mediaSlots(form, undefined, {}), []);
  assert.equal(resolveVariant(form, 'contact', 0, { pageTypes: { contact: { form: 'media' } } }), 'media');
});

test('a page\'s portrait hero on phones goes with its landscape hero as the phone source; a page without one keeps one photo', async () => {
  const { pairPhoneHeroes, PHONE_MEDIA } = await import('../apply-reference-analysis.mjs');
  const entry = (route, width, height, src) => ({ item: { evidence: { route } }, media: { src, alt: '', width, height } });
  const entries = pairPhoneHeroes([entry('/', 2560, 1371, '/h1.webp'), entry('/', 1080, 2043, '/h2.webp'), entry('/about/', 1920, 800, '/h3.webp'), entry('/about/', 1600, 1000, '/h4.webp')]);
  assert.deepEqual(entries[0].media.sources, [{ media: PHONE_MEDIA, src: '/h2.webp', width: 1080, height: 2043 }]);
  assert.equal(entries[2].media.sources, undefined, 'no portrait photo on that page');
  assert.equal(entries[1].media.sources, undefined);
});

test('a photo too square for a banner or a mosaic place takes the layout that shows it; the default hero is the widest photo that fits a hero frame', async () => {
  const { fitsFrames } = await import('../lib/media-ratio.mjs');
  const { rankHeroes } = await import('../apply-reference-analysis.mjs');
  const square = { width: 600, height: 600 };
  const wide = { width: 1600, height: 900 };
  assert.equal(fitsFrames([16 / 7], square), false, 'a square photo in a 16 / 7 banner shows 44%');
  assert.equal(fitsFrames([16 / 7], wide), true);
  assert.equal(fitsFrames([1.27, 2], square), false, 'a square photo in a mosaic\'s wide place');
  assert.equal(fitsFrames([0.61, 1], { width: 713, height: 475 }), false, 'a wide photo in a mosaic\'s narrow place on a tablet');
  assert.equal(fitsFrames([0.61, 1], { width: 800, height: 1000 }), true);
  assert.equal(fitsFrames([16 / 7], { slot: 'process' }), true, 'an image slot has no photo to cut');
  const strip = { src: '/strip.png', width: 900, height: 300 };
  const portrait = { src: '/phone.png', width: 1080, height: 2043 };
  const banner = { src: '/banner.png', width: 2560, height: 1280 };
  assert.deepEqual(rankHeroes([strip, portrait, banner]).map((hero) => hero.src), ['/banner.png', '/strip.png', '/phone.png']);
});

test('a place whose shape is fixed gets a photo that fits it first: a wide row a wide photo, even when a square one is listed first', () => {
  const square = photo('square', 'general', { width: 600, height: 600 });
  const wide = photo('wide', 'general', { width: 1600, height: 700 });
  const page = { route: '/', pageType: 'home', status: 'authored', hero: {}, blocks: [{ id: 'row', type: 'splitMedia', variant: 'wide', heading: 'Row', paragraphs: ['P'] }, { id: 'side', type: 'splitMedia', variant: 'single', heading: 'Side', paragraphs: ['P'] }] };
  const media = { origin: 'library', pools: { process: [square, wide] }, placeholders: [] };
  const { byRoute } = allocateSite({ pages: [page], components: { hero: 'plain', media, pageTypes: { home: { mediaModules: [] } } } });
  const [row, side] = byRoute['/'];
  assert.equal(row[0].src, 'wide', 'the banner takes the photo it can show');
  assert.equal(side[0].src, 'square', 'a frame that follows its photo takes what is left');
});

test('an extra photo row splits a run of text where its content is most even, after any section but a photo one', async () => {
  const { withMediaModules } = await import('../lib/media-slots.mjs');
  const text = (id, words) => ({ id, type: 'intro', heading: id, paragraphs: ['word '.repeat(words)] });
  // A run of a short section, a related list and a long FAQ: the row goes between the list and the FAQ.
  const page = { route: '/socks/', pageType: 'solution', blocks: [text('a', 20), { id: 'related', type: 'relatedPages', heading: 'Related', links: [] }, { id: 'faq', type: 'faq', heading: 'FAQ', items: [{ question: 'Q?', answer: 'word '.repeat(300) }] }, { id: 'cta', type: 'cta', heading: 'Go', paragraphs: [], cta: { label: 'Go', href: '/' } }] };
  const components = { pageTypes: { solution: { mediaModules: [] } }, photoBreaks: { '/socks/': 1 } };
  assert.deepEqual(withMediaModules(page, components, {}).map((block) => block.id), ['a', 'related', 'media-module-1', 'faq', 'cta']);
});

test('every framed block prefers photos that fit its usual ratio: case cards landscape ones, so no wide photo lands among portraits', () => {
  const tall = photo('tall', 'general', { width: 600, height: 1100 });
  const wide = photo('wide', 'general', { width: 971, height: 568 });
  const page = { route: '/s/', pageType: 'solution', status: 'authored', hero: {}, blocks: [{ id: 'cases', type: 'caseStudies', items: [{ client: 'A', title: 'A', summary: 'S' }] }] };
  const media = { origin: 'library', pools: { product: [tall, wide] }, placeholders: [] };
  const { byRoute } = allocateSite({ pages: [page], components: { hero: 'plain', media, pageTypes: { solution: { mediaModules: [] } } } });
  assert.equal(byRoute['/s/'][0][0].src, 'wide', 'a 4 / 3 card takes the landscape photo first');
});

test('a section\'s own variant set by the site wins over the one it came with from the competitor\'s module', async () => {
  const { resolveVariant } = await import('../lib/media-slots.mjs');
  const row = { id: 's3', type: 'splitMedia', variant: 'dual' };
  assert.equal(resolveVariant(row, 'product_manufacturer', 1, { pageTypes: { product_manufacturer: { splitSequence: ['single'] } } }), 'dual', 'a page-type pattern does not override the section\'s module');
  assert.equal(resolveVariant(row, 'product_manufacturer', 1, { pageTypes: { product_manufacturer: { blocks: { s3: { variant: 'single' } } } } }), 'single');
  // Every block with variants takes the page type's value, then the site's (a FAQ the blueprint added to a page type
  // whose competitor page has none follows pageTypes.<type>.faq, as CSS_HOOKS.md promises), else the renderer's default.
  const faq = { id: 'faq', type: 'faq', items: [] };
  assert.equal(resolveVariant(faq, 'about', 0, { faq: 'accordion', pageTypes: { about: { faq: 'dark-cards' } } }), 'dark-cards');
  assert.equal(resolveVariant(faq, 'about', 0, { faq: 'accordion', pageTypes: { about: {} } }), undefined, 'the site-wide FAQ treatment is the renderer\'s own default');
  assert.equal(resolveVariant({ id: 's2', type: 'splitMedia' }, 'about', 0, { splitMedia: 'alternate', pageTypes: { about: {} } }), undefined, 'components.splitMedia orders the rows, it is no row variant');
  assert.equal(resolveVariant({ id: 'steps', type: 'process', steps: [] }, 'home', 0, { pageTypes: { home: { process: 'photo-cards' } } }), 'photo-cards');
  assert.equal(resolveVariant({ id: 'x', type: 'sources', items: [] }, 'home', 0, { pageTypes: { home: { sources: 'x' } } }), undefined, 'a block without variants takes none');
  // A split row's photo side: the site's choice for the section (as the competitor's row has it), else the site-wide order.
  const { splitSide } = await import('../lib/media-slots.mjs');
  assert.deepEqual([0, 1, 2].map((index) => splitSide(row, 'about', index, { splitMedia: 'alternate' })), ['media-end', 'media-start', 'media-end']);
  assert.equal(splitSide(row, 'about', 1, { splitMedia: 'media-start' }), 'media-start');
  assert.equal(splitSide(row, 'about', 0, { splitMedia: 'alternate', pageTypes: { about: { blocks: { s3: { side: 'media-start' } } } } }), 'media-start');
});

test("a reference's title tiles do not take a section's points, and a home page takes the reference home's own walls", async () => {
  const { resolveVariant, withMediaModules } = await import('../lib/media-slots.mjs');
  const grid = { id: 'g', type: 'featureGrid', variant: 'cards', items: [] };
  assert.equal(resolveVariant(grid, 'solution', 0, { pageTypes: { solution: { featureGrid: 'bullets' } } }), 'bullets');
  assert.equal(resolveVariant(grid, 'solution', 0, { pageTypes: { solution: { featureGrid: 'media' } } }), 'cards');
  const text = (id) => ({ id, type: 'intro', heading: id, paragraphs: ['A long paragraph of words that runs on.'] });
  const home = { route: '/', pageType: 'home', blocks: ['a', 'b', 'c', 'd'].map(text) };
  const walls = (components) => withMediaModules(home, components, {}).filter((block) => block.type === 'gallery').length;
  assert.equal(walls({ pageTypes: { home: {} } }), 0, 'no walls of its own: the blueprint\'s structure');
  assert.equal(walls({ pageTypes: { home: { mediaModules: [{ at: 0.5, type: 'band' }] } } }), 1);
});

test('a section of cards shown as a bullet list is one list again, however many grids it was split into', async () => {
  const { withSectionVisuals } = await import('../lib/media-slots.mjs');
  const item = (title) => ({ heading: title, paragraphs: [`${title} text.`] });
  const blocks = [{ id: 'm2', type: 'featureGrid', variant: 'cards', heading: 'Points', items: [item('a'), item('b'), item('c')] }, { id: 'm2-2', type: 'featureGrid', variant: 'cards', continues: 'm2', items: [item('d'), item('e')] }];
  const listed = withSectionVisuals(blocks, { pageTypes: { solution: { featureGrid: 'bullets' } } }, 'solution');
  assert.deepEqual(listed.map((block) => [block.id, block.items.length]), [['m2', 5]]);
  const grids = withSectionVisuals(blocks, { pageTypes: { solution: { featureGrid: 'media' } } }, 'solution');
  assert.deepEqual(grids.map((block) => block.id), ['m2', 'm2-2'], 'cards keep their rows');
});
