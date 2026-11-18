import assert from 'node:assert/strict';
import test from 'node:test';

import { absoluteJsonLd, breadcrumbTrail, pageSchemas, robotsDirective, robotsTxt, serializeJsonLd, siteSchemas, sitemapXml, socialMeta } from '../lib/seo-head.mjs';

const identity = { siteName: 'Knit Pace', origin: 'https://knitpace.com', schemaLogo: { src: '/icon-512.png', width: 512, height: 512 }, ogImage: { src: '/og-image.png', width: 1200, height: 630 } };
const nav = { header: [{ label: 'Products', route: '/products/', children: [{ label: 'Leggings Manufacturer', route: '/leggings-manufacturer/', children: [] }] }], footer: [] };
const page = (route, extra = {}) => ({ route, status: 'authored', pageType: 'product_manufacturer', hero: { heading: 'H1' }, seo: { title: 'T', description: 'D', canonical: route }, jsonLd: [], ...extra });

test('breadcrumbs follow the navigation path from Home; home has none', () => {
  assert.deepEqual(breadcrumbTrail(page('/leggings-manufacturer/'), nav).map((crumb) => crumb.name), ['Home', 'Products', 'Leggings Manufacturer']);
  assert.deepEqual(breadcrumbTrail(page('/about/', { hero: { heading: 'About us' } }), nav).map((crumb) => crumb.route), ['/', '/about/']);
  assert.deepEqual(breadcrumbTrail(page('/'), nav), []);
  assert.deepEqual(breadcrumbTrail(page('/leggings-manufacturer/'), nav, new Set(['/', '/leggings-manufacturer/'])).map((crumb) => crumb.route), ['/', '/leggings-manufacturer/'], 'an unbuilt hub is not a crumb');
});

test('home carries WebSite and Organization; other pages a BreadcrumbList; 07 site types are not duplicated', () => {
  const home = siteSchemas({ page: page('/'), identity, trail: [] });
  assert.deepEqual(home.map((item) => item['@type']), ['WebSite', 'Organization']);
  assert.equal(home[1].logo, 'https://knitpace.com/icon-512.png');
  const withOrg = siteSchemas({ page: page('/', { jsonLd: [{ '@type': 'Organization' }] }), identity, trail: [] });
  assert.deepEqual(withOrg.map((item) => item['@type']), ['WebSite']);
  const crumbs = siteSchemas({ page: page('/leggings-manufacturer/'), identity, trail: breadcrumbTrail(page('/leggings-manufacturer/'), nav) });
  // Another page carries a short Organization for the @id its nodes name (site13 claude-seo audit L-4), then its trail.
  assert.deepEqual(crumbs.map((item) => item['@type']), ['Organization', 'BreadcrumbList']);
  assert.deepEqual(Object.keys(crumbs[0]).sort(), ['@context', '@id', '@type', 'logo', 'name', 'url']);
  assert.equal(crumbs[1].itemListElement[2].item, 'https://knitpace.com/leggings-manufacturer/');
  // With the company's contact it also carries the email and the sales contactPoint (RateHarbor audit 2026-11-17, M-10).
  const contacted = siteSchemas({ page: page('/leggings-manufacturer/'), identity, trail: [], contact: { email: 'sales@knitpace.com' } });
  assert.equal(contacted[0].email, 'sales@knitpace.com');
  assert.deepEqual(contacted[0].contactPoint, { '@type': 'ContactPoint', contactType: 'sales', email: 'sales@knitpace.com' });
});

test('placeholders are noindex and out of the sitemap; robots opens only with an identity', () => {
  assert.equal(robotsDirective(page('/x/', { status: 'placeholder' })), 'noindex, follow');
  assert.equal(robotsDirective(page('/x/')), null);
  const xml = sitemapXml([page('/a/'), page('/b/', { status: 'placeholder' })], identity);
  assert.match(xml, /<loc>https:\/\/knitpace.com\/a\/<\/loc>/);
  assert.doesNotMatch(xml, /\/b\//);
  assert.match(robotsTxt(identity), /Sitemap: https:\/\/knitpace.com\/sitemap.xml/);
  assert.equal(robotsTxt(null), 'User-agent: *\nDisallow: /\n');
  const tags = Object.fromEntries(socialMeta({ page: page('/a/'), identity }).map((tag) => [tag.key, tag.content]));
  assert.equal(tags['og:url'], 'https://knitpace.com/a/');
  // The site's share image as the 1200x630 JPG the build cuts from it (lib/share-image.mjs).
  assert.deepEqual([tags['og:image'], tags['og:image:width'], tags['og:image:height']], ['https://knitpace.com/og-image-og.jpg', '1200', '630']);
  assert.equal(tags['twitter:card'], 'summary_large_image');
  // A hero wide enough (its 1536 size from the srcset) is shared as the JPG cut from it, never the WebP.
  const hero = { src: '/media/h-960.webp', srcset: '/media/h-480.webp 480w, /media/h-960.webp 960w, /media/h-1536.webp 1536w', width: 960, height: 640, alt: 'A model' };
  const own = Object.fromEntries(socialMeta({ page: page('/a/'), identity, image: hero }).map((tag) => [tag.key, tag.content]));
  assert.deepEqual([own['og:image'], own['og:image:width'], own['og:image:height'], own['og:image:alt']], ['https://knitpace.com/media/h-og.jpg', '1200', '630', 'A model']);
  // A competitor's placeholder photo is never cut into a share image: it is named as it is (the release refuses it).
  const reference = { src: '/media/reference/h-1536.webp', width: 1536, height: 1024, alt: 'A model' };
  assert.equal(Object.fromEntries(socialMeta({ page: page('/a/'), identity, image: reference }).map((tag) => [tag.key, tag.content]))['og:image'], 'https://knitpace.com/media/reference/h-1536.webp');
});

test('every page node names the company as its publisher (S2)', () => {
  const ids = (schemas) => schemas.filter((item) => ['WebPage', 'AboutPage', 'ContactPage'].includes(item['@type'])).map((item) => item.publisher?.['@id']);
  const nav = { header: [], footer: [] };
  for (const pageType of ['general', 'about', 'contact', 'solution']) assert.deepEqual(ids(pageSchemas({ page: page('/a/', { pageType }), identity, nav })), ['https://knitpace.com/#organization'], pageType);
  // A page node of the page's own markup gets it too; one naming its publisher keeps it.
  const own = page('/a/', { jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'A' }] });
  assert.deepEqual(ids(pageSchemas({ page: own, identity, nav })), ['https://knitpace.com/#organization']);
  const named = page('/a/', { jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'A', publisher: { '@id': 'https://other.example/#org' } }] });
  assert.deepEqual(ids(pageSchemas({ page: named, identity, nav })), ['https://other.example/#org']);
});

test('root-relative URLs in a page JSON-LD become absolute; other values are untouched', () => {
  const [schema] = absoluteJsonLd([{ '@type': 'Organization', name: '/not-a-url', url: '/', logo: '/icon-512.png', sameAs: ['https://x.com/a'] }], identity);
  assert.deepEqual(schema, { '@type': 'Organization', name: '/not-a-url', url: 'https://knitpace.com/', logo: 'https://knitpace.com/icon-512.png', sameAs: ['https://x.com/a'] });
});

test('page schemas: identity owns the organisation, the breadcrumb list is the visible trail, and < is escaped', () => {
  const home = page('/', { pageType: 'home', jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Working title', url: '/' }] });
  const schemas = pageSchemas({ page: home, identity, nav });
  assert.deepEqual(schemas.map((item) => item['@type']), ['Organization', 'WebPage', 'WebSite']);
  assert.equal(schemas[0].name, 'Knit Pace');
  assert.equal(schemas[0].logo, 'https://knitpace.com/icon-512.png');
  const product = page('/leggings-manufacturer/', { jsonLd: [{ '@type': 'BreadcrumbList', itemListElement: [{ name: 'Other' }] }, { '@type': 'Service', url: '/leggings-manufacturer/' }] });
  const types = pageSchemas({ page: product, identity, nav }).map((item) => item['@type']);
  assert.deepEqual(types, ['Service', 'WebPage', 'Organization', 'BreadcrumbList']);
  assert.equal(pageSchemas({ page: product, identity, nav })[3].itemListElement[1].name, 'Products');
  assert.equal(JSON.parse(serializeJsonLd({ text: '</script>' })).text, '</script>');
  assert.doesNotMatch(serializeJsonLd({ text: '</script>' }), /</);
});

test('a hub list of child pages names built pages only, renumbered', () => {
  const hub = page('/products/', { jsonLd: [{ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'A', url: '/a/' }, { '@type': 'ListItem', position: 2, name: 'Held', url: '/held/' }, { '@type': 'ListItem', position: 3, name: 'B', url: 'https://knitpace.com/b/' }] }] });
  const [list] = pageSchemas({ page: hub, identity, nav, builtRoutes: new Set(['/', '/products/', '/a/', '/b/']) });
  assert.deepEqual(list.itemListElement.map((item) => [item.position, item.name]), [[1, 'A'], [2, 'B']]);
});

test('the company is one entity: the Organization, the WebSite publisher and a Service provider share its @id', async () => {
  const { pageSchemas } = await import('../lib/seo-head.mjs');
  const identity = { siteName: 'Strandmill', origin: 'https://strandmill.com', schemaLogo: { src: '/logo.png' } };
  const service = pageSchemas({ page: page('/bikinis/', { hero: { heading: 'Bikinis' }, jsonLd: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'S', provider: { '@type': 'Organization', name: 'Strandmill' } }] }), identity, nav: {} })[0];
  assert.equal(service.provider['@id'], 'https://strandmill.com/#organization');
  const home = pageSchemas({ page: page('/', { pageType: 'home' }), identity, nav: {} });
  assert.equal(home.find((item) => item['@type'] === 'Organization')['@id'], 'https://strandmill.com/#organization');
  assert.deepEqual(home.find((item) => item['@type'] === 'WebSite').publisher, { '@id': 'https://strandmill.com/#organization' });
  const other = pageSchemas({ page: page('/x/', { pageType: 'general', jsonLd: [{ '@type': 'Product', name: 'P', brand: { '@type': 'Organization', name: 'Another' } }] }), identity, nav: {} })[0];
  assert.equal(other.brand['@id'], undefined, 'another company is not linked');
});

test('the Organization states the company contact details, stand-ins included, with an E.164 telephone and a PostalAddress', async () => {
  const { organizationDetails } = await import('../lib/seo-head.mjs');
  const contact = { email: 'sales@example.com', phone: '+86 575 8888 0000', address: 'Shaoxing, Zhejiang, China', same_as: ['https://www.linkedin.com/company/x'] };
  // Stand-ins are stated (claude-seo seo-schema; owner 2026-11-17): the launch preflight holds them, not the markup.
  const stated = organizationDetails({ contact: { ...contact, placeholder: true } });
  assert.equal(stated.email, 'sales@example.com');
  assert.equal(stated.telephone, '+8657588880000');
  assert.deepEqual(stated.address, { '@type': 'PostalAddress', addressLocality: 'Shaoxing', addressRegion: 'Zhejiang', addressCountry: 'CN' });
  assert.deepEqual(stated.sameAs, ['https://www.linkedin.com/company/x']);
  assert.deepEqual(stated.contactPoint, { '@type': 'ContactPoint', contactType: 'sales', email: 'sales@example.com', telephone: '+8657588880000' });
  // A number that is not E.164 (no country code, or the template's short "+1 555 0100") is left out; so is an address
  // that names no place.
  const thin = organizationDetails({ contact: { email: 'a@b.com', phone: '+1 555 0100', address: 'Office address to be confirmed' } });
  assert.equal(thin.telephone, undefined);
  assert.equal(thin.address, undefined);
});

test('a page\'s own Service is described by the page\'s summary, not its first sentence (aloha L-7, RateHarbor L-1, 2026-11-18)', async () => {
  const { pageSchemas } = await import('../lib/seo-head.mjs');
  const page = { route: '/printing/', pageType: 'solution', status: 'authored', seo: { title: 'Printing', description: 'Custom printing for swimwear brands, sampled before bulk.', canonical: '/printing/' }, hero: { heading: 'Printing' }, blocks: [],
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'Printing', description: 'Orders start at 50 pieces per style in each colour.' }] };
  const service = pageSchemas({ page, identity: { origin: 'https://example.com', siteName: 'Ex', schemaLogo: { src: '/l.png' } }, nav: {} }).find((item) => item['@type'] === 'Service');
  assert.equal(service.description, 'Custom printing for swimwear brands, sampled before bulk.');
});
