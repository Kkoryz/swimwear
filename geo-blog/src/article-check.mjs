import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAME_QUESTION, answeredBy, overlap, sitePosts } from './site-posts.mjs';

const IMAGE = /!\[[^\]]*\]\(visuals\/(V\d+)\.\w+\)/g;
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const count = (haystack, needle) => (needle ? haystack.split(needle).length - 1 : 0);

export function readArticle(runDir) {
  const article = join(runDir, '06-article.md');
  return {
    text: existsSync(article) ? readFileSync(article, 'utf8') : null,
    replacements: readJson(join(runDir, '06-replacements.json'))?.replacements ?? null,
    visuals: readJson(join(runDir, '06-visuals.json'))?.visuals ?? null,
  };
}

// The site's page paths, from its built sitemap (config.site_sitemap).
// The site may be rebuilding its sitemap while we read it: take a reading only when two in a row agree.
export function siteRoutes(config) {
  if (!config.site_sitemap) return [];
  const read = () => (existsSync(config.site_sitemap) ? readFileSync(config.site_sitemap, 'utf8') : '');
  let last = read();
  for (let i = 0; i < 10; i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    const now = read();
    if (now === last && now.includes('</urlset>')) break;
    last = now;
  }
  return [...last.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}
// Figure density from the site (stage 08 measures its reference articles into src/data/article-rhythm.json): between one
// per 150 and one per 400 words; 400 when the site has no measure.
export function wordsPerPicture(config) {
  const dir = config.site_dir ?? config.site_import?.cwd;
  const file = dir && join(dir, 'src/data/article-rhythm.json');
  const measured = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).wordsPerPicture : null;
  return Number.isFinite(measured) ? Math.max(150, Math.min(400, measured)) : 400;
}

// Pages that are not products or services (08's blog gate needs one product or service link).
const GENERIC = /^\/(about-us|faq|contact-us|request-a-quote|sustainability|blog)?\/?$/;

export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return {};
  return Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.match(/^(\w+):\s*"?(.*?)"?\s*$/)).filter(Boolean).map((x) => [x[1], x[2]]));
}

// The lists `apply` and the image step work from must match the article: each replacement's text found exactly once,
// each image line listed as a visual and each listed figure placed. Plus what the site's blog page needs: SEO title and
// description lengths, and 3+ links to existing pages including a product or service page.
export function articleCheck(config) {
  const { text, replacements, visuals } = readArticle(config.runDir);
  if (text == null) return ['06-article.md missing'];
  if (replacements == null) return ['06-replacements.json missing'];
  if (visuals == null) return ['06-visuals.json missing'];
  const failures = [];
  for (const r of replacements) {
    if (r.status === 'replaced') continue;
    const n = count(text, r.text);
    if (n !== 1) failures.push(`replacement ${r.id}: its text occurs ${n} times in the article (needs exactly 1)`);
  }
  const images = [...text.matchAll(IMAGE)].map((m) => m[1]);
  const figures = new Set(visuals.filter((v) => /^V\d+$/.test(v.id)).map((v) => v.id));
  for (const id of images) if (!figures.has(id)) failures.push(`image ${id} is not in 06-visuals.json`);
  for (const id of figures) if (!images.includes(id)) failures.push(`visual ${id} has no image line in the article`);

  failures.push(...visualSpecFailures(text, visuals));

  // The site takes the first paragraph as the page lead; the opening section must keep a paragraph of its own.
  const opening = text.split(/^## /m)[1] ?? '';
  const paragraphs = opening.split(/\r?\n\s*\r?\n/).slice(1).filter((b) => /^[A-Za-z0-9*_[]/.test(b.trim()) && !b.trim().startsWith('!['));
  if (paragraphs.length < 2) failures.push(`the opening section needs at least 2 paragraphs (the first becomes the page lead; got ${paragraphs.length})`);

  const fm = frontmatter(text);
  if (!fm.seo_title || fm.seo_title.length > 60) failures.push(`seo_title must be 1–60 characters (got ${fm.seo_title?.length ?? 0})`);
  if (!fm.seo_description || fm.seo_description.length < 70 || fm.seo_description.length > 160) failures.push(`seo_description must be 70–160 characters (got ${fm.seo_description?.length ?? 0})`);
  if (!/^[a-z0-9]+(-[a-z0-9]+){1,5}$/.test(fm.slug ?? '')) failures.push(`slug must be 2–6 lowercase words joined by hyphens (got "${fm.slug ?? ''}")`);
  const routes = [...siteRoutes(config), ...sitePosts(config, { excludeSlug: fm.slug }).map((p) => `/blog/${p.slug}/`)];
  if (routes.length) {
    const internal = [...text.matchAll(/\]\((\/[^)\s#]*)\)/g)].map((m) => m[1]).filter((p) => !p.startsWith('/visuals'));
    for (const p of internal) if (!routes.includes(p)) failures.push(`internal link to a page the site does not have: ${p}`);
    const valid = new Set(internal.filter((p) => routes.includes(p)));
    if (valid.size < 3) failures.push(`needs links to at least 3 site pages (got ${valid.size})`);
    if (![...valid].some((p) => !GENERIC.test(p))) failures.push('needs at least one link to a product or service page');
  }
  return failures;
}

// What the site needs to make each figure: photos in a setting of their own, charts it can draw exactly from numbers and
// dates the article states.
const CHART_KINDS = { bar: ['label', 'value'], timeline: ['label', 'start', 'end'], steps: ['label'] };
export function visualSpecFailures(text, visuals) {
  const failures = [];
  const plain = text.replace(/[,  ]/g, '');
  const settings = new Map();
  for (const v of visuals.filter((x) => /^V\d+$/.test(x.id))) {
    if (v.type === 'chart') {
      const kind = v.chart?.kind;
      if (v.produce !== 'draw' || !CHART_KINDS[kind]) { failures.push(`${v.id}: a chart needs produce "draw" and chart.kind bar, timeline or steps`); continue; }
      const items = v.chart.items ?? [];
      if (!items.length || (kind === 'steps' && (items.length < 3 || items.length > 7))) failures.push(`${v.id}: ${kind} chart has ${items.length} items`);
      for (const item of items) {
        for (const field of CHART_KINDS[kind]) if (item[field] == null || item[field] === '') failures.push(`${v.id}: item without ${field}`);
        if (String(item.label ?? '').split(/\s+/).filter(Boolean).length > 5) failures.push(`${v.id}: label over 5 words: "${item.label}"`);
        for (const value of [item.value, item.start, item.end].filter((x) => x != null)) {
          if (!plain.includes(String(value)) && !dateInText(String(value), text)) failures.push(`${v.id}: ${value} does not appear in the article`);
        }
      }
    } else if (['photo', 'hero'].includes(v.type)) {
      if (!v.setting) failures.push(`${v.id}: a photo needs a setting`);
      else if (settings.has(v.setting.trim().toLowerCase())) failures.push(`${v.id}: same setting as ${settings.get(v.setting.trim().toLowerCase())}`);
      else settings.set(v.setting.trim().toLowerCase(), v.id);
    }
  }
  return failures;
}

// A chart date (2026-01-04) may be written in the text as "January 4, 2026", "Jan 4" or "4 January".
function dateInText(iso, text) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const month = new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = String(Number(m[3]));
  return new RegExp(`\\b(${month}|${month.slice(0, 3)})\\.? ${day}\\b|\\b${day} (${month}|${month.slice(0, 3)})\\b`).test(text);
}

// The article chasing a question another post of the site already answers (title or H2): reported, not blocking.
export function overlapWarnings(config) {
  const { text } = readArticle(config.runDir);
  if (text == null) return [];
  const fm = frontmatter(text);
  const posts = sitePosts(config, { excludeSlug: fm.slug });
  const title = text.match(/^# (.+)$/m)?.[1] ?? '';
  const warnings = [];
  for (const p of posts) {
    if (overlap(title, p.title) >= SAME_QUESTION || (fm.seo_title && p.seoTitle && overlap(fm.seo_title, p.seoTitle) >= SAME_QUESTION)) warnings.push(`title chases the same query as /blog/${p.slug}/ ("${p.title}")`);
  }
  for (const [, h] of text.matchAll(/^## (.+)$/gm)) for (const hit of answeredBy(h, posts)) warnings.push(`H2 "${h.trim()}" repeats /blog/${hit.slug}/ ("${hit.heading}")`);
  return warnings;
}

// Readable copies for the owner: the replacement list and the table/figure plan.
export function writeLists(runDir) {
  const { replacements, visuals } = readArticle(runDir);
  const cell = (s, n = 400) => { const t = String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
  writeFileSync(join(runDir, '06-replacements.md'), [
    '# Replacement list', '',
    'Fill `real` for each entry in 06-replacements.json, then run `geo apply <run-dir>`.', '',
    '| id | section | kind | real information needed | current text |', '|---|---|---|---|---|',
    ...replacements.map((r) => `| ${r.id} | ${cell(r.section)} | ${r.kind} | ${cell(r.needed)} | ${cell(r.text, 160)} |`), '',
  ].join('\n'));
  writeFileSync(join(runDir, '06-visuals.md'), [
    '# Tables and figures', '',
    '| id | section | type | title | setting / chart | shows | produce |', '|---|---|---|---|---|---|---|',
    ...visuals.map((v) => `| ${v.id} | ${cell(v.section)} | ${v.type} | ${cell(v.title)} | ${cell(v.setting ?? (v.chart ? `${v.chart.kind}: ${(v.chart.items ?? []).map((i) => i.label).join(' / ')}` : ''), 220)} | ${cell(v.content, 220)} | ${cell(v.produce)} |`), '',
  ].join('\n'));
}
