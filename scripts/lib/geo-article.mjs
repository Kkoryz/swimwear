// A GEO blog article (geo-blog-research: runs/<slug>/06-article.md and 06-visuals.json) as a blog post of the site
// (seo-site-blog-post-v1, lib/blog.mjs). The Markdown is the article's one source: an optional frontmatter (seo_title,
// seo_description, slug), one H1, H2 sections with paragraphs, H3 subheadings, lists, tables and images
// ![alt](visuals/<id>.png) in the writer's order. Each section keeps that order (body). The hero visual is the post's
// featured image; every other visual stays where the writer placed it.

import { chartErrors } from './blog.mjs';

const VISUAL = /^!\[([^\]]*)\]\(visuals\/([A-Za-z0-9_-]+)\.[a-z]+\)$/;
const SLUG_WORDS = 8;
const INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export const slugOf = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, SLUG_WORDS).join('-');

// key: value lines between --- fences at the top (quotes around a value dropped).
function frontmatter(markdown) {
  const match = markdown.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { fields: {}, rest: markdown };
  const fields = Object.fromEntries(match[1].split(/\r?\n/).map((line) => line.match(/^([A-Za-z_]+):\s*(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value.trim().replace(/^(['"])(.*)\1$/, '$2')]));
  return { fields, rest: markdown.slice(match[0].length) };
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

// { fields, title, sections: [{ heading, body: [{ text } | { subheading } | { list } | { table } | { visual, alt }] }] }.
// Text before the first H2 opens the article (lead).
export function parseArticle(markdown) {
  const { fields, rest } = frontmatter(markdown);
  const lines = rest.split(/\r?\n/);
  let title = null;
  const lead = [];
  const sections = [];
  const into = () => sections.at(-1)?.body ?? lead;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^# /.test(line)) { if (title) throw new Error(`a second H1: "${line}"`); title = line.slice(2).trim(); continue; }
    if (/^## /.test(line)) { sections.push({ heading: line.slice(3).trim(), body: [] }); continue; }
    if (/^### /.test(line)) { into().push({ subheading: line.slice(4).trim() }); continue; }
    if (/^#{4,} /.test(line)) throw new Error(`a heading below H3 is not supported: "${line}"`);
    const visual = line.match(VISUAL);
    if (visual) { into().push({ visual: visual[2], alt: visual[1].trim() }); continue; }
    if (line.startsWith('|')) {
      const block = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) block.push(lines[index++].trim());
      index -= 1;
      // The first row is the header; a writer that left out the separator line under it meant the same table.
      const separated = /^\|?\s*:?-{3,}/.test(block[1] ?? '');
      if (block.length < (separated ? 3 : 2)) throw new Error(`a table without rows: "${block[0]}"`);
      into().push({ table: { columns: cells(block[0]), rows: block.slice(separated ? 2 : 1).map(cells) } });
      continue;
    }
    const item = /^(?:[-*]|(\d+)\.)\s+(.*)$/;
    if (item.test(line)) {
      const ordered = Boolean(line.match(item)[1]);
      const items = [];
      while (index < lines.length && item.test(lines[index].trim())) items.push(lines[index++].trim().match(item)[2]);
      index -= 1;
      into().push({ list: { ...(ordered ? { ordered } : {}), items } });
      continue;
    }
    // A paragraph: its lines up to the next blank line or block.
    const paragraph = [line];
    while (index + 1 < lines.length && lines[index + 1].trim() && !/^(#|!\[|\||[-*]\s|\d+\.\s)/.test(lines[index + 1].trim())) paragraph.push(lines[++index].trim());
    into().push({ text: paragraph.join(' ') });
  }
  if (!title) throw new Error('the article has no H1');
  if (!sections.length) throw new Error('the article has no H2 section');
  return { fields, title, lead, sections };
}

// How densely an article is illustrated: the reference blog's words per picture (measure-reference-article.mjs) or the
// best-ranking competitor's (Thygesen's buyer's guides, measured 2026-10-30: one picture every 400 words), whichever
// is denser, never denser than one every MIN_WORDS_PER_PICTURE (owner 2026-10-30: the reference's density, the text
// readable). Words per picture in the text (the hero not counted), and the sections with fewer than they want: a
// section of SECTION_WORDS or more wants one picture per target's words. Reported, never blocking: the writer plans
// the pictures.
export const WORDS_PER_PICTURE = 400;
const MIN_WORDS_PER_PICTURE = 150;
const SECTION_WORDS = 150;
export const pictureTarget = (referenceWordsPerPicture) => Math.max(MIN_WORDS_PER_PICTURE, Math.min(WORDS_PER_PICTURE, referenceWordsPerPicture || WORDS_PER_PICTURE));
export function pictureDensity(article, visuals = [], target = WORDS_PER_PICTURE) {
  const hero = new Set(visuals.filter((visual) => visual.type === 'hero').map((visual) => visual.id));
  const words = (parts) => parts.filter((part) => part.text).reduce((sum, part) => sum + part.text.split(/\s+/).filter(Boolean).length, 0);
  const sections = article.sections.map((section) => ({ heading: section.heading, words: words(section.body), pictures: section.body.filter((part) => part.visual && !hero.has(part.visual)).length }));
  const total = words(article.lead) + sections.reduce((sum, section) => sum + section.words, 0);
  const pictures = sections.reduce((sum, section) => sum + section.pictures, 0);
  const wants = (count) => (count < SECTION_WORDS ? 0 : Math.max(1, Math.floor(count / target)));
  const short = sections.filter((section) => section.pictures < wants(section.words));
  return { words: total, pictures, wordsPerPicture: pictures ? Math.round(total / pictures) : null, target, enough: pictures >= Math.floor(total / target) && !short.length, sectionsShort: short.map(({ heading, words: count, pictures: have }) => ({ heading, words: count, pictures: have, wants: wants(count) })) };
}

// The visuals the article places, in order: [{ id, alt }].
export const placedVisuals = (article) => [...article.lead, ...article.sections.flatMap((section) => section.body)].filter((part) => part.visual).map(({ visual, alt }) => ({ id: visual, alt }));

// The post. images: id -> { src, srcset, width, height } of each made visual (the hero's at its widest size for the
// featured image); visuals: 06-visuals.json's list. A visual not made yet is left out (listed in missing).
export function articlePost(article, { visuals = [], images = {}, previous = null, now = new Date() } = {}) {
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  const missing = [];
  let image = null;
  const part = (item) => {
    if (!item.visual) return [item];
    // A chart is drawn by the template from the writer's data, not made as an image.
    const visual = byId.get(item.visual);
    if (visual?.type === 'chart') {
      const errors = chartErrors(visual.chart, `${item.visual}.chart`);
      if (errors.length) throw new Error(`06-visuals.json: ${errors.join('; ')}`);
      return [{ chart: { ...visual.chart, alt: item.alt, ...(visual.title ? { caption: visual.title } : {}) } }];
    }
    const made = images[item.visual];
    if (!made) { missing.push(item.visual); return []; }
    if (byId.get(item.visual)?.type === 'hero') { image = { src: made.wide?.src ?? made.src, alt: item.alt, width: made.wide?.width ?? made.width, height: made.wide?.height ?? made.height }; return []; }
    return [{ figure: { src: made.src, srcset: made.srcset, alt: item.alt, width: made.width, height: made.height, ...(byId.get(item.visual)?.title ? { caption: byId.get(item.visual).title } : {}) } }];
  };
  // A visual placed in the opening (the 11-16 writer puts the hero there, after the answer) is made as any other: the
  // hero is the featured image, another one opens the first section (the opening holds text only).
  const opening = article.lead.filter((item) => item.visual).flatMap(part);
  const sections = article.sections.map((section, index) => ({ heading: section.heading, body: [...(index ? [] : opening), ...section.body.flatMap(part)] }));
  // The opening answer: the text before the first H2, else the first section's first paragraph.
  let lead = article.lead.filter((item) => item.text).map((item) => item.text);
  if (!lead.length) {
    const first = sections[0].body.findIndex((item) => item.text);
    if (first < 0) throw new Error(`the first section "${sections[0].heading}" has no paragraph to open the article with`);
    lead = [sections[0].body[first].text];
    sections[0].body.splice(first, 1);
  }
  const empty = sections.filter((section) => !section.body.some((item) => item.text));
  if (empty.length) throw new Error(`sections with no paragraph of their own: ${empty.map((section) => `"${section.heading}"`).join(', ')}`);
  const sources = [...new Map([...lead, ...sections.flatMap((section) => section.body.flatMap((item) => item.table ? item.table.rows.flat() : [item.text ?? '']))].flatMap((text) => [...text.matchAll(INLINE_LINK)]).map(([, label, url]) => [url, { title: label, url }])).values()];
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const { seo_title: seoTitle, seo_description: seoDescription, slug } = article.fields;
  const post = {
    slug: slug || previous?.slug || slugOf(article.title),
    status: 'review',
    seo: { title: seoTitle || article.title, description: seoDescription || lead[0] },
    title: article.title,
    lead,
    datePublished: previous?.datePublished ?? stamp,
    dateModified: stamp,
    author: { type: 'Organization' },
    ...(image ? { image } : {}),
    takeaways: [],
    sections,
    sources,
  };
  return { post, missing, seoMissing: [!seoTitle && 'seo_title', !seoDescription && 'seo_description'].filter(Boolean) };
}
