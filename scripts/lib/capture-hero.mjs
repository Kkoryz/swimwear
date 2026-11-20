// The reference's first screen from its capture's own rects (docs/research/reference-pages/<folder>/raw/<viewport>.json,
// capture-reference.mjs), no browser and no model: at each width the capture took (a desktop 1440x1000, a tablet
// 768x1024, a phone 390x844) the opening band under or behind the header, its height and its share of that screen.
// The patterns step writes them to components.heroHeights (scaffold-placeholder-pages.mjs), PageHero.astro sets them
// as each page type's --hero-min-height (template.css, the screen the cap), and the layout audit holds a page's hero to
// them (lib/usability-checks.mjs hero_height).
//
// Owner 2026-11-18: Staylumen's heroes sat at the template's 360 to 600px against the reference's 1000 (home), 572
// (about), 412 (contact) and 837 (solution, place) at 1440x1000. The patterns step's live phone measure found its
// sections by their desktop paths, which a phone's visit to a Duda site does not have (every page type measured 1168px
// on a phone); the capture's phone rects are the phone's own page.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { captureTree } from './capture-dom.mjs';
import { readJson } from './json-io.mjs';
import { captureFolder } from './rules.mjs';

// The capture's widths by the names components.heroHeights keeps them under.
export const CAPTURE_WIDTHS = Object.freeze([
  { key: 'desktop', id: 'desktop-1440' },
  { key: 'tablet', id: 'tablet-768' },
  { key: 'phone', id: 'mobile-390' },
]);
// The opening band: a painted element (a photo, a video, a photo or solid background) at least this share of the
// screen's width, at least HERO_MIN_PX tall, starting no lower than HERO_START_SHARE of the screen under the header.
export const HERO_MIN_WIDTH_SHARE = 0.9;
export const HERO_MIN_PX = 120;
export const HERO_START_SHARE = 0.25;

// A colour's alpha, whatever its notation: a computed style keeps the author's colour space (oklch(), lab(), color():
// Tailwind v4's colours are oklch), so an rgb()-only reading took a dark oklch band for no paint at all (Tapa Works'
// reference, 2026-11-20). transparent and none are 0; a function's alpha is after its "/", else the fourth of a comma
// list (rgba(), hsla()), else 1; a hex colour's is its fourth or its last two digits, else 1; a colour name is 1.
export function colourAlpha(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'transparent' || text === 'none') return 0;
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 4) return parseInt(digits[3].repeat(2), 16) / 255;
    if (digits.length === 8) return parseInt(digits.slice(6), 16) / 255;
    return 1;
  }
  const call = /^[a-z-]+\((.*)\)$/.exec(text);
  if (!call) return 1;
  const body = call[1];
  const alpha = body.includes('/') ? body.slice(body.lastIndexOf('/') + 1).trim() : body.split(',')[3]?.trim();
  if (!alpha) return 1;
  const amount = parseFloat(alpha);
  if (!Number.isFinite(amount)) return 1;
  return alpha.endsWith('%') ? amount / 100 : amount;
}
const opaque = (value) => colourAlpha(value) >= 0.6;
const painted = (node) => ['img', 'video', 'picture', 'canvas'].includes(node.tag) || /url\(/.test(node.styles?.['background-image'] ?? '') || opaque(node.styles?.['background-color']);
const fixed = (node) => { for (let at = node; at; at = at.parent) if (at.styles?.position === 'fixed') return true; return false; };

// The opening band of one captured view: { top, height, share } (px of the page, share of the screen's height), or null
// where the page opens on no painted band (text on the page's own surface: nothing to size).
export function captureHero(extraction, { html = null } = {}) {
  const tree = captureTree(extraction, { html });
  const { width, height: screen } = tree.viewport;
  const header = tree.header && tree.header.rect.height > 0 ? tree.header.rect.y + tree.header.rect.height : 0;
  const candidates = tree.nodes.filter((node) => node.displayed && node.styles?.visibility !== 'hidden' && node.opacity > 0.1
    && !node.inShell && !node.containsShell && !fixed(node)
    && node.rect.width >= width * HERO_MIN_WIDTH_SHARE && node.rect.height >= HERO_MIN_PX
    // Not a wrapper of the whole content (a page's own surface).
    && node.rect.height <= tree.scrollHeight * 0.5
    && node.rect.y < header + screen * HERO_START_SHARE && painted(node));
  if (!candidates.length) return null;
  const top = Math.min(...candidates.map((node) => node.rect.y));
  // The topmost band; of the boxes starting there (a video and its frame), the tallest.
  const hero = candidates.filter((node) => node.rect.y <= top + 8).reduce((best, node) => (node.rect.height > best.rect.height ? node : best));
  const height = Math.round(hero.rect.height);
  return { top: Math.round(hero.rect.y), height, share: Math.round((1000 * height) / screen) / 1000 };
}

// { desktop, tablet, phone } of one reference page type from its capture folder, each { height, share }; a width
// without a capture or a band is left out. { band: false } where the capture has views and none of them opens on a
// band (the page opens on text, or on copy beside a photo, on its own surface: no first-screen height to take; Tapa
// Works' reference about page, 2026-11-20, where the patterns step took a 1715px content section instead); null
// without any captured view. The DOM's parents come from the view's own rendered HTML where the capture kept one
// (rendered-<viewport>.html: the phone's visit), else from the desktop's.
export async function capturedHeroHeights(root, pageType) {
  const dir = resolve(root, 'docs/research/reference-pages', captureFolder(pageType), 'raw');
  const html = async (id) => {
    for (const name of [`rendered-${id}.html`, 'rendered.html']) if (existsSync(resolve(dir, name))) return readFile(resolve(dir, name), 'utf8');
    return null;
  };
  const heights = {};
  let views = 0;
  for (const { key, id } of CAPTURE_WIDTHS) {
    const extraction = await readJson(resolve(dir, `${id}.json`), null);
    if (!extraction?.elements) continue;
    views += 1;
    const hero = captureHero(extraction, { html: await html(id) });
    if (hero) heights[key] = { height: hero.height, share: hero.share };
  }
  if (Object.keys(heights).length) return heights;
  return views ? { band: false } : null;
}
