#!/usr/bin/env node

// Reads the section patterns (module designs) of the reference's core pages and applies them:
//  - every page type gets the split-row sequence and card/gallery modules of its reference page;
//  - pages Site Factory has not authored (home, about, contact, hubs) are built from our page blueprints (Site
//    Factory 06's slot manifest via --blueprints, else scripts/lib/page-blueprints.mjs), not from the reference's
//    section order; held pages get no placeholder;
//  - docs/research/slot-manifest.json records the blueprint and the module this template renders each slot with;
//  - docs/research/pattern-inventory.json and one crop per reference section record what was found and used.
// Usage: node scripts/scaffold-placeholder-pages.mjs --pages-plan <pages.json> [--blueprints <slot-manifest.json>]
//        home=<url> about=<url> contact=<url> [product_manufacturer=<url> product_wholesale=<url> solution=<url>]

import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAuthoringPages } from './lib/authoring-contract.mjs';
import { AUTHORED_PATTERN_KEYS, PATTERN_DECISIONS, authoredPatterns, coverage, inventory } from './lib/pattern-map.mjs';
import { blueprintChoices, blueprintPage, blueprintsFrom, competitorBlueprints, slotManifest, withPurposeWording } from './lib/page-blueprints.mjs';
import { DEFAULT_TRADE, imageBriefs, siteTrade, tradeConfigPath } from './lib/trade.mjs';
import { tradePhotos } from './lib/slot-visuals.mjs';
import { siteNavFromPlan } from './lib/site-plan.mjs';
import { withClientWall } from './lib/site-proof.mjs';
import { extractSectionShapes, measurePhoneSections } from './lib/reference-anatomy.mjs';
import { PAGE_SHELL } from './lib/page-shell.mjs';
import { captureFolder } from './lib/rules.mjs';
import { capturedHeroHeights } from './lib/capture-hero.mjs';
import { captureTree } from './lib/capture-dom.mjs';
import { revealDeferredContent, scrollThroughPage } from './lib/reveal.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

// The widths a reference page is measured at: its sections at desktop width, the same sections again at a phone's
// (each shape's `phone`: height, words, main photo and its ratio), on one page load.
export const DESKTOP = Object.freeze({ width: 1440, height: 1000 });
export const PHONE = Object.freeze({ width: 390, height: 844 });
export const TABLET = Object.freeze({ width: 768, height: 1024 });

// A reference that refuses this machine keeps its earlier measure (lib/reference-access.mjs).
export { BLOCKED_STATUSES } from './lib/reference-access.mjs';
import { BLOCKED_STATUSES, captureStamp, measuredBeside } from './lib/reference-access.mjs';
import { contextFor } from './capture-reference.mjs';
import { HERO_FORM_FIELDS } from './lib/usability-checks.mjs';

// The reference page's sections, measured at desktop and at phone width; the page is left at desktop width, scrolled
// to the top, for the section crops. desktopOnly: a hero sample's sections at desktop width only (its hero's pattern
// needs no more).
export async function measureReference(browser, url, { desktopOnly = false } = {}) {
  const page = await browser.newPage({ viewport: { ...DESKTOP } });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response?.ok()) throw Object.assign(new Error(`reference page failed: ${response?.status() ?? 'no response'} ${url}`), { status: response?.status() ?? null });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await revealDeferredContent(page);
  await scrollThroughPage(page);
  const shapes = await page.evaluate(extractSectionShapes, PAGE_SHELL);
  const headings = await page.evaluate(measureHeadingAlign, PAGE_SHELL);
  const heroText = await page.evaluate(measureHeroText, PAGE_SHELL);
  const siblings = await page.evaluate(navSiblings, url).catch(() => []);
  if (desktopOnly) return { page, shapes, headings, heroText, siblings };
  // A site may reload its page when the viewport changes (a script re-running on resize): the measurement waits for
  // that, reveals the lazy content again and finds the sections by their anchors; a reload during a step is retried.
  const atWidth = async (viewport, work) => {
    await page.setViewportSize({ ...viewport });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await revealDeferredContent(page);
        await scrollThroughPage(page);
        return await work();
      } catch (error) {
        if (attempt || !/Execution context was destroyed|navigation/.test(error.message)) throw error;
      }
    }
    return null;
  };
  const anchors = shapes.map((shape) => shape.anchor);
  const tablets = await atWidth(TABLET, () => page.evaluate(measurePhoneSections, anchors));
  shapes.forEach((shape, index) => { shape.tablet = tablets?.[index] ?? null; });
  // The phone's measure is a phone's visit (capture-reference.mjs PHONE_DEVICE): a page that serves its phone layout
  // by the browser it sees is measured in that layout, its sections found by their paths.
  const phonePage = await browser.newPage(contextFor({ ...PHONE, phone: true }));
  let phones = [];
  try {
    await phonePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await phonePage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await revealDeferredContent(phonePage);
    await scrollThroughPage(phonePage);
    phones = await phonePage.evaluate(measurePhoneSections, anchors);
  } finally {
    await phonePage.close();
  }
  shapes.forEach((shape, index) => { shape.phone = phones[index]; });
  await atWidth(DESKTOP, async () => {});
  return { page, shapes, headings, heroText, siblings };
}

// The competitor's pages in the same menu as a reference page, same site, the page itself left out: the samples its
// page type's hero is decided by besides it (heroByMajority). The menu is the largest list (three links or more) that
// holds a link to the page, a header's or nav's before the rest of the page's (a footer's). A "#…" link is a button,
// not a link to the page (swimwearbali.com's header opens its menu popup with one, which ended the search empty).
export function navSiblings(url) {
  const norm = (href) => { try { const parsed = new URL(href, location.href); return parsed.origin === location.origin ? `${parsed.origin}${parsed.pathname}`.replace(/\/?$/, '/') : null; } catch { return null; } };
  const target = norm(url) ?? norm(location.href);
  const real = (anchor) => !anchor.getAttribute('href').trim().startsWith('#');
  const links = (list) => [...new Set([...list.querySelectorAll(':scope > li > a[href]')].filter(real).map((anchor) => norm(anchor.href)).filter(Boolean))];
  const lists = (selector) => [...new Set([...document.querySelectorAll(selector)].filter((anchor) => real(anchor) && norm(anchor.href) === target).map((anchor) => anchor.closest('ul')).filter(Boolean))].map(links).filter((hrefs) => hrefs.length >= 3);
  const menus = lists('header a[href], nav a[href]');
  const [largest = []] = (menus.length ? menus : lists('a[href]')).sort((a, b) => b.length - a.length);
  return largest.filter((href) => href !== target);
}

// A page type's hero by the majority of the competitor's pages of that kind (owner 2026-11-18, through Site Factory:
// design is decided by several samples, never by one; Strandmill's product pages took the banner of /swimwear-manufacturer/
// while three of the four pages beside it in its menu put the title over the photo). A tie, or no sample, keeps the
// reference page's.
export const HERO_SAMPLES = 4;
// The other competitors' pages of a page type (site.json designPeers { <page type>: [url, ...] }; owner 2026-11-18:
// design follows the majority of several competitors' pages of that kind, the reference deciding a tie or no sample):
// they vote beside the reference's own pages, at most PEER_SAMPLES a page type.
export const PEER_SAMPLES = 6;
export const SINGLE_PAGE_TYPES = Object.freeze(['home', 'about', 'contact', 'privacy', 'terms', 'blog_hub', 'blog_post']);
// The page-type variants a sample votes on beside its hero: the card, process and gallery variants (one value each). The
// split sequence and the photo walls are the reference page's: a sequence is no vote.
export const VOTED_MODULE_KEYS = Object.freeze(['featureGrid', 'process', 'gallery']);
// A page type's modules by the majority of the reference page and the other competitors' pages of its type (designPeers,
// not the reference's own menu siblings: a size guide beside a product page is no page of its kind), key by key, only
// the modules the reference page has; a sample without the module casts no vote on it, and a tie keeps the reference's.
export function modulesByMajority(reference = {}, samples = []) {
  const voted = { ...reference };
  for (const key of VOTED_MODULE_KEYS.filter((name) => reference[name])) voted[key] = heroByMajority(reference[key], samples.map((sample) => sample?.[key]).filter(Boolean));
  return voted;
}
// A page's hero as a sample votes it: the enquiry form in its first section (HERO_FORM_FIELDS fields or more, or an
// embedded form whose fields are out of reach) is a form hero, whatever photo it sits by (the reference's /management
// and its state pages; Vacasa's city pages; Vacasa's one-field estimate box is none).
export function sampleHero(sections, heroOf) {
  const top = sections[0]?.shape;
  if (top?.hasForm && ((top.formFields ?? 0) >= HERO_FORM_FIELDS || top.formEmbed)) return 'media-form';
  return heroOf(sections);
}
// A reference page type's first screen: the capture's, wherever the page type has a capture (lib/capture-hero.mjs
// capturedHeroHeights: its bands, or { band: false } where it opens on none); the live measure's opening section
// (heroHeightsOf) only without any capture. A section is cut at the headings, not at a band: where the capture found
// no band, the live measure's first section is the page's copy down to its next heading (2026-11-20, Tapa Works'
// reference about page: 1715px of copy, photo and figures taken for a first screen), never a height to keep.
export function heroHeightsFrom(captured, sections) {
  return captured ?? heroHeightsOf(sections);
}
// A reference page's first screen: the height of its opening section (its hero, else its first section with content:
// the contact page's photo after a spacer) at a desktop (1440x1000), a tablet (768x1024) and a phone (390x844), each
// with its share of that screen's height. Each page type's hero takes them (components.heroHeights, PageHero.astro):
// owner 2026-11-18, Staylumen's heroes were the template's default 360 to 560px where the reference's are 1000 (home),
// 572 (about), 412 (contact) and 837 (solution, place); nothing carried the measure into the pages.
export function heroHeightsOf(sections) {
  const hero = sections.find((section) => String(section.decision).startsWith('hero:')) ?? sections.find((section) => !String(section.decision).startsWith('skip'));
  if (!hero?.height) return null;
  const at = (height, screen) => (height > 0 ? { height: Math.round(height), share: Math.round((1000 * height) / screen) / 1000 } : null);
  const heights = { desktop: at(hero.height, DESKTOP.height), tablet: at(hero.tablet?.height ?? 0, TABLET.height), phone: at(hero.phone?.height ?? 0, PHONE.height) };
  return Object.fromEntries(Object.entries(heights).filter(([, value]) => value));
}
// The photo walls' shape from the reference's own photos under its first screens (raw desktop-1440.json of each
// captured page: images and photo backgrounds from 35% of the width): one across the page (90% or more) keeps the
// walls across it ({ fit: 'full' }); else the walls sit in the content's width, as the reference's photos do, as tall
// as its photos' median height in a WALL_CONTAINER-wide column, between 2:1 and 3:1 (3:1 shows a 3:2 photo's middle
// half, the most the layout audit's heavy_crop lets go). Owner 2026-11-18: Staylumen's home walls were 1425x713 photos
// across the page where the reference shows split rows and panels of about 590px.
// Only photos a visitor sees in the page's body: not in its header or footer (nor below the footer's top: a builder's
// footer photo whose parent the capture cannot place), not hidden (display none, visibility hidden, no opacity, no size),
// not fixed to the screen (a pop-up) - a footer's photo across the page set every wall across it.
// htmls: each capture's rendered.html, by index (lib/capture-dom.mjs takes the parents of id-anchored elements from it).
export const WALL_CONTAINER = 1200;
export function photoWallOf(raws = [], htmls = []) {
  const fixed = (node) => { for (let at = node; at; at = at.parent) if (at.styles?.position === 'fixed') return true; return false; };
  const photos = raws.flatMap((raw, index) => {
    if (!raw?.elements) return [];
    const tree = captureTree(raw, { html: htmls[index] ?? null });
    const footer = tree.footer && tree.footer.rect.height > 0 ? tree.footer.rect.y : Infinity;
    return tree.nodes.filter((node) => node.rect && node.displayed && node.styles?.visibility !== 'hidden' && node.opacity > 0 && !node.inShell && !fixed(node)
      && node.rect.y >= tree.viewport.height && node.rect.y < footer && node.rect.width >= tree.viewport.width * 0.35 && node.rect.height >= 200
      && (node.tag === 'img' || /url\(/.test(node.styles?.['background-image'] ?? '')))
      .map((node) => ({ wide: node.rect.width >= tree.viewport.width * 0.9, height: node.rect.height }));
  });
  if (!photos.length) return null;
  if (photos.some((photo) => photo.wide)) return { fit: 'full' };
  const heights = photos.map((photo) => photo.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  const ratio = Math.round(100 * Math.min(3, Math.max(2, WALL_CONTAINER / median))) / 100;
  return { fit: 'container', ratio: `${ratio} / 1`, height: Math.round(median) };
}
export function heroByMajority(reference, samples = []) {
  const counts = new Map();
  for (const variant of [reference, ...samples].filter(Boolean)) counts.set(variant, (counts.get(variant) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const leaders = [...counts].filter(([, count]) => count === most).map(([variant]) => variant);
  return leaders.length === 1 ? leaders[0] : reference ?? leaders[0];
}

// The page's title as the competitor sets it (its first visible h1 outside the shell, at desktop width): its font
// family, case, characters, and the width of its text in ems (its line boxes over its font size). Our titles are
// sized to their own words with the average (scripts/lib/heading-fit.mjs); null without a title.
// A page's own header (Concord's <header class="masthead"> holds its title; its site header, with the menu, is
// another) is not the shell: an h1 in a header without navigation counts when none is outside the shell (the hotel
// site's capture found no title at all, and its titles were fitted on the widest default, without their capitals).
export function measureHeroText(shell) {
  const shown = (element) => element.textContent.trim() && element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden';
  const titles = [...document.querySelectorAll('h1')].filter(shown);
  const inPageHeader = (element) => { const box = element.closest(shell.header); return Boolean(box) && !box.querySelector('nav, [role=navigation]') && !element.closest(shell.footer); };
  const heading = titles.find((element) => !element.closest(shell.shell)) ?? titles.find(inPageHeader);
  if (!heading) return null;
  const style = getComputedStyle(heading);
  const range = document.createRange();
  range.selectNodeContents(heading);
  const width = [...range.getClientRects()].reduce((sum, rect) => sum + rect.width, 0);
  const size = Number.parseFloat(style.fontSize);
  if (!size || !width) return null;
  // The words the competitor sets under its title on the photo (recorded only: no rule moves a lead by it since the
  // site13 claude-seo audit 2026-11-17, M-10): the text between the
  // title as seen (a heading below a small h1 set much larger than it: an eyebrow h1 over the visual title) and the
  // hero's first button or link, whatever its tags; not a strip under the buttons. A title not set on a photo (a banner
  // with its title under it, a plain header) measures none: null. Concord's mastheads carry their title alone
  // (swimwearbali.com 2026-11-17: its home's 8-word lead is an h3 under an 88px h2 and a 14px h1; counting the <p>s of
  // the title's section missed it, took the manufacturer page's 61-word introduction under its banner, and averaged 27).
  const box = heading.getBoundingClientRect();
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const holds = (rect) => rect.width > 0 && rect.height > 0 && rect.left <= centre.x && rect.right >= centre.x && rect.top <= centre.y && rect.bottom >= centre.y;
  let photo = null;
  for (let node = heading.parentElement; node && node !== document.body && !photo; node = node.parentElement) {
    if (/url\(/.test(getComputedStyle(node).backgroundImage) && holds(node.getBoundingClientRect())) photo = { scope: node, rect: node.getBoundingClientRect() };
    else {
      const media = [...node.querySelectorAll('img, video, picture')].find((item) => !heading.contains(item) && holds(item.getBoundingClientRect()));
      if (media) photo = { scope: node, rect: media.getBoundingClientRect() };
    }
  }
  let leadWords = null;
  if (photo) {
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden' && rect.left >= photo.rect.left - 1 && rect.right <= photo.rect.right + 1 && rect.top >= photo.rect.top - 1 && rect.bottom <= photo.rect.bottom + 1; };
    const ownWords = (element) => [...element.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(' ').trim().split(/\s+/).filter(Boolean).length;
    const titleSize = Number.parseFloat(style.fontSize);
    const title = [...photo.scope.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((item) => visible(item) && item.getBoundingClientRect().top >= box.top - 2 && Number.parseFloat(getComputedStyle(item).fontSize) >= titleSize * 1.5).sort((a, b) => Number.parseFloat(getComputedStyle(b).fontSize) - Number.parseFloat(getComputedStyle(a).fontSize))[0] ?? heading;
    const below = title.getBoundingClientRect().bottom;
    // A button or a link standing on its own (not a link inside a sentence of the lead).
    const actions = [...photo.scope.querySelectorAll('a, button')].filter((item) => visible(item) && item.textContent.trim() && !item.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6') && item.getBoundingClientRect().top >= below - 2).map((item) => item.getBoundingClientRect().top);
    const limit = actions.length ? Math.min(...actions) : photo.rect.bottom;
    leadWords = [...photo.scope.querySelectorAll('*')]
      .filter((element) => !title.contains(element) && !heading.contains(element) && !element.closest('a, button, nav, script, style') && visible(element) && element.getBoundingClientRect().top >= below - 2 && element.getBoundingClientRect().bottom <= limit + 2)
      .reduce((sum, element) => sum + ownWords(element), 0);
  }
  return { family: style.fontFamily, textTransform: style.textTransform, chars: heading.textContent.trim().replace(/\s+/g, ' ').length, ems: width / size, leadWords };
}

// The competitor's titles over its reference pages: the first title's family and case, the average character width
// (em) over all of them and how many characters it rests on (lib/heading-fit.mjs charEmFor trusts a long enough one).
export function heroTextAverage(samples) {
  const found = samples.filter(Boolean);
  const chars = found.reduce((sum, sample) => sum + sample.chars, 0);
  if (!chars) return null;
  const ems = found.reduce((sum, sample) => sum + sample.ems, 0);
  const leads = found.filter((sample) => typeof sample.leadWords === 'number');
  const byType = Object.fromEntries(leads.filter((sample) => sample.pageType).map((sample) => [sample.pageType, sample.leadWords]));
  return { family: found[0].family, textTransform: found[0].textTransform, chars, charEm: Math.round((ems / chars) * 1000) / 1000, ...(leads.length ? { leadWords: Math.round(leads.reduce((sum, sample) => sum + sample.leadWords, 0) / leads.length) } : {}), ...(Object.keys(byType).length ? { leadWordsByPageType: byType } : {}) };
}

// How a page sets its section headings: of its visible h2s outside the shell, how many start their text on the left of
// their section's content and how many are centred (the text's middle within a few pixels of its box's middle, the box
// wider than the text).
export function measureHeadingAlign(shell) {
  const counts = { start: 0, center: 0 };
  for (const heading of document.querySelectorAll('h2')) {
    if (heading.closest(shell.shell)) continue;
    const box = heading.getBoundingClientRect();
    if (box.width < 60 || box.height < 10 || getComputedStyle(heading).visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
    if (!lines.length) continue;
    const left = Math.min(...lines.map((rect) => rect.left));
    const right = Math.max(...lines.map((rect) => rect.right));
    const centred = getComputedStyle(heading).textAlign === 'center' || (box.width - (right - left) > 40 && Math.abs((left + right) / 2 - (box.left + box.right) / 2) < 6);
    counts[centred ? 'center' : 'start'] += 1;
  }
  return counts;
}

// Page types a representative stands for (site-template.json representatives, named by their capture folder).
const REPRESENTATIVE_TYPES = Object.fromEntries(['product_manufacturer', 'product_wholesale', 'solution', 'place', 'about', 'contact'].map((pageType) => [captureFolder(pageType), pageType]));

// site-template.json follows the pages that are built: authoring mode, all routes, and a representative per page type
// (one that still exists is kept; a missing or gone one is the first built page of its type, or dropped).
export async function recordRoutes(root, builtPages) {
  const path = resolve(root, 'site-template.json');
  const manifest = await readJson(path, null);
  if (!manifest) return;
  manifest.mode = 'authoring';
  manifest.routes = builtPages.map((page) => page.route).sort();
  const routes = new Set(manifest.routes);
  manifest.representatives ||= {};
  for (const [key, pageType] of Object.entries(REPRESENTATIVE_TYPES)) {
    if (routes.has(manifest.representatives[key])) continue;
    const replacement = builtPages.find((page) => page.pageType === pageType)?.route;
    if (replacement) manifest.representatives[key] = replacement; else delete manifest.representatives[key];
  }
  await writeJson(path, manifest);
}

// A page type's hero (template-variants.json heroByPageType) follows the competitor's evidence, the capture's coarse
// guess (pattern-inventory.json heroVariant) and then the hero the analysis named (section-modules.json), only while
// it is missing or still that guess. Nothing records who set a value, so any other value is taken for the site's own
// choice (the treatment, a repair) and stays; a named hero once applied therefore stays too, also when a later
// analysis names another.
const heroGuess = (inventory, pageType) => inventory?.pages?.find((page) => page.pageType === pageType)?.heroVariant;
const followsEvidence = (current, guess) => current === undefined || current === guess;
// A page type whose hero the majority of the competitor's pages decided (pattern-inventory heroSamples, heroByMajority)
// keeps it: the analysis names the hero of the one reference page only (site13 2026-11-18: its "hero:media-banner" of
// /swimwear-manufacturer/ undid the product pages' media-overlay, 3 of 5 pages, and the accessories page's button fell
// under the first screen).
const majorityDecided = (inventory, pageType) => Boolean(inventory?.pages?.find((page) => page.pageType === pageType)?.heroSamples?.length);
// The enquiry form beside a hero (media-form) is one landing page's: named from the reference's page, a page type takes the
// same photo hero without the form (media-overlay, as PageHero.astro draws media-form, so the phone frames hold) and its
// pages lead to the form from their button and closing call, the contact and quote pages carrying it in full (owner
// 2026-11-18: "每个 service 带这么大表单"; Staylumen took the reference's /management form for nine service pages, where
// Awning, Evolve and Vacasa open their service pages on a button, 10 of 10). A site that keeps the form hero for a page
// type sets it in template-variants.json, which stays.
const typeHero = (variant) => (variant === 'media-form' ? 'media-overlay' : variant);

// The site's pages Site Factory has not authored, built from the blueprints (marked placeholders), the site's menus,
// and the slot manifest that goes to Site Factory 06 (docs/research/slot-manifest.json). Without Site Factory's
// blueprints, each page type follows the competitor's page (docs/research/pattern-inventory.json); a person can leave
// competitor sections out in docs/research/blueprint-choices.json (written with enabled: false, the default).
export async function writeBlueprintPages({ root = process.cwd(), pagesPlan, blueprints = null }) {
  const contact = pagesPlan.pages.find((page) => page.page_type === 'contact');
  if (!contact) throw new Error('the site plan has no contact page');
  const inventory = await readJson(resolve(root, 'docs/research/pattern-inventory.json'), null);
  const choicesPath = resolve(root, 'docs/research/blueprint-choices.json');
  let choices = await readJson(choicesPath, null);
  if (!choices && inventory) {
    choices = blueprintChoices(inventory);
    await mkdir(resolve(root, 'docs/research'), { recursive: true });
    await writeJson(choicesPath, choices);
  }
  const sections = await readJson(resolve(root, 'docs/research/analysis/section-modules.json'), []);
  // The owner's proof fills the owner slots (scripts/lib/site-proof.mjs); none while the site has no proof file; its
  // client wall only where site.json switches it on (clientWallOn).
  const proof = withClientWall(await readJson(resolve(root, 'src/data/site-proof.json'), null), await readJson(resolve(root, 'site.json'), null));
  const trust = await readJson(resolve(root, 'src/data/site-trust.json'), null);
  // A trade other than the default words the competitor-derived blueprint's purposes its own way
  // (config/blueprint-wording.<trade>.json); Site Factory's own manifest keeps its words.
  const { trade } = await siteTrade(root);
  const wording = trade === DEFAULT_TRADE ? null : (await readJson(tradeConfigPath('blueprint-wording', trade))).purposes;
  const used = blueprints ?? withPurposeWording(competitorBlueprints(inventory, { choices, sections }), wording);
  // Every page of the plan Site Factory has not written is a marked placeholder (noindex, not in the sitemap) until it
  // does; a menu heading without a page (nav_only), a page the handoff withholds, the blog (the template builds it) and
  // held pages never are.
  const authored = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  const authoredRoutes = new Set(authored.map((page) => page.route));
  const imported = await readJson(resolve(root, 'docs/research/site-factory-import.json'), {});
  const held = new Set((imported.skipped || []).map((item) => item.pageId));
  const pages = pagesPlan.pages
    .filter((planned) => planned.page_type !== 'blog_hub' && !planned.nav_only && !planned.withheld && !authoredRoutes.has(planned.url) && !held.has(planned.page_id) && used[planned.page_type])
    .map((planned) => blueprintPage({ page: planned, pagesPlan, contactRoute: contact.url, blueprints: used, proof, trust }));
  assertAuthoringPages(pages);
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeJson(resolve(root, 'src/data/placeholder-pages.json'), pages);
  // The site's menus come from the same plan, also when no Site Factory page is imported yet.
  await writeJson(resolve(root, 'src/data/site-nav.json'), siteNavFromPlan(pagesPlan));
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  // What the trade's photos show (config/image-briefs*.json photos, lib/slot-visuals.mjs): a trade whose photos are
  // scenes of its work gives its cards icons, not photos. Run scripts write only the keys they derive; every other key
  // of template-variants.json is the treatment's or a repair's.
  const photos = tradePhotos(await imageBriefs(root));
  const tradeChanged = (variants.components.tradePhotos ?? undefined) !== photos;
  if (tradeChanged) {
    if (photos) variants.components.tradePhotos = photos;
    else delete variants.components.tradePhotos;
  }
  // A hero the analysis named for a page type (section-modules "hero:<variant>") replaces the capture's guess.
  const heroes = sections.filter((item) => item.module?.startsWith('hero:') && !majorityDecided(inventory, item.pageType) && followsEvidence(variants.components.heroByPageType?.[item.pageType], heroGuess(inventory, item.pageType)));
  if (heroes.length) variants.components.heroByPageType = { ...(variants.components.heroByPageType || {}), ...Object.fromEntries(heroes.map((item) => [item.pageType, typeHero(item.module.slice(5))])) };
  if (heroes.length || tradeChanged) await writeJson(variantsPath, variants);
  await writeJson(resolve(root, 'docs/research/slot-manifest.json'), slotManifest({ components: variants.components, source: variants.sourceUrl ?? null, blueprints: used }));
  await recordRoutes(root, [...authored, ...pages]);
  return { pages, blueprints: used };
}

// The capture's findings in template-variants.json components (report: the new pattern inventory, previous: the one
// it replaces). Run scripts write only the keys they derive; every other key is the treatment's or a repair's and
// stays: of a page type's patterns only the classifier's keys are replaced, and its hero follows the rule above.
export function withCapture(components, report, previous) {
  const heroByPageType = { ...components.heroByPageType };
  const pageTypes = { ...components.pageTypes };
  // The first screen's heights are the capture's own measure: each capture replaces them.
  const heroHeights = Object.fromEntries(report.pages.filter((page) => page.heroHeights).map((page) => [page.pageType, page.heroHeights]));
  const photoWall = report.photoWall ?? components.photoWall;
  for (const page of report.pages) {
    if (page.heroVariant && followsEvidence(heroByPageType[page.pageType], heroGuess(previous, page.pageType))) heroByPageType[page.pageType] = page.heroVariant;
    pageTypes[page.pageType] = { ...Object.fromEntries(Object.entries(pageTypes[page.pageType] ?? {}).filter(([key]) => !AUTHORED_PATTERN_KEYS.includes(key))), ...page.modules };
  }
  // The reference's section headings: start where most of them start on the content's left edge, else centre.
  const headings = report.headings;
  const headingAlign = headings && headings.start + headings.center ? (headings.start >= headings.center ? 'start' : 'center') : components.headingAlign;
  // The competitor's titles as measured (lib/heading-fit.mjs); a capture that found none keeps the earlier measure.
  const heroText = report.heroText ?? components.heroText;
  return { ...components, heroByPageType, pageTypes, ...(Object.keys(heroHeights).length ? { heroHeights } : {}), ...(photoWall ? { photoWall } : {}), ...(headingAlign ? { headingAlign } : {}), ...(heroText ? { heroText } : {}) };
}

// blueprints: Site Factory 06's slot manifest when given; else each page type follows the competitor's page.
export async function scaffoldReferencePatterns({ pagesPlan, references, blueprints = null, root = process.cwd() }) {
  const contact = pagesPlan.pages.find((page) => page.page_type === 'contact');
  if (!contact) throw new Error('the site plan has no contact page');
  // The browser opens for the first page measured live: a run that keeps every measure visits nothing.
  let opened = null;
  const browser = { newPage: async (options) => (await (opened ??= import('playwright').then(({ chromium }) => chromium.launch({ headless: true })))).newPage(options) };
  const pages = [];
  // The capture these measures stand beside (lib/reference-access.mjs: the live pages are measured once a capture).
  const stamp = await captureStamp(root);
  const report = { schemaVersion: 'seo-site-pattern-inventory-v1', ...(stamp ? { capture: stamp } : {}), viewport: DESKTOP.width, phoneViewport: PHONE.width, pages: [], headings: { start: 0, center: 0 } };
  const pageTypes = {};
  const heroTexts = [];
  const inventoryPath = resolve(root, 'docs/research/pattern-inventory.json');
  const previous = await readJson(inventoryPath, null);
  const peers = (await readJson(resolve(root, 'site.json'), null))?.designPeers ?? {};
  const beside = measuredBeside(previous, stamp);
  // A page kept from an earlier measure without its own heading and hero counts (an inventory written before they were
  // kept per page): the site's counts stay the earlier ones.
  let keptWithoutCounts = false;
  try {
    for (const [pageType, url] of Object.entries(references)) {
      const peerUrls = (peers[pageType] ?? []).slice(0, PEER_SAMPLES);
      const kept = previous?.pages?.find((entry) => entry.pageType === pageType && entry.reference === url);
      // An earlier measure kept as this run's (its crops stay): its page, its counts and whatever this run says of it.
      const keep = (more) => {
        pageTypes[pageType] = kept.modules;
        report.pages.push({ ...kept, ...more });
        if (kept.headings) for (const [align, count] of Object.entries(kept.headings)) report.headings[align] += count;
        heroTexts.push(kept.heroText ? { ...kept.heroText, pageType } : null);
        if (!kept.headings || !('heroText' in kept)) keptWithoutCounts = true;
      };
      // Measured beside this capture already, with these peers (a measure from before the capture was recorded names
      // no peers and is taken as theirs): kept, the page not visited. Its first screen is the capture's own, read again.
      if (beside && kept && (previous.capture == null || JSON.stringify(kept.peers ?? []) === JSON.stringify(peerUrls))) {
        const heroHeights = (await capturedHeroHeights(root, pageType)) ?? kept.heroHeights;
        keep({ ...(heroHeights ? { heroHeights } : {}), peers: peerUrls });
        continue;
      }
      let measured;
      try {
        measured = await measureReference(browser, url);
      } catch (error) {
        if (!BLOCKED_STATUSES.includes(error.status) || !kept) throw error;
        console.warn(`patterns: ${url} answered ${error.status}; the ${pageType} page keeps the measure an earlier run took (stale in docs/research/pattern-inventory.json, crops kept)`);
        keep({ stale: { status: error.status } });
        continue;
      }
      const { page, shapes, headings, heroText } = measured;
      for (const [align, count] of Object.entries(headings)) report.headings[align] += count;
      heroTexts.push(heroText && { ...heroText, pageType });
      if (shapes.length < 2) throw new Error(`could not find the section list on ${url}`);
      const sections = inventory(shapes, { pageType });
      // One crop per reference section for pattern-by-pattern review; the crops of an earlier capture go (another
      // section count or pattern would leave crops of sections the page no longer has).
      const cropDir = resolve(root, 'docs/research/pattern-sections', pageType);
      await rm(cropDir, { recursive: true, force: true });
      await mkdir(cropDir, { recursive: true });
      for (const section of sections) {
        const { top, left, width, height } = section.shape;
        const file = `${String(section.index).padStart(2, '0')}-${section.pattern}.png`;
        await page.screenshot({ path: resolve(cropDir, file), fullPage: true, clip: { x: Math.max(0, left), y: Math.max(0, top), width: Math.max(1, width), height: Math.max(1, Math.min(height, 3000)) } }).catch(() => {});
        section.crop = `docs/research/pattern-sections/${pageType}/${file}`;
      }
      await page.close();
      pageTypes[pageType] = authoredPatterns(sections);
      const heroOf = (list) => { const hero = list.find((section) => section.pattern.startsWith('hero-')); return hero ? PATTERN_DECISIONS[hero.pattern].slice('hero:'.length) : undefined; };
      const ownHero = sampleHero(sections, heroOf);
      // The hero by the majority of this page and the competitor's pages beside it in its menu (heroByMajority): only
      // their heroes are measured; one that cannot be read is left out.
      // Its samples: the reference's pages beside it in its menu, then the other competitors' pages of its type
      // (designPeers), each measured at desktop width; one that cannot be read is left out.
      const heroSamples = [];
      const sampleModules = [];
      const others = new Set(Object.values(references).map((ref) => String(ref).replace(/\/?$/, '/')));
      const siblingUrls = SINGLE_PAGE_TYPES.includes(pageType) ? [] : (measured.siblings ?? []).filter((href) => !others.has(href)).slice(0, HERO_SAMPLES);
      for (const [sampleUrl, peer] of [...siblingUrls.map((href) => [href, false]), ...peerUrls.map((href) => [href, true])]) {
        try {
          const sample = await measureReference(browser, sampleUrl, { desktopOnly: true });
          await sample.page.close();
          const sampleSections = inventory(sample.shapes, { pageType });
          const variant = sampleHero(sampleSections, heroOf);
          if (variant) heroSamples.push({ url: sampleUrl, heroVariant: variant, ...(peer ? { peer: true } : {}) });
          if (peer) sampleModules.push(authoredPatterns(sampleSections));
        } catch (error) {
          console.warn(`patterns: ${peer ? 'peer' : 'hero'} sample ${sampleUrl} not measured (${error.message.slice(0, 120)})`);
        }
      }
      pageTypes[pageType] = modulesByMajority(pageTypes[pageType], sampleModules);
      // A form hero stands only on more pages than the reference's own (one landing page's form is not every page's of
      // the type): without them the type takes the page's own photo hero (else the photo behind the copy, typeHero).
      const voted = heroByMajority(ownHero, heroSamples.map((sample) => sample.heroVariant));
      const heroVariant = voted === 'media-form' && !heroSamples.some((sample) => sample.heroVariant === 'media-form') ? (heroOf(sections) ?? typeHero(voted)) : voted;
      // The capture's own rects (lib/capture-hero.mjs: the phone's visit has its own DOM, which the live measure's
      // desktop paths do not find); the live measure only where the page type has no capture (heroHeightsFrom).
      const heroHeights = heroHeightsFrom(await capturedHeroHeights(root, pageType), sections);
      report.pages.push({ pageType, reference: url, modules: pageTypes[pageType], heroVariant, ...(heroHeights ? { heroHeights } : {}), ...(heroSamples.length ? { heroOwn: ownHero, heroSamples } : {}), coverage: coverage(sections), headings, heroText: heroText ?? null, sections: sections.map(({ shape, ...rest }) => rest), peers: peerUrls });
    }
  } finally {
    await (await opened)?.close();
  }
  report.heroText = keptWithoutCounts && previous?.heroText ? previous.heroText : heroTextAverage(heroTexts);
  // The photo walls' shape from the captured pages' raw measure (capture-reference-pages.mjs).
  const rawDirs = Object.keys(references).map((pageType) => resolve(root, 'docs/research/reference-pages', captureFolder(pageType), 'raw'));
  const raws = await Promise.all(rawDirs.map((dir) => readJson(resolve(dir, 'desktop-1440.json'), null)));
  const htmls = await Promise.all(rawDirs.map((dir) => readFile(resolve(dir, 'rendered.html'), 'utf8').catch(() => null)));
  const photoWall = photoWallOf(raws, htmls);
  if (photoWall) report.photoWall = photoWall;
  if (keptWithoutCounts && previous?.headings) report.headings = previous.headings;
  await writeJson(inventoryPath, report);
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  variants.components = withCapture(variants.components, report, previous);
  await writeJson(variantsPath, variants);
  pages.push(...(await writeBlueprintPages({ root, pagesPlan, blueprints })).pages);
  return { pages, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const planIndex = args.indexOf('--pages-plan');
  const planPath = planIndex >= 0 ? args[planIndex + 1] : null;
  const blueprintIndex = args.indexOf('--blueprints');
  const blueprintPath = blueprintIndex >= 0 ? args[blueprintIndex + 1] : null;
  const skip = new Set([planIndex, planIndex + 1, ...(blueprintIndex >= 0 ? [blueprintIndex, blueprintIndex + 1] : [])]);
  const references = Object.fromEntries(args.filter((arg, index) => !skip.has(index)).map((arg) => arg.split(/=(.*)/s).slice(0, 2)));
  if (!planPath || !Object.keys(references).length) {
    console.error('Usage: node scripts/scaffold-placeholder-pages.mjs --pages-plan <pages.json> home=<url> about=<url> contact=<url> [<page_type>=<url> ...]');
    process.exitCode = 1;
  } else {
    readJson(resolve(planPath))
      .then(async (pagesPlan) => scaffoldReferencePatterns({ pagesPlan, references, blueprints: blueprintPath ? blueprintsFrom(await readJson(resolve(blueprintPath))) : null }))
      .then(({ report }) => console.log(JSON.stringify(report.pages.map((page) => ({ pageType: page.pageType, coverage: `${page.coverage}%`, hero: page.heroVariant, modules: page.modules, patterns: page.sections.map((section) => section.pattern).join(' > ') })), null, 2)))
      .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
  }
}
