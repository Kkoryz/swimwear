// The style board (scripts/build-style-board.mjs, src/pages/style-board/): every module the site's pages use (a block
// type with the variant it renders with, "featureGrid:media"), drawn once with the longest and once with the shortest
// copy Site Factory wrote for it, its photos as grey frames. The treatment is written without our copy and the copy
// placed without the treatment; the hotel site first saw them together at the build, after 168 photos were made (90
// thrown away). The board puts them together before any photo is made, and says which modules no competitor section
// shows (their look has no reference: the template's default and the treatment's guess).

import { copyWords, mediaSlots, resolveVariant, withMediaModules } from './media-slots.mjs';

export const BOARD_SCHEMA = 'seo-site-style-board-v1';
export const BOARD_ROUTE = '/style-board/';
// The blog's own blocks render in the blog views (an article's prose, the hub's list of posts), not as modules.
const LEFT_OUT = new Set(['prose', 'postList']);

export const moduleKey = (type, variant) => `${type}:${variant ?? 'default'}`;
// A module key as a file name part ("featureGrid:media" -> "featureGrid-media").
export const moduleSlug = (key) => key.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

// The competitor module names (lib/authoring-contract.mjs SECTION_MODULES, docs/research/analysis/section-modules.json)
// a block of this type and variant renders: a text section is intro/proof whatever its variant, the owner's logos and
// testimonials are owner:<type>, a band, figure or form may be named without its variant.
// A photo band without copy (the competitor's full-width photo walls, lib/media-slots.mjs withMediaModules) renders the
// competitor's figure sections.
export function sectionModuleNames(type, variant) {
  if (type === 'intro' || type === 'proof') return ['intro/proof'];
  const own = variant ? [`${type}:${variant}`] : [type];
  if (type === 'logos' || type === 'testimonials') return [`owner:${type}`, ...own];
  if (['band', 'figure', 'form'].includes(type)) return [...new Set([type, ...own])];
  if (type === 'gallery' && variant === 'band') return [...own, 'figure'];
  return own;
}

// The variant a component draws when it is given none (each component's own default: FeatureGridBlock cards, or
// media when it has photos; ProcessBlock circles; StatsBlock row; ...; a FAQ and a closing band the site's): a module
// is named by what is drawn, as the competitor's sections are.
const DRAWN_DEFAULTS = {
  featureGrid: (slots) => (slots ? 'media' : 'cards'),
  process: () => 'circles',
  stats: () => 'row',
  gallery: () => 'grid',
  iconList: () => 'checks',
  table: () => 'grid',
  splitMedia: () => 'single',
  relatedPages: () => 'links',
  testimonials: () => 'grid',
  faq: (_, components) => components.faq,
  cta: (_, components) => components.cta,
};

// A block without the photos it carries: the board shows grey frames in their place.
const withoutMedia = (value) => {
  if (Array.isArray(value)) return value.map(withoutMedia);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'media' ? null : withoutMedia(item)]));
};

// The board of Site Factory's pages (status authored; a placeholder's copy is no real copy): one module per type and
// variant, in the order the pages first use them, each with its longest and shortest sample (one when it is used once)
// and the competitor sections it renders (evidence; none: unbacked).
export function styleBoard(pages, components, sectionModules = []) {
  const groups = new Map();
  for (const page of pages) {
    if (page.status !== 'authored') continue;
    let splits = 0;
    for (const block of withMediaModules(page, components, {})) {
      if (LEFT_OUT.has(block.type)) continue;
      const splitIndex = block.type === 'splitMedia' ? splits++ : 0;
      // The photos as the page plans them (the variant the plan resolves), the name as the component draws it.
      const resolved = resolveVariant(block, page.pageType, splitIndex, components);
      const slots = mediaSlots(block, resolved, components).length;
      const variant = resolved ?? DRAWN_DEFAULTS[block.type]?.(slots, components) ?? null;
      const key = moduleKey(block.type, variant);
      const group = groups.get(key) ?? { key, type: block.type, variant, uses: 0, samples: [] };
      group.uses += 1;
      group.samples.push({ route: page.route, pageType: page.pageType, blockId: block.id, splitIndex, words: copyWords(block), slots, block: withoutMedia(block) });
      groups.set(key, group);
    }
  }
  const modules = [...groups.values()].map(({ samples, ...group }) => {
    const longest = samples.reduce((best, sample) => (sample.words > best.words ? sample : best));
    const shortest = samples.reduce((best, sample) => (sample.words < best.words ? sample : best));
    const names = sectionModuleNames(group.type, group.variant);
    const evidence = sectionModules.filter((section) => names.includes(section.module)).map(({ pageType, index, module, gap }) => ({ pageType, index, module, ...(gap ? { gap } : {}) }));
    return { ...group, names, evidence, samples: [{ role: samples.length > 1 ? 'longest' : 'only', ...longest }, ...(shortest !== longest ? [{ role: 'shortest', ...shortest }] : [])] };
  });
  return { schemaVersion: BOARD_SCHEMA, route: BOARD_ROUTE, modules, unbacked: modules.filter((module) => !module.evidence.length).map((module) => module.key) };
}

// The board is a development page: a release build (SITE_RELEASE=1, build-release.mjs) has none.
export const boardBuilt = () => process.env.SITE_RELEASE !== '1';
