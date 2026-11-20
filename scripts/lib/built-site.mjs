// The built site (dist/) as the stage 10-12 checks read it: one file per route, read once, and what a page's HTML says
// to search engines and visitors. Plain patterns over Astro's own output (double-quoted attributes, closed tags).

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mainText } from './content-fingerprint.mjs';
import { readText } from './json-io.mjs';

export const distFile = (root, route) => resolve(root, 'dist', route === '/' ? 'index.html' : `${route.replace(/^\/|\/$/g, '')}/index.html`);

// A page's built HTML, or null when the route has no file.
export const readBuiltPage = (root, route) => readText(distFile(root, route), null);

// Every page's built HTML by route (null for a route with no file).
export async function readBuiltPages(root, pages) {
  const built = new Map();
  for (const page of pages) built.set(page.route, await readBuiltPage(root, page.route));
  return built;
}

// The HTML of every file in dist/ (pages, the 404 page, whatever else the build wrote), sorted by path; [] without dist.
export async function builtHtmlFiles(root) {
  const walk = async (dir) => (existsSync(dir) ? (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])))).flat() : []);
  return Promise.all((await walk(resolve(root, 'dist'))).sort().map((file) => readFile(file, 'utf8')));
}

export const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
export const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) || [];
// Text as a reader sees it: the named entities a build writes and every numeric one (&#39;, &#x27;), each decoded once
// (&amp;lt; is the five characters "&lt;", never "<").
const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
export const decode = (text) => text.replace(/&(?:(amp|quot|apos|lt|gt|nbsp)|#(\d{1,7})|#x([0-9a-f]{1,6}));/gi, (entity, name, decimal, hex) => {
  if (name) return NAMED[name.toLowerCase()];
  const code = decimal ? Number(decimal) : parseInt(hex, 16);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
});
const plain = (html) => decode(html.replace(/<[^>]+>/g, '').trim());

// A backdrop under text (hero, band, CTA) or a photo marked data-decorative (a card photo beside its own title) is
// decorative: an empty alt is right for it.
// The photo under an overlay hero's copy is the page's main photo (PageHero.astro): with an alt it is a content photo
// and its alt keeps the alt rules; without one it is the backdrop it was.
export const isDecorative = (image) => Boolean(image.decorative) || (/__backdrop\b/.test(image.class ?? '') && !(/\bpage-hero__backdrop\b/.test(image.class) && (image.alt ?? '').trim()));

// Root-relative link targets without query or fragment.
export const internalLinks = (html) => [...html.matchAll(/<a\b[^>]*\shref="(\/[^"#?]*)/g)].map((match) => match[1]);

export function parsePage(html) {
  const head = html.split('</head>')[0];
  const meta = new Map();
  for (const tag of tags(head, 'meta')) for (const key of [attribute(tag, 'name'), attribute(tag, 'property')]) if (key && !meta.has(key)) meta.set(key, attribute(tag, 'content'));
  const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1].trim());
  const mainAt = html.indexOf('<main');
  return {
    lang: attribute(html.match(/<html\b[^>]*>/)?.[0] ?? '', 'lang'),
    titles,
    title: titles[0] ?? null,
    meta,
    description: meta.get('description') ?? null,
    robots: meta.get('robots') ?? null,
    canonical: attribute(tags(head, 'link').find((tag) => attribute(tag, 'rel') === 'canonical') ?? '', 'href'),
    // data is undefined when the block does not parse.
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => {
      try { return { text: match[1], data: JSON.parse(match[1]) }; } catch { return { text: match[1], data: undefined }; }
    }),
    headings: [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({ level: Number(match[1]), html: match[2], text: plain(match[2]) })),
    // alt: '' for an empty or bare alt attribute, null when there is none.
    images: [...html.matchAll(/<img\b[^>]*>/g)].map(({ 0: tag, index }) => ({
      src: attribute(tag, 'src'), alt: attribute(tag, 'alt') ?? (/\salt(?=[\s=>/])/.test(tag) ? '' : null), loading: attribute(tag, 'loading'),
      class: attribute(tag, 'class'), width: attribute(tag, 'width'), height: attribute(tag, 'height'), decorative: /\sdata-decorative\b/.test(tag), inMain: mainAt >= 0 && index > mainAt,
    })),
    links: [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)].map(({ 0: anchor, 1: open, 2: inner }) => ({ href: attribute(open, 'href'), text: plain(inner), ariaLabel: attribute(anchor, 'aria-label'), imageAlt: inner.match(/<img\b[^>]*\salt="([^"]+)"/)?.[1] ?? null })),
    mainText: mainText(html),
  };
}
