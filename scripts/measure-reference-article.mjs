#!/usr/bin/env node

// The reference blog's articles, measured for ours (owner 2026-10-30): the article given (site.json reference.article)
// or the first three its blog lists, at 1440: body text line height, the gaps between paragraphs, after an H2, before
// an H2 and around pictures, characters per line, and words per picture in the text (each the articles' median). The
// text follows the reference only where it reads more easily (rhythmVars); the words per picture set how densely our
// articles are illustrated. Both go to src/data/article-rhythm.json (read by BlogPostView and the GEO article import);
// the raw measures to docs/research/raw/reference-article.json.
// Usage: node scripts/measure-reference-article.mjs <reference origin> [article url]

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { writeJson } from './lib/json-io.mjs';
import { scrollThroughPage } from './lib/reveal.mjs';

export const ARTICLE_RHYTHM_SCHEMA = 'seo-site-article-rhythm-v1';
const INDEXES = ['/blog/', '/news/', '/articles/'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rem = (px) => `${+(px / 16).toFixed(3)}rem`;

// The text is set to a readable article's rhythm (the template's defaults below), and follows the reference only where
// the reference reads more easily: more line height, more room, shorter lines (owner 2026-10-30: swimwearbali.com's
// articles are set at 1.5 with 100+ characters a line and 15px between paragraphs, tighter than ours; its picture
// density is what we take from it). A measure not taken keeps the default.
export const READABLE = Object.freeze({ lineHeight: 1.8, paragraphGap: 28, headingGap: 20, sectionGap: 40, figureGap: 48, charsPerLine: 80 });
export function rhythmVars(measured) {
  const vars = {};
  if (measured.lineHeight > READABLE.lineHeight) vars['--article-line-height'] = String(clamp(measured.lineHeight, READABLE.lineHeight, 1.9));
  if (measured.paragraphGap > READABLE.paragraphGap) vars['--article-paragraph-gap'] = rem(clamp(measured.paragraphGap, READABLE.paragraphGap, 48));
  if (measured.headingGap > READABLE.headingGap) vars['--article-heading-gap'] = rem(clamp(measured.headingGap, READABLE.headingGap, 40));
  // Before an H2: the gap less the paragraph's own (a reference whose headings carry their own space keeps ours).
  const section = measured.sectionGap != null && measured.paragraphGap != null ? measured.sectionGap - measured.paragraphGap : null;
  if (section > READABLE.sectionGap) vars['--article-section-gap'] = rem(clamp(section, READABLE.sectionGap, 80));
  // At most 64px around a picture: 96 (swimwearbali's 127, capped) broke a picture-dense article into islands.
  if (measured.figureGap > READABLE.figureGap) vars['--article-figure-gap'] = rem(clamp(measured.figureGap, READABLE.figureGap, 64));
  if (measured.charsPerLine && measured.charsPerLine < READABLE.charsPerLine) vars['--article-measure'] = `${Math.round(clamp(measured.charsPerLine, 60, READABLE.charsPerLine))}ch`;
  return vars;
}

// The reference's articles: the given URL, else the first ARTICLES of its blog index. An article card links its post
// more than once (picture, title, "read more"); a menu link outside the page shell once (swimwearbali.com's menu, not
// in its header, led to a service page).
const ARTICLES = 3;
async function articleUrls(page, origin, given) {
  if (given) return [given];
  for (const index of INDEXES) {
    const response = await page.goto(new URL(index, origin).href, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    if (!response?.ok()) continue;
    await page.waitForTimeout(2000);
    const host = new URL(page.url()).host;
    const found = await page.evaluate(({ host, count }) => {
      const links = [...document.querySelectorAll('a[href]')].filter((a) => !a.closest('header, nav, footer, aside')).map((a) => a.href.split('#')[0]).filter((href) => {
        try { const url = new URL(href); const slug = url.pathname.split('/').filter(Boolean).at(-1) ?? ''; return url.host === host && slug.split('-').length >= 4 && !/(category|tag|page|author)\//.test(url.pathname); } catch { return false; }
      });
      return [...new Set(links)].filter((href) => links.filter((other) => other === href).length >= 2).slice(0, count);
    }, { host, count: ARTICLES });
    if (found.length) return found;
  }
  return [];
}
const median = (list) => { const sorted = list.filter((value) => value != null).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

// In the browser: the article body (the element with the most paragraph text) and its rhythm.
function measureInPage() {
  const score = (el) => [...el.querySelectorAll('p')].reduce((sum, p) => sum + p.innerText.length, 0);
  const body = [...document.querySelectorAll('article, main, .entry-content, .post-content, [class*="article"], [class*="post"], [class*="blog"]')].sort((a, b) => score(b) - score(a))[0] ?? document.body;
  const paragraphs = [...body.querySelectorAll('p')].filter((p) => p.innerText.trim().length > 200);
  if (!paragraphs.length) return null;
  const p = paragraphs[Math.floor(paragraphs.length / 2)];
  const style = getComputedStyle(p);
  const font = parseFloat(style.fontSize);
  // Characters per line: the paragraph's characters over its line boxes.
  const range = document.createRange();
  range.selectNodeContents(p);
  const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  const blocks = [...body.querySelectorAll('p, h2, h3, figure, img, table, ul, ol')].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.height > 0 && !el.parentElement.closest('p, figure, li, table, ul, ol') && !(el.tagName === 'IMG' && el.closest('figure')) && (el.tagName !== 'IMG' || box.width > 250);
  });
  const kind = (el) => (['FIGURE', 'IMG'].includes(el.tagName) ? 'img' : ['UL', 'OL'].includes(el.tagName) ? 'list' : el.tagName.toLowerCase());
  const gaps = {};
  for (let index = 1; index < blocks.length; index += 1) {
    const gap = Math.round(blocks[index].getBoundingClientRect().top - blocks[index - 1].getBoundingClientRect().bottom);
    if (gap >= 0 && gap <= 300) (gaps[`${kind(blocks[index - 1])}>${kind(blocks[index])}`] ||= []).push(gap);
  }
  const median = (...keys) => { const list = keys.flatMap((key) => gaps[key] ?? []).sort((a, b) => a - b); return list.length ? list[Math.floor(list.length / 2)] : null; };
  const words = [...body.querySelectorAll('p, li')].reduce((sum, el) => sum + el.innerText.split(/\s+/).filter(Boolean).length, 0);
  const pictures = blocks.filter((el) => kind(el) === 'img').length;
  return {
    font, lineHeight: +(parseFloat(style.lineHeight) / font).toFixed(2), charsPerLine: Math.round(p.innerText.length / Math.max(1, lines)), column: Math.round(p.getBoundingClientRect().width),
    paragraphGap: median('p>p'), headingGap: median('h2>p'), sectionGap: median('p>h2', 'list>h2'), figureGap: median('p>img', 'img>p'),
    words, pictures, wordsPerPicture: pictures ? Math.round(words / pictures) : null, gaps,
  };
}

export async function measureReferenceArticle({ origin, article = null, root = process.cwd() }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const urls = await articleUrls(page, origin, article);
    if (!urls.length) return { urls: [] };
    const articles = [];
    for (const url of urls) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!response?.ok()) throw new Error(`reference article failed: ${response?.status() ?? 'no response'} ${url}`);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await scrollThroughPage(page);
      const one = await page.evaluate(measureInPage);
      if (!one) throw new Error(`no article text found on ${url}`);
      articles.push({ url, ...one });
    }
    // Each measure is the articles' median (one article's oddity does not set the rhythm).
    const keys = ['lineHeight', 'charsPerLine', 'paragraphGap', 'headingGap', 'sectionGap', 'figureGap', 'wordsPerPicture'];
    const measured = Object.fromEntries(keys.map((key) => [key, median(articles.map((one) => one[key]))]));
    const vars = rhythmVars(measured);
    await mkdir(resolve(root, 'docs/research/raw'), { recursive: true });
    await writeJson(resolve(root, 'docs/research/raw/reference-article.json'), { schemaVersion: ARTICLE_RHYTHM_SCHEMA, measuredAt: new Date().toISOString(), measured, articles });
    // The reference's words per picture in the text: the articles' picture target (lib/geo-article.mjs pictureTarget).
    await writeJson(resolve(root, 'src/data/article-rhythm.json'), { schemaVersion: ARTICLE_RHYTHM_SCHEMA, urls, vars, wordsPerPicture: measured.wordsPerPicture });
    return { urls, measured, vars };
  } finally {
    await browser.close();
  }
}

runMain(import.meta.url, async () => {
  const { positionals } = cliArgs();
  if (!positionals[0]) return usage('Usage: node scripts/measure-reference-article.mjs <reference origin> [article url]');
  const result = await measureReferenceArticle({ origin: positionals[0], article: positionals[1] ?? null });
  if (!result.urls.length) { console.log('no article found on the reference blog: articles keep the template rhythm'); return; }
  console.log(`${result.urls.join(', ')}: ${JSON.stringify(result.vars)} (${result.measured.wordsPerPicture ?? '-'} words per picture)`);
});
