#!/usr/bin/env node

// Shows the reference's photos on every page (the owner, 2026-09-26: stabilise copy and design first, photos later):
// installs the analysis's media pools as development placeholders and points the template at them, without touching
// the design tokens. A release build removes them and fails while a page still uses one. The generated library, if
// any, stays in docs/research/image-plan.json and public/media/photos for `pnpm apply:image-library`.
// An older analysis (media.json without pools) uses the reference photos already installed as
// public/media/reference/<class>-<name>.<ext> (product-, process-, material-, lifestyle-, hero-).
// Usage: node scripts/use-reference-media.mjs [--media <docs/research/analysis/media.json>]

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyReferenceAnalysis } from './apply-reference-analysis.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { MEDIA_KINDS } from './lib/rules.mjs';

const FOLDER = 'public/media/reference';

// Pools from the installed reference photos, by their file name's class prefix.
export async function installedPools(root) {
  const { default: sharp } = await import('sharp');
  const files = (await readdir(resolve(root, FOLDER)).catch(() => [])).filter((name) => /\.(png|jpe?g|webp|avif)$/i.test(name)).sort();
  const pools = {};
  const heroes = [];
  for (const name of files) {
    const kind = name.split('-')[0];
    if (kind !== 'hero' && !MEDIA_KINDS.includes(kind)) continue;
    const { width, height } = await sharp(resolve(root, FOLDER, name)).metadata();
    const alt = name.replace(/\.[^.]+$/, '').split('-').slice(1).join(' ');
    const item = { src: `/media/reference/${name}`, alt, width, height };
    if (kind === 'hero') heroes.push(item); else (pools[kind] ||= []).push(item);
  }
  return { pools, heroes };
}

export async function useReferenceMedia({ root = process.cwd(), mediaPath = 'docs/research/analysis/media.json' } = {}) {
  const media = await readJson(resolve(root, mediaPath), null);
  if (media?.pools) return applyReferenceAnalysis({ root, designLockPath: null, mediaPath: resolve(root, mediaPath) });
  const { pools, heroes } = await installedPools(root);
  if (!Object.keys(pools).length) throw new Error(`no reference photos: ${mediaPath} has no pools and ${FOLDER} has no <class>-*.png|jpg|webp files`);
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  // Run scripts write only the keys they derive (here media); every other key is the treatment's or a repair's.
  variants.components.media = { origin: 'reference-placeholder', pools, hero: heroes[0] ?? null, heroOptions: heroes, placeholders: variants.components.media?.placeholders ?? [] };
  await writeJson(variantsPath, variants);
  return { media: Object.fromEntries(Object.entries(pools).map(([kind, items]) => [kind, items.length])), heroes: heroes.length, from: FOLDER };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ media: { type: 'string' } });
  const mediaPath = values.media ?? 'docs/research/analysis/media.json';
  if (!existsSync(resolve(mediaPath)) && !existsSync(resolve(FOLDER))) throw new Error(`no reference media: neither ${mediaPath} nor ${FOLDER}`);
  console.log(JSON.stringify(await useReferenceMedia({ mediaPath }), null, 2));
});
