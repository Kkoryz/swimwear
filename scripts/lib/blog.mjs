// The blog: articles (src/data/blog-posts.json, one record per post) and the blog's own copy (src/data/blog.json) become
// ordinary site pages, so routing, the sitemap, structured data and every audit treat them like any page:
// /blog/<slug>/ (pageType blog_post) and the hub /blog/, /blog/page/2/ ... (pageType blog_hub, 12 posts a page).
// Paragraphs may link inline with [label](/route/) (the links a writer placed in the text).

export const BLOG_POST_SCHEMA = 'seo-site-blog-post-v1';
export const BLOG_ROUTE = '/blog/';
export const POSTS_PER_PAGE = 12;

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/.test(value) && !Number.isNaN(Date.parse(value));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const INLINE_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

// Text and links of one paragraph: [{ text } | { text, href }].
export function inlineParts(paragraph) {
  const parts = [];
  let last = 0;
  for (const match of paragraph.matchAll(INLINE_LINK)) {
    if (match.index > last) parts.push({ text: paragraph.slice(last, match.index) });
    parts.push({ text: match[1], href: match[2] });
    last = match.index + match[0].length;
  }
  if (last < paragraph.length) parts.push({ text: paragraph.slice(last) });
  return parts;
}
export const plainText = (paragraph) => paragraph.replace(INLINE_LINK, '$1');
export const inlineLinks = (paragraph) => [...paragraph.matchAll(INLINE_LINK)].map((match) => ({ label: match[1], href: match[2] }));

// Heading anchor for the table of contents.
export const anchor = (heading) => heading.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

// The running text of a section: its paragraphs and list items, from paragraphs/list or, for a section written as an
// ordered body (paragraphs, subheadings, tables and figures in the writer's order), from that body.
export function sectionTexts(section) {
  const body = (section.body ?? []).flatMap((part) => (part.text ? [part.text] : part.list?.items ?? []));
  return [...(section.paragraphs ?? []), ...(section.list?.items ?? []), ...body];
}

// Words of the article body (for reading time, rounded up, 230 words a minute).
export function postWords(post) {
  const text = [...(post.lead ?? []), ...(post.sections ?? []).flatMap((section) => [section.heading, ...sectionTexts(section)])].map(plainText).join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

const validTable = (table) => Array.isArray(table?.columns) && table.columns.length >= 2 && Array.isArray(table.rows) && table.rows.every((row) => Array.isArray(row) && row.length === table.columns.length);
// A chart drawn by the template (ArticleChart.astro): bars of values, a timeline of date ranges, steps, ranges on one
// scale, figure cards, a share bar, or a comparison of options (lib/visual-data.mjs draws a page's data with them).
export const CHART_KINDS = Object.freeze(['bar', 'timeline', 'steps', 'ranges', 'stats', 'shares', 'comparison']);
const CHART_COUNTS = { steps: [3, 7], stats: [1, 6], shares: [2, 6] };
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
export function chartErrors(chart, at = 'chart') {
  if (!CHART_KINDS.includes(chart?.kind)) return [`${at}.kind must be one of ${CHART_KINDS.join(', ')}`];
  if (chart.kind === 'comparison') {
    const options = Array.isArray(chart.options) ? chart.options : [];
    if (options.length < 2 || options.length > 3 || !options.every(isText)) return [`${at}.options must name 2 or 3 options`];
    if (!Array.isArray(chart.rows) || !chart.rows.length) return [`${at}.rows are required`];
    return chart.rows.flatMap((row, index) => (isText(row?.label) && Array.isArray(row.values) && row.values.length === options.length && row.values.every(isText) ? [] : [`${at}.rows[${index}] needs a label and one value per option`]));
  }
  const items = Array.isArray(chart.items) ? chart.items : [];
  const [min, max] = CHART_COUNTS[chart.kind] ?? [2, 8];
  if (items.length < min || items.length > max) return [`${at} needs ${min} to ${max} items`];
  const errors = [];
  for (const [index, item] of items.entries()) {
    const where = `${at}.items[${index}]`;
    if (!isText(item?.label)) errors.push(`${where}.label is required`);
    if (chart.kind === 'ranges' && !(typeof item.min === 'number' && typeof item.max === 'number' && item.max >= item.min)) errors.push(`${where} needs min and max numbers, max not below min`);
    if (chart.kind === 'stats' && !isText(String(item.value ?? ''))) errors.push(`${where}.value is required`);
    if (chart.kind === 'shares' && !(typeof item.percent === 'number' && item.percent > 0)) errors.push(`${where}.percent must be a number above 0`);
    if (chart.kind === 'bar' && !(typeof item.value === 'number' && item.value >= 0)) errors.push(`${where}.value must be a number of 0 or more`);
    if (chart.kind === 'timeline' && !(isDay(item.start) && isDay(item.end) && item.end >= item.start)) errors.push(`${where} needs start and end dates (YYYY-MM-DD), end not before start`);
    if (chart.kind === 'steps' && item.detail != null && !isText(item.detail)) errors.push(`${where}.detail must be text`);
  }
  return errors;
}

// One part of an ordered section body: { text } | { subheading } | { list } | { table } | { figure } | { chart }.
function bodyPartErrors(part, at) {
  if (part?.chart) return [...chartErrors(part.chart, `${at}.chart`), ...(isText(part.chart.alt) ? [] : [`${at}.chart needs alt (what it shows)`])];
  if (isText(part?.text) || isText(part?.subheading)) return [];
  if (part?.list) return Array.isArray(part.list.items) && part.list.items.length >= 2 && part.list.items.every(isText) ? [] : [`${at}.list needs at least two items`];
  if (part?.table) return validTable(part.table) ? [] : [`${at}.table needs columns and rows of the same width`];
  if (part?.figure) return isText(part.figure.src) && isText(part.figure.alt) ? [] : [`${at}.figure needs src and alt`];
  return [`${at} must be one of text, subheading, list, table, figure or chart`];
}

// Contract errors of one post record.
export function validatePost(post, where = 'post') {
  const errors = [];
  if (!post || typeof post !== 'object') return [`${where} must be an object`];
  if (!SLUG.test(post.slug ?? '')) errors.push(`${where}.slug must be lowercase words joined by hyphens`);
  if (!['published', 'review', 'placeholder'].includes(post.status)) errors.push(`${where}.status must be published, review or placeholder`);
  if (!isText(post.seo?.title) || !isText(post.seo?.description)) errors.push(`${where}.seo needs title and description`);
  if (!isText(post.title)) errors.push(`${where}.title (the H1) is required`);
  if (!Array.isArray(post.lead) || !post.lead.length || !post.lead.every(isText)) errors.push(`${where}.lead must be the answer-first opening paragraph(s)`);
  if (!isDate(post.datePublished) || !isDate(post.dateModified)) errors.push(`${where}.datePublished and dateModified must be ISO 8601 dates`);
  else if (Date.parse(post.dateModified) < Date.parse(post.datePublished)) errors.push(`${where}.dateModified is before datePublished`);
  const author = post.author ?? {};
  if (!['Organization', 'Person'].includes(author.type)) errors.push(`${where}.author.type must be Organization or Person`);
  if (author.type === 'Person' && !(isText(author.name) && isText(author.url))) errors.push(`${where}.author: a person needs name and url (their profile page)`);
  if (post.image != null && !(isText(post.image.src) && isText(post.image.alt))) errors.push(`${where}.image needs src and alt`);
  if (!Array.isArray(post.sections) || !post.sections.length) errors.push(`${where}.sections must be a non-empty array`);
  for (const [index, section] of (post.sections ?? []).entries()) {
    const at = `${where}.sections[${index}]`;
    if (!isText(section?.heading)) errors.push(`${at}.heading is required`);
    if (section?.body != null) {
      if (!Array.isArray(section.body) || !section.body.some((part) => isText(part?.text))) errors.push(`${at}.body must be an array with at least one paragraph (text)`);
      else errors.push(...section.body.flatMap((part, partIndex) => bodyPartErrors(part, `${at}.body[${partIndex}]`)));
      continue;
    }
    if (!Array.isArray(section?.paragraphs) || !section.paragraphs.length || !section.paragraphs.every(isText)) errors.push(`${at}.paragraphs must be a non-empty array of text`);
    if (section?.list != null && !(Array.isArray(section.list.items) && section.list.items.length >= 2 && section.list.items.every(isText))) errors.push(`${at}.list needs at least two items`);
    if (section?.table != null && !validTable(section.table)) errors.push(`${at}.table needs columns and rows of the same width`);
  }
  for (const [index, item] of (post.takeaways ?? []).entries()) if (!isText(item)) errors.push(`${where}.takeaways[${index}] must be text`);
  for (const [index, item] of (post.faq ?? []).entries()) if (!isText(item?.question) || !isText(item?.answer)) errors.push(`${where}.faq[${index}] needs question and answer`);
  for (const [index, item] of (post.sources ?? []).entries()) if (!isText(item?.title) || !/^https?:\/\//.test(item?.url ?? '')) errors.push(`${where}.sources[${index}] needs a title and an absolute url`);
  if (post.cta != null && !(isText(post.cta.label) && isText(post.cta.href))) errors.push(`${where}.cta needs label and href`);
  return errors;
}

// One post as a site page. Its structured data (BlogPosting) is added by stage 10 (seo-head pageSchemas).
export function postPage(post, blog) {
  const route = `${BLOG_ROUTE}${post.slug}/`;
  const blocks = post.sections.map((section, index) => ({ id: `section-${index + 1}`, type: 'prose', heading: section.heading, anchor: anchor(section.heading), paragraphs: section.paragraphs ?? [], ...(section.body ? { body: section.body } : {}), ...(section.list ? { list: section.list } : {}), ...(section.table ? { table: section.table } : {}) }));
  if (post.faq?.length) blocks.push({ id: 'faq', type: 'faq', heading: blog?.faqHeading ?? 'FAQ', items: post.faq });
  if (post.sources?.length) blocks.push({ id: 'sources', type: 'sources', items: post.sources });
  if (post.cta) blocks.push({ id: 'cta', type: 'cta', ...(post.cta.heading ? { heading: post.cta.heading } : {}), ...(post.cta.text ? { paragraphs: [post.cta.text] } : {}), cta: { label: post.cta.label, href: post.cta.href }, links: post.related ?? [] });
  return {
    id: `blog-${post.slug}`,
    route,
    pageType: 'blog_post',
    // A post in review is built for the person checking it (held: noindex, out of the sitemap and the hub).
    status: post.status === 'placeholder' ? 'placeholder' : post.status === 'review' ? 'hold' : 'authored',
    seo: { title: post.seo.title, description: post.seo.description, canonical: route },
    jsonLd: [],
    hero: { heading: post.title, lead: post.lead },
    parent: { name: blog?.heading ?? 'Blog', route: BLOG_ROUTE },
    article: { datePublished: post.datePublished, dateModified: post.dateModified, author: post.author, image: post.image ?? null, category: post.category ?? null, takeaways: post.takeaways ?? [], minutes: Math.max(1, Math.ceil(postWords(post) / 230)) },
    blocks,
  };
}

// The hub: the posts marked featured first, then newest first, POSTS_PER_PAGE a page; page 1 is /blog/, then
// /blog/page/2/ ... (each its own canonical).
export function hubPages(posts, blog) {
  // A hub with copy of its own (blog.blocks) is a page before any post is written; without, it waits for the posts.
  if (!posts.length && !blog?.blocks?.length) return [];
  const sorted = [...posts].sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)) || Date.parse(right.datePublished) - Date.parse(left.datePublished));
  const total = Math.max(1, Math.ceil(sorted.length / POSTS_PER_PAGE));
  // The posts come first, right under the heading (owner 2026-11-12: "blog信息太多且页面没有把重要的blog放最上面";
  // the competitor's news page is its list of posts): the hub's own blocks follow them, the closing call (cta) last.
  const [before, after] = [[], blog?.blocks ?? []];
  const placeholder = !blog || (sorted.length > 0 && sorted.every((post) => post.status === 'placeholder'));
  return Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    const route = number === 1 ? BLOG_ROUTE : `${BLOG_ROUTE}page/${number}/`;
    const items = sorted.slice(index * POSTS_PER_PAGE, number * POSTS_PER_PAGE).map((post) => ({ title: post.title, href: `${BLOG_ROUTE}${post.slug}/`, excerpt: plainText(post.lead[0]), date: post.datePublished, ...(post.image ? { image: post.image } : {}), ...(post.category ? { category: post.category } : {}) }));
    const heading = blog?.heading ?? '[Placeholder] Blog';
    return {
      id: number === 1 ? 'blog' : `blog-page-${number}`,
      route,
      pageType: 'blog_hub',
      status: placeholder ? 'placeholder' : 'authored',
      seo: { title: number === 1 ? (blog?.title ?? heading) : `${blog?.title ?? heading} – Page ${number}`, description: blog?.description ?? '[Placeholder] What this blog covers.', canonical: route },
      jsonLd: [],
      hero: { heading: number === 1 ? heading : `${heading} – Page ${number}`, ...(number === 1 && blog?.intro ? { lead: [blog.intro] } : {}) },
      blocks: [...(number === 1 ? before : []), ...(items.length ? [{ id: 'posts', type: 'postList', items, pagination: { page: number, pages: total, base: BLOG_ROUTE } }] : []), ...(number === 1 ? after : [])],
    };
  });
}

// A release build (pnpm build:release sets SITE_RELEASE=1, as do the steps that check its output): see blogPages.
export const isReleaseBuild = (env = process.env) => env.SITE_RELEASE === '1';

// Every blog page: the hub pages and one page per post. Placeholder posts (template canaries) are marked and noindex.
// The hub lists the posts that are built: in a release build only those not in review (a post in review is never
// linked from the released site, and the launch preflight holds while one is built); in any other build those in
// review too, so the site's articles can be reached while they are checked (owner 2026-11-12).
/** @param {any[]} [posts] @param {any} [blog] @param {{ release?: boolean }} [options] @returns {any[]} */
export function blogPages(posts = [], blog = null, { release = isReleaseBuild() } = {}) {
  const errors = posts.flatMap((post, index) => validatePost(post, `blog-posts[${index}]${post?.slug ? `(${post.slug})` : ''}`));
  if (errors.length) throw new Error(`Invalid blog posts:\n${errors.join('\n')}`);
  const listed = release ? posts.filter((post) => post.status !== 'review') : posts;
  return [...hubPages(listed, blog), ...posts.map((post) => postPage(post, blog))];
}

// BlogPosting for a post page (stage 10): the visible headline, dates, author and image; the site's Organization as
// publisher (and as author unless a real person wrote it).
export function blogPostingSchema(page, { absolute, organization }) {
  const { article } = page;
  const author = article.author?.type === 'Person' ? { '@type': 'Person', name: article.author.name, url: absolute(article.author.url) } : { '@id': organization };
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: page.hero.heading,
    description: page.seo.description,
    datePublished: article.datePublished,
    dateModified: article.dateModified,
    author,
    publisher: { '@id': organization },
    mainEntityOfPage: absolute(page.seo.canonical),
    ...(article.image ? { image: [absolute(article.image.src)] } : {}),
  };
}
