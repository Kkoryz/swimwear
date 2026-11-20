// A page's first screen at the reference's height (components.heroHeights, measured by the patterns step from the
// reference's capture: lib/capture-hero.mjs, else scaffold-placeholder-pages.mjs heroHeightsOf where a page type has no
// capture): its page type's, else the nearest reference page type's (lib/nearest-page-type.mjs: the FAQ, case and blog
// pages go by the about page). { desktop, tablet, phone }, each { height (px), share (of that screen's height) }, or
// null without a measure. A reference page type whose capture opens on no band ({ band: false }) has no height to
// give: null, and no other page type's is taken in its place.
import { referenceType } from './nearest-page-type.mjs';

// The hero variants template.css sizes to the reference's height (--hero-measured): PageHero.astro marks only these
// (data-hero-height), and the layout audit holds only a marked hero to the reference's height (lib/usability-checks.mjs
// hero_height). A split hero is as tall as its copy and photo, a banner as the first screen leaves it (2026-11-20:
// Tapa Works' split heroes failed or passed on their titles' line counts alone).
export const SIZED_HERO_VARIANTS = Object.freeze(['media-overlay']);

export function heroHeightsFor(pageType, components = {}) {
  const all = components.heroHeights ?? {};
  const types = Object.keys(all);
  if (!types.length) return null;
  const heights = all[referenceType(pageType, types)] ?? null;
  return heights?.band === false ? null : heights;
}

// The inline custom properties PageHero.astro sets (template.css --hero-measured takes one per width): each width
// measured, whichever they are; null without any. A width left out takes the treatment's height, not another width's
// (2026-11-20: a page type banded on a phone only had no measure at all while a desktop one was required).
export function heroHeightStyle(heights) {
  const set = [['desktop', heights?.desktop], ['tablet', heights?.tablet], ['phone', heights?.phone]].filter(([, value]) => value?.height);
  return set.length ? set.map(([width, value]) => `--hero-h-${width}: ${value.height}px`).join('; ') : null;
}
