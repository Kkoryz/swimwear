// The site's menus: the site plan's navigation (src/data/site-nav.json) limited to pages that exist, with the blog.
import siteNavData from '../data/site-nav.json';
import { BLOG_ROUTE } from '../../scripts/lib/blog.mjs';
import { blogData, builtRoutes } from './site-data';
import type { NavNode } from './types';

// Menus show pages that exist: a planned (unbuilt) page is left out unless it groups built pages, so a large site plan
// does not turn every page into a menu of hundreds of unlinked entries. site-nav.json keeps the whole plan.
const builtOnly = (nodes: NavNode[]): NavNode[] => nodes.flatMap((node) => {
  const children = builtOnly(node.children);
  return (node.route && builtRoutes.has(node.route)) || children.length ? [{ ...node, children }] : [];
});
const planNav = siteNavData as { header: NavNode[]; footer: NavNode[] };
// The blog joins the header menu once it has posts (the site plan does not list it); the footer repeats the header.
const withBlog = (nodes: NavNode[]) => (builtRoutes.has(BLOG_ROUTE) && !JSON.stringify(nodes).includes(`"${BLOG_ROUTE}"`) ? [...nodes, { label: (blogData as { navLabel?: string } | null)?.navLabel ?? 'Blog', route: BLOG_ROUTE, children: [] }] : nodes);
export const siteNav = { ...planNav, header: withBlog(builtOnly(planNav.header)), footer: builtOnly(planNav.footer) };
