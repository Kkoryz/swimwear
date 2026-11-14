#!/usr/bin/env node

// Phone crops of the photos our frames show in another shape on phones (art direction). The competitor's frames change
// shape between desktop and phones (gyknit: the same hero photo at about 4 / 1 on desktop, 1 / 1 on phones), but a
// wide photo of ours cannot fill a frame that tall without showing less than MIN_SHOWN of itself, and the template caps
// a frame at what its photo fills, so phones got a strip. Each of our blocks whose frame follows the competitor's on
// phones (PHONE_FRAMES: the hero, a closing band with a photo) takes the phone ratio of the competitor section it was
// made from: the section named for it (docs/research/analysis/section-modules.json, else the capture's decision),
// measured at 390px by the patterns step (docs/research/pattern-inventory.json, each section's `phone.photo`). A page
// type whose competitor page has no such section, or none with a photo on phones, keeps its frame as it is.
// Only the photos the renderer puts in those frames are cut (the hero each page resolves to, lib/media-slots.mjs
// heroPhoto; the photo the site allocation gives a closing band, lib/media-allocation.mjs), each around the subject a
// vision judge named for it (the photo-focus step, lib/photo-focus.mjs); without one (no agent) the crop takes sharp's
// attention strategy, which a busy background can pull off the subject (waves beside a model), and is reported. A crop
// is saved next to its photo, so it goes where the photo goes (a release removes the reference placeholders with their
// crops). src/data/phone-heroes.json maps frame -> page type -> ratio and photo -> ratio -> crop; the renderer
// (src/lib/media.ts pageHero, CtaBlock.astro) gives a photo without a phone photo of its own the crop for its frame. The
// judged subjects of all the site's photos go to src/data/photo-focus.json, where every frame that cuts a photo centres
// on its subject.
// Usage: node scripts/derive-phone-heroes.mjs

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { allocateSite } from './lib/media-allocation.mjs';
import { MIN_SHOWN } from './lib/media-ratio.mjs';
import { heroPhoto, heroShowsPhoto, resolveVariant, withMediaModules } from './lib/media-slots.mjs';
import { focusPath, photosInUse } from './lib/photo-focus.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

// Widest crop written: twice a phone's width.
const MAX_WIDTH = 900;
// Narrowest crop that stays sharp on a phone (a 390px screen at 1.5x); a narrower one is used but reported.
const SHARP_WIDTH = 585;

// Our blocks whose photo frame takes the competitor's phone shape, each with the competitor modules it was made from
// (section-modules.json names; the capture's decision stands in when no module is named) and which such section
// counts when a page has several: the hero is the first, a closing band the last.
export const PHONE_FRAMES = Object.freeze({
  hero: { modules: /^hero:/, pick: 'first' },
  cta: { modules: /^cta:(image-band|form)$/, pick: 'last' },
});

// The phone ratio of each frame on each page type: the competitor section's main photo at 390px, from the pattern
// inventory's `phone` shapes. { <frame>: { byPageType: { <page type>: ratio } } }; a page type without a measured
// section (an inventory from before phone shapes, a competitor page without the module, a module without a photo on
// phones) is left out.
export function phoneFrames(inventory, sectionModules = []) {
  const frames = Object.fromEntries(Object.keys(PHONE_FRAMES).map((frame) => [frame, { byPageType: {} }]));
  for (const page of inventory?.pages ?? []) {
    const named = sectionModules.filter((item) => item.pageType === page.pageType);
    for (const [frame, rule] of Object.entries(PHONE_FRAMES)) {
      const indexes = (named.length ? named.filter((item) => rule.modules.test(item.module ?? '')).map((item) => item.index) : page.sections.filter((section) => rule.modules.test(section.decision ?? '')).map((section) => section.index)).sort((a, b) => a - b);
      const index = rule.pick === 'last' ? indexes.at(-1) : indexes[0];
      const ratio = page.sections.find((section) => section.index === index)?.phone?.photo?.ratio;
      if (ratio) frames[frame].byPageType[page.pageType] = ratio;
    }
  }
  return frames;
}

// Whether a photo fills a frame of the ratio showing at least MIN_SHOWN of itself (a narrower photo always does).
export const fillsRatio = (photo, ratio) => (photo.width / photo.height) * MIN_SHOWN <= ratio;

// A photo a frame can cut: one with a size, not a content placeholder, without a phone photo of its own already.
const cuttable = (photo) => Boolean(photo?.src) && !photo.slot && !photo.sources?.length && photo.width > 0 && photo.height > 0;

// The photos the renderer puts in the phone frames, each with the ratios it is cut to: the hero photo of every page
// whose hero shows one, at its page type's hero ratio; the photo the allocation gives a closing band that shows one
// (variant image-band or form), at its page type's closing ratio. A photo that fills the ratio needs no crop.
export function frameCrops({ pages, components, sitePhotos = [], frames }) {
  const builtRoutes = new Set(pages.map((page) => page.route));
  const isBuilt = (href) => !href.startsWith('/') || builtRoutes.has(href);
  const allocation = allocateSite({ pages, components, sitePhotos, isBuilt });
  const cuts = new Map();
  const add = (photo, ratio) => {
    if (!ratio || !cuttable(photo) || fillsRatio(photo, ratio)) return;
    const entry = cuts.get(photo.src) ?? { photo, ratios: [] };
    if (!entry.ratios.includes(ratio)) entry.ratios.push(ratio);
    cuts.set(photo.src, entry);
  };
  for (const page of pages) {
    if (heroShowsPhoto(components.heroByPageType?.[page.pageType] ?? components.hero)) add(heroPhoto(page, components, sitePhotos), frames.hero?.byPageType[page.pageType]);
    const closing = frames.cta?.byPageType[page.pageType];
    if (!closing) continue;
    withMediaModules(page, components, { isBuilt }).forEach((block, index) => {
      if (block.type !== 'cta') return;
      const variant = resolveVariant(block, page.pageType, 0, components) ?? components.cta;
      if (variant === 'image-band' || variant === 'form') add(allocation.byRoute[page.route]?.[index]?.[0], closing);
    });
  }
  return [...cuts.values()];
}

// The crop of a ratio around a point (fractions of the width and height), kept inside the photo.
export function cropBox(photo, ratio, focus) {
  const width = Math.min(photo.width, Math.round(photo.height * ratio));
  const height = Math.min(photo.height, Math.round(width / ratio));
  const clamp = (value, most) => Math.max(0, Math.min(most, value));
  return { left: clamp(Math.round(focus.x * photo.width - width / 2), photo.width - width), top: clamp(Math.round(focus.y * photo.height - height / 2), photo.height - height), width, height };
}

export async function derivePhoneHeroes({ root = process.cwd() } = {}) {
  const { default: sharp } = await import('sharp');
  const components = (await readJson(resolve(root, 'src/data/template-variants.json'))).components;
  const sitePhotos = (await readJson(resolve(root, 'src/data/site-media.json'), { photos: [] })).photos ?? [];
  const pages = await loadSitePages(root);
  const frames = phoneFrames(await readJson(resolve(root, 'docs/research/pattern-inventory.json'), null), await readJson(resolve(root, 'docs/research/analysis/section-modules.json'), []));
  const crops = {};
  const soft = [];
  const unfocused = [];
  for (const { photo, ratios } of frameCrops({ pages, components, sitePhotos, frames })) {
    const source = resolve(root, 'public', photo.src.replace(/^\//, ''));
    if (!existsSync(source)) throw new Error(`photo ${photo.src} is not in public/`);
    const focus = await readJson(resolve(root, focusPath(photo.src)), null);
    if (!focus) unfocused.push(photo.src);
    for (const ratio of ratios) {
      const width = Math.min(photo.width, Math.round(photo.height * ratio), MAX_WIDTH);
      const height = Math.round(width / ratio);
      const file = join(dirname(photo.src), `${basename(photo.src, extname(photo.src))}-phone-${Math.round(ratio * 100)}.webp`).replace(/\\/g, '/');
      const target = resolve(root, 'public', file.replace(/^\//, ''));
      await mkdir(dirname(target), { recursive: true });
      const image = focus
        ? sharp(source).extract(cropBox(photo, ratio, focus)).resize({ width, height, fit: 'fill' })
        : sharp(source).resize({ width, height, fit: 'cover', position: sharp.strategy.attention });
      await image.webp({ quality: 82 }).toFile(target);
      (crops[photo.src] ||= {})[ratio.toFixed(2)] = { src: file, width, height };
      if (width < SHARP_WIDTH) soft.push(`${file} (${width}px wide, from ${photo.width}x${photo.height})`);
    }
  }
  await writeJson(resolve(root, 'src/data/phone-heroes.json'), { frames, crops, soft, unfocused });
  // Every photo's judged subject, for the frames that cut it.
  const focus = {};
  for (const photo of photosInUse(components, sitePhotos)) {
    const judged = await readJson(resolve(root, focusPath(photo.src)), null);
    if (judged) focus[photo.src] = { x: judged.x, y: judged.y };
  }
  await writeJson(resolve(root, 'src/data/photo-focus.json'), focus);
  return { frames, crops: Object.values(crops).reduce((sum, byRatio) => sum + Object.keys(byRatio).length, 0), soft, unfocused };
}

runMain(import.meta.url, async () => {
  const { frames, crops, soft, unfocused } = await derivePhoneHeroes();
  const shapes = Object.entries(frames).map(([frame, { byPageType }]) => `${frame} ${Object.keys(byPageType).length ? JSON.stringify(byPageType) : 'none measured'}`).join('; ');
  console.log(`${crops} phone crop(s); the competitor's phone shapes: ${shapes}`);
  // A soft crop comes from a photo too small for its phone frame: a larger photo (generated or the owner's) fixes it.
  if (soft.length) console.log(`soft on phones (under ${SHARP_WIDTH}px wide): ${soft.join('; ')}`);
  if (unfocused.length) console.log(`cut without a judged subject (attention crop, may miss it): ${unfocused.join('; ')}`);
});
