// The searches the site's pages and articles are written for: each page's primary and secondaries from the Site
// Factory snapshot the site is built from (site.json siteFactory: pages.json's primary_query, keywords.json's primary
// and secondaries by page id), and each article's (a GEO article's geo.keyword). The cannibalisation checks read them
// (lib/prelaunch/cannibal.mjs, the publish gate in lib/blog-gates.mjs).

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { readJson } from './json-io.mjs';

// A path site.json names: as written, else the same path inside the site (a checkout elsewhere, the publishing
// workflow's: the snapshot is committed under inputs/, its absolute path is the machine's that built the site).
export function sitePath(root, path) {
  if (!path) return null;
  const full = isAbsolute(path) ? path : resolve(root, path);
  if (existsSync(full)) return full;
  const inside = String(path).replaceAll('\\', '/').match(/(?:^|\/)(inputs\/.+)$/)?.[1];
  return inside && existsSync(resolve(root, inside)) ? resolve(root, inside) : null;
}

// [{ route, pageId, role: 'primary' | 'secondary', query }] of the site's pages; source: the snapshot read, or null when
// there is none (then the list is empty).
export async function pageSearches(root) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const dir = sitePath(root, site.siteFactory);
  if (!dir) return { source: null, searches: [] };
  const plan = await readJson(resolve(dir, 'pages.json'), { pages: [] });
  const keywords = await readJson(resolve(dir, 'keywords.json'), { pages: [] });
  const rows = (plan.pages ?? []).filter((row) => row.url && !row.nav_only && !row.withheld);
  const byId = new Map((keywords.pages ?? []).map((page) => [page.id, page]));
  const searches = [];
  for (const row of rows) {
    const page = byId.get(row.page_id);
    const primary = row.primary_query || page?.primary?.query;
    if (primary) searches.push({ route: row.url, pageId: row.page_id, role: 'primary', query: primary });
    for (const secondary of page?.secondaries ?? []) if (secondary?.query) searches.push({ route: row.url, pageId: row.page_id, role: 'secondary', query: secondary.query });
  }
  return { source: dir, searches };
}

// [{ route, slug, role: 'primary', query }] of the articles: every post but a placeholder, its search its geo.keyword.
export const postSearches = (posts = []) => posts.filter((post) => post.status !== 'placeholder' && post.geo?.keyword?.trim()).map((post) => ({ route: `/blog/${post.slug}/`, slug: post.slug, status: post.status, role: 'primary', query: post.geo.keyword.trim() }));
