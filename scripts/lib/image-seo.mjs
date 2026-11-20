// Google Images SEO for the site's own photos (owner 2026-11-20), switched by site.json imageSeo: on only where it says
// true. A new site's site.json starts with it (create-workspace.mjs); a site built before it has none and stays as
// built until scripts/handfix-image-seo.mjs sets it (owner: "新站默认打开，旧站用手改脚本"). Google's rules followed:
//   https://developers.google.com/search/docs/appearance/google-images (descriptive file names; alt text that uses the
//     page's words for what it shows, never stuffed);
//   https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps (<image:image> in the sitemap
//     the site has);
//   https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata (contentUrl and creator,
//     creditText, copyrightNotice; the IPTC digital source type of a photo a model made).
// What it does:
//   - a published photo's file name is a short slug of what it shows and the product its page names (imageSlug), unique
//     across the site, given once when the photo is published (generate-images.mjs, import-geo-article.mjs) and kept;
//   - the build writes, for every page, an ImageObject per content photo and, in sitemap.xml, an <image:image> per
//     content photo of each listed page (imageSeo(), an Astro integration); a decorative photo (empty alt) is neither;
//   - the image maker is asked to name the page's product in the alt of a photo that shows it (libraryProducts).
// With the switch off nothing here runs: file names stay the photo's id and the build is what it was.

import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage } from './built-site.mjs';
import { readJson } from './json-io.mjs';
import { legalName } from './legal-name.mjs';
import { singularOf } from './search-key.mjs';
import { absoluteUrl, organizationId, serializeJsonLd, withSitemapImages } from './seo-head.mjs';
import { xmpPacket } from './web-image.mjs';

// The switch: site.json imageSeo, on only when true (a site.json without it is a site built before it).
export const imageSeoOn = (site) => site?.imageSeo === true;
export function siteImageSeo(root = process.cwd()) {
  try { return imageSeoOn(JSON.parse(readFileSync(resolve(root, 'site.json'), 'utf8').replace(/^﻿/, ''))); } catch { return imageSeoOn(null); }
}

// English function words (a closed, language-level set): they say nothing of what a photo shows, so a file name drops them.
const FUNCTION_WORDS = new Set(('a an the and or but nor so yet of in on at by for from to into onto over under with without within '
  + 'beside besides between among against along across around behind below beneath above near through toward towards '
  + 'up down off out as while is are was were be been being has have had its it his her their them they this that these '
  + 'those there here who whom whose which what where when some each both all another other').split(' '));

// Words in plain ASCII: accents folded, "&" as and, possessive 's and apostrophes dropped, lower case.
export const asciiWords = (text) => (String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replaceAll('&', ' and ').replace(/['’]s\b/g, '').replace(/['’]/g, '').match(/[a-z0-9]+/g) ?? []);
const contentWords = (text) => asciiWords(text).filter((word) => !FUNCTION_WORDS.has(word));

// The product a page names: its plan's label (the product name, "Big & Tall Aloha Shirts"; its primary query and H1 say
// what the company is, "... manufacturer", which a photo does not show); none without one. core: its last two terms,
// singular (English names its product at the end: aloha shirt, resort dress) - what an alt text names and a file name
// carries; the label's earlier words (big, tall) are what a photo seldom shows. A term is a word, or the words the
// label joins with a hyphen ("One-Piece Swimsuits": one piece swimsuit, never "piece swimsuit"); a number before the
// core belongs to it too ("Two Piece Sets": two piece set), since a count is never left off the thing it counts.
const NUMBER = /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/;
export function productTerm(page) {
  const label = page?.planned?.label || '';
  const terms = label.split(/\s+/).map((part) => contentWords(part).map(singularOf)).filter((term) => term.length);
  if (!terms.length) return null;
  let from = Math.max(0, terms.length - 2);
  while (from > 0 && terms[from - 1].length === 1 && NUMBER.test(terms[from - 1][0])) from -= 1;
  return { label, words: terms.flat(), core: terms.slice(from).flat() };
}

// How many times a text names the product (its core, singular, as whole words).
export function productMentions(text, term) {
  if (!term?.core?.length) return 0;
  const words = asciiWords(text).map(singularOf);
  let count = 0;
  for (let index = 0; index + term.core.length <= words.length; index += 1) if (term.core.every((word, offset) => words[index + offset] === word)) count += 1;
  return count;
}

// The file name of a photo (without its size): lower-case ASCII words joined by hyphens, at most SLUG_MAX characters,
// from what it shows (its alt) and its product: the alt's words in their order when they name the product within the
// limit, else the product first and then the alt's other words. null when there is nothing to name it by.
export const SLUG_MAX = 50;
export function imageSlug({ alt, term = null }) {
  const altWords = contentWords(alt);
  const core = term?.core ?? [];
  const fit = (words) => {
    const kept = [];
    for (const word of words.filter((item, index) => words.indexOf(item) === index)) {
      if ([...kept, word].join('-').length > SLUG_MAX) break;
      kept.push(word);
    }
    return kept;
  };
  const named = (words) => core.length > 0 && productMentions(words.join(' '), term) > 0;
  const inOrder = fit(altWords);
  const words = !core.length || named(inOrder) ? inOrder : fit([...core, ...altWords.filter((word) => !core.includes(singularOf(word)))]);
  return words.length ? words.join('-') : null;
}

// A name not taken yet: the slug, else the slug with -2, -3, ... (the order photos are published in decides, and a
// published name is kept).
export function uniqueName(slug, taken) {
  let name = slug;
  for (let n = 2; taken.has(name); n += 1) name = `${slug}-${n}`;
  taken.add(name);
  return name;
}

// The names the site's published photos already have (each file's name without its size and crop suffix), in every
// folder of public/media: a new photo is named apart from all of them.
export const SIZE_SUFFIX = /-\d+(?:-phone-\d+)?\.(?:webp|png|jpe?g)$/i;
export async function takenNames(root) {
  const taken = new Set();
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else if (SIZE_SUFFIX.test(entry.name)) taken.add(entry.name.replace(SIZE_SUFFIX, ''));
    }
  };
  await walk(resolve(root, 'public/media'));
  return taken;
}

// The page whose product a library photo shows: the first route of the image plan's category (plan.routes: route ->
// category), else the home page (the site's own product: a site-wide photo, a theme's).
export function productPageOf(entry, { routes = {}, pages = [] } = {}) {
  const route = Object.entries(routes).find(([, category]) => category === entry?.category)?.[0] ?? '/';
  return pages.find((page) => page.route === route) ?? pages.find((page) => page.route === '/') ?? null;
}

// The file name a photo is published under: with the switch on, its slug (unique among taken); otherwise, or with no
// alt to name it by, the fallback (its id, as before).
export function publishedName({ on, alt, term, taken, fallback }) {
  const slug = on ? imageSlug({ alt, term }) : null;
  if (!slug) { taken?.add(fallback); return fallback; }
  return uniqueName(slug, taken);
}

// The namer of a site's library photos as they are published (generate-images.mjs): (entry, alt) -> the file name,
// the product from the entry's page (productPageOf), unique among every published name; the entry's id with the switch
// off. A published photo keeps its name; a photo made again is another photo and takes the name of what it now shows
// (its earlier files go: removePublished).
const productPages = async (root) => [...await readJson(resolve(root, 'src/data/authoring-pages.json'), []), ...await readJson(resolve(root, 'src/data/placeholder-pages.json'), [])];
export async function libraryNamer(root, plan) {
  const on = siteImageSeo(root);
  const taken = on ? await takenNames(root) : new Set();
  const pages = on ? await productPages(root) : [];
  return (entry, alt) => publishedName({ on, alt, term: photoTerm(entry, { routes: plan?.routes ?? {}, pages, alt }), taken, fallback: entry.id });
}

// The product name the image maker is given for a photo's alt (lib/image-prompt.mjs closing): the product a photo of
// the goods is made to show (photoTerm before the photo has an alt); none for any other photo, or with the switch off.
export async function libraryProducts(root, plan) {
  if (!siteImageSeo(root)) return () => null;
  const pages = await productPages(root);
  return (entry) => photoTerm(entry, { routes: plan?.routes ?? {}, pages, alt: '' })?.core.join(' ') ?? null;
}

// Every published file of a photo (each size and phone crop of the name src has) removed: a photo made again under
// another name leaves none of its earlier files behind.
export async function removePublished(root, src) {
  const dir = resolve(root, 'public', src.slice(1, src.lastIndexOf('/')));
  const stem = publishedStem(src);
  for (const file of await readdir(dir).catch(() => [])) if (SIZE_SUFFIX.test(file) && file.replace(SIZE_SUFFIX, '') === stem) await rm(join(dir, file), { force: true });
}

// The product a library photo shows: its page's (productPageOf), else the site's (the home page's), whichever its alt
// names or, for a photo of the goods themselves (lib/photo-class.mjs goods, not a close-up of their material), its plan
// entry was made to show (its products, subject or brief name it); none otherwise (a scene of the work, a fabric, a
// theme's photo), so a name never claims a product the photo does not show.
export function photoTerm(entry, { routes = {}, pages = [], alt = entry?.alt } = {}) {
  const made = `${entry?.products ?? ''} ${entry?.subject ?? ''} ${entry?.intent?.content ?? ''}`;
  const goods = entry?.photoClass === 'goods' && entry?.kind !== 'material';
  const candidates = [productTerm(productPageOf(entry, { routes, pages })), productTerm(pages.find((page) => page.route === '/'))].filter(Boolean);
  return candidates.find((term) => productMentions(alt, term) > 0) ?? (goods ? candidates.find((term) => productMentions(made, term) > 0) : null) ?? null;
}

// The namer of an article's pictures (import-geo-article.mjs): (id, alt) -> the file name from its alt; the picture's id
// with the switch off.
export async function articleNamer(root) {
  const on = siteImageSeo(root);
  const taken = on ? await takenNames(root) : new Set();
  const home = on ? (await readJson(resolve(root, 'src/data/authoring-pages.json'), [])).find((page) => page.route === '/') : null;
  const term = productTerm(home);
  // The site's product only where the alt names it (an article's picture was not made to show the product).
  return (id, alt) => publishedName({ on, alt, term: productMentions(alt, term) > 0 ? term : null, taken, fallback: id });
}
// A published file's name without its folder, size and crop (/media/blog/a/b-960.webp is b).
export const publishedStem = (src) => String(src ?? '').split('/').at(-1).replace(SIZE_SUFFIX, '');

// The XMP a published file carries (lib/web-image.mjs xmpPacket): (sourceType) -> the packet with the site as creator
// and credit line and the copyright notice as the footer states it, the IPTC digital source type its record states;
// null for every file while site.json imageSeo is off or the site has no name yet (the files stay without metadata).
export async function siteXmp(root, { year = new Date().getFullYear() } = {}) {
  if (!siteImageSeo(root)) return () => null;
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  if (!identity?.siteName) return () => null;
  const copyright = `© ${year} ${legalName({ identity })}`;
  return (sourceType = null) => xmpPacket({ sourceType, creator: identity.siteName, copyright });
}

// The IPTC digital source type (https://cv.iptc.org/newscodes/digitalsourcetype/) as schema.org's enumeration names it:
// trainedAlgorithmicMedia is https://schema.org/TrainedAlgorithmicMediaDigitalSource.
export const schemaSourceType = (code) => (/^[a-z][A-Za-z]+$/.test(code ?? '') ? `https://schema.org/${code.charAt(0).toUpperCase()}${code.slice(1)}DigitalSource` : null);

// Every published file of the site's photos -> the IPTC digital source type its record states: the image register's
// photos (docs/research/image-plan.json origin), the blog's (docs/research/geo-articles/*/record.json), the owner's own
// photos where src/data/site-media.json states one, and each photo's phone crops (src/data/phone-heroes.json) as their
// photo. A file no record names has none (nothing is guessed).
const filesOf = (web) => [web?.src, web?.wide?.src, ...String(web?.srcset ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])].filter(Boolean);
export async function imageSources(root) {
  const sources = new Map();
  const note = (web, type) => { if (type) for (const file of filesOf(web)) sources.set(file, type); };
  for (const entry of (await readJson(resolve(root, 'docs/research/image-plan.json'), { entries: [] })).entries ?? []) note(entry.web, entry.origin?.digitalSourceType);
  const articles = resolve(root, 'docs/research/geo-articles');
  for (const name of (await readdir(articles, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
    const record = await readJson(join(articles, name, 'record.json'), null);
    for (const visual of Object.values(record?.visuals ?? {})) note({ ...visual.web, wide: visual.wide }, visual.origin?.digitalSourceType);
  }
  for (const photo of (await readJson(resolve(root, 'src/data/site-media.json'), { photos: [] })).photos ?? []) note(photo, photo.digitalSourceType ?? photo.origin?.digitalSourceType);
  const phone = await readJson(resolve(root, 'src/data/phone-heroes.json'), { crops: {} });
  for (const [src, crops] of Object.entries(phone.crops ?? {})) for (const crop of Object.values(crops ?? {})) if (sources.has(src)) sources.set(crop.src, sources.get(src));
  return sources;
}

// The ImageObject of one content photo (Google's image metadata): its URL, the site as its creator and credit, the
// copyright as the footer states it, and the digital source type its record states.
export function imageObjectSchema({ src, identity, owner, year, sourceType = null }) {
  const type = schemaSourceType(sourceType);
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    contentUrl: absoluteUrl(identity, src),
    creator: { '@type': 'Organization', '@id': organizationId(identity), name: identity.siteName },
    creditText: identity.siteName,
    copyrightNotice: `© ${year} ${owner}`,
    ...(type ? { digitalSourceType: type } : {}),
  };
}

// A page's content photos: the images of its main content that have an alt (a decorative one has none) and are the
// site's own files, once each in page order. The photo under an overlay hero's copy is one: it is the page's main
// photo and its alt says what it shows (PageHero.astro), though the alt rules still read its class as a backdrop.
export function contentImages(html) {
  const seen = new Set();
  return parsePage(html).images.filter((image) => image.inMain && !image.decorative && (image.alt ?? '').trim() && image.src?.startsWith('/') && !image.src.startsWith('//'))
    .filter((image) => !seen.has(image.src) && seen.add(image.src));
}

// How many of the site's content photos name the product in their alt (Google: alt text that uses the page's words
// for what the photo shows, the product named once): built [[page, html]]; a photo counts when its alt names the
// page's product (productTerm) or the site's (the home page's). { images, named, repeated: [...], unnamed: [...] }, a
// report only (the alt is the image maker's: lib/alt-text.mjs).
export function altProductReport(built) {
  const home = productTerm(built.find(([page]) => page.route === '/')?.[0]);
  const report = { images: 0, named: 0, repeated: [], unnamed: [] };
  for (const [page, html] of built) {
    if (!html) continue;
    const terms = [productTerm(page), home].filter(Boolean);
    if (!terms.length) continue;
    for (const image of contentImages(html)) {
      report.images += 1;
      const counts = terms.map((term) => productMentions(image.alt, term));
      const where = `${page.route} ${image.src.split('/').at(-1)}`;
      if (counts.some((count) => count > 0)) report.named += 1;
      else report.unnamed.push(where);
      if (counts.some((count) => count > 1)) report.repeated.push(where);
    }
  }
  return report;
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => (entry.isDirectory() ? htmlFiles(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])))).flat().sort();
}

// Into the built site: an ImageObject per content photo in each page's head (before </head>), and the content photos
// of each page the sitemap lists as its <image:image> entries. { pages, images, sitemapImages } counted.
export async function writeImageSeo(dist, { root, identity, year = new Date().getFullYear() }) {
  if (!identity?.origin || !identity.siteName) return { pages: 0, images: 0, sitemapImages: 0 };
  const owner = legalName({ identity });
  const sources = await imageSources(root);
  const byLoc = new Map();
  let pages = 0;
  let images = 0;
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(file, 'utf8');
    const photos = contentImages(html);
    if (!photos.length || !html.includes('</head>')) continue;
    const blocks = photos.map((image) => `<script type="application/ld+json">${serializeJsonLd(imageObjectSchema({ src: image.src, identity, owner, year, sourceType: sources.get(image.src) }))}</script>`).join('');
    await writeFile(file, html.replace('</head>', () => `${blocks}</head>`));
    const canonical = parsePage(html).canonical;
    if (canonical) byLoc.set(canonical, photos.map((image) => absoluteUrl(identity, image.src)));
    pages += 1;
    images += photos.length;
  }
  const sitemapPath = join(dist, 'sitemap.xml');
  let sitemapImages = 0;
  if (existsSync(sitemapPath)) {
    const xml = withSitemapImages(await readFile(sitemapPath, 'utf8'), byLoc);
    sitemapImages = (xml.match(/<image:image>/g) ?? []).length;
    await writeFile(sitemapPath, xml);
  }
  return { pages, images, sitemapImages };
}

// The Astro integration: after the share images are cut, before the release guard prunes (astro.config.mjs adds it
// only while the switch is on).
export function imageSeo() {
  let root = null;
  return {
    name: 'seo-site-image-seo',
    hooks: {
      'astro:config:done': ({ config }) => { root = fileURLToPath(config.root); },
      'astro:build:done': async ({ dir, logger }) => {
        const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
        const result = await writeImageSeo(fileURLToPath(dir), { root, identity });
        logger.info(`image SEO: ${result.images} ImageObject(s) on ${result.pages} page(s), ${result.sitemapImages} sitemap image(s)`);
      },
    },
  };
}
