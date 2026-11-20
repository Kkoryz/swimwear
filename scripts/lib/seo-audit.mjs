// Stage 10 gate: checks the built site (dist/) against the technical SEO rules the template serialises
// (scripts/lib/seo-head.mjs): head tags, structured data, breadcrumbs, images, orphans, sitemap, robots.txt, 404; then
// the four-site audit's checks (2026-11-17, lib/seo-site-checks.mjs and the data checks of lib/site-data-checks.mjs).
// Every finding names who clears it (owner: lib/issue-owners.mjs), so the launch checklist and Site Factory's report
// can route it.

import { resolve } from 'node:path';
import { attribute, decode, internalLinks, isDecorative, parsePage, readBuiltPages } from './built-site.mjs';
import { readJson, readText, writeJson } from './json-io.mjs';
import { absoluteUrl, breadcrumbTrail, isIndexable, robotsAllows, SERVICE_PAGE_TYPES } from './seo-head.mjs';
import { assetRefProblems } from './asset-refs.mjs';
import { homeCategoryProblems } from './home-categories.mjs';
import { requiredBlocks } from './page-blueprints.mjs';
import { schemaProblems } from './schema-rules.mjs';
import { TITLE_MAX, TITLE_PX_MAX, titleChars, titlePx } from './title-limits.mjs';
import { mainKeywords, loadSitePages } from './site-pages.mjs';
import { pageAltProblems } from './alt-text.mjs';
import { imageBudgetProblems, imagePriorityProblems } from './image-budgets.mjs';
import { ownerOf } from './issue-owners.mjs';
import { companyFacts } from './facts.mjs';
import { proofProblems, readProof } from './proof-consistency.mjs';
import { emptyBlogProblems, templatedDescriptions, trustValueProblems } from './site-data-checks.mjs';
import { builtPromiseProblems, channelHandleProblems, controlNameProblems, firstImageOnScreen, imageWeightProblems, inboundLinkProblems, lastmodProblems, lcpPriorityProblems, lexiconProblems, napProblems, heroReuseProblems, navNoindexProblems, offscreenEagerProblems, photoReuseProblems, privacyContradictionProblems, thinPageProblems, unreferencedAssets } from './seo-site-checks.mjs';

export { emptyBlogProblems };

// Pure checks for one built page: errors { issue, detail } and warnings { level: 'warning', issue, detail }.
// company: the company behind the site (src/data/site-company.json): once it states a service area, every Organization
// and Service states it too.
export function pageProblems({ html, page, identity, nav, builtRoutes = null, keyword = null, company = null }) {
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
  // A page that offers a service carries a Service (T-2 of the four-site audit 2026-11-17: product, service and city
  // pages had none).
  if (identity && SERVICE_PAGE_TYPES.includes(page.pageType) && !types.includes('Service')) add('service_schema_missing', page.pageType);
  // Google's required (error) and recommended (warning) properties per type (scripts/lib/schema-rules.mjs).
  const serviceArea = Boolean(company?.serviceArea?.length);
  for (const schema of schemas) {
    for (const problem of schemaProblems(schema, { serviceArea })) {
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
  // Title and description lengths (what results usually show), back to the copy owner, never a rewrite. The title as a
  // reader sees it (entities decoded: &amp; is one character): over TITLE_MAX fails, Site Factory's rule (lib/title-limits.mjs;
  // a replacement list fixes it); under 30 characters, or wider than a desktop result shows, is a warning.
  const shown = decode(titles[0] ?? '');
  const chars = titleChars(shown);
  // A later page of the blog list carries the list's title plus the " – Page N" this template adds (lib/blog.mjs): the
  // title Site Factory wrote is checked on the first page, never again with our own suffix counted against it.
  const laterPage = (page.blocks ?? []).some((block) => block.pagination?.page > 1);
  if (chars > TITLE_MAX && !laterPage) add('title_too_long', `${chars} characters (at most ${TITLE_MAX}): ${shown}`);
  else if (shown && chars < 30) warn('title_length', `${chars} characters`);
  if (shown && chars <= TITLE_MAX && titlePx(shown) > TITLE_PX_MAX) warn('title_too_wide', `about ${titlePx(shown)}px at 20px Arial (about ${TITLE_PX_MAX}px shown): ${shown}`);
  const descriptionChars = titleChars(decode(description ?? ''));
  if (description && (descriptionChars < 70 || descriptionChars > 165)) warn('description_length', `${descriptionChars} characters`);
  // Placeholder text must never reach an indexable page.
  if (isIndexable(page) && /\[Placeholder\]/.test(html.split('<main')[1] ?? '')) add('placeholder_text_on_indexable');
  // Link text: descriptive, never generic; every link, button and form control has an accessible name (an image link
  // carries its alt): control_without_name, a failure since the four-site audit (it was link_text_empty, a warning).
  for (const link of built.links) {
    const text = link.text.toLowerCase();
    if (['click here', 'here', 'read more', 'learn more', 'more'].includes(text)) warn('link_text_generic', `"${text}" -> ${link.href}`);
  }
  for (const { issue, detail } of controlNameProblems(html)) add(issue, detail);
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
  // A first image below the first section (a closing photo on a page without a hero photo) stays lazy (L-5).
  if (images[0]?.loading === 'lazy' && firstImageOnScreen(html)) add('first_image_lazy', images[0].src);
  for (const { issue, detail } of [...lcpPriorityProblems(html), ...offscreenEagerProblems(html)]) warn(issue, detail);
  // Modern Web Guidance's image rules: one or two images fetched first, sizes with every srcset (lib/image-budgets.mjs).
  for (const { issue, detail } of imagePriorityProblems(html)) add(issue, detail);
  // Alt text rules (lib/alt-text.mjs): warnings here, a hold at launch (preflight image_alt_rules).
  for (const { src, problem } of pageAltProblems(images.filter((image) => image.alt !== null).map((image) => ({ src: image.src, alt: image.alt, decorative: isDecorative(image) })), { keyword })) warn(`alt_${problem}`, src);
  return problems;
}

// Every way in to an enquiry lands on a form (Strandmill audit 2026-11-17: three of four sites' "Request a quote" page
// had none): a page that must carry the enquiry form (REQUIRED_BLOCKS: the contact and the inquiry page) has a <form>,
// and so does the target of every button on the site that asks for a quote or an enquiry. One failure per target page,
// with the pages whose links lead there.
const ENQUIRY_LABEL = /\b(quote|quotation|enquir\w*|inquir\w*)\b/i;
const BUTTON_CLASS = /(^|\s)(button|[\w-]+__cta)(\s|$)/;
export function formLandingProblems(pages, built) {
  // An enquiry form: the resource request form (data-request="resource") is no landing for "Request a quote".
  const hasForm = (route) => /<form\b(?![^>]*\sdata-request="resource")/i.test(built.get(route) ?? '');
  const formPages = new Set(pages.filter((page) => requiredBlocks(page.pageType, page.id).includes('form')).map((page) => page.route));
  const sources = new Map([...formPages].map((route) => [route, new Set()]));
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    for (const [, open, inner] of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)) {
      const route = attribute(open, 'href')?.match(/^(\/[^#?]*)/)?.[1];
      if (!route || !built.has(route)) continue;
      const asks = BUTTON_CLASS.test(attribute(open, 'class') ?? '') && ENQUIRY_LABEL.test(decode(inner.replace(/<[^>]+>/g, ' ')));
      if (formPages.has(route) || asks) (sources.get(route) ?? sources.set(route, new Set()).get(route)).add(page.route);
    }
  }
  return [...sources].filter(([route]) => built.get(route) && !hasForm(route)).map(([route, from]) => ({ route, issue: 'cta_target_without_form', detail: from.size ? `no <form>; linked from ${[...from].slice(0, 5).join(' ')}${from.size > 5 ? ` and ${from.size - 5} more` : ''}` : `no <form> on a ${formPages.has(route) ? 'page that must carry the enquiry form' : 'page'}` }));
}

// The four-site audit's checks across the site (lib/seo-site-checks.mjs) and on its data (lib/site-data-checks.mjs):
// [{ route, issue, detail, level }]. lexicon: config/stand-in-lexicon.json; released: an accepted SEO baseline exists.
export async function siteWideProblems({ root, pages, built, identity = null, keywords = new Map(), trust = null, pageFigures = null, lexicon = null, sitemap = '', released = false, proof = null, demo = null, facts = new Map(), contact = null, runtime = null }) {
  return [
    ...navNoindexProblems(pages, built),
    ...await imageWeightProblems(root, pages, built),
    ...napProblems(pages, built, { allowedEmails: [proof?.privacy?.contact] }),
    ...channelHandleProblems(pages, built, { contact, runtime }),
    ...builtPromiseProblems(pages, built),
    ...trustValueProblems({ trust, pageFigures }),
    ...templatedDescriptions(pages, { keywords, siteName: identity?.siteName ?? '' }),
    ...inboundLinkProblems(pages, built),
    ...lastmodProblems(sitemap, { released }),
    ...thinPageProblems(pages, built),
    ...lexiconProblems(pages, built, lexicon),
    ...privacyContradictionProblems(pages, built),
    ...heroReuseProblems(pages, built),
    ...photoReuseProblems(pages, built, await readJson(resolve(root, 'docs/research/image-plan.json'), null)),
    ...proofProblems({ proof, demo, pages, facts }),
    ...await unreferencedAssets(root),
  ];
}

// pages and built (html by route, readBuiltPages) may be passed in by a caller that has already read them.
export async function auditSeo({ root = process.cwd(), pages = null, built = null } = {}) {
  pages ??= await loadSitePages(root);
  built ??= await readBuiltPages(root, pages);
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const nav = await readJson(resolve(root, 'src/data/site-nav.json'), { header: [], footer: [] });
  const company = await readJson(resolve(root, 'src/data/site-company.json'), null);
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
    for (const { level, ...problem } of pageProblems({ html, page, identity, nav, builtRoutes: routes, keyword: keywords.get(page.route), company })) (level === 'warning' ? warnings : failures).push({ route: page.route, ...problem });
    const links = [...new Set(internalLinks(html))].filter((href) => href !== page.route && inbound.has(href));
    outlinks.set(page.route, links);
    for (const href of links) inbound.set(href, inbound.get(href) + 1);
    // An indexable page should not send readers (and link equity) to a placeholder page.
    if (isIndexable(page)) for (const href of links) if (!isIndexable(byRoute.get(href))) warnings.push({ route: page.route, issue: 'links_to_placeholder', detail: href });
  }
  failures.push(...formLandingProblems(pages, built), ...emptyBlogProblems(pages));
  // The home page's body links every category (lib/home-categories.mjs; site13 blind audit M8).
  failures.push(...homeCategoryProblems(pages, built, nav, isIndexable));
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
  // Each listed crawler is named in its purpose's own group (G1/A2 of the four-site audit 2026-11-17), not only by "*".
  const named = new Set([...robots.matchAll(/^user-agent:\s*(\S+)/gim)].map((match) => match[1].toLowerCase()));
  const unnamed = identity && policy.groups?.length ? policy.allow.filter((crawler) => !named.has(crawler.token.toLowerCase())).map((crawler) => crawler.token) : [];
  if (unnamed.length) failures.push({ route: '/robots.txt', issue: 'robots_groups_missing', detail: `no group names ${unnamed.join(', ')} (config/crawler-policy.json groups)` });
  // llms.txt lists every indexable page (A6; lib/seo-head.mjs llmsTxt).
  const llms = await readText(resolve(root, 'dist/llms.txt'), '');
  const unlisted = identity ? indexable.filter((url) => !llms.includes(`](${url})`)) : [];
  if (unlisted.length) failures.push({ route: '/llms.txt', issue: 'llms_txt_mismatch', detail: `${unlisted.length} indexable page(s) not listed: ${unlisted.slice(0, 3).join(' ')}` });
  // The header logo every page loads and the phone crops of the hero photos, by weight (four-site audit 2026-11-17).
  failures.push(...await imageBudgetProblems(root, identity));
  // Every url() and src of the built CSS and HTML names a file of the build (lib/asset-refs.mjs; site13 blind audit M3).
  failures.push(...await assetRefProblems(root));
  const notFound = await readText(resolve(root, 'dist/404.html'), '');
  if (!notFound.includes('noindex')) failures.push({ route: '/404.html', issue: 'not_found_page' });
  // The four-site audit's checks (2026-11-17).
  const sitewide = await siteWideProblems({
    root, pages, built, identity, keywords, sitemap,
    trust: await readJson(resolve(root, 'src/data/site-trust.json'), null),
    pageFigures: await readJson(resolve(root, 'src/data/page-figures.json'), null),
    lexicon: await readJson(resolve(root, 'config/stand-in-lexicon.json'), null),
    released: Boolean(await readJson(resolve(root, 'docs/research/seo-baseline.json'), null)),
    ...await readProof(root),
    facts: await companyFacts(root).catch(() => new Map()),
    contact: await readJson(resolve(root, 'src/data/site-contact.json'), null),
    runtime: await readJson(resolve(root, 'src/data/site-runtime.json'), null),
  });
  for (const { level, ...problem } of sitewide) (level === 'warning' ? warnings : failures).push(problem);
  // Who clears each finding (lib/issue-owners.mjs): the launch checklist and Site Factory's report route by it.
  for (const entry of [...failures, ...warnings]) entry.owner = ownerOf(entry.issue);
  const report = { schemaVersion: 'seo-site-seo-audit-v1', pages: pages.length, indexable: indexable.length, identity: Boolean(identity), failures, warnings };
  await writeJson(resolve(root, 'docs/research/seo-audit.json'), report);
  if (failures.length) throw new Error(`SEO audit failed with ${failures.length} issue(s): ${failures.slice(0, 5).map((failure) => `${failure.route} ${failure.issue} ${failure.detail ?? ''}`).join('; ')}`);
  return report;
}
