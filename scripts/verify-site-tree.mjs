#!/usr/bin/env node

// Checks a built site (dist/) against the Site Factory snapshot it was built from (site.json siteFactory): every page
// of the site's plan is built; no internal link is broken; every page has one H1; a page Site Factory wrote has 07's
// title and description; a placeholder page is noindex and out of the sitemap, a written one is in it; the menus are
// the plan's (the site tree's); each page's breadcrumb trail is its line of parents; a parent page links its children.
// Writes docs/research/site-tree-check.json and prints one line per check; exits 1 when one fails.
// Usage: node scripts/verify-site-tree.mjs

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { decode, distFile, internalLinks, parsePage, readBuiltPage } from './lib/built-site.mjs';
import { runMain } from './lib/cli.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { siteNavFromPlan } from './lib/site-plan.mjs';

// The checks of one built site: [{ check, passed, failures }].
export function treeChecks({ plan, authored, nav, built, sitemap, exists }) {
  const pages = plan.pages.filter((page) => !page.nav_only && !page.withheld);
  const byId = new Map(plan.pages.map((page) => [page.page_id, page]));
  const parsed = new Map([...built].filter(([, html]) => html).map(([route, html]) => [route, parsePage(html)]));
  const written = new Map((authored.pages ?? []).filter((page) => page.release_status === 'ready_for_template').map((page) => [page.url, page]));
  // Pages Site Factory holds are built for review with its title and description, noindex and out of the sitemap.
  const held = new Map((authored.pages ?? []).filter((page) => page.release_status === 'hold').map((page) => [page.url, page]));
  const inSitemap = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(decode(match[1]), 'https://x.test').pathname));
  const fail = (check, failures) => ({ check, passed: failures.length === 0, failures });
  const route = (page) => page.url;
  const ancestors = (page) => {
    const line = [];
    for (let at = byId.get(page.parent_page_id); at && at.page_type !== 'home'; at = byId.get(at.parent_page_id)) if (!at.nav_only) line.unshift(at.url);
    return line;
  };
  const trail = (html) => {
    const list = parsePage(html).jsonLd.map((block) => block.data).flatMap((data) => (Array.isArray(data?.['@graph']) ? data['@graph'] : [data])).find((data) => data?.['@type'] === 'BreadcrumbList');
    return (list?.itemListElement ?? []).map((item) => new URL(item.item, 'https://x').pathname);
  };
  const navRoutes = (nodes) => nodes.flatMap((node) => [node.route, ...navRoutes(node.children)]).filter(Boolean);
  // A blog hub with no published post is held (lib/blog.mjs hubPages): built noindex, out of the sitemap and the menus.
  const heldHub = (page) => page.page_type === 'blog_hub' && /noindex/.test(parsed.get(route(page))?.robots ?? '');
  const expectedNav = siteNavFromPlan(plan);
  return [
    fail('every planned page is built', pages.filter((page) => page.page_type !== 'blog_hub' && !built.get(route(page))).map(route)),
    fail('no broken internal link', [...built].filter(([, html]) => html).flatMap(([at, html]) => [...new Set(internalLinks(html))].filter((href) => !exists(href)).map((href) => `${at} -> ${href}`))),
    fail('one H1 a page', [...parsed].filter(([, page]) => page.headings.filter((heading) => heading.level === 1).length !== 1).map(([at, page]) => `${at} (${page.headings.filter((heading) => heading.level === 1).length})`)),
    fail('written and held pages carry 07\'s title and description', [...written, ...held].flatMap(([at, page]) => {
      const html = parsed.get(at);
      if (!html) return [`${at} not built`];
      return [html.title && decode(html.title) !== page.title && `${at} title "${html.title}"`, html.description && decode(html.description) !== page.meta_description && `${at} description`].filter(Boolean);
    })),
    fail('placeholders and held pages are noindex and out of the sitemap; written pages are in it', pages.filter((page) => built.get(route(page))).flatMap((page) => {
      const html = parsed.get(route(page));
      const placeholder = !written.has(route(page)) && page.page_type !== 'blog_hub';
      if (placeholder || heldHub(page)) return [!/noindex/.test(html.robots ?? '') && `${route(page)} indexable`, inSitemap.has(route(page)) && `${route(page)} in sitemap`].filter(Boolean);
      return written.has(route(page)) && !inSitemap.has(route(page)) ? [`${route(page)} missing from sitemap`] : [];
    })),
    fail('the menus are the site tree\'s', JSON.stringify(navRoutes(nav.header)) === JSON.stringify(navRoutes(expectedNav.header)) && JSON.stringify(navRoutes(nav.footer)) === JSON.stringify(navRoutes(expectedNav.footer)) ? [] : ['src/data/site-nav.json differs from the plan\'s menus']),
    fail('breadcrumbs follow the line of parents', pages.filter((page) => page.page_type !== 'home' && built.get(route(page))).flatMap((page) => {
      const expected = ['/', ...ancestors(page), route(page)];
      const actual = trail(built.get(route(page)));
      return JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${route(page)}: ${actual.join(' > ')} (tree: ${expected.join(' > ')})`];
    })),
    fail('a parent page links its children', pages.filter((page) => built.get(route(page))).flatMap((page) => {
      const links = new Set(internalLinks(built.get(route(page))));
      return pages.filter((child) => child.parent_page_id === page.page_id && built.get(route(child)) && !heldHub(child)).filter((child) => !links.has(route(child))).map((child) => `${route(page)} -> ${route(child)}`);
    })),
    fail('Site Factory\'s structural links and breadcrumb agree with the tree', structuralDisagreements(plan, authored.pages ?? [], ancestors)),
  ];
}

// The tree is the source of the site's structure; Site Factory's own copy of it (07 structural_links and breadcrumb,
// beta 0.0.0.6) is only checked against it. A page without those fields is not checked.
export function structuralDisagreements(plan, packagePages, ancestors) {
  const byId = new Map(plan.pages.map((page) => [page.page_id, page]));
  const urls = (list) => JSON.stringify([...list].sort());
  const issues = [];
  for (const source of packagePages) {
    const page = byId.get(source.page_id);
    if (!page) continue;
    if (Array.isArray(source.breadcrumb) && source.breadcrumb.length) {
      const expected = ['/', ...ancestors(page), page.url];
      const given = source.breadcrumb.map((item) => item.url);
      if (JSON.stringify(given) !== JSON.stringify(expected)) issues.push(`${page.url} breadcrumb: ${given.join(' > ')} (tree: ${expected.join(' > ')})`);
    }
    if (!Array.isArray(source.structural_links)) continue;
    const ofRole = (role) => source.structural_links.filter((link) => link.role === role).map((link) => link.url);
    const parent = byId.get(page.parent_page_id);
    const children = plan.pages.filter((other) => other.parent_page_id === page.page_id).map((other) => other.url);
    const siblings = parent ? plan.pages.filter((other) => other.parent_page_id === parent.page_id && other.page_id !== page.page_id).map((other) => other.url) : [];
    const expected = { parent: parent ? [parent.url] : [], child: children, sibling: siblings };
    for (const [role, list] of Object.entries(expected)) if (urls(ofRole(role)) !== urls(list)) issues.push(`${page.url} ${role} links: ${ofRole(role).join(', ') || 'none'} (tree: ${list.join(', ') || 'none'})`);
  }
  return issues;
}

export async function verifySiteTree({ root = process.cwd() } = {}) {
  const site = await readJson(resolve(root, 'site.json'));
  const plan = await readJson(resolve(site.siteFactory, 'pages.json'));
  const authored = await readJson(resolve(site.siteFactory, 'authoring_package.json'));
  const nav = await readJson(resolve(root, 'src/data/site-nav.json'));
  const built = new Map();
  for (const page of plan.pages) built.set(page.url, await readBuiltPage(root, page.url));
  const sitemap = await readText(resolve(root, 'dist/sitemap.xml'), '');
  const exists = (href) => existsSync(distFile(root, href)) || existsSync(resolve(root, 'dist', href.slice(1)));
  const checks = treeChecks({ plan, authored, nav, built, sitemap, exists });
  const summary = { pages: plan.pages.length, written: authored.pages.filter((page) => page.release_status === 'ready_for_template').length, built: [...built.values()].filter(Boolean).length };
  await writeJson(resolve(root, 'docs/research/site-tree-check.json'), { summary, checks });
  return { summary, checks };
}

runMain(import.meta.url, async () => {
  const { summary, checks } = await verifySiteTree();
  console.log(`${summary.pages} planned pages, ${summary.written} written by Site Factory, ${summary.built} built`);
  for (const check of checks) console.log(`${check.passed ? 'ok  ' : 'FAIL'} ${check.check}${check.passed ? '' : `: ${check.failures.slice(0, 5).join('; ')}${check.failures.length > 5 ? ` (+${check.failures.length - 5})` : ''}`}`);
  if (checks.some((check) => !check.passed)) process.exitCode = 1;
});
