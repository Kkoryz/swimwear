// Visual density of the content area between Header and Footer, measured the same way on the
// reference and on the candidate so "looks like the source" becomes a checkable band.

import { PAGE_SHELL } from './page-shell.mjs';
import { scrollThroughPage } from './reveal.mjs';

// v2 (owner 2026-11-10 via Site Factory): tables, charts, step and figure cards, embeds and video are visual or
// structured blocks, not text: they break a text run and count with the photos in the visual share; words are the
// rendered text outside tables (a collapsed tab's or accordion's text no longer counts). A v1 file is measured anew.
export const DENSITY_SCHEMA = 'seo-site-reference-density-v2';
// Our own blocks that are structured (a flow chart, step cards, a table, figures, a chart): the generic detection below
// finds the reference's, these name ours where their markup has no box or table of its own.
const OWN_STRUCTURED = '.process-steps, .process-ring, .process-timeline, dl.stats, .table-block, .table-cards, .section-charts, .pricing-cards, .swatches';
// Utility pages (a form and contact channels, a legal text) are not content pages: the reference's content-page
// density does not apply to them.
export const DENSITY_EXEMPT_PAGE_TYPES = Object.freeze(['contact', 'privacy', 'blog_hub', 'blog_post']);
// Page types held to the band's ceiling but not its floor: the benchmark measures content pages, and an about page
// reads mostly as text (owner 2026-11-12: an about page with fewer pictures is fine).
export const DENSITY_FLOOR_EXEMPT_PAGE_TYPES = Object.freeze(['about']);

// Tolerances around the reference range. The candidate carries different copy, so it gets some slack,
// but it must not become a wall of text or an image dump compared with every reference page.
export const DENSITY_TOLERANCE = Object.freeze({
  wordsPer1000pxMax: 1.15,
  visualAreaPctMin: 0.75,
  visualAreaPctMax: 1.35,
  longestTextOnlyPxMax: 1.2,
});

// Scrolls to load lazy media, then measures in the browser.
export async function measureDensity(page) {
  await scrollThroughPage(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  return page.evaluate(({ shell, own }) => {
    // The site's header and footer: none inside the page's own content (shell.page).
    const site = (box) => Boolean(box) && !box.parentElement?.closest(shell.page);
    const header = [...document.querySelectorAll(shell.header)].find(site);
    const footer = [...document.querySelectorAll(shell.footer)].find(site);
    const inShell = (element) => { for (let box = element.closest(shell.shell); box; box = box.parentElement?.closest(shell.shell)) if (site(box)) return true; return false; };
    const top = header ? header.getBoundingClientRect().bottom + scrollY : 0;
    const bottom = footer ? footer.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight;
    const height = Math.max(bottom - top, 1);
    const width = document.documentElement.clientWidth;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 60 && rect.height > 60;
    };
    // Off-canvas carousel slides are not visible content. A box reaching past the content's top or foot counts for its
    // part inside (area and runs are clipped to it): a hero photo under the header starts above the header's foot, and
    // counted for nothing (hotel-rm's home and hhmhotels.com's, 2026-11-14).
    const inside = (rect) => rect.bottom + scrollY > top + 1 && rect.top + scrollY < bottom - 1 && rect.right > 0 && rect.left < width;
    const content = (element) => !inShell(element);
    const boxes = (elements) => elements.filter((element) => content(element) && visible(element)).map((element) => element.getBoundingClientRect()).filter(inside);
    // Photos: images, video and background photos.
    const photos = [...boxes([...document.querySelectorAll('img, video')]), ...boxes([...document.querySelectorAll('body *')].filter((element) => /url\(/.test(getComputedStyle(element).backgroundImage)))];
    // Structured blocks: tables, embeds (an interactive fabric explorer), charts, and card grids (three or more boxed
    // cards of text side by side: steps, figures, features), and ours by name.
    const boxed = (element) => {
      const style = getComputedStyle(element);
      return !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderLeftWidth) > 0 || style.boxShadow !== 'none';
    };
    const cardGrid = (element) => {
      const cards = [...element.children].filter((child) => visible(child) && boxed(child) && child.innerText.trim() && !child.querySelector('img'));
      return cards.length >= 3 && new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top / 10))).size < cards.length;
    };
    const charts = boxes([...document.querySelectorAll('svg, canvas')]).filter((rect) => rect.width > 200 && rect.height > 120);
    const structured = [...boxes([...document.querySelectorAll(`table, iframe, ${own}`)]), ...charts, ...boxes([...document.querySelectorAll('body *')].filter(cardGrid))];
    // Areas are unions of boxes (stacked or layered ones count once), on a 20px grid.
    const area = (rects) => {
      const cells = new Set();
      for (const rect of rects) {
        const x0 = Math.max(0, Math.floor(rect.left / 20)), x1 = Math.min(Math.ceil(width / 20), Math.ceil(rect.right / 20));
        const y0 = Math.floor(Math.max(top, rect.top + scrollY) / 20), y1 = Math.ceil(Math.min(bottom, rect.bottom + scrollY) / 20);
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) cells.add(y * 10000 + x);
      }
      return cells.size * 400;
    };
    const share = (rects) => Math.min(100, Math.round((100 * area(rects)) / (width * height)));
    // Rendered text only (a collapsed tab or accordion has no boxes), tables apart.
    const rendered = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const words = [...document.querySelectorAll('p, li, h1, h2, h3, h4, summary')]
      .filter((element) => !inShell(element) && !element.closest('nav, form, table') && !element.querySelector('p, li, h2, h3') && rendered(element))
      .map((element) => element.innerText).join(' ').split(/\s+/).filter(Boolean).length;
    // The longest stretch with neither a photo nor a structured block.
    const breaks = [...photos, ...structured].map((rect) => ({ top: Math.max(top, rect.top + scrollY), bottom: Math.min(bottom, rect.bottom + scrollY) })).sort((left, right) => left.top - right.top);
    let cursor = top;
    let longest = 0;
    for (const item of breaks) { longest = Math.max(longest, item.top - cursor); cursor = Math.max(cursor, item.bottom); }
    longest = Math.max(longest, bottom - cursor);
    return {
      contentHeight: Math.round(height),
      images: photos.length,
      structured: structured.length,
      words,
      wordsPer1000px: Math.round((1000 * words) / height),
      photoAreaPct: share(photos),
      structuredAreaPct: share(structured),
      visualAreaPct: share([...photos, ...structured]),
      longestTextOnlyPx: Math.round(longest),
    };
  }, { shell: PAGE_SHELL, own: OWN_STRUCTURED });
}

// Allowed band for candidate pages, derived from every measured reference page.
export function densityBands(referencePages, tolerance = DENSITY_TOLERANCE) {
  const values = (key) => referencePages.map((page) => page.metrics[key]);
  if (!referencePages.length) throw new Error('reference density needs at least one measured page');
  return {
    wordsPer1000px: { max: Math.round(Math.max(...values('wordsPer1000px')) * tolerance.wordsPer1000pxMax) },
    visualAreaPct: { min: Math.round(Math.min(...values('visualAreaPct')) * tolerance.visualAreaPctMin), max: Math.round(Math.max(...values('visualAreaPct')) * tolerance.visualAreaPctMax) },
    longestTextOnlyPx: { max: Math.round(Math.max(...values('longestTextOnlyPx')) * tolerance.longestTextOnlyPxMax) },
  };
}

// The bands by page type (owner 2026-11-12: Concord's home, most of it full-width photos, was held to the band of the
// service pages): pages measured for a page type (pageType: the competitor's own page of that type, its home for the
// home page) give that page type its own band, under pageTypes; the band itself (the top-level keys) is the untyped
// pages' (the content pages' benchmark), which every other page type takes. Without untyped pages it is all pages'.
export function pageTypeBands(referencePages, tolerance = DENSITY_TOLERANCE) {
  const untyped = referencePages.filter((page) => !page.pageType);
  const base = densityBands(untyped.length ? untyped : referencePages, tolerance);
  const typed = Object.groupBy(referencePages.filter((page) => page.pageType), (page) => page.pageType);
  const pageTypes = Object.fromEntries(Object.entries(typed).map(([type, pages]) => [type, densityBands(pages, tolerance)]));
  return Object.keys(pageTypes).length ? { ...base, pageTypes } : base;
}

// The band a page type is planned and audited to: its own where it has one, else the band.
export function bandFor(bands, pageType) {
  if (!bands) return bands;
  const { pageTypes, ...band } = bands;
  return (pageType && pageTypes?.[pageType]) || band;
}

// How many words a run of text with no picture may hold before it needs one: the longest text-only run the band
// allows, filled at the sparsest text of the reference pages (words over their text-only height), so a run this long
// renders within the band. The image planning places a photo wall only in a run longer than this
// (lib/media-slots.mjs withMediaModules): a short page gets none (owner 2026-11-12: the photos follow the content).
export function textRunWords(referencePages, bands) {
  const perPx = referencePages.map(({ metrics }) => metrics.words / (metrics.contentHeight * (1 - metrics.visualAreaPct / 100))).filter((value) => Number.isFinite(value) && value > 0);
  return perPx.length ? Math.round(bands.longestTextOnlyPx.max * Math.min(...perPx)) : null;
}

// The issue names stay those of photos (a page short of visuals takes a photo row when it is planned: lib/visual-budget.mjs).
export function densityFailures(metrics, bands) {
  const failures = [];
  if (metrics.wordsPer1000px > bands.wordsPer1000px.max) failures.push({ issue: 'density_text_heavy', value: metrics.wordsPer1000px, maximum: bands.wordsPer1000px.max });
  if (metrics.visualAreaPct < bands.visualAreaPct.min) failures.push({ issue: 'density_too_few_images', value: metrics.visualAreaPct, minimum: bands.visualAreaPct.min });
  if (metrics.visualAreaPct > bands.visualAreaPct.max) failures.push({ issue: 'density_too_many_images', value: metrics.visualAreaPct, maximum: bands.visualAreaPct.max });
  if (metrics.longestTextOnlyPx > bands.longestTextOnlyPx.max) failures.push({ issue: 'density_long_text_run', value: metrics.longestTextOnlyPx, maximum: bands.longestTextOnlyPx.max });
  return failures;
}

// Each page block's own measure, by the rules measureDensity applies to the page (pictures: images, video and
// background photos; structured: tables, embeds, charts and card grids): its height, words, the share of it that is
// picture or structured, and its text-only height above its first and below its last such box. The visual budget's
// block model is fitted from these (lib/visual-budget.mjs fitBlockModel).
export async function measureBlocks(page) {
  return page.evaluate((own) => {
    const width = document.documentElement.clientWidth;
    const visible = (element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 60 && rect.height > 60; };
    const boxed = (element) => { const style = getComputedStyle(element); return !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderLeftWidth) > 0 || style.boxShadow !== 'none'; };
    const cardGrid = (element) => { const cards = [...element.children].filter((child) => visible(child) && boxed(child) && child.innerText.trim() && !child.querySelector('img')); return cards.length >= 3 && new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top / 10))).size < cards.length; };
    const all = [...document.querySelectorAll('main *')];
    const rects = [
      ...all.filter((element) => (/^(IMG|VIDEO)$/.test(element.tagName) || /url\(/.test(getComputedStyle(element).backgroundImage)) && visible(element)),
      ...[...document.querySelectorAll(`main :is(table, iframe, ${own})`)].filter(visible),
      ...all.filter((element) => /^(svg|canvas)$/i.test(element.tagName) && visible(element) && element.getBoundingClientRect().width > 200 && element.getBoundingClientRect().height > 120),
      ...all.filter((element) => visible(element) && cardGrid(element)),
    ].map((element) => element.getBoundingClientRect());
    return [...document.querySelectorAll('main [data-authoring-block]')].filter((element) => !element.parentElement.closest('[data-authoring-block]')).map((element) => {
      const box = element.getBoundingClientRect();
      const inside = rects.filter((rect) => rect.bottom > box.top + 1 && rect.top < box.bottom - 1).map((rect) => ({ ...rect.toJSON(), top: Math.max(rect.top, box.top), bottom: Math.min(rect.bottom, box.bottom) })).sort((a, b) => a.top - b.top);
      const cells = new Set();
      for (const rect of inside) for (let y = Math.floor(rect.top / 20); y < Math.ceil(rect.bottom / 20); y += 1) for (let x = Math.max(0, Math.floor(rect.left / 20)); x < Math.min(Math.ceil(width / 20), Math.ceil(rect.right / 20)); x += 1) cells.add(y * 10000 + x);
      // A table's cells count here (not in the page's words above): a table is as tall as its rows, and the block model
      // fits height on these words (motel /project-management/ 2026-11-14: a table estimated 1,113px for 1,885px).
      const words = [...element.querySelectorAll('p, li, h1, h2, h3, h4, summary, th, td, dt, dd')].filter((item) => !item.closest('nav, form') && !item.querySelector('p, li, h2, h3, th, td, dt, dd')).map((item) => item.innerText).join(' ').split(/\s+/).filter(Boolean).length;
      const type = element.getAttribute('data-authoring-block');
      const variant = element.getAttribute(type === 'featureGrid' ? 'data-pattern' : 'data-variant') ?? '';
      // A closing band with its photo behind it is another module than one without (CtaBlock data-has-photo).
      const photo = type === 'cta' && element.getAttribute('data-has-photo') === 'true' ? '+photo' : '';
      return { key: `${type}:${variant}${photo}`, id: element.getAttribute('data-block-id'), height: Math.round(box.height), words, visualShare: Math.round((100 * cells.size * 400) / (width * Math.max(1, box.height))) / 100, before: Math.round(inside.length ? inside[0].top - box.top : box.height), after: Math.round(inside.length ? box.bottom - Math.max(...inside.map((rect) => rect.bottom)) : box.height) };
    });
  }, OWN_STRUCTURED);
}
