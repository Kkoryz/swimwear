// The plan gate (Fable's 08-onward plan 2026-11-14, section 3.2): the site's own layout rules as checks on the layout
// plan (lib/layout-plan.mjs planPage), run before any photo is made or page built. The two sites' reviews found
// mostly breaches of these rules (hotel-rm: all 31 open P1 findings; motel: 11 of 14), each after the photos and a
// build; the audits stopped on others (h1_lines, unfilled_row, heading_off_axis) after 57 minutes of a run.
//
// One table: each assertion says who clears it (owner: plan, the planner's parameters or an owner's waiver; template,
// a rule of the template; site-factory, the copy; owner) and what it does to the run (gate: fail holds it before the
// photos, owner 2026-11-14; report goes to Site Factory's report and the owner's list and the run goes on; review: a
// rule only the review can judge on the page). rule: the sentence the design review and every repair are given
// (lib/protected-rules.mjs SITE_DECISIONS is these, in this order), so what they are told is what is checked. A new
// rule of the owner's is an assertion here, a pure function and a test.

import { SECTION_HEADING_MAX_LINES } from './heading-fit.mjs';

// What a photo-steps block may run to on a phone, and the widest phone frame a framed hero may keep (lib/layout-plan.mjs
// planPage estimates both).
export const PHOTO_STEPS_MAX_PHONE_PX = 1000;
export const PHONE_HERO_MAX_RATIO = 1.25;
export const MAX_CARDS_LONG = 3;
export const LONG_CARD_WORDS = 40;
// A row of short items (lib/visual-budget.mjs varyItemRows' itemRow).
const itemRow = (block) => (block.type === 'featureGrid' && block.pattern !== 'bullets') || (block.type === 'process' && block.variant !== 'list') || block.type === 'stats';
const PROOF = new Set(['certifications', 'testimonials', 'caseStudies', 'logos', 'stats', 'table', 'orderCase', 'orderRoutes', 'styleGrid', 'relatedPages', 'sources', 'trustBar', 'gallery', 'pricing', 'swatches']);
const SERVICE_TYPES = new Set(['solution', 'service', 'solutions_hub', 'services_hub']);
const PLAIN = new Set(['white', 'tinted']);
const sameSection = (a, b) => b.continues != null && [a.id, a.continues].includes(b.continues);
const pairs = (blocks) => blocks.slice(1).map((block, index) => [blocks[index], block]);

export const PLAN_ASSERTIONS = Object.freeze([
  {
    id: 'sizes_follow_copy', owner: 'template', gate: 'review', zh: '模块风格照竞品，尺寸跟我们的文案（宽、高、列数、行长不照抄固定值）',
    rule: 'the style of each module follows the competitor; its sizes follow our copy: widths, heights, column counts and line lengths are not copied as fixed values',
    check: null,
  },
  {
    id: 'title_lines', owner: 'site-factory', gate: 'report', zh: '页标题在最小字号下仍超过 2 行（桌面）或 4 行（手机）：标题太长',
    rule: 'a title and every heading are sized by the template to their own words (at most two lines for a page title on desktops); no rule sets their font-size or the fit variables, and no section heading is larger than its page\'s title',
    check: (page) => (page.hero?.title && !page.hero.title.fits ? [{ block: 'hero', detail: `"${page.hero.title.text}": ${page.hero.title.desktopLines} lines on a desktop, ${page.hero.title.phoneLines} on a phone at the smallest size` }] : []),
  },
  {
    id: 'item_rows_adjacent', owner: 'plan', gate: 'fail', zh: '相邻两节是同一种短条目行（卡片、步骤、数字）',
    rule: 'two sections of the same shape (rows of short items) do not stand one under the other: the template sets one of them out as a list beside its heading',
    check: (page) => pairs(page.blocks).filter(([a, b]) => !sameSection(a, b) && !sameSection(b, a) && itemRow(a) && itemRow(b)).map(([a, b]) => ({ block: b.id, detail: `${a.id} (${a.type}:${a.pattern ?? a.variant ?? ''}) and ${b.id} (${b.type}:${b.pattern ?? b.variant ?? ''})` })),
  },
  {
    id: 'card_set_uneven', owner: 'template', gate: 'fail', zh: '一个卡片组拆成几个网格后列数或卡片标题层级不一致',
    rule: 'a card set split over several grids reads as one section: one heading, one card width',
    check: (page) => {
      const sets = Object.groupBy(page.blocks.filter((block) => block.type === 'featureGrid' && block.pattern !== 'bullets'), (block) => block.set);
      return Object.entries(sets).filter(([, grids]) => grids.length > 1 && (new Set(grids.map((grid) => grid.columns)).size > 1 || new Set(grids.map((grid) => grid.titleLevel)).size > 1)).map(([set, grids]) => ({ block: set, detail: grids.map((grid) => `${grid.id}: ${grid.columns} columns, ${grid.titleLevel}`).join('; ') }));
    },
  },
  {
    id: 'set_last_row', owner: 'template', gate: 'review', zh: '卡片组最后一个网格从组的第一列起排，只有网格自己的短末行居中（几何，样板页检查）',
    rule: 'a card set\'s last grid starts under the set\'s first column; only a grid\'s own short last row is centred',
    check: null,
  },
  {
    id: 'hero_lead', owner: 'template', gate: 'review', zh: '首屏副标题比竞品长很多时移到首屏下方（模板自动）',
    rule: 'a hero lead much longer than the competitor\'s stands under the hero, not on its photo',
    check: null,
  },
  {
    id: 'service_card_photo', owner: 'plan', gate: 'fail', zh: '指向服务页的卡片用了照片（应为线条图标）',
    rule: 'cards that name services carry a line icon, not a photo',
    check: (page, context) => (context.serviceCards ? page.blocks.filter((block) => (block.slots.length || (block.type === 'relatedPages' && block.estimate.pictured)) && block.linksTo?.some((type) => SERVICE_TYPES.has(type)) && ['relatedPages', 'featureGrid', 'gallery'].includes(block.type) && !block.wall).map((block) => ({ block: block.id, detail: `${block.type}:${block.pattern ?? block.variant ?? ''} with photos, linking to ${block.linksTo.filter((type) => SERVICE_TYPES.has(type)).length} service page(s)` })) : []),
  },
  {
    id: 'band_button', owner: 'template', gate: 'review', zh: '整幅照片带可以在下沿带一个按钮，链接到前一节所链之处',
    rule: 'a full-width photo band may carry a button on its lower edge, linking where the section before it links',
    check: null,
  },
  {
    id: 'hero_photo_hook', owner: 'template', gate: 'review', zh: '首屏之后的样式写给 main[data-hero-photo]，不按页型列举',
    rule: 'what follows the hero (a header over its photo, the photo\'s overlay) is written for main[data-hero-photo] (set by the template on every page that opens on a photo), never for a list of page types',
    check: null,
  },
  // The checks the review is not told as sentences (the protected rules already say them, or they are numbers).
  {
    id: 'density_band', owner: 'plan', gate: 'fail', zh: '页面放得下，但规划后的图片面积仍在竞品区间外（规划器停下时没进区间）',
    rule: null,
    // The picture area only (owner 2026-11-14): the words a 1,000px and the longest text-only run hold nothing.
    check: (page) => {
      if (!page.band || !page.feasibility || page.feasibility.verdict === 'does_not_fit') return [];
      const { estimate: now, band } = page;
      const out = [];
      if (!page.floorExempt && band.visualAreaPct?.min != null && now.visualAreaPct < band.visualAreaPct.min) out.push(`pictures ${now.visualAreaPct}% under ${band.visualAreaPct.min}%`);
      if (band.visualAreaPct?.max != null && now.visualAreaPct > band.visualAreaPct.max) out.push(`pictures ${now.visualAreaPct}% over ${band.visualAreaPct.max}%`);
      return out.length ? [{ block: 'page', detail: `${out.join('; ')} (planned ${page.budgetWalls} wall(s); the arithmetic says ${page.feasibility.walls})` }] : [];
    },
  },
  {
    id: 'does_not_fit', owner: 'owner', gate: 'report', zh: '图片面积进不了竞品区间（额外照片墙用到上限也不够）：给业主和 08 的信息，不是 SF 的改稿要求',
    rule: null,
    check: (page) => (page.feasibility?.verdict === 'does_not_fit' ? [{ block: 'page', detail: `pictures reach ${page.feasibility.reachPct}% with ${page.feasibility.cap} wall(s), ${page.feasibility.gapPct} points short of ${page.band?.visualAreaPct?.min}%: ${page.feasibility.limits.map((limit) => limit.detail).join('; ')}` }] : []),
  },
  {
    id: 'surface_repeat', owner: 'template', gate: 'fail', zh: '相邻两节底色相同（白接白、灰接灰）',
    rule: null,
    check: (page) => pairs(page.blocks).filter(([a, b]) => !sameSection(a, b) && PLAIN.has(a.surface) && a.surface === b.surface).map(([a, b]) => ({ block: b.id, detail: `${a.id} and ${b.id} both ${a.surface}` })),
  },
  {
    id: 'orphan_card', owner: 'template', gate: 'fail', zh: '网格末行只剩一张卡',
    rule: null,
    check: (page) => page.blocks.filter((block) => block.type === 'featureGrid' && block.pattern !== 'bullets' && block.columns > 1 && block.items > 1 && block.items % block.columns === 1).map((block) => ({ block: block.id, detail: `${block.items} cards in ${block.columns} columns` })),
  },
  {
    id: 'long_cards_row', owner: 'template', gate: 'fail', zh: `${LONG_CARD_WORDS} 词以上的卡片一行超过 ${MAX_CARDS_LONG} 张`,
    rule: null,
    check: (page) => page.blocks.filter((block) => block.type === 'featureGrid' && block.pattern !== 'bullets' && (block.cardWords ?? block.longestItemWords) >= LONG_CARD_WORDS && block.columns > MAX_CARDS_LONG).map((block) => ({ block: block.id, detail: `cards of up to ${block.cardWords ?? block.longestItemWords} words, ${block.columns} to a row` })),
  },
  {
    id: 'long_list_layout', owner: 'template', gate: 'fail', zh: '长条目列表排成全宽单列长条',
    rule: null,
    check: (page) => page.blocks.filter((block) => block.type === 'iconList' && block.layout === 'list' && block.columns === 1 && block.items >= 4).map((block) => ({ block: block.id, detail: `${block.items} items of up to ${block.longestItemChars} characters in one full-width column` })),
  },
  {
    id: 'photo_steps_tall', owner: 'plan', gate: 'fail', zh: `步骤块配背景照片，手机上预计超过 ${PHOTO_STEPS_MAX_PHONE_PX}px（应改列表变体）`,
    rule: null,
    check: (page) => page.blocks.filter((block) => block.phoneHeightPx > PHOTO_STEPS_MAX_PHONE_PX).map((block) => ({ block: block.id, detail: `${block.items} steps over one photo, about ${block.phoneHeightPx}px on a phone` })),
  },
  {
    id: 'phone_hero_strip', owner: 'plan', gate: 'fail', zh: '手机首屏照片是扁横条（没有竖幅框）',
    rule: null,
    check: (page, context) => (context.phoneHeroes && page.hero?.framed && !(page.hero.phoneFrame && page.hero.phoneFrame <= PHONE_HERO_MAX_RATIO) ? [{ block: 'hero', detail: `${page.hero.variant} with ${page.hero.phoneFrame ? `a ${page.hero.phoneFrame}:1 phone frame` : 'no phone frame'} for page type ${page.pageType}` }] : []),
  },
  {
    id: 'wall_placement', owner: 'plan', gate: 'fail', zh: '照片墙相邻、夹在同一卡片组的两个网格之间，或夹在两个证明块之间',
    rule: null,
    check: (page) => page.blocks.flatMap((block, index) => {
      if (!block.wall) return [];
      const [before, after] = [page.blocks[index - 1], page.blocks[index + 1]];
      // Where a section's cards go on as a list the planner may place one (planVisualBudget place across); never between
      // two grids of one card set.
      const why = after?.wall ? 'next to another wall' : before && after && sameSection(before, after) && before.type === after.type ? `between two grids of ${before.set ?? before.id}'s set` : PROOF.has(before?.type) && !before.wall && PROOF.has(after?.type) && !after.wall ? `between ${before.id} and ${after.id}, two proof sections` : null;
      return why ? [{ block: block.id, detail: why }] : [];
    }),
  },
  {
    id: 'signature_floor', owner: 'plan', gate: 'fail', zh: '整幅照片带少于竞品该页型的下限',
    rule: null,
    check: (page) => (page.signatureBands < page.signatureFloor ? [{ block: 'page', detail: `${page.signatureBands} full-width band(s), the competitor's page shows ${page.signatureFloor}` }] : []),
  },
  {
    id: 'walls_cap', owner: 'plan', gate: 'fail', zh: '为密度额外加的照片墙超过上限',
    rule: null,
    check: (page, context) => (page.budgetWalls > (context.maxWalls ?? 3) ? [{ block: 'page', detail: `${page.budgetWalls} walls added for density, at most ${context.maxWalls ?? 3}` }] : []),
  },
  {
    id: 'section_heading_lines', owner: 'site-factory', gate: 'report', zh: `节标题预计超过 ${SECTION_HEADING_MAX_LINES} 行`,
    rule: null,
    check: (page) => page.blocks.flatMap((block) => ['desktop', 'mobile'].filter((viewport) => block.heading?.[viewport] > SECTION_HEADING_MAX_LINES).map((viewport) => ({ block: block.id, viewport, detail: `"${block.heading.text}": ${block.heading[viewport]} lines` }))),
  },
]);

// Every page's breaches: { items: [{ assertion, owner, gate, route, block, viewport?, detail }], failed (items that
// hold the run), reported }. context: { serviceCards (the site's cards that name services carry icons), phoneHeroes
// (the site has its phone frames: src/data/phone-heroes.json), maxWalls }.
export function planGate(plans, context = {}) {
  const items = [];
  for (const page of plans) {
    for (const assertion of PLAN_ASSERTIONS) {
      if (!assertion.check) continue;
      for (const found of assertion.check(page, context)) items.push({ assertion: assertion.id, owner: assertion.owner, gate: assertion.gate, route: page.route, ...found });
    }
  }
  return { items, failed: items.filter((item) => item.gate === 'fail').length, reported: items.filter((item) => item.gate === 'report').length };
}

// The owner's waivers of gate failures (docs/research/plan-waivers.json { waivers: [{ assertion, route?, block?, why, by,
// at }] }): a failure a waiver matches (its assertion; its page and block where the waiver names them) holds nothing and
// stays in the list as waived, with the reason (hotel-rm 2026-11-14: the owner let its phone heroes and one odd card
// through, "两个模版问题不大了").
export const PLAN_WAIVERS = 'docs/research/plan-waivers.json';
export function applyPlanWaivers(items, waivers = []) {
  if (!waivers.length) return items;
  return items.map((item) => {
    if (item.gate !== 'fail') return item;
    const waiver = waivers.find((entry) => entry.assertion === item.assertion && (!entry.route || entry.route === item.route) && (!entry.block || entry.block === item.block));
    return waiver ? { ...item, gate: 'waived', waiver: `${waiver.why} (${waiver.by}, ${waiver.at})` } : item;
  });
}
