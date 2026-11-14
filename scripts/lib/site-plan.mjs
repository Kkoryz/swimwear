// The site plan (Site Factory's pages.json): how its pages relate (children, counterparts, siblings) and its menus.
// The importer, the placeholder pages and the related pages block read it; nothing here writes copy.

// Child-page cards for a plan slot: up to the slot's maximum as cards, every further child as a plain link, so the
// parent still links all its children. Nothing is dropped.
export function childCards(slot, children) {
  const cards = children.slice(0, slot.items[1]);
  const more = children.slice(slot.items[1]);
  return {
    items: cards.map((child) => ({ caption: child.label, href: child.url })),
    ...(more.length ? { links: more.map((child) => ({ label: child.label, href: child.url })) } : {}),
  };
}

// Pages the site plan relates a page to, closest first: its manufacturing or wholesale counterpart (sibling_page_id,
// either way), its parent (not the home page), its children, then its siblings of the same page type.
export function relatedPages(page, pagesPlan) {
  const byId = new Map(pagesPlan.pages.map((item) => [item.page_id, item]));
  const parent = byId.get(page.parent_page_id);
  const list = [
    byId.get(page.sibling_page_id),
    ...pagesPlan.pages.filter((item) => item.sibling_page_id === page.page_id),
    parent?.page_type === 'home' || parent?.nav_only ? null : parent,
    ...childPages(pagesPlan, page.page_id),
    ...pagesPlan.pages.filter((item) => item.parent_page_id === page.parent_page_id && item.page_type === page.page_type),
  ];
  return [...new Map(list.filter((item) => item && item.page_id !== page.page_id).map((item) => [item.page_id, item])).values()];
}

// Children of a page: its header-navigation children in nav order, else every page whose parent it is.
export function childPages(pagesPlan, parentId) {
  const byId = new Map(pagesPlan.pages.map((page) => [page.page_id, page]));
  const find = (nodes) => { for (const node of nodes || []) { if (node.page_id === parentId) return node; const hit = find(node.children); if (hit) return hit; } return null; };
  const node = find(pagesPlan.header_nav);
  const ids = node?.children?.length ? node.children.map((child) => child.page_id) : pagesPlan.pages.filter((page) => page.parent_page_id === parentId).map((page) => page.page_id);
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Header and footer navigation from the site plan (pages.json header_nav / footer_nav): labels and routes only. A node
// without a page (page_id null) or on a page the site never builds (nav_only: a specialist site's product hub, the owner
// 2026-09-30) is a menu heading: route null.
// A page the handoff withholds (withheld) is out of the menus, or a heading when pages hang under it.
function navTree(nodes, byId) {
  return nodes.flatMap((node) => {
    const target = node.page_id == null ? null : byId.get(node.page_id);
    if (node.page_id != null && !target) throw new Error(`navigation references a page missing from the site plan: ${node.page_id}`);
    const children = navTree(node.children || [], byId);
    if (target?.withheld && !children.length) return [];
    return [{ label: node.label, route: target && !target.nav_only && !target.withheld ? target.url : null, children }];
  });
}

export function siteNavFromPlan(pagesPlan) {
  const byId = new Map(pagesPlan.pages.map((item) => [item.page_id, item]));
  return { schemaVersion: 'seo-site-nav-v1', source: 'site-factory pages.json', brand: null, header: navTree(pagesPlan.header_nav || [], byId), footer: navTree(pagesPlan.footer_nav || [], byId) };
}
