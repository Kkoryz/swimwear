// Stage 10 gate: checks the built site (dist/) against the technical SEO rules the template serialises
// (scripts/lib/seo-head.mjs): head tags, structured data, breadcrumbs, images, orphans, sitemap, robots.txt, 404.

import { resolve } from 'node:path';
import { decode, internalLinks, isDecorative, parsePage, readBuiltPages } from './built-site.mjs';
import { readJson, readText, writeJson } from './json-io.mjs';
import { absoluteUrl, breadcrumbTrail, isIndexable, robotsAllows } from './seo-head.mjs';
import { schemaProblems } from './schema-rules.mjs';
import { mainKeywords, loadSitePages } from './site-pages.mjs';
import { pageAltProblems } from './alt-text.mjs';

// Pure checks for one built page: errors { issue, detail } and warnings { level: 'warning', issue, detail }.
export function pageProblems({ html, page, identity, nav, builtRoutes = null, keyword = null }) {
  const problems = [];
  const add = (issue, detail = '') => problems.push({ issue, detail });
  const warn = (issue, detail = '') => problems.push({ level: 'warning', issue, detail });
  const built = parsePage(html);
  if (!/^[a-z]/i.test(built.lang ?? '')) add('html_lang_missing');
  if (html.length > 2 * 1024 * 1024) add('html_too_large', `${Math.round(html.length / 1024)} KB`);
  const { titles, description } = built;
  if (titles.length !== 1 || !titles[0]) add('title', `${titles.length} title elements`);
  if (!description) add('meta_description_missing');
  const expected = absoluteUrl(identity, page.seo.canonical);
  if (built.canonical !== expected) add('canonical', `${built.canonical} != ${expected}`);
  const { robots } = built;
  if (isIndexable(page) ? robots?.includes('noindex') : !robots?.includes('noindex')) add('robots', `${robots} on a ${page.status} page`);
  if (identity) for (const key of ['og:title', 'og:description', 'og:url', 'og:image']) if (!built.meta.has(key)) add('social_tag_missing', key);
  for (const block of built.jsonLd) if (block.data === undefined) add('json_ld_invalid');
  const schemas = built.jsonLd.filter((block) => block.data !== undefined).map((block) => block.data);
  const types = schemas.flatMap((schema) => [schema['@type']].flat());
  const trail = breadcrumbTrail(page, nav, builtRoutes);
  if (page.route === '/' && identity) for (const type of ['WebSite', 'Organization']) if (!types.includes(type)) add('json_ld_missing', type);
  if (trail.length >= 2) {
    const list = schemas.find((schema) => schema['@type'] === 'BreadcrumbList');
    if (!list) add('json_ld_missing', 'BreadcrumbList');
    const visible = [...(html.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)?.[0] ?? '').matchAll(/<li class="breadcrumbs__item"[^>]*>([\s\S]*?)<\/li>/g)].map((item) => decode(item[1].replace(/<[^>]+>/g, '').trim()));
    const listed = (list?.itemListElement || []).map((item) => item.name);
    if (JSON.stringify(visible) !== JSON.stringify(listed)) add('breadcrumb_mismatch', `visible ${JSON.stringify(visible)} vs json-ld ${JSON.stringify(listed)}`);
  }
  // The site identity (stage 00) owns the organisation's name, URL and logo; a page's own Organization must agree.
  for (const organization of identity ? schemas.filter((schema) => schema['@type'] === 'Organization') : []) {
    if (organization.name !== identity.siteName) add('organization_name', `${organization.name} != ${identity.siteName}`);
    if (organization.url && !String(organization.url).startsWith(identity.origin)) add('organization_url', organization.url);
    if (typeof organization.logo === 'string' && !organization.logo.startsWith(identity.origin)) add('organization_logo', organization.logo);
  }
  // Google's required (error) and recommended (warning) properties per type (scripts/lib/schema-rules.mjs).
  for (const schema of schemas) {
    for (const problem of schemaProblems(schema)) {
      if (problem.issue === 'json_ld_placeholder' && !isIndexable(page)) continue;
      if (problem.level === 'warning') warn(problem.issue, problem.detail); else add(problem.issue, problem.detail);
    }
  }
  // Headings: one H1, no skipped levels, no empty or number-only headings.
  const { headings } = built;
  const h1s = headings.filter((heading) => heading.level === 1).length;
  if (h1s !== 1) add('h1_count', `${h1s} h1 elements`);
  headings.forEach((heading, index) => {
    if (index > 0 && heading.level > headings[index - 1].level + 1) warn('heading_level_skipped', `h${headings[index - 1].level} to h${heading.level}: ${heading.text.slice(0, 40)}`);
    if (!heading.text || /^[\d\s.,%+-]*$/.test(heading.text)) warn('heading_empty_or_numeric', `h${heading.level}: "${heading.text}"`);
  });
  // Title and description lengths (what results usually show): a warning back to the copy owner, never a rewrite.
  if (titles[0] && (titles[0].length < 30 || titles[0].length > 65)) warn('title_length', `${titles[0].length} characters`);
  if (description && (description.length < 70 || description.length > 165)) warn('description_length', `${description.length} characters`);
  // Placeholder text must never reach an indexable page.
  if (isIndexable(page) && /\[Placeholder\]/.test(html.split('<main')[1] ?? '')) add('placeholder_text_on_indexable');
  // Link text: descriptive, never empty (an image link carries its alt) or generic.
  for (const link of built.links) {
    const text = link.text.toLowerCase();
    if (!text && !link.ariaLabel && !link.imageAlt) warn('link_text_empty', link.href ?? '');
    else if (['click here', 'here', 'read more', 'learn more', 'more'].includes(text)) warn('link_text_generic', `"${text}" -> ${link.href}`);
  }
  // A structured-data link on this site must point at a page that is built.
  if (identity && builtRoutes) {
    const links = JSON.stringify(schemas).match(new RegExp(`"(?:url|item)":"${identity.origin.replace(/[.]/g, '[.]')}(/[^"#?]*)"`, 'g')) || [];
    for (const link of links) {
      const route = link.slice(link.indexOf(identity.origin) + identity.origin.length, -1);
      if (!builtRoutes.has(route)) add('json_ld_unbuilt_url', route);
    }
  }
  const images = built.images.filter((image) => image.inMain);
  for (const image of images) {
    // alt="" may serialise as a bare attribute; only a missing alt fails.
    if (image.alt === null) add('image_alt_missing', image.src);
    if (!image.width || !image.height) add('image_size_missing', image.src);
  }
  if (images[0]?.loading === 'lazy') add('first_image_lazy', images[0].src);
  // Alt text rules (lib/alt-text.mjs): warnings here, a hold at launch (preflight image_alt_rules).
  for (const { src, problem } of pageAltProblems(images.filter((image) => image.alt !== null).map((image) => ({ src: image.src, alt: image.alt, decorative: isDecorative(image) })), { keyword })) warn(`alt_${problem}`, src);
  return problems;
}

// pages and built (html by route, readBuiltPages) may be passed in by a caller that has already read them.
export async function auditSeo({ root = process.cwd(), pages = null, built = null } = {}) {
  pages ??= await loadSitePages(root);
  built ??= await readBuiltPages(root, pages);
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const nav = await readJson(resolve(root, 'src/data/site-nav.json'), { header: [], footer: [] });
  const failures = [];
  const warnings = [];
  const inbound = new Map(pages.map((page) => [page.route, 0]));
  const routes = new Set(pages.map((page) => page.route));
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const keywords = await mainKeywords(root);
  const outlinks = new Map();
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) { failures.push({ route: page.route, issue: 'not_built' }); continue; }
    for (const { level, ...problem } of pageProblems({ html, page, identity, nav, builtRoutes: routes, keyword: keywords.get(page.route) })) (level === 'warning' ? warnings : failures).push({ route: page.route, ...problem });
    const links = [...new Set(internalLinks(html))].filter((href) => href !== page.route && inbound.has(href));
    outlinks.set(page.route, links);
    for (const href of links) inbound.set(href, inbound.get(href) + 1);
    // An indexable page should not send readers (and link equity) to a placeholder page.
    if (isIndexable(page)) for (const href of links) if (!isIndexable(byRoute.get(href))) warnings.push({ route: page.route, issue: 'links_to_placeholder', detail: href });
  }
  // Duplicate titles and descriptions among indexable pages.
  for (const field of ['title', 'description']) {
    const seen = new Map();
    for (const page of pages.filter(isIndexable)) (seen.get(page.seo[field]) ?? seen.set(page.seo[field], []).get(page.seo[field])).push(page.route);
    for (const [value, list] of seen) if (value && list.length > 1) warnings.push({ route: list.join(' '), issue: `duplicate_${field}`, detail: value.slice(0, 80) });
  }
  // Click depth from the home page: pages more than three links deep are harder to crawl and find.
  if (routes.has('/')) {
    const depth = new Map([['/', 0]]);
    for (let queue = ['/']; queue.length;) {
      const route = queue.shift();
      for (const href of outlinks.get(route) || []) if (!depth.has(href)) { depth.set(href, depth.get(route) + 1); queue.push(href); }
    }
    for (const page of pages.filter(isIndexable)) if ((depth.get(page.route) ?? 0) > 3) warnings.push({ route: page.route, issue: 'click_depth', detail: `${depth.get(page.route)} clicks from home` });
  }
  // Every indexable page needs a crawlable link from another page (orphans cannot be discovered by following links).
  for (const page of pages.filter(isIndexable)) if (page.route !== '/' && !inbound.get(page.route)) failures.push({ route: page.route, issue: 'orphan_page' });
  const sitemap = await readText(resolve(root, 'dist/sitemap.xml'), '');
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
  const indexable = pages.filter(isIndexable).map((page) => absoluteUrl(identity, page.seo.canonical)).sort();
  if (JSON.stringify(listed) !== JSON.stringify(indexable)) failures.push({ route: '/sitemap.xml', issue: 'sitemap_mismatch', detail: `${listed.length} listed, ${indexable.length} indexable` });
  const robots = await readText(resolve(root, 'dist/robots.txt'), '');
  if (identity && !robots.includes(`Sitemap: ${absoluteUrl(identity, '/sitemap.xml')}`)) failures.push({ route: '/robots.txt', issue: 'robots_sitemap_missing' });
  // The owner's crawler policy (config/crawler-policy.json): every listed crawler may fetch the site.
  const policy = await readJson(resolve(root, 'config/crawler-policy.json'), { allow: [] });
  if (identity) for (const crawler of policy.allow) if (!robotsAllows(robots, crawler.token)) failures.push({ route: '/robots.txt', issue: 'crawler_blocked', detail: `${crawler.token} (${crawler.purpose})` });
  const notFound = await readText(resolve(root, 'dist/404.html'), '');
  if (!notFound.includes('noindex')) failures.push({ route: '/404.html', issue: 'not_found_page' });
  const report = { schemaVersion: 'seo-site-seo-audit-v1', pages: pages.length, indexable: indexable.length, identity: Boolean(identity), failures, warnings };
  await writeJson(resolve(root, 'docs/research/seo-audit.json'), report);
  if (failures.length) throw new Error(`SEO audit failed with ${failures.length} issue(s): ${failures.slice(0, 5).map((failure) => `${failure.route} ${failure.issue} ${failure.detail ?? ''}`).join('; ')}`);
  return report;
}
