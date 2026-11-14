#!/usr/bin/env node

// Applies the mechanical parts of a reference analysis:
//  - design-lock tokens (roles + supplementary roles) into the marked :root block of src/styles/global.css
//  - classified media pools from docs/research/analysis/media.json into public/media/reference/ and template-variants.json
// Usage: node scripts/apply-reference-analysis.mjs [--design-lock <path>] [--media <path>]  (neither: both, from
// docs/research/analysis/; one: that one only)

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import sharp from 'sharp';
import { cliArgs, runMain } from './lib/cli.mjs';
import { contrastRatio } from './lib/contrast.mjs';
import { altFromDescription } from './lib/alt-text.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { PHONE_MEDIA } from './lib/library-media.mjs';

const START = '/* design-lock:start */';
const END = '/* design-lock:end */';

export function designLockTokens(lock) {
  const tokens = { ...(lock.tokens || {}) };
  for (const role of Object.values(lock.supplementaryRoles || {})) if (role?.token && role.value != null) tokens[role.token] = role.value;
  return tokens;
}

// Adjustments made inside the block, each a token with a comment line right above it saying why (a contrast fix):
// they survive a new analysis.
export function adjustedTokens(css) {
  if (!css.includes(START) || !css.includes(END)) return new Map();
  const block = css.slice(css.indexOf(START), css.indexOf(END));
  return new Map([...block.matchAll(/^[ \t]*(\/\*[^\n]*\*\/)[ \t]*\r?\n[ \t]*(--[\w-]+)[ \t]*:[ \t]*([^;]+);/gm)].map((match) => [match[2], { note: match[1], value: match[3].trim() }]));
}

// The reference's link colour as text on the page's light surfaces (the page, and the cards and bands on the
// secondary surface) below WCAG AA (4.5:1): the same hue made darker until it reads on both, noted in the block (so it
// is kept like any other adjustment).
const rgbOf = (value) => (/^#[0-9a-f]{6}$/i.test(value ?? '') ? [1, 3, 5].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) : null);
const hexOf = (rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
export function readableLink(tokens) {
  const link = rgbOf(tokens['--link']);
  const surfaces = ['--surface-primary', '--surface-secondary'].filter((token) => rgbOf(tokens[token]));
  if (!link || !surfaces.length) return null;
  const worst = (color) => surfaces.map((token) => ({ token, ratio: contrastRatio(color, rgbOf(tokens[token])) })).sort((a, b) => a.ratio - b.ratio)[0];
  const before = worst(link);
  if (before.ratio >= 4.5) return null;
  for (let scale = 0.98; scale > 0; scale -= 0.02) {
    const shade = link.map((channel) => channel * scale);
    const after = worst(shade);
    if (after.ratio >= 4.5) return { value: hexOf(shade), note: `/* The reference's ${tokens['--link']} as link text is ${before.ratio.toFixed(1)}:1 on ${tokens[before.token]}; this shade of it is ${after.ratio.toFixed(1)}:1 or more on the light surfaces (WCAG AA). */` };
  }
  return null;
}

export function writeTokenBlock(css, tokens, notes = {}) {
  const adjusted = adjustedTokens(css);
  const line = (token, value) => {
    const kept = adjusted.get(token) ?? notes[token];
    return kept ? `  ${kept.note}\n  ${token}: ${kept.value};` : `  ${token}: ${value};`;
  };
  const body = Object.entries(tokens).map(([token, value]) => line(token, value)).join('\n');
  const block = `${START}\n:root {\n${body}\n}\n${END}`;
  if (css.includes(START) && css.includes(END)) return css.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`), block);
  // First run: remove the same tokens from the default :root so the locked values are the only definitions.
  let stripped = css;
  for (const token of Object.keys(tokens)) stripped = stripped.replace(new RegExp(`^\\s*${token.replace(/[-]/g, '\\-')}\\s*:[^;]*;\\n`, 'm'), '');
  const importsEnd = [...stripped.matchAll(/^@import[^\n]*\n/gm)].pop();
  const at = importsEnd ? importsEnd.index + importsEnd[0].length : 0;
  return `${stripped.slice(0, at)}\n${block}\n${stripped.slice(at)}`;
}

// The competitor's phone heroes: where a page shows a landscape hero and, on phones, a portrait one (both its heroes,
// the same page in their evidence), the portrait one goes with the landscape one as its phone source (art direction),
// so a phone shows a whole portrait photo instead of a narrow slice of the wide one. entries: [{ item, media }] in the
// analysis's hero order; the media objects gain sources.
export { PHONE_MEDIA };
export function pairPhoneHeroes(entries) {
  const route = (entry) => entry.item.evidence?.route ?? null;
  const portrait = (entry) => entry.media.height > entry.media.width * 1.2;
  const used = new Set();
  for (const wide of entries.filter((entry) => !portrait(entry) && route(entry))) {
    const tall = entries.find((entry) => portrait(entry) && !used.has(entry) && route(entry) === route(wide));
    if (!tall) continue;
    used.add(tall);
    wide.media.sources = [{ media: PHONE_MEDIA, src: tall.media.src, width: tall.media.width, height: tall.media.height }];
  }
  return entries;
}

// The heroes in the order pages take them (the first opens the home page): the ones a hero's frame (about twice as wide
// as high) shows most of, and wide enough not to be enlarged, first. A thin banner strip or a portrait photo (a phone
// hero, shown on phones through its landscape pair) is no default hero. Ties keep the analysis's order.
export const HERO_FRAME = 2;
export function rankHeroes(heroes) {
  const score = (hero) => {
    const aspect = hero.width / hero.height;
    return (Math.min(aspect, HERO_FRAME) / Math.max(aspect, HERO_FRAME)) * Math.min(1, hero.width / 1600);
  };
  return heroes.map((hero, order) => ({ hero, order, score: score(hero) })).sort((left, right) => right.score - left.score || left.order - right.order).map((entry) => entry.hero);
}

export async function applyReferenceAnalysis({ root = process.cwd(), designLockPath, mediaPath }) {
  const result = {};
  if (designLockPath) {
    const lock = await readJson(designLockPath);
    const tokens = designLockTokens(lock);
    const cssPath = resolve(root, 'src/styles/global.css');
    const link = readableLink(tokens);
    await writeFile(cssPath, writeTokenBlock(await readFile(cssPath, 'utf8'), tokens, link ? { '--link': link } : {}));
    await mkdir(resolve(root, 'docs/research/raw'), { recursive: true });
    await writeJson(resolve(root, 'docs/research/raw/design-lock.json'), lock);
    result.tokens = Object.keys(tokens).length;
  }
  if (mediaPath) {
    const media = await readJson(mediaPath);
    // Reference placeholders render during development only; a release build removes public/media/reference/.
    await mkdir(resolve(root, 'public/media/reference'), { recursive: true });
    const install = async (item, name) => {
      const file = `${name}${extname(item.localPath).toLowerCase()}`;
      await copyFile(item.localPath, resolve(root, 'public/media/reference', file));
      // Alt describes what the photo shows (the analysis subject, without its working notes); the file's own size lets
      // pages reserve space before it loads.
      const { width, height } = await sharp(item.localPath).metadata();
      return { src: `/media/reference/${file}`, alt: altFromDescription(item.alt ?? item.subject ?? ''), width, height };
    };
    const pools = {};
    for (const [kind, items] of Object.entries(media.pools || {})) {
      pools[kind] = [];
      for (const [index, item] of items.entries()) pools[kind].push(await install(item, `${kind}-${String(index + 1).padStart(2, '0')}-${basename(item.localPath, extname(item.localPath)).slice(0, 8)}`));
    }
    const installed = [];
    for (const [index, item] of (media.hero || []).entries()) installed.push({ item, media: await install(item, `hero-${index + 1}`) });
    const heroes = rankHeroes(pairPhoneHeroes(installed).map((entry) => entry.media));
    const variantsPath = resolve(root, 'src/data/template-variants.json');
    const variants = await readJson(variantsPath);
    // Run scripts write only the keys they derive (here media, phoneHeroes); every other key is the treatment's or a repair's.
    // The reference photos replace any generated library outright (its per-route pools and heroes would otherwise
    // still win); classes waiting for the owner's own photos stay so.
    // A hero that shows its photo with no text on it (a banner above the H1, a split) takes another photo than the
    // home hero, which often keeps empty space or a dark gradient for its headline.
    const bare = ['media-banner', 'media-split'];
    const heroByPageType = heroes.length > 1 ? Object.fromEntries(Object.entries(variants.components.heroByPageType ?? {}).filter(([type, variant]) => type !== 'home' && bare.includes(variant)).map(([type]) => [type, heroes[1]])) : {};
    // The competitor shows portrait heroes on phones: a generated library plans each hero's portrait twin too.
    if (heroes.some((hero) => hero.sources)) variants.components.phoneHeroes = true; else delete variants.components.phoneHeroes;
    variants.components.media = { origin: 'reference-placeholder', pools, hero: heroes[0] ?? null, ...(Object.keys(heroByPageType).length ? { heroByPageType } : {}), heroOptions: heroes, placeholders: variants.components.media?.placeholders ?? [] };
    await writeJson(variantsPath, variants);
    result.media = Object.fromEntries(Object.entries(pools).map(([kind, items]) => [kind, items.length]));
    result.heroes = heroes.length;
  }
  return result;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'design-lock': { type: 'string' }, media: { type: 'string' } });
  const both = !values['design-lock'] && !values.media;
  const result = await applyReferenceAnalysis({
    designLockPath: values['design-lock'] ?? (both ? 'docs/research/analysis/design-lock.json' : null),
    mediaPath: values.media ?? (both ? 'docs/research/analysis/media.json' : null),
  });
  console.log(JSON.stringify(result, null, 2));
}, { stack: true });
