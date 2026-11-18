// What the site's images may weigh and how a built page may ask for them (four-site audit 2026-11-17): the header logo
// every page loads, the phone crops of the hero photos, and Modern Web Guidance's image rules (optimize-image-priority,
// html section 3): a page asks for one or two images first, and an image with a srcset says how wide it shows.

import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attribute, tags } from './built-site.mjs';
import { readJson } from './json-io.mjs';

// The header logo every page loads (the four sites' 2200 x 240 PNGs of 155-180 KB, shown about 190 x 20).
export const HEADER_LOGO_MAX_BYTES = 20 * 1024;
// A phone crop of a photo (site13's 20 phone heroes of 155-224 KB, heavier than their desktop files); never heavier than
// the photo's desktop file either (phoneCropBudget).
export const PHONE_CROP_MAX_BYTES = 150 * 1024;
// Images a page fetches with fetchpriority="high" (MWG optimize-image-priority: "at most 1-2" per page).
export const MAX_HIGH_PRIORITY_IMAGES = 2;

// The bytes a phone crop may weigh: its photo's desktop file, at most PHONE_CROP_MAX_BYTES.
export const phoneCropBudget = (desktopBytes) => Math.min(PHONE_CROP_MAX_BYTES, desktopBytes);

// Whether a srcset lists width candidates ("a.webp 480w, b.webp 960w"), which the browser can only choose among with sizes.
const hasWidths = (srcset) => /\s\d+w\s*(,|$)/.test(srcset ?? '');

// MWG's image rules on one built page: { issue, detail } for each image fetched first beyond the limit and each
// <img> or <source> whose width candidates come without sizes.
export function imagePriorityProblems(html) {
  const problems = [];
  const first = [...tags(html, 'img'), ...tags(html, 'link')].filter((tag) => attribute(tag, 'fetchpriority') === 'high');
  if (first.length > MAX_HIGH_PRIORITY_IMAGES) problems.push({ issue: 'fetchpriority_overused', detail: `${first.length} images ask fetchpriority="high" (at most ${MAX_HIGH_PRIORITY_IMAGES}): ${first.map((tag) => attribute(tag, 'src') ?? attribute(tag, 'href')).join(', ')}` });
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/g) ?? []) {
    if (hasWidths(attribute(tag, 'srcset')) && !attribute(tag, 'sizes')) problems.push({ issue: 'srcset_without_sizes', detail: attribute(tag, 'src') ?? attribute(tag, 'srcset').split(/\s/)[0] });
  }
  return problems;
}

// The built site's image budgets: the header logo (identity.logo) within HEADER_LOGO_MAX_BYTES, and every phone crop
// (src/data/phone-heroes.json) within its photo's desktop file and PHONE_CROP_MAX_BYTES. { route, issue, detail } each.
export async function imageBudgetProblems(root, identity) {
  const problems = [];
  const bytes = async (src) => (await stat(resolve(root, 'dist', src.replace(/^\//, ''))).catch(() => null))?.size ?? null;
  const kb = (value) => `${Math.round(value / 1024)} KB`;
  const logo = identity?.logo?.src ? await bytes(identity.logo.src) : null;
  if (logo !== null && logo > HEADER_LOGO_MAX_BYTES) problems.push({ route: identity.logo.src, issue: 'header_logo_heavy', detail: `${kb(logo)}, at most ${kb(HEADER_LOGO_MAX_BYTES)} (scripts/fit-header-logo.mjs makes it)` });
  const { crops = {} } = await readJson(resolve(root, 'src/data/phone-heroes.json'), {});
  for (const [src, byRatio] of Object.entries(crops)) {
    const desktop = await bytes(src);
    for (const crop of Object.values(byRatio)) {
      const size = await bytes(crop.src);
      if (size === null || desktop === null) continue;
      if (size > phoneCropBudget(desktop)) problems.push({ route: crop.src, issue: 'phone_crop_heavy', detail: `${kb(size)}, its desktop file ${src} ${kb(desktop)}, at most ${kb(phoneCropBudget(desktop))} (scripts/derive-phone-heroes.mjs makes it)` });
    }
  }
  return problems;
}
