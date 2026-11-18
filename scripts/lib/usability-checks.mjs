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
// - hero_shared: the home page's opening photo on another page (a failure); one opening photo on two pages of one page
//   type is a warning (a catch-all type such as general shares the site-wide heroes by design: HERO_MAX_PAGES).

import { isFaqPage } from './faq-layout.mjs';

export const HERO_FORM_FIELDS = 3;
export const FAQ_OPEN_MAX = 2;
export const BAND_STACK_MAX = 3;
export const STRIP_MAX_SHARE = 0.25;
// Thinner than this a band is a sliver (a photo wall's margin, a rule), not a bar of its own.
export const STRIP_MIN_PX = 24;
// The page types whose pages carry the enquiry form by their nature.
export const FORM_PAGE_TYPES = Object.freeze(['contact']);

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
  const hero = main.querySelector('.page-hero img');
  const heroSrc = hero ? (hero.currentSrc || hero.getAttribute('src') || null) : null;
  return { viewportHeight: vh, heroFields, faqs, openQuestions, bands, heroSrc };
}

// The most narrow bands (non-photo, under STRIP_MAX_SHARE of the screen) that start within one screen's height of each
// other, from the first screen on.
export const narrowBand = (band, viewportHeight, share = STRIP_MAX_SHARE) => band.surface !== 'photo' && band.height >= STRIP_MIN_PX && band.height < viewportHeight * share;
export function stackedStrips(bands, viewportHeight, share = STRIP_MAX_SHARE) {
  const strips = bands.filter((band) => narrowBand(band, viewportHeight, share));
  let most = 0;
  for (const band of strips.filter((item) => item.top < viewportHeight)) most = Math.max(most, strips.filter((item) => item.top >= band.top && item.top < band.top + viewportHeight).length);
  return most;
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
  const strips = stackedStrips(evidence.bands ?? [], evidence.viewportHeight);
  if (strips >= BAND_STACK_MAX) problems.push({ issue: 'band_stack', detail: `${strips} narrow full-width bands within one screen (${(evidence.bands ?? []).filter((band) => narrowBand(band, evidence.viewportHeight)).slice(0, 6).map((band) => `${band.surface} ${band.height}px at ${band.top}`).join(', ')})` });
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
