// The home page links its categories in its body (site13 blind audit M8: the home body linked no product page, and
// Site Factory's links did not include them; the header menu alone does not count). The categories are the site
// tree's hubs under the home page (products and solutions hubs, page types HUB_TYPES) and their children, from the
// header menu: a hub that is a menu heading (site.json navOnly, route null) is not a page, its children are linked; a
// built hub is linked with its children. The importer adds the module (placeHomeCategories) when the home copy's own
// links do not reach each of them; the SEO audit fails a built home page that still misses one
// (homeCategoryProblems, home_categories_unlinked).

import { indexBefore } from './block-position.mjs';

export const HUB_TYPES = Object.freeze(['products_hub', 'solutions_hub']);
export const HOME_CATEGORIES_ID = 'categories';

// The hubs and their children: [{ label, route (null for a menu heading), links: [{ label, href }] }]. nav: the site
// nav (site-nav.json, siteNavFromPlan); typeOf(route): the page type at a route; linkable(route): a built, indexable
// page.
export function homeCategoryGroups(nav, typeOf, linkable) {
  return (nav?.header ?? []).filter((entry) => entry.children?.length && (entry.route === null || HUB_TYPES.includes(typeOf(entry.route)))).map((entry) => ({
    label: entry.label,
    route: entry.route && linkable(entry.route) ? entry.route : null,
    links: entry.children.filter((child) => child.route && linkable(child.route)).map((child) => ({ label: child.label, href: child.route })),
  })).filter((group) => group.route || group.links.length);
}

// Every route the categories module links: each built hub, then its children.
export const homeCategoryTargets = (groups) => [...new Set(groups.flatMap((group) => [...(group.route ? [group.route] : []), ...group.links.map((link) => link.href)]))];

// The routes a page's blocks link: card and button hrefs, link lists and the copy's inline [label](/route/) links.
export const routesLinkedIn = (blocks) => new Set([...JSON.stringify(blocks ?? []).matchAll(/(?:"href":"|\]\()(\/[^"\s)#?]*)/g)].map((match) => match[1]));

// Adds the categories module to the home page's blocks when its own links miss a category: a related-pages module
// (the reference's link cards) headed by the hubs' menu labels ("Products and Solutions", no new copy), each built
// hub then its children, before the page's related pages (else its FAQ, else its closing call). Returns the block
// added, or null.
export function placeHomeCategories(blocks, { groups, hero = null }) {
  const targets = homeCategoryTargets(groups);
  const reached = routesLinkedIn([...blocks, ...(hero ? [hero] : [])]);
  if (!targets.length || targets.every((route) => reached.has(route))) return null;
  const labels = groups.map((group) => group.label);
  const links = groups.flatMap((group) => [...(group.route ? [{ label: group.label, href: group.route }] : []), ...group.links]);
  const taken = new Set(blocks.map((block) => block.id));
  let id = HOME_CATEGORIES_ID;
  for (let n = 2; taken.has(id); n += 1) id = `${HOME_CATEGORIES_ID}-${n}`;
  const block = { id, type: 'relatedPages', heading: labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0], links };
  blocks.splice(indexBefore(blocks, ['relatedPages', 'faq', 'cta']), 0, block);
  return block;
}

// The build check: the home page's <main> links every category. pages: the site's pages (route, pageType, status);
// built: html by route; isIndexable: the SEO head's rule.
export function homeCategoryProblems(pages, built, nav, isIndexable) {
  const html = built.get('/');
  if (!html) return [];
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const groups = homeCategoryGroups(nav, (route) => byRoute.get(route)?.pageType, (route) => Boolean(byRoute.get(route) && built.has(route) && isIndexable(byRoute.get(route))));
  const main = html.slice(Math.max(0, html.indexOf('<main')), html.includes('</main>') ? html.indexOf('</main>') : html.length);
  const linked = new Set([...main.matchAll(/<a\b[^>]*\shref="(\/[^"#?]*)/g)].map((match) => match[1]));
  const missing = homeCategoryTargets(groups).filter((route) => !linked.has(route));
  return missing.length ? [{ route: '/', issue: 'home_categories_unlinked', detail: `the home page body links no ${missing.slice(0, 5).join(' ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}` }] : [];
}
