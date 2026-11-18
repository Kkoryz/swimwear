// The layout plan (Fable's 08-onward plan 2026-11-14, stages 0 and 1): what a page will be, worked out by code from
// its copy, the competitor's bands and the template's rules before any photo is made or any page is built, so the
// decisions that are functions of the content (modules, variants, columns, title levels, surfaces, photo walls,
// density) are settled once and checked once, and the audit after the build only checks the pages keep to the plan.
// Two sites (motel, hotel-rm) found these only after their photos and a build: 96 runs, 26 hours, 1,349 model calls.
//
// This file holds the arithmetic: the feasibility of each page's density (whether its pictures can come into the
// competitor's band, and with how many photo walls), the words a page renders, the lines its section headings take,
// and each page's plan.

import { cardGridColumns, cardSet, cardSetColumns, cardTitleLevel, iconListLayout, longestCardWords } from './block-layout.mjs';
import { DENSITY_EXEMPT_PAGE_TYPES, DENSITY_FLOOR_EXEMPT_PAGE_TYPES, bandFor } from './density.mjs';
import { HERO_FIT, SPLIT_HERO_FIT, fitHeading, titleMetrics, wrapLines } from './heading-fit.mjs';
import { PROOF_BLOCKS, blockWords, copyWords, drawsCharts, heroShowsPhoto, renderedWords, mediaSlots, modelVariant, resolveVariant, signatureFloor, splitsSection, withMediaModules } from './media-slots.mjs';
import { TRUST_BAR, tintedSections } from './section-surfaces.mjs';
import { PAGE_TOC, pageToc } from './page-toc.mjs';
import { DEFAULT_BLOCK_MODEL, MAX_BUDGET_WALLS, estimateBlock, modelKey, pageEstimate } from './visual-budget.mjs';

// The words a page renders as the density measure counts them (lib/media-slots.mjs renderedWords, blockWords).
export { renderedWords };

// Whether a page's pictures can come into its page type's density band (owner 2026-11-14: the picture area is what
// counts, "文字量差没关系 关键是图片面积得对", and in the band is enough, "在范围内容就行"), by arithmetic on the page's
// estimated height and picture area (the block model, lib/visual-budget.mjs) without the photo walls added for density:
// each wall adds wall.height px of which wall.visual are picture. The copy's length is never a measure here and never
// budgeted from the design reference (owner 2026-11-14: "不应该按照单个竞品定预算啊"; its length follows the SEO-strong
// competitors, Site Factory's): the words a 1,000px and the text-only runs are left out.
// verdict: fits (no wall), fits_with_walls (walls: at most maxWalls, owner 2026-11-14: three, and no more than the page
// has places for), does_not_fit (limits: what stops it, with the numbers; reachPct: the picture share at the cap,
// gapPct: how far it stays under the floor). A page that does not fit is not held (owner 2026-11-14): it is the
// owner's and 08's to know (layout-plan.md), not a rewrite for Site Factory.
export function feasibility({ words = null, band, height, visual, runs = [], wall, maxWalls, places = Infinity, floorExempt = false }) {
  const share = (walls) => round1((100 * (visual + walls * wall.visual)) / Math.max(1, height + walls * wall.height));
  const floor = floorExempt ? null : band.visualAreaPct?.min ?? null;
  const ceiling = band.visualAreaPct?.max ?? null;
  const perWall = floor == null ? 0 : wall.visual - (floor / 100) * wall.height;
  const walls = floor == null || share(0) >= floor ? 0 : perWall > 0 ? Math.ceil(((floor / 100) * height - visual) / perWall) : Infinity;
  const cap = Math.min(maxWalls, places);
  const limits = [];
  if (walls > maxWalls) limits.push({ metric: 'visualAreaPct', walls, value: share(0), minimum: floor, detail: `${Number.isFinite(walls) ? walls : 'no number of'} walls needed to reach ${floor}%, at most ${maxWalls}` });
  else if (walls > places) limits.push({ metric: 'places', walls, places, detail: `${walls} walls needed, the page has ${places} place(s) for one` });
  else if (walls > 0 && ceiling != null && share(walls) > ceiling) limits.push({ metric: 'visualAreaPct.max', walls, detail: `${walls} walls take the pictures over ${ceiling}%` });
  const verdict = limits.length ? 'does_not_fit' : walls === 0 ? 'fits' : 'fits_with_walls';
  const reach = share(Math.min(walls, cap));
  const estimate = { words, heightPx: Math.round(height), visualAreaPct: share(0), wordsPer1000px: words == null ? null : Math.round((1000 * words) / Math.max(1, height)), longestTextOnlyPx: Math.round(Math.max(0, ...runs)) };
  return { verdict, walls: verdict === 'does_not_fit' ? null : walls, cap, estimate, limits, ...(verdict === 'does_not_fit' ? { reachPct: reach, gapPct: floor == null ? 0 : round1(Math.max(0, floor - reach)) } : {}) };
}

const round1 = (value) => Math.round(value * 10) / 10;

// Section headings (main h2) over SECTION_HEADING_MAX_LINES lines are Site Factory's to shorten (lib/heading-fit.mjs;
// the audit warned of 36 on hotel-rm and 51 on motel, after the build). Before the build a heading's lines are its
// words wrapped (greedy, as the browser wraps) into the characters a line its module holds at that width. That
// capacity is a module's column width over its heading size and the face's average character width; the model keeps
// the width in ems of the heading's size (capacity x charEm), fitted per width and module from headings a built site
// measured (fitHeadingModel), so another face scales it by its own charEm.
export const HEADING_VIEWPORTS = Object.freeze(['desktop', 'mobile']);
export const headingKey = (block, variant) => `${block.type}:${variant ?? ''}${block.paragraphs?.length ? '+lead' : ''}`;

// samples: [{ viewport, key, text, lines }] -> { viewport: { key: ems, 'type:*': ems, '*': ems } }. Per group the
// capacity that predicts the most headings' lines exactly, the middle of the best ones.
export function fitHeadingModel(samples, charEm) {
  const groups = {};
  for (const sample of samples) {
    for (const key of [sample.key, `${sample.key.split(':')[0]}:*`]) (groups[`${sample.viewport}|${key}`] ||= []).push(sample);
  }
  const model = {};
  for (const [name, list] of Object.entries(groups)) {
    const [viewport, key] = name.split('|');
    let best = -1;
    let caps = [];
    for (let capacity = 8; capacity <= 160; capacity += 1) {
      const right = list.filter((sample) => wrapLines(sample.text, capacity).length === sample.lines).length;
      if (right > best) { best = right; caps = [capacity]; } else if (right === best) caps.push(capacity);
    }
    // Headings of one or two short lines allow any wide capacity: the middle of the best run that starts lowest.
    const run = caps.filter((capacity, index) => capacity === caps[0] + index);
    (model[viewport] ||= {})[key] = Math.round(run[Math.floor((run.length - 1) / 2)] * charEm * 100) / 100;
  }
  for (const widths of Object.values(model)) {
    const own = Object.entries(widths).filter(([key]) => !key.endsWith(':*')).map(([, ems]) => ems).sort((left, right) => left - right);
    if (own.length) widths['*'] = own[Math.floor(own.length / 2)];
  }
  return model;
}

// The lines a heading takes in its module at a width: its key's capacity, else its module's over all variants, else
// the width's usual one.
export function predictHeadingLines(text, { viewport, key, model, charEm }) {
  const widths = model?.[viewport] ?? {};
  const ems = widths[key] ?? widths[`${key.split(':')[0]}:*`] ?? widths['*'];
  if (!ems || !String(text ?? '').trim()) return 0;
  return wrapLines(text, Math.max(1, Math.floor(ems / charEm))).length;
}

// ---------------------------------------------------------------------------------------------------------------
// The plan of a page: every block as the renderer will place it (lib/media-slots.mjs withMediaModules, the same call
// PageView makes), with what the content decides for it: its variant, columns and card title level
// (lib/block-layout.mjs, the functions the components call), its surface (lib/section-surfaces.mjs), its photo slots,
// its estimated height and picture area (the block model), its heading's lines. Then the page: its estimate, its
// feasibility and its photo walls.

const isWall = (block) => String(block?.id).startsWith('media-module-');
const isBudgetWall = (block) => String(block?.id).startsWith('media-module-budget-');
// A process shown as numbered cards over a photo of the work stacks its steps on a phone with the photo stretched
// behind all of them (hotel-rm 2026-11-14: four steps over a 1,279px panel, five over 1,245px, "severely cropped"):
// about PHONE_STEP_PX a step and PHONE_STEPS_BASE_PX for its heading (lib/plan-assertions.mjs holds its limit).
export const PHONE_STEP_PX = 270;
export const PHONE_STEPS_BASE_PX = 160;
// A hero whose photo is not laid full-bleed under its title (a banner, a split) keeps its photo's own shape on a phone
// unless its phone frame (src/data/phone-heroes.json) is taller (lib/plan-assertions.mjs phone_hero_strip).
export const FRAMED_HEROES = new Set(['media-banner', 'media-split']);
// The content's width at 1440 (--container-max 72rem) and on a 390px phone (1.25rem gutters).
export const TITLE_COLUMNS = Object.freeze({ desktop: 1152, phone: 350 });

/**
 * @param {any} page
 * @param {any} components template-variants.json components
 * @param {{ isBuilt?: (href: string) => boolean, headingModel?: any, charEm?: number, pageTypes?: Map<string, string>, phoneHeroes?: any, maxWalls?: number }} [options]
 */
// trustBar: whether the page shows its trust bar under the hero (lib/site-trust.mjs trustBarContent: planSite reads
// the figures); the page's estimate counts it and the charts drawn after a section, as the trial build measures them.
export function planPage(page, components, { isBuilt = () => true, headingModel = null, charEm = 0.6, pageTypes = new Map(), phoneHeroes = null, maxWalls = MAX_BUDGET_WALLS, trustBar = false, treatmentCss = '' } = {}) {
  const options = { isBuilt };
  const blocks = withMediaModules(page, components, options);
  const model = components.blockModel ? { ...DEFAULT_BLOCK_MODEL, ...components.blockModel } : DEFAULT_BLOCK_MODEL;
  const setColumns = cardSetColumns(blocks);
  const shown = blocks.map((block) => (block.type === 'featureGrid' && setColumns.has(cardSet(block)) ? { ...block, setColumns: setColumns.get(cardSet(block)) } : block));
  let at = 0;
  const variants = new Map(shown.map((block) => [block.id, resolveVariant(block, page.pageType, block.type === 'splitMedia' ? at++ : 0, components)]));
  const heroVariant = components.heroByPageType?.[page.pageType] ?? components.hero;
  // A long page's table of contents under the hero (PageView.astro, lib/page-toc.mjs) is a part of its own.
  const toc = pageToc(page, blocks);
  const tinted = tintedSections([...(trustBar ? [TRUST_BAR] : []), ...(toc.length ? [PAGE_TOC] : []), ...shown], (block) => variants.get(block.id));
  let splits = 0;
  const rows = shown.map((block, index) => {
    const splitIndex = block.type === 'splitMedia' ? splits++ : 0;
    const variant = resolveVariant(block, page.pageType, splitIndex, components);
    const shape = modelVariant(block, page, blocks, components, options);
    const estimate = estimateBlock(block, shape, blockWords(block, shape, components), model, page.pageType);
    const row = { id: block.id, type: block.type, variant: variant ?? null, model: modelKey(block, shape), continues: block.continues ?? null, surface: surfaceOf(block, variant, tinted), slots: mediaSlots(block, variant, components, options).filter(Boolean), estimate: { heightPx: Math.round(estimate.height), visualPx: Math.round(estimate.visual), pictured: estimate.pictured, before: Math.round(estimate.before), after: Math.round(estimate.after) } };
    if (isWall(block)) row.wall = isBudgetWall(block) ? 'budget' : block.signature ? 'signature' : 'competitor';
    const items = block.items ?? block.steps ?? [];
    if (items.length) { row.items = items.length; row.longestItemWords = Math.max(0, ...items.map((item) => copyWords(item))); }
    if (block.type === 'featureGrid') {
      const pattern = variant ?? (row.slots.length ? 'media' : 'cards');
      // cardWords: the words the template's card rule counts (a card's text, not its title: lib/block-layout.mjs).
      Object.assign(row, { pattern, columns: cardGridColumns(block, pattern).columns, titleLevel: cardTitleLevel(block), set: cardSet(block), cardWords: longestCardWords(block) });
    }
    if (block.type === 'iconList') {
      const list = iconListLayout(block);
      Object.assign(row, { columns: list.columns, layout: list.layout, longestItemChars: Math.max(0, ...list.listed.map((item) => `${item.heading ?? ''} ${item.text}`.trim().length)) });
    }
    if (block.type === 'process' && variant === 'photo-cards') row.phoneHeightPx = PHONE_STEPS_BASE_PX + PHONE_STEP_PX * items.length;
    if (block.heading) row.heading = { text: block.heading, ...Object.fromEntries(HEADING_VIEWPORTS.map((viewport) => [viewport, predictHeadingLines(block.heading, { viewport, key: headingKey(block, variant), model: headingModel, charEm })])) };
    // The pages its cards lead to (a related block's links show each page's own photo as a tile).
    const links = [...items, ...(block.links ?? [])].map((item) => item.href).filter((href) => typeof href === 'string' && href.startsWith('/'));
    if (links.length) row.linksTo = links.map((href) => pageTypes.get(href) ?? null);
    return row;
  });
  const heroShown = (page.pageType !== 'privacy' || Boolean(components.heroByPageType?.privacy)) && heroShowsPhoto(heroVariant);
  const heroEstimate = page.hero ? estimateBlock({ type: 'hero' }, heroShown ? heroVariant : 'plain', renderedWords(page.hero), model, page.pageType) : null;
  // The title in the face the treatment sets it in (src/styles/reference.css), as PageHero.astro fits it.
  const titleEm = titleMetrics({ css: treatmentCss, pageType: page.pageType, heroText: components.heroText });
  const heroFit = heroShown && heroVariant === 'media-split' ? SPLIT_HERO_FIT : HERO_FIT;
  const fit = (width) => fitHeading(page.hero.heading, { columnPx: TITLE_COLUMNS[width], capPx: 999, minPx: heroFit[width].minPx, maxLines: heroFit[width].lines, charEm: titleEm });
  const title = page.hero?.heading ? { desktop: fit('desktop'), phone: fit('phone') } : null;
  const hero = page.hero ? { variant: heroShown ? heroVariant : 'plain', photo: heroShown, framed: heroShown && FRAMED_HEROES.has(heroVariant), phoneFrame: phoneHeroes?.frames?.hero?.byPageType?.[page.pageType] ?? null, title: title ? { text: page.hero.heading, desktopLines: title.desktop.lines, phoneLines: title.phone.lines, fits: title.desktop.fits && title.phone.fits } : null } : null;
  // In page order, each with the block it belongs to (null: the hero and the trust bar): a section's charts after it,
  // a closing band's before it (PageView.astro).
  const part = (type) => estimateBlock({ type }, '', 0, model, page.pageType);
  const contents = toc.length ? [{ block: null, estimate: estimateBlock({ type: 'page-toc' }, '', copyWords(toc.map((entry) => entry.heading)), model, page.pageType) }] : [];
  const entries = [...(heroEstimate ? [{ block: null, estimate: heroEstimate }] : []), ...(trustBar ? [{ block: null, estimate: part('trustBar') }] : []), ...contents, ...rows.flatMap((row, index) => {
    const own = { block: blocks[index], estimate: { height: row.estimate.heightPx, visual: row.estimate.visualPx, pictured: row.estimate.pictured, before: row.estimate.before, after: row.estimate.after } };
    if (!drawsCharts(blocks[index])) return [own];
    const charts = { block: blocks[index], estimate: part('charts') };
    return blocks[index].type === 'cta' ? [charts, own] : [own, charts];
  })];
  const estimates = entries.map((entry) => entry.estimate);
  const now = pageEstimate(estimates);
  const words = renderedWords(page.hero) + renderedWords(blocks);
  const band = components.densityBands && !DENSITY_EXEMPT_PAGE_TYPES.includes(page.pageType) ? bandFor(components.densityBands, page.pageType) : null;
  const plan = { route: page.route, pageType: page.pageType, hero, blocks: rows, words, estimate: { heightPx: Math.round(now.height), visualAreaPct: round1(now.visualPct), longestTextOnlyPx: Math.round(now.longestRun), wordsPer1000px: Math.round((1000 * words) / Math.max(1, now.height)) }, band, floorExempt: DENSITY_FLOOR_EXEMPT_PAGE_TYPES.includes(page.pageType), budgetWalls: rows.filter((row) => row.wall === 'budget').length, signatureFloor: signatureFloor(page, components), signatureBands: rows.filter((row) => row.wall === 'signature').length };
  if (band) {
    // The page without the walls added for density: its copy and the competitor's own photo modules.
    const base = entries.filter((entry) => !entry.block || !isBudgetWall(entry.block)).map((entry) => entry.estimate);
    const banded = Object.values(components.pageTypes ?? {}).some((patterns) => (patterns.mediaModules ?? []).some((module) => module.type === 'band'));
    const wall = estimateBlock({ type: 'gallery' }, banded ? 'band' : 'grid', 0, model, page.pageType);
    plan.feasibility = feasibility({ words, band, height: pageEstimate(base).height, visual: base.reduce((sum, item) => sum + item.visual, 0), runs: textRuns(base), wall: { height: wall.height, visual: wall.visual }, maxWalls, places: wallPlaces(blocks.filter((block) => !isBudgetWall(block))), floorExempt: plan.floorExempt });
  }
  return plan;
}

// The text-only runs of a page's estimates in order (px), as pageEstimate counts its longest.
function textRuns(estimates) {
  const runs = [];
  let run = 0;
  for (const item of estimates) {
    if (item.pictured) { runs.push(run + item.before); run = item.after; } else run += item.height;
  }
  runs.push(run);
  return runs.filter((value) => value > 0);
}

// The places a photo wall may take on a page (the planner's rules, lib/visual-budget.mjs planVisualBudget): between two
// body blocks up to the closing call, never next to another wall, inside a section going on in blocks of its own, or
// between two proof sections.
export function wallPlaces(blocks) {
  const closing = blocks.findIndex((block) => block.type === 'cta' || block.type === 'form');
  const body = closing < 0 ? blocks.length : closing;
  let places = 0;
  for (let at = 1; at <= body; at += 1) {
    if (isWall(blocks[at - 1]) || isWall(blocks[at])) continue;
    if (PROOF_BLOCKS.has(blocks[at - 1]?.type) && PROOF_BLOCKS.has(blocks[at]?.type)) continue;
    if (splitsSection(blocks, at)) continue;
    places += 1;
  }
  return places;
}

// A section's surface as the renderer sets it (lib/section-surfaces.mjs, the call PageView makes): tinted; a band of its
// own (a tinted split row) tinted; a section that parts the page (a photo, a wall, the closing call, steps over a photo)
// its own; else white. The testimonials are a plain section of the alternation, as the renderer has drawn them since
// 3253435 (swimwear 2026-11-15: the plan still took them for a tinted band and failed 22 pairs the page draws apart).
function surfaceOf(block, variant, tinted) {
  if (tinted.has(block.id)) return 'tinted';
  if (block.continues == null && block.type === 'splitMedia' && variant === 'tinted') return 'tinted';
  if (isWall(block) || ['figure', 'gallery', 'cta'].includes(block.type) || (block.type === 'process' && variant === 'photo-cards')) return 'own';
  return 'white';
}
