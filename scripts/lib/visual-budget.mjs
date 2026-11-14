// The visual budget (owner 2026-11-12: the photos follow the content, decided when the page is planned, the audit only
// checks): each page's height, picture share and longest picture-less run estimated from its sections before it is
// built, and photo walls added or taken off until the estimate sits inside the reference's density band
// (components.densityBands, measure-reference-density.mjs). How tall a module renders and how much of it is picture
// comes from the block model (config/block-model.default.json, calibrated per site from its grey-frame trial build before
// any photo is made: components.blockModel, calibrate-plan.mjs).

import defaults from '../../config/block-model.default.json' with { type: 'json' };

export const DEFAULT_BLOCK_MODEL = defaults.modules;
// The estimate aims inside the band, not at its edges: the model is a fit, the audit measures the real page.
export const BUDGET_MARGIN = Object.freeze({ run: 0.9, visualPct: 3 });
// The most photo walls a page takes for density: a safety stop, not a design rule. The picture-area band decides how
// many a page takes (its ceiling keeps a page from becoming photo after photo); a page still outside it after this many
// is reported as not fitting (lib/layout-plan.mjs feasibility). Owner 2026-11-14 withdrew the cap of three the same
// day: it held hotel-rm's home at 39% where its walls had brought it to 45% ("照片多少由图片面积区间决定").
export const MAX_BUDGET_WALLS = 12;

// The model key of a block: its type and the variant it renders with (featureGrid: its pattern).
export const modelKey = (block, variant) => `${block.type}:${variant ?? ''}`;

// One block's estimate: { height, visual (px of picture area, page-wide), before, after (text-only px at its top and
// bottom; a block with no picture is text throughout) }.
// A page type may style a module its own way (the hotel site's service pages hide the closing band's photo): its
// fit for that page type (key@pageType) comes first.
export function estimateBlock(block, variant, words, model = DEFAULT_BLOCK_MODEL, pageType = null) {
  // A variant the model has not seen takes its module's average (type:*), then the module without a variant.
  const fit = (pageType ? model[`${modelKey(block, variant)}@${pageType}`] : null) ?? model[modelKey(block, variant)] ?? model[`${block.type}:*`] ?? model[`${block.type}:`] ?? model['*'] ?? DEFAULT_BLOCK_MODEL['*'];
  const height = Math.max(40, fit.base + fit.perWord * words);
  // A card grid of fewer than three cards is no structured block to the measure (lib/density.mjs: three boxed cards
  // side by side), photo cards apart (motel /our-history/ 2026-11-14: two cards going on, 159px estimated, none measured).
  const share = block.type === 'featureGrid' && variant !== 'media' && Array.isArray(block.items) && block.items.length < 3 ? 0 : fit.visual;
  const pictured = share > 0.05;
  return { height, visual: share * height, before: pictured ? fit.before * height : height, after: pictured ? fit.after * height : height, pictured };
}

// Two estimates one after the other as one (a block and the charts drawn after it, a hero and its lead set under it):
// their heights and pictures add up, the text at its top and foot runs on across a part with no picture.
export function joinEstimates(first, second) {
  const height = first.height + second.height;
  const before = first.pictured ? first.before : second.pictured ? first.height + second.before : height;
  const after = second.pictured ? second.after : first.pictured ? first.after + second.height : height;
  return { height, visual: first.visual + second.visual, before, after, pictured: first.pictured || second.pictured };
}

// A page's estimated density from its blocks' estimates in order (the hero first): content height, picture share (%)
// and the longest picture-less run (px), as lib/density.mjs measures the built page.
export function pageEstimate(estimates) {
  let height = 0;
  let visual = 0;
  let run = 0;
  let longest = 0;
  for (const item of estimates) {
    height += item.height;
    visual += item.visual;
    if (item.pictured) { longest = Math.max(longest, run + item.before); run = item.after; } else run += item.height;
  }
  longest = Math.max(longest, run);
  return { height, visualPct: height ? (100 * visual) / height : 0, longestRun: longest };
}

// Plans a page's photo walls to its budget. blocks: the page's blocks with the reference's walls already in place;
// helpers: variantOf(block), wordsOf(block), wall(id) (a new wall of the reference's kind), isWall(block), hero ({ block,
// variant, words } of the page's hero, or null). floor: the competitor's signature bands on this page type
// (pattern-map signatureBands; the walls marked signature). Returns the blocks, walls added where the copy runs on or
// the page shows too little; where it shows too much, in this order (owner 2026-11-12: the competitor's own photo
// bands go last, and never below its count): the walls added here, the photos of photo cards (icon cards instead),
// photo tiles (links instead), the competitor's other walls, then its bands down to the floor.
// apart(before, after): whether a wall may stand between these two blocks (media-slots: never between two proof sections,
// where a photo has nothing to break up).
// lead: { words } of the hero's lead where the page sets it under the hero (heading-fit.mjs leadBelowHero), text after
// the hero; chartsOf(block): whether the block's data is drawn as charts after it (a closing band's before it). Both are
// counted as the layout plan and the trial build count them (lib/layout-plan.mjs). The trust bar is not: it is in the
// plan's estimate only, about a point on a short page, inside BUDGET_MARGIN.
export function planVisualBudget(blocks, { bands, model = DEFAULT_BLOCK_MODEL, variantOf, wordsOf, wall, isWall, hero = null, lead = null, chartsOf = () => false, pageType = null, floor = 0, apart = () => true }) {
  const target = { run: bands.longestTextOnlyPx.max * BUDGET_MARGIN.run, min: bands.visualAreaPct.min + BUDGET_MARGIN.visualPct, max: bands.visualAreaPct.max - BUDGET_MARGIN.visualPct };
  const charts = () => estimateBlock({ type: 'charts' }, '', 0, model, pageType);
  const estimates = () => blocks.map((block) => {
    const own = estimateBlock(block, variantOf(block), wordsOf(block), model, pageType);
    if (!chartsOf(block)) return own;
    return block.type === 'cta' ? joinEstimates(charts(), own) : joinEstimates(own, charts());
  });
  const heroTop = hero ? estimateBlock(hero.block, hero.variant, hero.words, model, pageType) : null;
  const leadTop = lead ? estimateBlock({ type: 'page-lead' }, '', lead.words, model, pageType) : null;
  const top = heroTop && leadTop ? joinEstimates(heroTop, leadTop) : heroTop ?? leadTop;
  const measure = () => pageEstimate([...(top ? [top] : []), ...estimates()]);
  const closing = () => { const at = blocks.findIndex((block) => block.type === 'cta' || block.type === 'form'); return at < 0 ? blocks.length : at; };
  // The text runs between pictured blocks, before the closing call: { start, end, height } over block indexes, the
  // height counted as the page is measured: the text below the picture before the run and above the one after it too.
  const runs = () => {
    const list = estimates();
    const body = closing();
    const found = [];
    for (let start = 0; start < body;) {
      if (list[start].pictured) { start += 1; continue; }
      let end = start;
      while (end < body && !list[end].pictured) end += 1;
      const above = start > 0 ? list[start - 1].after : top?.after ?? 0;
      const below = end < list.length ? list[end].before : 0;
      found.push({ start, end, height: above + list.slice(start, end).reduce((sum, item) => sum + item.height, 0) + below });
      start = end;
    }
    return found;
  };
  // Where a wall may go in a run: between two of its blocks, else at its edge (next to a pictured block), never next to
  // another wall; the place that splits the run's height most evenly. Not inside a section going on in a block of its
  // own (continues): the wall would cut it in two. Across (a run too long for the band that has no other place): where
  // such a section changes module (its cards go on as a list), never between two grids of one card set.
  const place = (run, across = false) => {
    const list = estimates();
    const candidates = [];
    for (let at = run.start; at <= run.end; at += 1) {
      if (at === 0 || at > closing()) continue;
      if (isWall(blocks[at - 1]) || (blocks[at] && isWall(blocks[at]))) continue;
      if (!apart(blocks[at - 1], blocks[at])) continue;
      const inside = blocks[at]?.continues != null && [blocks[at - 1]?.id, blocks[at - 1]?.continues].includes(blocks[at].continues);
      if (inside && !(across && blocks[at].type !== blocks[at - 1]?.type)) continue;
      candidates.push(at);
    }
    const above = (at) => list.slice(run.start, at).reduce((sum, item) => sum + item.height, 0);
    return candidates.sort((left, right) => Math.abs(2 * above(left) - run.height) - Math.abs(2 * above(right) - run.height))[0];
  };
  let added = 0;
  for (; added < MAX_BUDGET_WALLS; added += 1) {
    const now = measure();
    const longest = runs().sort((left, right) => right.height - left.height);
    // A run too long is split; a page short of pictures gets one in its longest run that takes one. Each run is tried in
    // turn, longest first (hotel-rm's home, 2026-11-14: its longest run had no place and the planner stopped there, the
    // page at 10% pictures for a band of 38-68%); a run too long for the band takes one across a section's change of
    // module when it has no other place.
    const tooLong = now.longestRun > target.run ? longest.filter((run) => run.height > target.run) : [];
    const short = now.visualPct < target.min ? longest : [];
    let at;
    for (const run of tooLong) if ((at = place(run) ?? place(run, true)) !== undefined) break;
    if (at === undefined) for (const run of short) if ((at = place(run)) !== undefined) break;
    if (at === undefined) break;
    blocks.splice(at, 0, wall(`media-module-budget-${added + 1}`));
  }
  const over = () => measure().visualPct > target.max;
  // Walls come off (the last first) while the runs stay within the band; allowed: whether one more may go.
  const takeOff = (which, allowed = () => true) => {
    while (over() && allowed()) {
      const index = blocks.findLastIndex((block) => isWall(block) && which(block));
      if (index < 0) return;
      const [removed] = blocks.splice(index, 1);
      if (measure().longestRun > target.run) { blocks.splice(index, 0, removed); return; }
    }
  };
  takeOff((block) => !block.competitor);
  // Photo cards show icons instead (the last grid first); planned: the page's own variant (resolveVariant).
  for (let index = blocks.length - 1; index >= 0 && over(); index -= 1) if (blocks[index].type === 'featureGrid' && variantOf(blocks[index]) === 'media') blocks[index] = { ...blocks[index], variant: 'icons', planned: true };
  if (over()) for (const [index, block] of blocks.entries()) if (block.type === 'relatedPages' && variantOf(block) === 'tiles') blocks[index] = { ...block, variant: 'links', planned: true };
  takeOff((block) => block.competitor && !block.signature);
  takeOff((block) => block.signature, () => blocks.filter((block) => isWall(block) && block.signature).length > floor);
  return blocks;
}

// Two sections of the same shape never stand together (owner 2026-11-12: "图标得穿插 元素堆一起是不是不好看", "同类型模块
// 堆在一起这个得在最开始就避免": the hotel home ran three rows of three short items, icon cards, icon cards and steps, one
// under the other). A row of short items is a card grid (any but the list), steps (any but the list) or figures; where
// two meet, the card grid of the pair sets its points out as a list beside its heading (bullets, the competitor's
// service lists), the later one first. Planned with the page, before anything is built or photographed: on every page of
// every site (lib/media-slots.mjs withMediaModules), not only where a density band plans photo walls (Fable's 08-onward
// plan: it ran inside the visual budget, so a site without a band and the pages without walls never had it).
const itemRow = (block, variant) => (block.type === 'featureGrid' && variant !== 'bullets') || (block.type === 'process' && variant !== 'list') || block.type === 'stats';
export function varyItemRows(blocks, variantOf) {
  const toList = (index) => { blocks[index] = { ...blocks[index], variant: 'bullets', planned: true }; };
  // Only a grid with its own heading becomes a list (the list sits beside it); a section split in two (continues) is one
  // section, never a pair: its second half became a headless list, two points stacked down an empty column.
  // Nor does a grid other blocks go on from: its first grid alone as a list left a list over three rows of cards (the
  // hotel hub's thirteen entry cards in grids of four).
  const listable = (at) => blocks[at].type === 'featureGrid' && Boolean(blocks[at].heading) && blocks[at].continues == null && !blocks.some((item) => item.continues === blocks[at].id);
  for (let index = 1; index < blocks.length; index += 1) {
    const [before, block] = [blocks[index - 1], blocks[index]];
    if (block.continues === before.id || before.continues === block.id) continue;
    if (!itemRow(before, variantOf(before)) || !itemRow(block, variantOf(block))) continue;
    if (listable(index)) toList(index);
    else if (listable(index - 1) && !(index >= 2 && blocks[index - 2].type === 'featureGrid' && variantOf(blocks[index - 2]) === 'bullets')) toList(index - 1);
    // Neither grid can be a list (one goes on from another, or has no heading of its own): the pair's steps are
    // (hotel-rm's pricing page, motel's process page, 2026-11-14: a grid going on from another over a row of steps).
    else for (const at of [index, index - 1]) if (blocks[at].type === 'process') { blocks[at] = { ...blocks[at], variant: 'list', planned: true }; break; }
  }
  return blocks;
}

// Two split rows of the tinted variant one under the other run as one grey band (hotel-rm's digital marketing page,
// 2026-11-14): the later is a plain split row, planned with the page (lib/media-slots.mjs withMediaModules) and on its
// variant (resolveVariant: planned).
export function varySurfaces(blocks, variantOf) {
  for (let index = 1; index < blocks.length; index += 1) {
    const [before, block] = [blocks[index - 1], blocks[index]];
    if (before.type === 'splitMedia' && block.type === 'splitMedia' && variantOf(before) === 'tinted' && variantOf(block) === 'tinted') blocks[index] = { ...block, variant: 'single', planned: true };
  }
  return blocks;
}

// Whether a fitted model differs from the one in use enough to plan again: a module 15% taller or shorter at its usual
// length, or its picture share 0.1 apart.
export function modelMoved(previous = DEFAULT_BLOCK_MODEL, next = DEFAULT_BLOCK_MODEL) {
  return Object.entries(next).some(([key, fit]) => {
    const was = previous[key];
    if (!was) return true;
    const at = (model) => model.base + model.perWord * 120;
    return Math.abs(at(fit) - at(was)) > 0.15 * at(was) || Math.abs(fit.visual - was.visual) > 0.1;
  });
}

// A block model fitted from a built site's measured blocks (the layout audit's desktop block metrics): per model key a
// least-squares line of height on words, its picture share and text edges; keys with fewer than three samples keep a
// flat height; keys the site does not show keep the defaults.
export function fitBlockModel(samples, base = DEFAULT_BLOCK_MODEL) {
  const groups = {};
  // Each key, and each module over all its variants (type:*).
  for (const sample of samples) {
    (groups[sample.key] ||= []).push(sample);
    (groups[`${sample.key.split(':')[0]}:*`] ||= []).push(sample);
    if (sample.pageType) (groups[`${sample.key}@${sample.pageType}`] ||= []).push(sample);
  }
  const fitted = { ...base };
  for (const [key, list] of Object.entries(groups)) {
    const n = list.length;
    const mean = (pick) => list.reduce((sum, item) => sum + pick(item), 0) / n;
    const [mx, my] = [mean((item) => item.words), mean((item) => item.height)];
    const sxx = list.reduce((sum, item) => sum + (item.words - mx) ** 2, 0);
    const slope = n >= 3 && sxx ? Math.max(0, list.reduce((sum, item) => sum + (item.words - mx) * (item.height - my), 0) / sxx) : 0;
    const share = (pick) => Math.round(Math.min(1, mean(pick)) * 100) / 100;
    fitted[key] = { base: Math.round(Math.max(40, my - slope * mx)), perWord: Math.round(slope * 100) / 100, visual: share((item) => item.visualShare), before: share((item) => item.before / Math.max(1, item.height)), after: share((item) => item.after / Math.max(1, item.height)) };
  }
  return fitted;
}
