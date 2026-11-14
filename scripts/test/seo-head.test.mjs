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
  assert.equal(crumbs[0].itemListElement[2].item, 'https://knitpace.com/leggings-manufacturer/');
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
  assert.equal(tags['og:image'], 'https://knitpace.com/og-image.png');
  assert.equal(tags['twitter:card'], 'summary_large_image');
  // A hero served at 960 shares its 1536 size from the srcset.
  const hero = { src: '/media/h-960.webp', srcset: '/media/h-480.webp 480w, /media/h-960.webp 960w, /media/h-1536.webp 1536w', width: 960, height: 640, alt: 'A model' };
  const own = Object.fromEntries(socialMeta({ page: page('/a/'), identity, image: hero }).map((tag) => [tag.key, tag.content]));
  assert.deepEqual([own['og:image'], own['og:image:width'], own['og:image:height']], ['https://knitpace.com/media/h-1536.webp', '1536', '1024']);
});

test('root-relative URLs in a page JSON-LD become absolute; other values are untouched', () => {
  const [schema] = absoluteJsonLd([{ '@type': 'Organization', name: '/not-a-url', url: '/', logo: '/icon-512.png', sameAs: ['https://x.com/a'] }], identity);
  assert.deepEqual(schema, { '@type': 'Organization', name: '/not-a-url', url: 'https://knitpace.com/', logo: 'https://knitpace.com/icon-512.png', sameAs: ['https://x.com/a'] });
});

test('page schemas: identity owns the organisation, the breadcrumb list is the visible trail, and < is escaped', () => {
  const home = page('/', { jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Working title', url: '/' }] });
  const schemas = pageSchemas({ page: home, identity, nav });
  assert.deepEqual(schemas.map((item) => item['@type']), ['Organization', 'WebSite']);
  assert.equal(schemas[0].name, 'Knit Pace');
  assert.equal(schemas[0].logo, 'https://knitpace.com/icon-512.png');
  const product = page('/leggings-manufacturer/', { jsonLd: [{ '@type': 'BreadcrumbList', itemListElement: [{ name: 'Other' }] }, { '@type': 'Service', url: '/leggings-manufacturer/' }] });
  const types = pageSchemas({ page: product, identity, nav }).map((item) => item['@type']);
  assert.deepEqual(types, ['Service', 'BreadcrumbList']);
  assert.equal(pageSchemas({ page: product, identity, nav })[1].itemListElement[1].name, 'Products');
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
  const service = pageSchemas({ page: { route: '/bikinis/', hero: { heading: 'Bikinis' }, jsonLd: [{ '@context': 'https://schema.org', '@type': 'Service', name: 'S', provider: { '@type': 'Organization', name: 'Strandmill' } }] }, identity, nav: {} })[0];
  assert.equal(service.provider['@id'], 'https://strandmill.com/#organization');
  const home = pageSchemas({ page: { route: '/', hero: { heading: 'H' }, jsonLd: [] }, identity, nav: {} });
  assert.equal(home.find((item) => item['@type'] === 'Organization')['@id'], 'https://strandmill.com/#organization');
  assert.deepEqual(home.find((item) => item['@type'] === 'WebSite').publisher, { '@id': 'https://strandmill.com/#organization' });
  const other = pageSchemas({ page: { route: '/x/', hero: { heading: 'X' }, jsonLd: [{ '@type': 'Product', name: 'P', brand: { '@type': 'Organization', name: 'Another' } }] }, identity, nav: {} })[0];
  assert.equal(other.brand['@id'], undefined, 'another company is not linked');
});

test('the Organization states the company contact details only once they are real', async () => {
  const { organizationContact } = await import('../lib/seo-head.mjs');
  const contact = { email: 'sales@example.com', phone: '+86 575 0000', address: 'Shaoxing, Zhejiang, China', same_as: ['https://www.linkedin.com/company/x'] };
  assert.deepEqual(organizationContact({ ...contact, placeholder: true }), {});
  const stated = organizationContact(contact);
  assert.equal(stated.email, 'sales@example.com');
  assert.deepEqual(stated.sameAs, ['https://www.linkedin.com/company/x']);
  assert.equal(stated.contactPoint.contactType, 'sales');
});
