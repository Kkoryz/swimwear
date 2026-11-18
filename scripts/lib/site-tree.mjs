// The whole site from Site Factory's site tree (04_1_site_tree/tree.json: every page, its parent and its other parents)
// and its routes (06_1_plan/site_plan.json: each page's flat URL, kind and name): the site plan the template builds
// from (the shape of the former pages.json): page types, parents, main keywords and the menus. Site Factory writes
// some pages (07); every other page of the tree is built as a marked placeholder until it does.

import { BLUEPRINTS } from './page-blueprints.mjs';

export const SITE_TREE_PLAN_SCHEMA = 'sf/pages-from-tree/v1';

// A general page of the tree (site:<name>) by its name: the template's page type for it; any other is "general".
const GENERAL_TYPES = Object.freeze({ about: 'about', contact: 'contact', privacy: 'privacy', blog: 'blog_hub' });
// General pages in the header menu, in this order; the others go to the footer.
const HEADER_GENERAL = Object.freeze(['about', 'case_studies_portfolio', 'blog', 'contact']);

const stem = (page) => (page.id.startsWith('site:') ? page.id.slice(5) : null);

// The template's page type of a tree page.
export function pageTypeOf(page, pages) {
  if (page.type === 'home') return 'home';
  if (page.type === 'product') return 'product_manufacturer';
  if (page.type === 'service') return 'solution';
  // A city page and the hub of them (Site Factory 2026-11-16, Staylumen: San Diego, Scottsdale, Nashville under
  // Locations): pages of their own, not services, so no services list shows them.
  if (page.type === 'place') return 'place';
  if (page.type === 'hub') {
    const children = pages.filter((child) => child.parent === page.id);
    if (children.some((child) => child.type === 'product')) return 'products_hub';
    return children.length && children.every((child) => child.type === 'place') ? 'places_hub' : 'solutions_hub';
  }
  return GENERAL_TYPES[stem(page)] ?? 'general';
}

// The site plan: { pages: [{ page_id, page_type, label, url, parent_page_id, also_parent_ids, primary_query }],
// header_nav, footer_nav }. Every tree page needs a route; a route without a tree page is refused. A page the site plan
// lists as not built (unbuilt_pages, e.g. owner_held_back) is left out: no route, no menu entry, no link.
// pageTypes: the page types the authoring package declares (page_type, Site Factory 07: a legal page is privacy), which
// a page takes over the tree's; one the template has no blueprint for fails.
// A tree page marked nav_only is a menu heading the site never builds (as a handoff's nav_only status says); a category
// group the site plan merges into a hub (category_hub_merges, aloha 2026-11-17: "Aloha Shirts" into /products/) has no
// route of its own: it is a heading at its hub's URL.
export function sitePlanFromTree({ tree: given, sitePlan, keywords = null, pageTypes = new Map() }) {
  const unbuilt = new Set((sitePlan?.unbuilt_pages ?? []).map((page) => page.id));
  const tree = { ...given, pages: given.pages.filter((page) => !unbuilt.has(page.id)) };
  const orphans = tree.pages.filter((page) => unbuilt.has(page.parent) || page.also_parents?.some((id) => unbuilt.has(id)));
  if (orphans.length) throw new Error(`${orphans.map((page) => page.id).join(', ')} sits under a page the site plan does not build`);
  for (const [id, type] of pageTypes) if (!BLUEPRINTS[type]) throw new Error(`${id} declares page type ${type}, which the template does not have (${Object.keys(BLUEPRINTS).join(', ')})`);
  const merged = new Map((sitePlan?.category_hub_merges ?? []).filter((merge) => merge.id && merge.merged_into).map((merge) => [merge.id, merge]));
  const routes = { ...sitePlan?.routes };
  for (const [id, merge] of merged) if (!routes[id] && routes[merge.merged_into]) routes[id] = { url: routes[merge.merged_into].url, page_name: merge.page_name };
  const primary = new Map((keywords?.pages ?? []).map((page) => [page.id, page.primary?.query]).filter(([, query]) => query));
  const missing = tree.pages.filter((page) => !routes[page.id]);
  if (missing.length) throw new Error(`site plan has no route for ${missing.map((page) => page.id).join(', ')}`);
  const extra = Object.keys(sitePlan?.routes ?? {}).filter((id) => !unbuilt.has(id) && !tree.pages.some((page) => page.id === id));
  if (extra.length) throw new Error(`site plan routes pages the tree does not have: ${extra.join(', ')}`);
  const pages = tree.pages.map((page) => ({
    page_id: page.id,
    page_type: pageTypes.get(page.id) || pageTypeOf(page, tree.pages),
    label: routes[page.id].page_name || page.name,
    url: routes[page.id].url,
    parent_page_id: page.parent,
    ...(page.nav_only === true || (merged.has(page.id) && !sitePlan?.routes?.[page.id]) ? { nav_only: true } : {}),
    ...(page.also_parents?.length ? { also_parent_ids: page.also_parents } : {}),
    ...(primary.has(page.id) ? { primary_query: primary.get(page.id) } : {}),
  }));
  const byId = new Map(pages.map((page) => [page.page_id, page]));
  const childrenOf = (id) => tree.pages.filter((page) => page.parent === id).map((page) => page.id);
  const node = (id) => ({ label: byId.get(id).label, page_id: id, children: childrenOf(id).filter((child) => byId.get(child).page_type !== 'general').map(node) });
  const home = tree.pages.find((page) => page.type === 'home');
  const hubs = childrenOf(home?.id).filter((id) => byId.get(id).page_type.endsWith('_hub') && byId.get(id).page_type !== 'blog_hub');
  // The cities' hub closes the header (Site Factory 2026-11-16, Staylumen: "主导航末尾放 Locations").
  const placeHubs = hubs.filter((id) => byId.get(id).page_type === 'places_hub');
  const general = tree.pages.filter((page) => page.type === 'general');
  const inHeader = HEADER_GENERAL.map((name) => general.find((page) => stem(page) === name)).filter(Boolean);
  return {
    schemaVersion: SITE_TREE_PLAN_SCHEMA,
    source: 'Site Factory 04_1_site_tree/tree.json + 06_1_plan/site_plan.json',
    pages,
    // The hubs with their tree below them, then the general pages people look for first, then the cities' hub; the
    // rest in the footer.
    header_nav: [...hubs.filter((id) => !placeHubs.includes(id)).map(node), ...inHeader.map((page) => ({ label: byId.get(page.id).label, page_id: page.id, children: [] })), ...placeHubs.map(node)],
    footer_nav: general.filter((page) => !inHeader.includes(page)).map((page) => ({ label: byId.get(page.id).label, page_id: page.id, children: [] })),
  };
}
