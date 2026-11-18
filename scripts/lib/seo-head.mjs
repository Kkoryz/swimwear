// Stage 10: what a page's <head> and site files say to search engines, derived only from the page, the site identity
// and the site plan (no re-planning of copy or links). Shared by the layout, the sitemap/robots endpoints and the SEO
// audit so the built site and its checks cannot disagree.

import { blogPostingSchema } from './blog.mjs';
import { lastModified } from './page-dates.mjs';
import { e164, parseAddress, placeNode, postalAddress } from './site-company.mjs';
import { SHARE_SIZE, shareImageSrc } from './share-image.mjs';
import { pageReviewer, personSchema, teamSchemas } from './site-people.mjs';
import crawlerPolicy from '../../config/crawler-policy.json' with { type: 'json' };

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
// contact: the company's details (site-contact.json); company: the company behind the site (site-company.json). Their
// stand-ins are stated too (claude-seo seo-schema; owner 2026-11-17): the launch preflight holds until they are replaced.
export function siteSchemas({ page, identity, trail, contact = null, company = null }) {
  const schemas = [];
  const present = new Set((page.jsonLd || []).flatMap((item) => [item['@type']].flat()));
  if (identity && page.route === '/') {
    if (!present.has('WebSite')) schemas.push({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': websiteId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), publisher: { '@id': organizationId(identity) } });
    if (!present.has('Organization')) schemas.push({ '@context': 'https://schema.org', '@type': 'Organization', '@id': organizationId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), logo: absoluteUrl(identity, identity.schemaLogo.src), ...(page.seo?.description ? { description: page.seo.description } : {}), ...organizationDetails({ contact, company }) });
  }
  // Every other page names the company by its @id (publisher, provider): a short Organization node there too, so a page
  // read alone resolves it (site13 claude-seo audit 2026-11-17, L-4: #organization defined on the home page only).
  else if (identity && !present.has('Organization')) {
    // Its email and sales contactPoint too, as the home page states them (RateHarbor claude-seo audit 2026-11-17, M-10:
    // the shared node carried no contact the pages show).
    const { areaServed, email, contactPoint } = organizationDetails({ contact, company });
    schemas.push({ '@context': 'https://schema.org', '@type': 'Organization', '@id': organizationId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), ...(identity.schemaLogo?.src ? { logo: absoluteUrl(identity, identity.schemaLogo.src) } : {}), ...(areaServed ? { areaServed } : {}), ...(email ? { email } : {}), ...(contactPoint ? { contactPoint } : {}) });
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

// Owner 2026-11-17 ("法定名称和街道先不要放上去"): the company's legal name and its street (with the postal code) are
// stated nowhere for now, neither on the pages nor in the structured data (the Organization keeps its name and a city,
// region and country address); their stand-ins stay in src/data/site-company.json and on the sign-off list. Every
// JSON-LD block a page carries goes through withheldCompanyDetails, Site Factory's own included.
export const WITHHELD_COMPANY_KEYS = Object.freeze(['legalName', 'streetAddress', 'postalCode']);
export function withheldCompanyDetails(value) {
  if (Array.isArray(value)) return value.map(withheldCompanyDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !WITHHELD_COMPANY_KEYS.includes(key)).map(([key, inner]) => [key, withheldCompanyDetails(inner)]));
}

// Every JSON-LD block a page carries: its own (stage 07) structured data with absolute URLs, the site identity's name,
// URL and logo on WebSite/Organization (stage 00 owns them), and a BreadcrumbList only from the visible trail.
// The company for the Organization (T-1 of the four-site audit 2026-11-17; Google's Organization properties):
// PostalAddress, founding date, service area, profiles (sameAs), email, E.164 telephone and the sales contactPoint.
// Without a company record the address is read from the contact details (no stand-in phrase). The legal name and the
// street are withheld for now (WITHHELD_COMPANY_KEYS).
export function organizationDetails({ contact = null, company = null } = {}) {
  const telephone = e164(contact?.phone);
  const address = postalAddress(withheldCompanyDetails(company?.address ?? parseAddress(contact?.address)));
  const sameAs = company?.sameAs?.length ? company.sameAs : contact?.same_as ?? [];
  const areaServed = (company?.serviceArea ?? []).map(placeNode);
  return {
    ...(company?.foundingDate ? { foundingDate: company.foundingDate } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
    ...(telephone ? { telephone } : {}),
    ...(address ? { address } : {}),
    ...(areaServed.length ? { areaServed } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(contact?.email || telephone ? { contactPoint: { '@type': 'ContactPoint', contactType: 'sales', ...(contact.email ? { email: contact.email } : {}), ...(telephone ? { telephone } : {}), ...(areaServed.length ? { areaServed } : {}) } } : {}),
  };
}

// Page types that offer a service (a product a manufacturer makes, a service, a city it is offered in): their pages
// carry a Service (T-2), never Product (no price or stock to state) or LocalBusiness (a remote service has no premises).
export const SERVICE_PAGE_TYPES = Object.freeze(['product_manufacturer', 'product_wholesale', 'solution', 'service', 'place', 'location']);
const CITY_PAGE_TYPES = new Set(['place', 'location']);
// The page itself (T-3, T-4): its WebPage type, which carries its dateModified.
const WEB_PAGE_TYPES = Object.freeze({ about: 'AboutPage', contact: 'ContactPage' });
// A page node of the page's own markup (an FAQPage is its questions, beside the page node).
const PAGE_NODE_TYPES = new Set(['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'ProfilePage', 'Blog']);
const isBlogHub = (page) => page.pageType === 'blog_hub' && !/\/page\/\d+\/$/.test(page.route);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const titleCase = (text) => text.trim().split(/\s+/).map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(' ');

// Where a service is offered: a city page's city (in the company's one country, when it serves one), else the
// company's service area.
function serviceArea(page, company, trail) {
  const area = (company?.serviceArea ?? []).map(placeNode);
  if (!CITY_PAGE_TYPES.has(page.pageType)) return area;
  const city = page.planned?.label ?? trail.at(-1)?.name;
  if (!city) return area;
  const countries = (company?.serviceArea ?? []).filter((entry) => entry.type === 'Country');
  return [{ '@type': 'City', name: city, ...(countries.length === 1 ? { containedInPlace: placeNode(countries[0]) } : {}) }];
}

// The Service a service page carries when its own markup has none (T-2): named from the page's primary query (a page
// imported before the plan rode on it: its H1), its type the plan's label (else its breadcrumb's), provided by the
// company, offered in its service area (a city page: its city).
export function serviceSchema({ page, identity, company = null, trail = [] }) {
  const url = absoluteUrl(identity, page.seo.canonical);
  const label = page.planned?.label ?? trail.at(-1)?.name ?? page.hero.heading;
  const areaServed = serviceArea(page, company, trail);
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: page.planned?.primaryQuery ? titleCase(page.planned.primaryQuery) : page.hero.heading,
    serviceType: label,
    description: page.seo.description,
    url,
    provider: { '@id': organizationId(identity) },
    ...(areaServed.length ? { areaServed } : {}),
  };
}

// The page node (T-3, T-4): AboutPage, ContactPage or WebPage, part of the website, with its content's last change
// (lib/page-dates.mjs); the blog's hub is the Blog, with its listed posts.
export function webPageSchema({ page, identity, modified = null, service = null }) {
  const url = absoluteUrl(identity, page.seo.canonical);
  const common = { url, name: page.seo.title, description: page.seo.description, ...(modified ? { dateModified: modified } : {}) };
  if (isBlogHub(page)) {
    const posts = page.blocks.filter((block) => block.type === 'postList').flatMap((block) => block.items);
    return { '@context': 'https://schema.org', '@type': 'Blog', '@id': `${url}#blog`, ...common, publisher: { '@id': organizationId(identity) }, isPartOf: { '@id': websiteId(identity) },
      ...(posts.length ? { blogPost: posts.map((post) => ({ '@type': 'BlogPosting', headline: post.title, url: absoluteUrl(identity, post.href), ...(post.date ? { datePublished: post.date } : {}) })) } : {}) };
  }
  const type = WEB_PAGE_TYPES[page.pageType] ?? 'WebPage';
  // Every page node names its publisher, the company, as the blog's does (four-site audit 2026-11-17, Fable's plan S2:
  // a parser reading one page alone found no publisher on it).
  return { '@context': 'https://schema.org', '@type': type, '@id': `${url}#webpage`, ...common, publisher: { '@id': organizationId(identity) }, isPartOf: { '@id': websiteId(identity) },
    ...(type !== 'WebPage' ? { about: { '@id': organizationId(identity) } } : {}),
    ...(service ? { mainEntity: { '@id': service } } : {}) };
}

// A page's own Service gets the company as provider and the service area it lacks (H-2: Site Factory writes no areaServed).
function withServiceArea(item, page, identity, company, trail, single) {
  if (item['@type'] !== 'Service') return item;
  const areaServed = item.areaServed ?? serviceArea(page, company, trail);
  // The page's one Service gets its @id (the page's #service): the page node names it as its main entity.
  // Its description is the page's summary (its meta description), as the Service 08 writes has it: Site Factory's is the
  // page's first sentence, about the order terms more often than the service (aloha L-7, RateHarbor L-1, audits 2026-11-17/18).
  const description = page.seo?.description || item.description;
  return { ...(single ? { '@id': `${absoluteUrl(identity, page.seo.canonical)}#service` } : {}), ...item, ...(description ? { description } : {}), provider: item.provider ?? { '@id': organizationId(identity) }, ...(areaServed?.length ? { areaServed } : {}) };
}

/** @param {{ page: any, identity: any, nav: any, builtRoutes?: Set<string> | null, contact?: any, company?: any, dates?: Record<string, { hash: string, modified: string }> | null, team?: { route: string, people: any[] } | null }} input @returns {Record<string, unknown>[]} */
export function pageSchemas({ page, identity, nav, builtRoutes = null, contact = null, company = null, dates = null, team = null }) {
  const trail = breadcrumbTrail(page, nav, builtRoutes);
  const single = (page.jsonLd || []).filter((item) => item['@type'] === 'Service').length === 1;
  const own = absoluteJsonLd((page.jsonLd || []).filter((item) => item['@type'] !== 'BreadcrumbList'), identity).map((item) => {
    if (!identity) return item;
    if (item['@type'] === 'Organization') {
      const details = organizationDetails({ contact, company });
      // Its own telephone only in E.164, its own address only as a PostalAddress naming a place; the company's win.
      const { telephone, address, ...rest } = item;
      const ownAddress = typeof address === 'string' ? postalAddress(parseAddress(address)) : address;
      return { ...rest, ...(e164(telephone) ? { telephone: e164(telephone) } : {}), ...(ownAddress ? { address: ownAddress } : {}), '@id': organizationId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), logo: absoluteUrl(identity, identity.schemaLogo.src), ...(!item.description && page.seo?.description ? { description: page.seo.description } : {}), ...details };
    }
    if (item['@type'] === 'WebSite') return { ...item, '@id': websiteId(identity), name: identity.siteName, url: absoluteUrl(identity, '/'), publisher: { '@id': organizationId(identity) } };
    // A list of child pages names built pages only (a held page is left out until it ships); positions stay 1..n.
    if (item['@type'] === 'ItemList' && builtRoutes && Array.isArray(item.itemListElement)) {
      const route = (entry) => { try { const url = new URL(entry.url ?? entry.item, `${identity.origin}/`); return url.origin === identity.origin ? url.pathname : null; } catch { return null; } };
      const kept = item.itemListElement.filter((entry) => { const path = route(entry); return path === null || builtRoutes.has(path); });
      return { ...item, itemListElement: kept.map((entry, index) => (entry.position === undefined ? entry : { ...entry, position: index + 1 })) };
    }
    return withServiceArea(linkOrganization(item, identity), page, identity, company, trail, single);
  });
  const types = new Set(own.flatMap((item) => [item['@type']].flat()));
  const link = { absolute: (path) => absoluteUrl(identity, path), organization: organizationId(identity) };
  const article = page.pageType === 'blog_post' && page.article && identity ? [blogPostingSchema(page, link)] : [];
  const service = identity && SERVICE_PAGE_TYPES.includes(page.pageType) && !types.has('Service') ? [serviceSchema({ page, identity, company, trail })] : [];
  const ownService = own.find((item) => item['@type'] === 'Service' && item['@id'])?.['@id'] ?? service[0]?.['@id'] ?? null;
  // A blog post's page is its BlogPosting; a page whose own markup has its page node keeps that.
  const pageNode = identity && page.pageType !== 'blog_post' && ![...types].some((type) => PAGE_NODE_TYPES.has(type)) ? [webPageSchema({ page, identity, modified: lastModified(page, dates), service: ownService })] : [];
  // The people the page's team section names (lib/site-people.mjs): a Person each, working for the company.
  const people = identity ? teamSchemas(page, link) : [];
  // The person who reviews the page's subject (lib/site-people.mjs pageReviewer, the "Reviewed by" line): the page
  // node's reviewedBy (schema.org WebPage), the Person by the @id of their place on the team section.
  const reviewer = identity ? pageReviewer(page, team) : null;
  const reviewedBy = reviewer ? (({ '@type': type, '@id': id, name, url, jobTitle }) => ({ '@type': type, '@id': id, name, url, ...(jobTitle ? { jobTitle } : {}) }))(personSchema({ name: reviewer.name, url: reviewer.href, jobTitle: reviewer.role }, link)) : null;
  const isPageNode = (item) => [item['@type']].flat().some((type) => PAGE_NODE_TYPES.has(type));
  // A page node of the page's own markup names the company as its publisher too (S2), unless it names one.
  const published = (item) => (identity && isPageNode(item) && !item.publisher ? { ...item, publisher: { '@id': organizationId(identity) } } : item);
  const nodes = [...own, ...pageNode].map(published).map((item) => (reviewedBy && [item['@type']].flat().some((type) => PAGE_NODE_TYPES.has(type) && type !== 'Blog') && !item.reviewedBy ? { ...item, reviewedBy } : item));
  return withheldCompanyDetails([...nodes.slice(0, own.length), ...article, ...service, ...nodes.slice(own.length), ...people, ...siteSchemas({ page, identity, trail, contact, company })]);
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
// The image is the SHARE_SIZE JPG cut from that photo (lib/share-image.mjs; the build cuts it), never the WebP itself;
// a competitor's placeholder photo is named as it is (the release refuses it).
export function socialMeta({ page, identity, image: given = null }) {
  const own = widest(given);
  const chosen = own && own.width >= SHARE_SIZE.width ? { ...own, alt: own.alt || identity?.siteName } : identity?.ogImage ? { ...identity.ogImage, alt: identity.siteName } : null;
  const share = shareImageSrc(chosen?.src);
  const image = chosen && share ? { src: share, ...SHARE_SIZE, alt: chosen.alt } : chosen;
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

// robots.txt: open with the sitemap once the site has its identity (origin); closed while it has none. The owner's
// decision for each kind of crawler is a group of its own (config/crawler-policy.json groups; four-site audit
// 2026-11-17, G1/A2: claude-seo seo-agentic robots-ai-groups — site13's robots.txt allowed everyone but said nothing
// of search, AI search or AI training): search engines, AI search and answer engines, AI training, each naming its
// crawlers, then everyone else.
export function robotsTxt(identity, policy = crawlerPolicy) {
  if (!identity?.origin) return 'User-agent: *\nDisallow: /\n';
  const groups = (policy?.groups ?? []).map((group) => {
    const tokens = (policy.allow ?? []).filter((crawler) => group.purposes.includes(crawler.purpose)).map((crawler) => crawler.token);
    return tokens.length ? `# ${group.label}\n${tokens.map((token) => `User-agent: ${token}`).join('\n')}\n${group.allow === false ? 'Disallow' : 'Allow'}: /\n` : null;
  }).filter(Boolean);
  return `${[...groups, '# Everyone else\nUser-agent: *\nAllow: /\n'].join('\n')}\nSitemap: ${absoluteUrl(identity, '/sitemap.xml')}\n`;
}

// llms.txt (llmstxt.org; four-site audit 2026-11-17, A6: claude-seo's Agentic Browsing counts it, Google Search does
// not use it): the site's name, what it is (the home page's description), and its indexable pages, each linked with
// its title and its meta description as the line about it. Nothing the pages do not say.
export function llmsTxt(pages, identity) {
  const listed = pages.filter(isIndexable).sort((left, right) => (left.route === '/' ? -1 : right.route === '/' ? 1 : 0));
  const home = listed.find((page) => page.route === '/');
  const line = (page) => `- [${page.seo.title}](${absoluteUrl(identity, page.seo.canonical)})${page.seo.description ? `: ${page.seo.description}` : ''}`;
  return `# ${identity?.siteName ?? home?.seo.title ?? 'Site'}\n${home?.seo.description ? `\n> ${home.seo.description}\n` : ''}\n## Pages\n\n${listed.map(line).join('\n')}\n`;
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
