// Stage 10: what a page's <head> and site files say to search engines, derived only from the page, the site identity
// and the site plan (no re-planning of copy or links). Shared by the layout, the sitemap/robots endpoints and the SEO
// audit so the built site and its checks cannot disagree.

import { blogPostingSchema } from './blog.mjs';
import { lastModified } from './page-dates.mjs';

// Placeholder pages and pages Site Factory holds (shown for the owner's review until released) are not indexed.
export const isIndexable = (page) => page.status !== 'placeholder' && page.status !== 'hold';
export const robotsDirective = (page) => (isIndexable(page) ? null : 'noindex, follow');

export function absoluteUrl(identity, path) {
  return identity?.origin ? new URL(path, `${identity.origin}/`).href : path;
}

// Structured data URLs must be absolute: root-relative url/item/logo/image/@id values in a page's own JSON-LD are
// resolved against the site origin (serialisation only; no other value changes).
const URL_KEYS = new Set(['url', 'item', 'logo', 'image', '@id']);
export function absoluteJsonLd(value, identity, key = '') {
  if (Array.isArray(value)) return value.map((item) => absoluteJsonLd(item, identity, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, absoluteJsonLd(item, identity, name)]));
  return URL_KEYS.has(key) && typeof value === 'string' && value.startsWith('/') ? absoluteUrl(identity, value) : value;
}

// Breadcrumb trail: the navigation path to the page (a typical user path, not the URL), from Home, through built
// pages only (a crumb must be a page that exists); at least two items. Home has none. A page missing from the
// navigation gets Home > page. The visible trail and the BreadcrumbList are both this list.
/** @param {any} page @param {any} [nav] @param {Set<string> | null} [builtRoutes] @returns {{ name: string, route: string }[]} */
export function breadcrumbTrail(page, nav = {}, builtRoutes = null) {
  if (page.route === '/') return [];
  const find = (nodes, path) => {
    for (const node of nodes || []) {
      const next = [...path, { name: node.label, route: node.route }];
      if (node.route === page.route) return next;
      const hit = find(node.children, next);
      if (hit) return hit;
    }
    return null;
  };
  // A page outside the navigation sits under its parent when it names one (a post under the blog).
  const path = [nav.header, nav.footer].map((tree) => find(tree, [])).find(Boolean) ?? [...(page.parent ? [page.parent] : []), { name: page.hero.heading, route: page.route }];
  const built = (crumb) => crumb.route === page.route || !builtRoutes || builtRoutes.has(crumb.route);
  // A menu heading without a page (route null) is no step of the trail.
  return [{ name: 'Home', route: '/' }, ...path.filter((crumb) => crumb.route && crumb.route !== '/' && built(crumb))];
}

// One entity for the company and one for the website, referenced by @id wherever the markup names them.
export const organizationId = (identity) => `${absoluteUrl(identity, '/')}#organization`;
export const websiteId = (identity) => `${absoluteUrl(identity, '/')}#website`;
// The company wherever a page's own markup names it (provider, brand, manufacturer, publisher) gets the site's @id.
function linkOrganization(value, identity) {
  if (Array.isArray(value)) return value.map((item) => linkOrganization(item, identity));
  if (!value || typeof value !== 'object') return value;
  const linked = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, linkOrganization(item, identity)]));
  return linked['@type'] === 'Organization' && linked.name === identity.siteName && !linked['@id'] ? { '@id': organizationId(identity), ...linked } : linked;
}

// Site-level structured data stage 10 adds: WebSite and Organization on the home page (unless the page's own JSON-LD
// has them), and the BreadcrumbList of the visible trail.
// contact: the company's details (site-contact.json); stated in the Organization only once they are real.
export function siteSchemas({ page, identity, trail, contact = null }) {
  const schemas = [];
  const present = new Set((page.jsonLd || []).flatMap((item) => [item['@type']].flat()));
  if (identity && page.route === '/') {
    if (!present.has('WebSite')) schemas.push({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': websiteId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), publisher: { '@id': organizationId(identity) } });
    if (!present.has('Organization')) schemas.push({ '@context': 'https://schema.org', '@type': 'Organization', '@id': organizationId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), logo: absoluteUrl(identity, identity.schemaLogo.src), ...organizationContact(contact) });
  }
  if (trail.length >= 2) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: absoluteUrl(identity, crumb.route) })),
    });
  }
  return schemas;
}

// Every JSON-LD block a page carries: its own (stage 07) structured data with absolute URLs, the site identity's name,
// URL and logo on WebSite/Organization (stage 00 owns them), and a BreadcrumbList only from the visible trail.
// Contact details for the Organization (Google's recommended email, telephone, address, sameAs, contactPoint).
export function organizationContact(contact) {
  if (!contact || contact.placeholder) return {};
  return {
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.phone ? { telephone: contact.phone } : {}),
    ...(contact.address ? { address: contact.address } : {}),
    ...(contact.same_as?.length ? { sameAs: contact.same_as } : {}),
    ...(contact.email || contact.phone ? { contactPoint: { '@type': 'ContactPoint', contactType: 'sales', ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { telephone: contact.phone } : {}) } } : {}),
  };
}

/** @param {{ page: any, identity: any, nav: any, builtRoutes?: Set<string> | null, contact?: any }} input @returns {Record<string, unknown>[]} */
export function pageSchemas({ page, identity, nav, builtRoutes = null, contact = null }) {
  const own = absoluteJsonLd((page.jsonLd || []).filter((item) => item['@type'] !== 'BreadcrumbList'), identity).map((item) => {
    if (!identity) return item;
    if (item['@type'] === 'Organization') return { ...item, '@id': organizationId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), logo: absoluteUrl(identity, identity.schemaLogo.src), ...organizationContact(contact) };
    if (item['@type'] === 'WebSite') return { ...item, '@id': websiteId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), publisher: { '@id': organizationId(identity) } };
    // A list of child pages names built pages only (a held page is left out until it ships); positions stay 1..n.
    if (item['@type'] === 'ItemList' && builtRoutes && Array.isArray(item.itemListElement)) {
      const route = (entry) => { try { const url = new URL(entry.url ?? entry.item, `${identity.origin}/`); return url.origin === identity.origin ? url.pathname : null; } catch { return null; } };
      const kept = item.itemListElement.filter((entry) => { const path = route(entry); return path === null || builtRoutes.has(path); });
      return { ...item, itemListElement: kept.map((entry, index) => (entry.position === undefined ? entry : { ...entry, position: index + 1 })) };
    }
    return linkOrganization(item, identity);
  });
  const article = page.pageType === 'blog_post' && page.article && identity ? [blogPostingSchema(page, { absolute: (path) => absoluteUrl(identity, path), organization: organizationId(identity) })] : [];
  return [...own, ...article, ...siteSchemas({ page, identity, trail: breadcrumbTrail(page, nav, builtRoutes), contact })];
}

// JSON-LD inside <script>: "<" is escaped so copy can never close the element.
const LESS_THAN = String.fromCharCode(92) + 'u003c'; // the JSON escape for <
export const serializeJsonLd = (item) => JSON.stringify(item).replace(/</g, LESS_THAN);

// A photo at the widest size its srcset offers (a hero's src is a mid size; sharing wants the large one).
function widest(media) {
  if (!media?.srcset || !media.width) return media;
  const best = media.srcset.split(',').map((part) => part.trim().split(/\s+/)).map(([src, size]) => ({ src, width: Number.parseInt(size, 10) })).filter((item) => item.src && item.width > 0).sort((left, right) => right.width - left.width)[0];
  return best && best.width > media.width ? { ...media, src: best.src, width: best.width, height: Math.round((media.height * best.width) / media.width) } : media;
}

// Open Graph and Twitter card tags: the page's own title and description, its canonical URL, and its own photo
// (image: the hero or article photo, at least 1200px wide) before the site's share image; an article is og:type article.
/** @param {{ page: any, identity: any, image?: any }} input */
export function socialMeta({ page, identity, image: given = null }) {
  const own = widest(given);
  const image = own && own.width >= 1200 ? { ...own, alt: own.alt || identity?.siteName } : identity?.ogImage ? { ...identity.ogImage, alt: identity.siteName } : null;
  return [
    ['property', 'og:type', page.pageType === 'blog_post' ? 'article' : 'website'],
    page.article && ['property', 'article:published_time', page.article.datePublished],
    page.article && ['property', 'article:modified_time', page.article.dateModified],
    identity && ['property', 'og:site_name', identity.siteName],
    ['property', 'og:title', page.seo.title],
    ['property', 'og:description', page.seo.description],
    identity && ['property', 'og:url', absoluteUrl(identity, page.seo.canonical)],
    image && ['property', 'og:image', absoluteUrl(identity, image.src)],
    image && ['property', 'og:image:width', String(image.width)],
    image && ['property', 'og:image:height', String(image.height)],
    image && ['property', 'og:image:alt', image.alt],
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
  ].filter(Boolean).map(([attribute, key, content]) => ({ attribute, key, content }));
}

// sitemap.xml: canonical, indexable pages only, with lastmod when the page's content date is recorded and still matches
// (scripts/lib/page-dates.mjs); never the build time, since Google uses lastmod only when it is accurate.
/** @param {any[]} pages @param {any} identity @param {Record<string, { hash: string, modified: string }> | null} [dates] */
export function sitemapXml(pages, identity, dates = null) {
  const urls = pages.filter(isIndexable).map((page) => {
    const modified = lastModified(page, dates);
    return `  <url><loc>${absoluteUrl(identity, page.seo.canonical)}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// robots.txt: open with the sitemap once the site has its identity (origin); closed while it has none.
export function robotsTxt(identity) {
  if (!identity?.origin) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(identity, '/sitemap.xml')}\n`;
}

// Whether robots.txt lets a crawler (user-agent token) fetch a path: the group naming the token (else "*"), then the
// longest matching Allow/Disallow rule, Allow winning ties (RFC 9309, as in claude-seo scripts/agentic_check.py).
export function robotsAllows(robots, token, path = '/') {
  const groups = [];
  let current = null;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(field)) {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if (current && /^(allow|disallow)$/i.test(field)) current.rules.push({ allow: /^allow$/i.test(field), path: value });
  }
  const group = groups.find((item) => item.agents.includes(token.toLowerCase())) ?? groups.find((item) => item.agents.includes('*'));
  const matches = (group?.rules || []).filter((rule) => rule.path && path.startsWith(rule.path));
  if (!matches.length) return true;
  const best = matches.sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow))[0];
  return best.allow;
}
