// The stage 10 SEO audit's checks across the built site (four-site audit 2026-11-17, Fable's plan 4.2; claude-seo's
// seo-technical, seo-images, seo-local and seo-content rules and Modern Web Guidance's accessibility and performance
// rules, ported as code, never installed): the menus, image weight, the first image's priority, the company's phone and
// address against its structured data, every control's accessible name, links in, dates, thin pages, retired product
// names and files nobody uses. Each finding is { route, issue, detail, level: 'error' | 'warning' }; who clears it is
// lib/issue-owners.mjs's (ownerOf).

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { attribute, decode, internalLinks, parsePage } from './built-site.mjs';
import { promiseIn, isFileHref, isResourcePage } from './resource-promise.mjs';
import { isIndexable } from './seo-head.mjs';
import { emailsIn, isPrivacyPolicy, retentionsIn } from './data-practices.mjs';
import { HERO_MAX_PAGES, PHOTO_MAX_PAGES, REUSE_CAPPED_KINDS } from './image-plan.mjs';
import { GENERAL } from './media-allocation.mjs';
import { LIBRARY_PATH } from './release-guard.mjs';
import { COUNTRIES, countryCode, serviceAreaEntry, WORLDWIDE } from './site-company.mjs';

const error = (route, issue, detail) => ({ route, issue, detail, level: 'error' });
const warning = (route, issue, detail) => ({ route, issue, detail, level: 'warning' });
const plain = (html) => decode(String(html ?? '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
const listed = (items, max = 5) => `${items.slice(0, max).join(' ')}${items.length > max ? ` and ${items.length - max} more` : ''}`;

// The parts of a built page: its site header, its site footer (the template's SiteHeader and SiteFooter, one each) and
// its main content.
export function regions(html) {
  const part = (pattern) => html.match(pattern)?.[0] ?? '';
  const main = part(/<main\b[\s\S]*<\/main>/);
  // The related links (RelatedPagesBlock: data-authoring-block="relatedPages"), the content's own menus.
  const related = [...main.matchAll(/<section\b[^>]*data-authoring-block="relatedPages"[\s\S]*?<\/section>/g)].map((match) => match[0]).join('\n');
  return { header: part(/<header\b[^>]*data-site-header[\s\S]*?<\/header>/), footer: part(/<footer\b[^>]*data-site-footer[\s\S]*?<\/footer>/), main, related };
}

// The menus send readers and crawlers to pages the search engines are told to skip (four-site audit: the swimwear
// Launch page, two hotel-rm pages, Staylumen's Nashville): a page in the header, the footer or a related-links block
// (site13 blind audit 2026-11-17 H-4: the home page's named the held blog hub) is an indexable page. One
// finding per page linked, with where: a failure for a page Site Factory holds (the menus leave those out,
// src/lib/navigation.ts), a warning for a placeholder page (Site Factory has not written it yet; its release is held by
// the preflight's placeholder_page_present, and a run builds with such pages until then).
export function navNoindexProblems(pages, built) {
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const found = new Map();
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    const parts = regions(html);
    for (const where of ['header', 'footer', 'related']) {
      for (const href of new Set(internalLinks(parts[where]))) {
        const target = byRoute.get(href);
        if (!target || isIndexable(target)) continue;
        const entry = found.get(href) ?? found.set(href, { where: new Set(), on: 0 }).get(href);
        entry.where.add(where);
        entry.on += 1;
      }
    }
  }
  return [...found].map(([route, { where, on }]) => (byRoute.get(route).status === 'placeholder' ? warning : error)(route, 'nav_links_noindex', `a ${byRoute.get(route).status} (noindex) page linked from the ${[...where].join(' and ')} (${on} link(s) across the site): build it out, or take it out of the menus`));
}

// Image weight (claude-seo seo-images; the four sites' 400 KB phone heroes): a hero photo over HERO_IMAGE_MAX_BYTES or
// a content photo over CONTENT_IMAGE_MAX_BYTES warns; an image fetched at once (loading eager, or fetchpriority high)
// over EAGER_IMAGE_MAX_BYTES fails. Each image's weight is its heaviest file (src, srcset and its <picture>'s sources:
// what a wide screen gets). One finding per image, with the pages that show it.
export const HERO_IMAGE_MAX_BYTES = 300 * 1024;
export const CONTENT_IMAGE_MAX_BYTES = 200 * 1024;
export const EAGER_IMAGE_MAX_BYTES = 200 * 1024;
const candidates = (tag) => [attribute(tag, 'src'), ...(attribute(tag, 'srcset') ?? '').split(',').map((entry) => entry.trim().split(/\s+/)[0])].filter((src) => src?.startsWith('/'));
// The bands the template draws between the hero and a page's first section (its lead, table of contents) and a
// section's own charts: no section of their own for firstScreen.
const LEADING_BANDS = new Set(['page-lead', 'page-toc', 'charts']);
// The images of a page's main content: { files, hero, eager, firstScreen } each (the hero is the block
// data-authoring-block="hero"; firstScreen: in the hero, before it, or in the first section after it, where it may be
// seen without scrolling: site13 claude-seo audit 2026-11-17, L-5).
export function mainImages(html) {
  const main = regions(html).main;
  const images = [];
  // Each block's chunk: the hero is the one marked as such.
  const chunks = main.split(/(?=<[a-z]+\b[^>]*\sdata-authoring-block=")/);
  let sections = 0;
  for (const chunk of chunks) {
    const hero = /^<[a-z]+\b[^>]*\sdata-authoring-block="hero"/.test(chunk);
    const block = chunk.match(/^<[a-z]+\b[^>]*\sdata-authoring-block="([^"]*)"/)?.[1] ?? null;
    if (block && !hero && !LEADING_BANDS.has(block)) sections += 1;
    const firstScreen = sections <= 1;
    for (const { 0: picture } of chunk.matchAll(/<picture\b[\s\S]*?<\/picture>|<img\b[^>]*>/g)) {
      const img = picture.startsWith('<img') ? picture : picture.match(/<img\b[^>]*>/)?.[0];
      if (!img) continue;
      const sources = picture.startsWith('<picture') ? (picture.match(/<source\b[^>]*>/g) ?? []) : [];
      images.push({ tag: img, src: attribute(img, 'src'), files: [...new Set([...candidates(img), ...sources.flatMap(candidates)])], phone: phoneFile(img, sources), hero, firstScreen, eager: attribute(img, 'loading') === 'eager' || attribute(img, 'fetchpriority') === 'high' });
    }
  }
  return images;
}
// The file a phone (390 px wide at twice its pixels) fetches: a <source> for narrow screens, else the srcset's smallest
// candidate of 780w or more (else its widest), else the img's src.
const PHONE_PIXELS = 780;
export function phoneFile(img, sources = []) {
  const narrow = sources.find((source) => /max-width/.test(attribute(source, 'media') ?? ''));
  const set = (tag) => (attribute(tag, 'srcset') ?? '').split(',').map((entry) => entry.trim().split(/\s+/)).filter(([url]) => url).map(([url, width]) => ({ url, width: Number.parseInt(width, 10) || 0 }));
  if (narrow) return set(narrow)[0]?.url ?? null;
  const entries = set(img).sort((left, right) => left.width - right.width);
  return (entries.find((entry) => entry.width >= PHONE_PIXELS) ?? entries.at(-1))?.url ?? attribute(img, 'src') ?? null;
}
// An image fetched at once (the hero) fails when the file a phone takes is over EAGER_IMAGE_MAX_BYTES (the slow-network
// LCP), and its widest file over HERO_IMAGE_MAX_BYTES is only reported: desktops take the 1536w file (site13: 195-265
// KB at the lowest quality the renderer keeps, owner 2026-11-17 "不要浪费" — no photo is made again for it).
export async function imageWeightProblems(root, pages, built) {
  const sizes = new Map();
  const bytes = async (src) => {
    if (!sizes.has(src)) sizes.set(src, (await stat(resolve(root, 'dist', decodeURIComponent(src.replace(/^\//, '').split(/[?#]/)[0]))).catch(() => null))?.size ?? null);
    return sizes.get(src);
  };
  const found = new Map();
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    for (const image of mainImages(html)) {
      const weights = (await Promise.all(image.files.map(async (file) => [file, await bytes(file)]))).filter(([, size]) => size !== null);
      if (!weights.length) continue;
      const [widest, widestSize] = weights.sort((left, right) => right[1] - left[1])[0];
      const phone = image.phone ? weights.find(([candidate]) => candidate === image.phone) ?? [image.phone, await bytes(image.phone)] : null;
      const phoneHeavy = image.eager && phone?.[1] != null && phone[1] > EAGER_IMAGE_MAX_BYTES;
      const [file, size] = phoneHeavy ? phone : [widest, widestSize];
      const level = phoneHeavy ? 'error' : (image.hero || image.eager ? size > HERO_IMAGE_MAX_BYTES : size > CONTENT_IMAGE_MAX_BYTES) ? 'warning' : null;
      if (!level) continue;
      const key = `${level} ${file}`;
      const entry = found.get(key) ?? found.set(key, { level, file, size, image, routes: [] }).get(key);
      entry.routes.push(page.route);
    }
  }
  return [...found.values()].map(({ level, file, size, image, routes }) => (level === 'error' ? error : warning)(file, 'image_weight', `${kb(size)}, ${image.eager ? `fetched at once, at most ${kb(EAGER_IMAGE_MAX_BYTES)}` : image.hero ? `a hero photo, at most ${kb(HERO_IMAGE_MAX_BYTES)}` : `a content photo, at most ${kb(CONTENT_IMAGE_MAX_BYTES)}`}; on ${listed(routes, 3)}`));
}

// The first image of a page's content that loads at once (its likely LCP) asks to be fetched first (claude-seo
// seo-images, Modern Web Guidance optimize-image-priority): fetchpriority="high" (motel's blog hub had none). One
// warning per page; a lazy first image is first_image_lazy's failure.
export function lcpPriorityProblems(html) {
  const first = mainImages(html)[0];
  const tag = first?.tag;
  if (!tag || attribute(tag, 'loading') === 'lazy' || attribute(tag, 'fetchpriority') === 'high') return [];
  return [{ level: 'warning', issue: 'lcp_fetchpriority_missing', detail: `${first.src}: the first image of the page loads at once without fetchpriority="high"` }];
}

// An image below the first screen loads lazily (site13 claude-seo audit 2026-11-17, L-5: the privacy and terms pages
// fetched their closing call to action's backdrop eagerly, as the first image of a page without a hero photo): one
// loading eager, or fetched first, beyond the first section after the hero (mainImages firstScreen). One warning each.
export function offscreenEagerProblems(html) {
  return mainImages(html).filter((image) => image.eager && !image.firstScreen).map((image) => ({ level: 'warning', issue: 'image_eager_offscreen', detail: `${image.src}: below the first section, it loads at once (loading="lazy" there)` }));
}

// Whether the page's first image is one the first screen shows (mainImages firstScreen): only then may it not be lazy
// (first_image_lazy); a page whose first image is its closing photo lazy-loads it.
export const firstImageOnScreen = (html) => mainImages(html)[0]?.firstScreen ?? true;

// Controls without an accessible name (Modern Web Guidance accessibility.md; claude-seo seo-agentic's P0 "accessible
// names"; the motel blog cards' photo links): a link, a button, or a form control (not hidden) a screen reader or an
// agent cannot name. The text inside (an image's alt, an svg title), aria-label, aria-labelledby to an element with
// text, title, a <label for> or a wrapping <label>, an input button's value or an image input's alt name it.
export function controlNameProblems(html) {
  const body = html.match(/<body\b[\s\S]*<\/body>/)?.[0] ?? html;
  const idText = (ids) => String(ids ?? '').split(/\s+/).filter(Boolean).map((id) => plain(body.match(new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)<\\/\\1>`))?.[2] ?? '')).join(' ').trim();
  const contentName = (inner) => plain(inner) || (inner.match(/<img\b[^>]*\salt="([^"]+)"/)?.[1] ?? '') || plain(inner.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
  // A control hidden from assistive technology and the tab order (a card photo's duplicate link, aria-hidden with
  // tabindex -1) is no control to name.
  const ownName = (tag) => attribute(tag, 'aria-label')?.trim() || idText(attribute(tag, 'aria-labelledby')) || attribute(tag, 'title')?.trim() || (attribute(tag, 'aria-hidden') === 'true' && attribute(tag, 'tabindex') === '-1' ? 'hidden' : '');
  const found = [];
  for (const { 1: tag, 2: inner } of body.matchAll(/(<a\b[^>]*\shref="[^"]*"[^>]*>)([\s\S]*?)<\/a>/g)) if (!ownName(tag) && !contentName(inner)) found.push(`link ${attribute(tag, 'href')}`);
  for (const { 1: tag, 2: inner } of body.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)) if (!ownName(tag) && !contentName(inner)) found.push(`button${attribute(tag, 'class') ? ` .${attribute(tag, 'class').split(/\s+/)[0]}` : ''}`);
  // Where each <label> runs: a control inside one is named by it.
  const labels = [...body.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map((match) => [match.index, match.index + match[0].length, match[0]]);
  const forIds = new Set([...body.matchAll(/<label\b[^>]*\sfor="([^"]+)"/g)].map((match) => match[1]));
  for (const { 0: tag, 1: name, index } of body.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const type = (attribute(tag, 'type') ?? '').toLowerCase();
    if (name === 'input' && type === 'hidden') continue;
    const wrapped = labels.find(([start, end]) => index > start && index < end);
    const named = ownName(tag) || (attribute(tag, 'id') && forIds.has(attribute(tag, 'id'))) || (wrapped && plain(wrapped[2].replace(/<(input|select|textarea)\b[^>]*>/g, ''))) || (['submit', 'button', 'reset'].includes(type) && attribute(tag, 'value')) || (type === 'image' && attribute(tag, 'alt'));
    if (!named) found.push(`${name}${attribute(tag, 'name') ? ` ${attribute(tag, 'name')}` : ''}`);
  }
  return [...new Set(found)].map((what) => ({ issue: 'control_without_name', detail: `${what} has no accessible name` }));
}

// The company's phone, email, address and service area on the pages against its structured data (claude-seo seo-local:
// NAP consistency; four-site audit 2026-11-17, Fable's plan S4): a tel: link whose number the JSON-LD does not state; an
// email the page shows (a mailto: link or its text) that the JSON-LD does not state (the privacy policy's own contact,
// `allowedEmails`, and the privacy policy itself are privacy_contradiction's); an address shown (the contact channels,
// the footer's) that leaves out a part of the PostalAddress (street, postcode, town); and a market the page names (a
// case card's client market, "we ship to Australia", "clients worldwide") outside the JSON-LD's areaServed, a warning
// (the copy's wording is read, so it may misread). Each only once the structured data states one. The legal name and
// the street are not checked: neither is shown nor marked up for now (owner 2026-11-17, WITHHELD_COMPANY_KEYS).
const digits = (value) => String(value ?? '').replace(/[^\d]/g, '');
const samePhone = (left, right) => left.length >= 7 && right.length >= 7 && (left.endsWith(right) || right.endsWith(left));
const normal = (text) => decode(String(text ?? '')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The names a country goes by in copy (its name and aliases, but "us": a pronoun).
const COUNTRY_NAMES = Object.entries(COUNTRIES).flatMap(([code, country]) => [country.name, ...country.aliases.filter((alias) => alias !== 'us')].map((name) => [code, name]));
const SERVING = String.raw`\b(?:ship|ships|shipped|shipping|deliver|delivers|delivered|delivering|delivery|export|exports|exported|exporting|serve|serves|served|serving)\b[^.;:!?]{0,60}?\b(?:to|in|across|throughout)\s+(?:the\s+)?`;
const BUYERS = String.raw`\b(?:clients|customers|buyers|brands|retailers|labels|guests)\s+(?:[\p{L}'-]+\s+){0,2}?(?:in|from|across)\s+(?:the\s+)?`;
const servedCountry = (name) => new RegExp(`(?:${SERVING}|${BUYERS})${escaped(name)}(?![\\p{L}\\p{N}])`, 'iu');
const WORLDWIDE_CLAIM = new RegExp(String.raw`\b(?:ship\w*|deliver\w*|export\w*|serv(?:e|es|ed|ing)|clients|customers|buyers|brands|retailers)\b[^.;:!?]{0,60}?\b(?:worldwide|world-wide|around the world|all over the world|across the globe|internationally)\b|\bworldwide\s+(?:shipping|delivery|clients|customers|buyers)\b`, 'i');
// Whether a place the page names lies in the service area: worldwide covers all; else a country by its code or any of
// its names in the text, a city by its name.
function inArea(text, area) {
  const words = ` ${normal(text)} `;
  return area.some((entry) => {
    if (entry.name === WORLDWIDE.name) return true;
    const code = entry.code ?? (entry.type === 'Country' ? countryCode(entry.name) : null);
    const names = code ? COUNTRY_NAMES.filter(([own]) => own === code).map(([, name]) => name) : [entry.name];
    return names.some((name) => words.includes(` ${normal(name)} `));
  });
}
// The markets a page names: its case cards' client markets (CaseStudiesBlock), the countries its copy says it serves,
// ships to or has clients in, and a worldwide claim.
export function namedMarkets(main) {
  const text = plain(main);
  const markets = [...main.matchAll(/class="case__market"[^>]*>([\s\S]*?)<\/span>/g)].map((match) => plain(match[1]).replace(/^[·•|\-\s]+/, '').trim()).filter(Boolean);
  const countries = [...new Set(COUNTRY_NAMES.filter(([, name]) => servedCountry(name).test(text)).map(([code]) => COUNTRIES[code].name))];
  return { markets: [...new Set([...markets, ...countries])], worldwide: WORLDWIDE_CLAIM.test(text) };
}
export function napProblems(pages, built, { allowedEmails = [] } = {}) {
  const phones = new Set();
  const emails = new Set(allowedEmails.filter(Boolean).map((email) => email.toLowerCase()));
  let emailsStated = 0;
  const addresses = [];
  const areas = [];
  const walk = (value, key = null) => {
    if (Array.isArray(value)) { value.forEach((item) => walk(item, key)); return; }
    if (!value || typeof value !== 'object') {
      if (key === 'telephone' && digits(value)) phones.add(digits(value));
      if (key === 'email' && emailsIn(value).length) { emailsStated += 1; for (const email of emailsIn(value)) emails.add(email); }
      if (key === 'areaServed' && String(value).trim()) areas.push(serviceAreaEntry(String(value)));
      return;
    }
    if (value['@type'] === 'PostalAddress') addresses.push(['streetAddress', 'postalCode', 'addressLocality'].map((part) => value[part]).filter((part) => typeof part === 'string' && part.trim()));
    if (key === 'areaServed' && typeof value.name === 'string') areas.push(value.name === WORLDWIDE.name ? { ...WORLDWIDE } : { type: value['@type'], name: value.name });
    for (const [name, item] of Object.entries(value)) walk(item, name);
  };
  for (const html of built.values()) if (html) for (const block of parsePage(html).jsonLd) walk(block.data);
  const addressParts = addresses.find((parts) => parts.length) ?? [];
  const found = [];
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    const body = html.match(/<body\b[\s\S]*<\/body>/)?.[0] ?? '';
    if (phones.size) for (const href of new Set([...body.matchAll(/href="tel:([^"]+)"/g)].map((match) => match[1]))) if (![...phones].some((phone) => samePhone(digits(href), phone))) found.push(error(page.route, 'nap_mismatch', `the page's phone ${decode(href)} is not the structured data's (${[...phones].map((phone) => `+${phone}`).join(', ')})`));
    const privacy = page.pageType === 'privacy' && isPrivacyPolicy({ route: page.route, label: page.hero?.heading });
    if (emailsStated && !privacy) {
      const shown = new Set([...[...body.matchAll(/href="mailto:([^"?]+)/g)].flatMap((match) => emailsIn(decode(match[1]))), ...emailsIn(plain(body))]);
      for (const email of shown) if (!emails.has(email)) found.push(error(page.route, 'nap_mismatch', `the page's email ${email} is not the structured data's (${[...emails].join(', ')})`));
    }
    if (areas.length && isIndexable(page)) {
      const { markets, worldwide } = namedMarkets(regions(html).main);
      const outside = [...markets.filter((market) => !inArea(market, areas)), ...(worldwide && !areas.some((entry) => entry.name === WORLDWIDE.name) ? ['worldwide'] : [])];
      if (outside.length) found.push(warning(page.route, 'nap_mismatch', `the page names ${listed(outside, 4)} as a market, outside the structured data's areaServed (${[...new Set(areas.map((entry) => entry.name))].join(', ')}): state the real service area (src/data/site-company.json serviceArea), or the copy's`));
    }
    if (!addressParts.length) continue;
    // The contact channels' address card (ContactChannelsBlock) and the footer's address line (SiteFooter).
    const shown = [
      ...[...body.matchAll(/<li\b[^>]*\sdata-kind="address"[^>]*>[\s\S]*?class="contact-channel__value"[^>]*>([\s\S]*?)<\/(?:a|span)>/g)].map((match) => match[1]),
      ...[...body.matchAll(/<(span|a)\b[^>]*\sdata-contact-kind="address"[^>]*>([\s\S]*?)<\/\1>/g)].map((match) => match[2]),
    ].map(plain).filter(Boolean);
    for (const text of new Set(shown)) {
      const missing = addressParts.filter((part) => !normal(text).includes(normal(part)));
      if (missing.length) found.push(error(page.route, 'nap_mismatch', `the page's address "${text.slice(0, 80)}" leaves out the structured data's ${missing.join(', ')}`));
    }
  }
  return found;
}

// Ways to talk the copy names with no number or link to use them (four-site audit 2026-11-17, Fable's plan C6;
// claude-seo seo-eeat Trust "Clear contact information": site13's copy offered Skype, Viber and Zoom calls the site gave
// no handle for). A channel is reachable when the contact details (src/data/site-contact.json, the WhatsApp stand-in
// included) or the site's services (src/data/site-runtime.json: its chat lines) have a value naming it, by its field
// or its link. One warning per page, for Site Factory: the copy is reported, never cut here.
export const CHANNELS = Object.freeze([
  { name: 'WhatsApp', text: /\bwhats\s?app\b/i, handle: /whats\s?app|wa\.me\//i },
  { name: 'Skype', text: /\bskype\b/i, handle: /skype/i },
  { name: 'Viber', text: /\bviber\b/i, handle: /viber/i },
  { name: 'WeChat', text: /\b(?:wechat|weixin)\b/i, handle: /wechat|weixin|wxid/i },
  { name: 'Telegram', text: /\btelegram\b/i, handle: /telegram|t\.me\//i },
  // The product only, capitalised ("zoom in on the stitching" is no call).
  { name: 'Zoom', text: /\bZoom\b(?!\s+(?:in|out)\b)/, handle: /zoom/i },
  { name: 'Microsoft Teams', text: /\b(?:Microsoft|MS)\s+Teams\b/, handle: /teams/i },
  { name: 'Google Meet', text: /\bGoogle\s+Meet\b/, handle: /meet\.google|google\s?meet/i },
  { name: 'KakaoTalk', text: /\bkakao\s?talk\b/i, handle: /kakao/i },
  { name: 'Messenger', text: /\b(?:Facebook\s+)?Messenger\b/, handle: /messenger|m\.me\//i },
]);
// Every non-empty value of the contact details and the site's services, with the field names on its way.
function handleTexts(...sources) {
  const texts = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) { value.forEach((item) => walk(item, path)); return; }
    if (value && typeof value === 'object') { for (const [key, item] of Object.entries(value)) walk(item, `${path} ${key}`); return; }
    if (typeof value === 'string' && value.trim()) texts.push(`${path} ${value}`);
  };
  for (const source of sources) walk(source, '');
  return texts;
}
export function channelHandleProblems(pages, built, { contact = null, runtime = null } = {}) {
  // Only the parts that reach a person: the contact details, and the chat lines (not analytics or the registry).
  const texts = handleTexts(contact && Object.fromEntries(Object.entries(contact).filter(([key]) => !['placeholder', 'standIns'].includes(key))), runtime?.chat || null);
  const reachable = (channel) => texts.some((text) => channel.handle.test(text));
  const found = [];
  for (const page of pages.filter(isIndexable)) {
    const html = built.get(page.route);
    if (!html) continue;
    const text = plain(regions(html).main);
    const missing = CHANNELS.filter((channel) => channel.text.test(text) && !reachable(channel)).map((channel) => channel.name);
    if (missing.length) found.push(warning(page.route, 'channel_without_handle', `the copy names ${missing.join(', ')}, which the site's contact details (src/data/site-contact.json, site-runtime.json chat) give no number or link for: give one, or take the channel out of the copy`));
  }
  return found;
}

// Links in from other pages' content (claude-seo seo-content internal linking): an indexable page fewer than
// MIN_INBOUND_LINKS other pages link to from their main content (menus left out) is hard to find (the swimwear burkini
// page, Staylumen's city pages). The home page is exempt. A warning for Site Factory's links.
export const MIN_INBOUND_LINKS = 3;
export function inboundLinkProblems(pages, built) {
  const inbound = new Map(pages.map((page) => [page.route, new Set()]));
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    for (const href of new Set(internalLinks(regions(html).main))) if (href !== page.route && inbound.has(href)) inbound.get(href).add(page.route);
  }
  return pages.filter((page) => isIndexable(page) && page.route !== '/' && built.get(page.route) && inbound.get(page.route).size < MIN_INBOUND_LINKS).map((page) => warning(page.route, 'inbound_links_low', `${inbound.get(page.route).size} page(s) link here from their content (${listed([...inbound.get(page.route)], 3) || 'none'}), at least ${MIN_INBOUND_LINKS}`));
}

// Every page of the sitemap with one lastmod on a site already released once (an accepted SEO baseline): a date the
// build stamps, not when each page changed (claude-seo seo-sitemap). The first release may well have one date.
export function lastmodProblems(sitemap, { released = false } = {}) {
  const dates = [...String(sitemap ?? '').matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((match) => match[1].trim());
  const urls = (String(sitemap ?? '').match(/<loc>/g) ?? []).length;
  if (!released || urls < 2 || dates.length !== urls || new Set(dates).size !== 1) return [];
  return [warning('/sitemap.xml', 'lastmod_uniform', `all ${urls} URLs have lastmod ${dates[0]}: lastmod says when each page last changed (src/data/page-dates.json)`)];
}

// A page much thinner than the pages of its kind (claude-seo seo-content thin content; the swimwear Watersports page,
// about 700 words): an indexable page with fewer than THIN_SHARE of the median words of its page type's indexable
// pages, where the type has at least THIN_MIN_SIBLINGS. A warning for Site Factory.
export const THIN_SHARE = 0.6;
export const THIN_MIN_SIBLINGS = 3;
const median = (values) => { const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
export function thinPageProblems(pages, built) {
  const counted = pages.filter((page) => isIndexable(page) && built.get(page.route)).map((page) => ({ page, words: (parsePage(built.get(page.route)).mainText.match(/\S+/g) ?? []).length }));
  const byType = Map.groupBy(counted, ({ page }) => page.pageType);
  return [...byType.values()].filter((group) => group.length >= THIN_MIN_SIBLINGS).flatMap((group) => {
    const middle = median(group.map((item) => item.words));
    return group.filter((item) => item.words < middle * THIN_SHARE).map(({ page, words }) => warning(page.route, 'thin_vs_siblings', `${words} words, ${Math.round((words / middle) * 100)}% of the ${page.pageType} pages' median ${Math.round(middle)} (at least ${THIN_SHARE * 100}%)`));
  });
}

// Product names that no longer exist (config/stand-in-lexicon.json; the swimwear privacy page's Skype): each a page's
// main text, title or description names. A warning for Site Factory.
export function lexiconProblems(pages, built, lexicon) {
  const terms = (lexicon?.terms ?? []).map((entry) => ({ ...entry, pattern: new RegExp(`(^|[^\\p{L}\\p{N}])${entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u') }));
  const found = [];
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    const parsed = parsePage(html);
    const text = [parsed.title, parsed.description, plain(regions(html).main)].join(' ');
    for (const { term, why, pattern } of terms) if (pattern.test(text)) found.push(warning(page.route, 'stand_in_lexicon', `"${term}": ${why}`));
  }
  return found;
}

// A page that promises a file (lib/resource-promise.mjs), or the site tree's resources page, shows a file link or the
// resource request form (four-site audit: hotel-rm's and Staylumen's resources pages had neither).
export function builtPromiseProblems(pages, built) {
  return pages.filter((page) => isIndexable(page) && page.pageType !== 'privacy' && built.get(page.route)).flatMap((page) => {
    const main = regions(built.get(page.route)).main;
    if (/<form\b[^>]*\sdata-request="resource"/.test(main) || [...main.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].some((match) => isFileHref(match[1]))) return [];
    // A link to another site is a citation: its words are that site's (lib/resource-promise.mjs withoutCitations).
    const phrase = promiseIn(plain(main.replace(/<form\b[\s\S]*?<\/form>/g, ' ').replace(/<a\b[^>]*\shref="https?:\/\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi, ' ')));
    return phrase || isResourcePage(page) ? [error(page.route, 'promise_without_asset', `${phrase ? `"${phrase}"` : 'the resources page'} with no file link and no resource request form: link the file (the owner's), or let the page ask for it`)] : [];
  });
}

// Files in the build that no page, stylesheet, script or manifest names (claude-seo seo-performance; motel's 426 images,
// 48 MB): what a release ships for nothing. Named by path or file name anywhere in the build's text files; the files a
// browser or crawler asks for by convention are left out. One warning with the count, the weight and the heaviest.
const TEXT_FILES = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.webmanifest', '.svg']);
const CONVENTIONAL = new Set(['favicon.ico', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', '404.html', '.htaccess', 'site.webmanifest', 'manifest.webmanifest', 'llms.txt']);
async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(resolve(dir, entry.name)) : [resolve(dir, entry.name)])))).flat();
}
export async function unreferencedAssets(root) {
  const dist = resolve(root, 'dist');
  const files = await filesUnder(dist);
  if (!files.length) return [];
  const texts = await Promise.all(files.filter((file) => TEXT_FILES.has(extname(file).toLowerCase())).map(async (file) => [file, await readFile(file, 'utf8')]));
  const corpus = texts.map(([, text]) => text).join('\n');
  const unused = [];
  for (const file of files) {
    const path = relative(dist, file).replace(/\\/g, '/');
    const name = path.split('/').at(-1);
    // A dotfile (a folder's .gitkeep) is no asset a visitor is sent.
    if (extname(file).toLowerCase() === '.html' || name.startsWith('.') || CONVENTIONAL.has(name) || CONVENTIONAL.has(path)) continue;
    // A text file names itself only in its own text (a sourcemap comment): the others must.
    const elsewhere = texts.filter(([other]) => other !== file).map(([, text]) => text);
    const named = elsewhere.length === texts.length ? corpus.includes(name) || corpus.includes(encodeURI(name)) : elsewhere.some((text) => text.includes(name) || text.includes(encodeURI(name)));
    if (!named) unused.push({ path, size: (await stat(file)).size });
  }
  if (!unused.length) return [];
  const total = unused.reduce((sum, item) => sum + item.size, 0);
  const heaviest = [...unused].sort((left, right) => right.size - left.size).slice(0, 5).map((item) => `${item.path} (${kb(item.size)})`);
  return [warning('dist/', 'unreferenced_assets', `${unused.length} file(s), ${(total / 1024 / 1024).toFixed(1)} MB, that no page, stylesheet or script names: ${heaviest.join(', ')}`)];
}

// The privacy policy states one contact and one retention period (four-site audit 2026-11-17, C4; site13 blind audit
// M1: sales@ and privacy@, "as long as order records require" and "24 months" on one page). Its main content naming
// two addresses, or two periods for keeping what it holds, fails: the privacy facts module gives way to the copy for
// a stand-in (lib/data-practices.mjs), so what is left is the copy's own or the owner's facts against it.
export function privacyContradictionProblems(pages, built) {
  return pages.filter((page) => page.pageType === 'privacy' && isPrivacyPolicy({ route: page.route, label: page.hero?.heading }) && built.get(page.route)).flatMap((page) => {
    const text = plain(regions(built.get(page.route)).main);
    const emails = [...new Set(emailsIn(text))];
    const periods = [...new Set(retentionsIn(text))];
    return [
      ...(emails.length > 1 ? [error(page.route, 'privacy_contradiction', `two contacts on one privacy policy: ${emails.join(', ')}`)] : []),
      ...(periods.length > 1 ? [error(page.route, 'privacy_contradiction', `two retention periods on one privacy policy: ${periods.map((period) => `"${period}"`).join(', ')}`)] : []),
    ];
  });
}

// A site-wide hero photo opening more than HERO_MAX_PAGES indexable pages (four-site audit 2026-11-17, A-10: the motel
// site's five heroes on 18 pages): the same first screen on page after page. One warning per photo, with its pages;
// the image plan asks for heroes enough (lib/image-plan.mjs), so a site planned again clears it.
export function heroReuseProblems(pages, built) {
  const byHero = new Map();
  for (const page of pages.filter(isIndexable)) {
    const html = built.get(page.route);
    const hero = html ? mainImages(html).find((image) => image.hero) : null;
    if (!hero?.src) continue;
    (byHero.get(hero.src) ?? byHero.set(hero.src, []).get(hero.src)).push(page.route);
  }
  return [...byHero].filter(([, routes]) => routes.length > HERO_MAX_PAGES).map(([src, routes]) => warning(src, 'hero_reused', `one hero photo opens ${routes.length} pages (${listed(routes, 4)}), at most ${HERO_MAX_PAGES}: plan the images again for heroes of their own`));
}

// A site-wide library photo of a capped class (lib/image-plan.mjs REUSE_CAPPED_KINDS: the factory and its process) in
// the content of more than PHOTO_MAX_PAGES indexable pages (four-site audit 2026-11-17, Fable's plan C13: site13's three
// process photos on 11 pages each). One warning per photo, `<class>_reused`, with its pages; the image plan asks for
// photos enough, so a site planned (and its photos made) again clears it. A photo is its library id: the file name
// without its width (general-process-1-960.webp is general-process-1).
const libraryPhoto = new RegExp(`^/${LIBRARY_PATH}/(${GENERAL}-(${REUSE_CAPPED_KINDS.join('|')})-[\\w-]+?)-\\d+\\.\\w+$`);
export function photoReuseProblems(pages, built) {
  const byPhoto = new Map();
  for (const page of pages.filter(isIndexable)) {
    const html = built.get(page.route);
    if (!html) continue;
    const photos = new Map(mainImages(html).flatMap((image) => image.files).map((file) => file.match(libraryPhoto)).filter(Boolean).map((match) => [match[1], match[2]]));
    for (const [id, kind] of photos) (byPhoto.get(id) ?? byPhoto.set(id, { kind, routes: [] }).get(id)).routes.push(page.route);
  }
  return [...byPhoto].filter(([, { routes }]) => routes.length > PHOTO_MAX_PAGES).map(([id, { kind, routes }]) => warning(`/${LIBRARY_PATH}/${id}`, `${kind}_reused`, `one ${kind} photo shows on ${routes.length} pages (${listed(routes, 4)}), at most ${PHOTO_MAX_PAGES}: plan the images again (pnpm plan:images) for photos of their own`));
}
