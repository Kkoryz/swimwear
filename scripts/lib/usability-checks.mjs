// Usability checks of the built pages that need no reference and no model (owner 2026-11-18, on the Staylumen preview:
// "单看一站也不应该过": the design review only asked whether a page looks like the competitor's, and a page that copied a
// landing page's form onto nine service pages, an FAQ page with every answer open and a first screen of stacked bars
// passed it). The layout audit measures each page with measureUsability and fails what usabilityProblems and
// heroShareProblems find:
// - hero_form: an enquiry form of HERO_FORM_FIELDS fields or more in the first screen of a page that is not the contact
//   page, a page carrying its own enquiry form (the quote page), or a page of a type the site names a landing page
//   (template-variants.json components.landingPageTypes: a form hero the competitors' same pages carry by majority);
// - faq_unfolded: an FAQ of more than FAQ_OPEN_MAX questions with every answer shown, or an FAQ page with more than
//   FAQ_OPEN_MAX answers shown open in all (its FAQ blocks' and its question headings');
// - band_stack: BAND_STACK_MAX narrow full-width bands or more (a bar from STRIP_MIN_PX to STRIP_MAX_SHARE of the screen: a
//   solid header, a breadcrumb row, a figures strip) within one screen's height from the top of the page;
// Against the reference's measure, same width (owner 2026-11-18: the design review compared screenshots and never a
// size; Staylumen's heroes were 360 to 600px where the reference's are 412 to 1000):
// - hero_height: the first screen's photo hero more than HERO_HEIGHT_TOLERANCE off the reference's height for its
//   page type at that width (lib/hero-heights.mjs), the screen under it the cap; taller only where it holds a form;
//   only a hero the template sizes by that height (PageHero.astro data-hero-height: the overlay hero);
// - wall_shape: a photo wall across the page where the reference's photos sit in the content's width, or off the
//   reference's photo shape by more than WALL_RATIO_TOLERANCE (components.photoWall).
// - hero_shared: the home page's opening photo on another page (a failure); one opening photo on two pages of one page
//   type is a warning (a catch-all type such as general shares the site-wide heroes by design: HERO_MAX_PAGES).

import { isFaqPage } from './faq-layout.mjs';
import { heroHeightsFor } from './hero-heights.mjs';

export const HERO_FORM_FIELDS = 3;
export const FAQ_OPEN_MAX = 2;
export const BAND_STACK_MAX = 3;
export const STRIP_MAX_SHARE = 0.25;
// Thinner than this a band is a sliver (a photo wall's margin, a rule), not a bar of its own.
export const STRIP_MIN_PX = 24;
// The page types whose pages carry the enquiry form by their nature.
export const FORM_PAGE_TYPES = Object.freeze(['contact']);
export const HERO_HEIGHT_TOLERANCE = 0.2;
export const WALL_RATIO_TOLERANCE = 0.15;
// The audit's widths by the names the reference's heights are kept under.
const WIDTH_KEY = Object.freeze({ desktop: 'desktop', tablet: 'tablet', mobile: 'phone' });

// In the page (page.evaluate, self-contained): what the checks read, at the scroll's top.
export function measureUsability() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const main = document.querySelector('main') ?? document.body;
  const shown = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const closed = element.parentElement?.closest('details:not([open])') && !element.closest('summary');
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !closed;
  };
  // Fields a visitor fills in (not a search box, a checkbox or a button), shown in the first screen.
  const fields = [...main.querySelectorAll('input, select, textarea')].filter((field) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'search', 'reset', 'image'].includes(field.type) && shown(field));
  const heroFields = fields.filter((field) => field.getBoundingClientRect().top + window.scrollY < vh).length;
  // Each FAQ block: its questions and the answers shown.
  const faqs = [...main.querySelectorAll('.block--faq')].map((block) => {
    const items = [...block.querySelectorAll('.faq__item')];
    return { id: block.getAttribute('data-block-id'), items: items.length, open: items.filter((item) => (item.tagName === 'DETAILS' ? item.open : shown(item))).length };
  });
  // Question headings shown open (outside a summary): on an FAQ page, questions whose answers are all in view.
  const openQuestions = [...main.querySelectorAll('h2, h3')].filter((heading) => /\?\s*$/.test(heading.textContent.trim()) && !heading.closest('summary, .block--faq') && shown(heading)).length;
  // The page's surface down the left edge, in document order: a full-width element's own colour or photo, the deepest
  // one at each height (it paints over its ancestors); fixed bars (the enquiry bar) are left out.
  const colour = (value) => { const match = /rgba?\(([^)]+)\)/.exec(value); if (!match) return null; const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number); return (parts[3] ?? 1) >= 0.6 ? `rgb(${parts.slice(0, 3).join(',')})` : null; };
  const layers = [];
  const fixed = (element) => { for (let at = element; at && at !== document.body; at = at.parentElement) if (getComputedStyle(at).position === 'fixed') return true; return false; };
  for (const element of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < vw * 0.9 || rect.height < 1 || fixed(element)) continue;
    const photo = ['IMG', 'VIDEO', 'PICTURE'].includes(element.tagName) || /url\(/.test(style.backgroundImage);
    const surface = photo ? 'photo' : colour(style.backgroundColor);
    if (surface) layers.push({ top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, surface });
  }
  const page = colour(getComputedStyle(document.body).backgroundColor) ?? 'rgb(255,255,255)';
  const end = Math.min(document.documentElement.scrollHeight, vh * 2);
  const bands = [];
  for (let y = 0; y < end; y += 4) {
    let surface = page;
    for (const layer of layers) if (layer.top <= y && layer.bottom > y) surface = layer.surface;
    const last = bands.at(-1);
    if (last && last.surface === surface) last.height += 4; else bands.push({ top: y, height: 4, surface });
  }
  // The hero's box, where it starts and whether it holds a form; the fixed bar at the screen's foot; the photo walls.
  const heroBox = main.querySelector('.page-hero')?.getBoundingClientRect() ?? null;
  const bar = [...document.querySelectorAll('[data-enquiry-bar]')].find((element) => shown(element))?.getBoundingClientRect().height ?? 0;
  const heroShape = heroBox ? { top: Math.round(heroBox.top + window.scrollY), height: Math.round(heroBox.height), form: Boolean(main.querySelector('.page-hero[data-hero-form]')), bar: Math.round(bar), photo: main.hasAttribute('data-hero-photo'), sized: main.querySelector('.page-hero').hasAttribute('data-hero-height') } : null;
  const wallShapes = [...main.querySelectorAll('[data-block-id^="media-module-"] .gallery__band')].filter(shown).map((figure) => { const box = figure.getBoundingClientRect(); return { id: figure.closest('[data-block-id]').getAttribute('data-block-id'), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) }; });
  const hero = main.querySelector('.page-hero img');
  const heroSrc = hero ? (hero.currentSrc || hero.getAttribute('src') || null) : null;
  // The page's width without a scroll bar: a wall edge to edge spans it.
  const pageWidth = document.documentElement.clientWidth;
  return { viewportHeight: vh, viewportWidth: vw, pageWidth, heroFields, faqs, openQuestions, bands, bar: Math.round(bar), heroSrc, heroShape, wallShapes };
}

// The narrow bands (non-photo, under STRIP_MAX_SHARE of the screen) that start in the first screen: one screen's height
// from the top of the page, as the rule reads (owner 2026-11-18, "首屏有这么多黑条"). A window opened at any strip of the
// first screen ran a screen further on: MotelPilot's tablet service pages (2026-11-20) counted a gap between two grey
// sections and a white section of the second screen with the one strip under their hero.
// Each counts by the part a visitor sees: cut to the screen over the fixed enquiry bar (bar: its height, the page's
// measure evidence.bar; a blog page has the bar and no .page-hero, so not heroShape.bar alone), a strip that shows less than STRIP_MIN_PX there is none (2026-11-20, Strandmill's tablet
// service page: a white gap of 52px at 1020 showed 4px of it, under the bar at 963-1024). What the strip holds does not
// matter: a chart card's band across the screen counts as the figures strip of Staylumen's FAQ page did.
export const narrowBand = (band, viewportHeight, share = STRIP_MAX_SHARE) => band.surface !== 'photo' && band.height >= STRIP_MIN_PX && band.height < viewportHeight * share;
export const firstScreenStrips = (bands, viewportHeight, { share = STRIP_MAX_SHARE, bar = 0 } = {}) => bands.filter((band) => narrowBand(band, viewportHeight, share) && Math.min(band.top + band.height, viewportHeight - bar) - Math.max(band.top, 0) >= STRIP_MIN_PX);
export function stackedStrips(bands, viewportHeight, options = {}) {
  return firstScreenStrips(bands, viewportHeight, options).length;
}

// A page's usability failures from its measure at one width.
export function usabilityProblems(evidence, { page, components = {} }) {
  if (!evidence) return [];
  const problems = [];
  const formPage = FORM_PAGE_TYPES.includes(page.pageType) || (page.blocks ?? []).some((block) => block.type === 'form') || (components.landingPageTypes ?? []).includes(page.pageType);
  if (!formPage && evidence.heroFields >= HERO_FORM_FIELDS) problems.push({ issue: 'hero_form', detail: `${evidence.heroFields} form fields in the first screen of a ${page.pageType} page (the form belongs on the contact and quote pages and in the closing call; a landing page type is named in components.landingPageTypes)` });
  for (const faq of evidence.faqs ?? []) if (faq.items > FAQ_OPEN_MAX && faq.open === faq.items) problems.push({ issue: 'faq_unfolded', detail: `FAQ ${faq.id}: all ${faq.items} answers shown` });
  // The FAQ page as a whole: its FAQ blocks' open answers and its open question headings together (Strandmill's FAQ page
  // was 21 short FAQ blocks, each open within the limit).
  const pageOpen = (evidence.faqs ?? []).reduce((sum, faq) => sum + faq.open, 0) + (evidence.openQuestions ?? 0);
  if (isFaqPage(page) && pageOpen > FAQ_OPEN_MAX) problems.push({ issue: 'faq_unfolded', detail: `${pageOpen} answers shown open on the FAQ page` });
  const seen = { bar: evidence.bar ?? evidence.heroShape?.bar ?? 0 };
  const strips = stackedStrips(evidence.bands ?? [], evidence.viewportHeight, seen);
  if (strips >= BAND_STACK_MAX) problems.push({ issue: 'band_stack', detail: `${strips} narrow full-width bands in the first screen (${firstScreenStrips(evidence.bands ?? [], evidence.viewportHeight, seen).slice(0, 6).map((band) => `${band.surface} ${band.height}px at ${band.top}`).join(', ')})` });
  return problems;
}

// The page's first screen and photo walls against the reference's measure at one width (viewport: the audit's id).
const ratioOf = (text) => { const [w, h] = String(text ?? '').split('/').map(Number); return w > 0 && h > 0 ? w / h : null; };
export function referenceShapeProblems(evidence, { page, components = {}, viewport }) {
  if (!evidence) return [];
  const problems = [];
  const reference = heroHeightsFor(page.pageType, components)?.[WIDTH_KEY[viewport]];
  const hero = evidence.heroShape;
  // A photo hero only (PageView.astro data-hero-photo): a text hero (the legal pages') takes no height of the template's.
  // And only a hero the template sizes by the reference (heroShape.sized: PageHero.astro data-hero-height,
  // lib/hero-heights.mjs SIZED_HERO_VARIANTS): a split hero is as tall as its copy and photo, a banner as the first
  // screen leaves it, and measured against the reference they passed or failed on their titles' line counts.
  if (reference?.height && hero && hero.photo !== false && hero.sized) {
    const screen = evidence.viewportHeight - hero.top - (hero.bar ?? 0);
    const expected = Math.min(reference.height, screen);
    const short = hero.height < expected * (1 - HERO_HEIGHT_TOLERANCE);
    const tall = !hero.form && hero.height > Math.max(expected * (1 + HERO_HEIGHT_TOLERANCE), screen);
    if (short || tall) problems.push({ issue: 'hero_height', block: 'hero', detail: `the hero is ${hero.height}px at ${viewport} (${Math.round((100 * hero.height) / evidence.viewportHeight)}% of the screen's height) where the reference's for ${page.pageType} is ${reference.height}px (${Math.round(100 * (reference.share ?? reference.height / evidence.viewportHeight))}%; ${expected}px in this screen), more than ${HERO_HEIGHT_TOLERANCE * 100}% ${short ? 'shorter' : 'taller'}` });
  }
  const wall = components.photoWall;
  const expectedRatio = viewport === 'mobile' ? 4 / 3 : ratioOf(wall?.ratio);
  // Edge to edge: from the page's left edge across its width (a tablet's content width is 93% of its screen, its walls
  // inside the gutters; an evidence without the wall's left edge: 90% of a desktop's or a tablet's screen).
  const across = (shape) => (shape.left === undefined ? viewport !== 'mobile' && shape.width >= evidence.viewportWidth * 0.9 : shape.left <= 2 && shape.width >= (evidence.pageWidth ?? evidence.viewportWidth) - 4);
  for (const shape of evidence.wallShapes ?? []) {
    if (wall?.fit === 'container' && across(shape)) problems.push({ issue: 'wall_shape', block: shape.id, detail: `${shape.id} runs ${shape.width}px across the page where the reference's photos sit in the content's width` });
    else if (wall?.fit === 'container' && expectedRatio && Math.abs(shape.width / shape.height - expectedRatio) / expectedRatio > WALL_RATIO_TOLERANCE) problems.push({ issue: 'wall_shape', block: shape.id, detail: `${shape.id} is ${shape.width}x${shape.height} where the reference's photo shape is ${wall.ratio}` });
  }
  return problems;
}

// A photo's file without its width and format (the same photo at another size is the same photo).
export const photoName = (src) => (src ? String(src).split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/-\d{2,4}w?$/, '') : null);

// One opening photo on the home page and another page, or on two pages of one page type (results: { route, pageType,
// heroSrc } at one width).
export function heroShareProblems(results) {
  const byPhoto = new Map();
  for (const result of results) {
    const name = photoName(result.heroSrc);
    if (name) byPhoto.set(name, [...(byPhoto.get(name) ?? []), result]);
  }
  const problems = [];
  for (const [name, pages] of byPhoto) {
    if (pages.length < 2) continue;
    const home = pages.find((item) => item.route === '/');
    const shared = home ? pages.filter((item) => item !== home) : [];
    const types = new Map();
    for (const item of pages) types.set(item.pageType, [...(types.get(item.pageType) ?? []), item]);
    const siblings = [...types.values()].filter((list) => list.length > 1).flat();
    for (const item of new Set([...shared, ...siblings])) problems.push({ route: item.route, issue: 'hero_shared', level: shared.includes(item) ? 'failure' : 'warning', detail: `opens on ${name}, as ${pages.filter((other) => other !== item).map((other) => other.route).join(' ')} do${shared.includes(item) ? ' (the home page\'s photo)' : ' (a page of the same type)'}` });
  }
  return problems;
}
