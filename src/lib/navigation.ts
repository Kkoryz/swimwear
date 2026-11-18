// The site's menus: the site plan's navigation (src/data/site-nav.json) limited to pages that exist, with the blog.
import siteNavData from '../data/site-nav.json';
import { BLOG_ROUTE, heldHubRoutes } from '../../scripts/lib/blog.mjs';
import { blogData, builtRoutes, pages } from './site-data';
import type { NavNode } from './types';

// Menus show pages that exist: a planned (unbuilt) page is left out unless it groups built pages, so a large site plan
// does not turn every page into a menu of hundreds of unlinked entries. site-nav.json keeps the whole plan.
// A held blog hub (no post published yet: lib/blog.mjs hubPages) is built for review but left out of the menus; it joins
// them again with its first published post (Strandmill audit 2026-11-17).
// So is a page Site Factory holds (status hold: built for review, noindex): the menus link indexable pages only (the
// SEO audit's nav_links_noindex, four-site audit 2026-11-17: swimwear's Launch page, two hotel-rm pages, Staylumen's
// held service pages were in the header).
const heldHubs = heldHubRoutes(pages);
const heldPages = new Set(pages.filter((page) => page.status === 'hold').map((page) => page.route));
const inMenus = (route: string | null | undefined) => Boolean(route && builtRoutes.has(route) && !heldHubs.has(route) && !heldPages.has(route));
const builtOnly = (nodes: NavNode[]): NavNode[] => nodes.flatMap((node) => {
  const children = builtOnly(node.children);
  return inMenus(node.route) || children.length ? [{ ...node, children }] : [];
});
const planNav = siteNavData as { header: NavNode[]; footer: NavNode[] };
// The blog joins the header menu once it has a published post (the site plan does not list it); the footer repeats the header.
const withBlog = (nodes: NavNode[]) => (inMenus(BLOG_ROUTE) && !JSON.stringify(nodes).includes(`"${BLOG_ROUTE}"`) ? [...nodes, { label: (blogData as { navLabel?: string } | null)?.navLabel ?? 'Blog', route: BLOG_ROUTE, children: [] }] : nodes);
export const siteNav = { ...planNav, header: withBlog(builtOnly(planNav.header)), footer: builtOnly(planNav.footer) };
