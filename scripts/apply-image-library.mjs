#!/usr/bin/env node

// Puts the image library into the template: site-wide pools, each product route's own pools and a hero per route
// replace the reference-placeholder photos (template-variants.json components.media, origin "library"). Image slots
// with no library photo stay visible image slots; reference photos are not kept as a fallback. The plan's placeholder
// classes (e.g. process: the manufacturer's own factory) always stay slots until real photos arrive. A library written
// to the old folder (media/generated) is moved to media/photos first, its register following.
// Usage: node scripts/apply-image-library.mjs

import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { libraryMedia } from './lib/library-media.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { LEGACY_LIBRARY_PATH, LIBRARY_PATH } from './lib/release-guard.mjs';

// Moves an earlier library's files to LIBRARY_PATH and points the register's web paths there; true when it moved any.
export async function moveLegacyLibrary(root, plan) {
  const from = resolve(root, 'public', LEGACY_LIBRARY_PATH);
  if (!existsSync(from)) return false;
  const to = resolve(root, 'public', LIBRARY_PATH);
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) await rename(join(from, name), join(to, name));
  await rm(from, { recursive: true, force: true });
  const moved = (text) => text.replaceAll(`/${LEGACY_LIBRARY_PATH}/`, `/${LIBRARY_PATH}/`);
  for (const entry of plan.entries) if (entry.web) entry.web = { ...entry.web, src: moved(entry.web.src), srcset: moved(entry.web.srcset) };
  return true;
}

export async function applyImageLibrary({ root = process.cwd() } = {}) {
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  if (await moveLegacyLibrary(root, plan)) await writeJson(planPath, plan);
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  // Run scripts write only the keys they derive (here media); every other key is the treatment's or a repair's.
  const { pools, themePools, routePools, heroByRoute, routeCategories, routeThemes, hero } = libraryMedia(plan);
  variants.components.media = {
    origin: 'library',
    hero,
    heroByRoute,
    pools,
    // A themed page's shared classes take its theme's set (lib/page-theme.mjs; site13 claude-seo audit 2026-11-17, M-13).
    ...(themePools ? { themePools } : {}),
    routePools,
    routeCategories,
    ...(routeThemes ? { routeThemes } : {}),
    // The positions the site names a photo for (site.json pagePhotos), so the renderer takes the photo made for each.
    ...(plan.pagePhotos ? { pagePhotos: plan.pagePhotos } : {}),
    // Classes that wait for real photos render as image slots (never filled with another class's photo).
    placeholders: plan.placeholders ?? [],
  };
  await writeJson(variantsPath, variants);
  return { pools: Object.fromEntries(Object.entries(pools).map(([kind, items]) => [kind, items.length])), routes: Object.keys(routePools).length, heroes: Object.keys(heroByRoute).length };
}

runMain(import.meta.url, async () => console.log(JSON.stringify(await applyImageLibrary())), { stack: true });
