#!/usr/bin/env node

// The site's fonts, installed by code (site:run step "fonts", after the treatment): the family of each type role
// (docs/research/raw/font-lock.json) in every weight and style the reference shows it in
// (docs/research/analysis/font-roles.json), commercial families replaced by their open substitutes
// (lib/font-licenses.mjs SUBSTITUTES), downloaded from the Google Fonts CSS2 API into public/fonts/, recorded in
// docs/research/installed-fonts.json (family, weights, files, sources) and declared in src/styles/fonts.css (generated:
// the site's only @font-face rules and its role tokens). The step owns public/fonts/: a font file there that the record
// does not name is removed, and @font-face rules in the treatment's stylesheet are taken out.
// Downloads are cached by URL (.pipeline/cache/fonts, or FONT_CACHE_DIR): the same fonts are never downloaded twice. A
// network error or a family Google Fonts does not have fails the step; it never falls back to a system font.
// Usage: node scripts/install-fonts.mjs

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { FONTS_CSS, FONTS_DIR, INSTALLED_FONTS, downloadFaces, fontPlan, fontsCss, installedFonts, referenceFontLock, stripFontFaces, withFontsImport } from './lib/font-install.mjs';

const FONT_FILE = /\.(woff2?|ttf|otf)$/i;

export async function installFonts({ root = process.cwd(), fetch = globalThis.fetch, cacheDir = process.env.FONT_CACHE_DIR || resolve(root, '.pipeline/cache/fonts') } = {}) {
  const fontRoles = await readJson(resolve(root, 'docs/research/analysis/font-roles.json'), null);
  if (!fontRoles) throw new Error('fonts: docs/research/analysis/font-roles.json is missing (the analysis step writes it)');
  const fontLock = await referenceFontLock(root);
  if (!fontLock) throw new Error('fonts: docs/research/raw/font-lock.json is missing (the capture step writes it)');
  const plan = fontPlan({ fontRoles, fontLock });
  // Everything is downloaded before anything is written: a failure leaves the site's fonts as they were.
  const { faces, requests, downloads, synthesized } = await downloadFaces({ plan, cacheDir, fetch });
  const lock = installedFonts({ plan, faces, requests, synthesized });

  const dir = resolve(root, FONTS_DIR);
  await mkdir(dir, { recursive: true });
  // One file per download (a variable font serves several weights from one file).
  const files = new Map(lock.faces.map((face) => [face.file, faces.find((item) => item.url === face.url).bytes]));
  for (const [file, bytes] of files) await writeFile(resolve(root, 'public', file.replace(/^\//, '')), bytes);
  const kept = new Set([...files.keys()].map((file) => file.replace(/^\/fonts\//, '')));
  const removed = (await readdir(dir)).filter((name) => FONT_FILE.test(name) && !kept.has(name));
  for (const name of removed) await rm(resolve(dir, name));

  await writeJson(resolve(root, INSTALLED_FONTS), lock);
  await writeFile(resolve(root, FONTS_CSS), fontsCss(lock));
  const globalPath = resolve(root, 'src/styles/global.css');
  const global = await readFile(globalPath, 'utf8');
  if (withFontsImport(global) !== global) await writeFile(globalPath, withFontsImport(global));
  const referencePath = resolve(root, 'src/styles/reference.css');
  const reference = await readFile(referencePath, 'utf8').catch(() => null);
  const strippedFaces = reference !== null && stripFontFaces(reference) !== reference;
  if (strippedFaces) await writeFile(referencePath, stripFontFaces(reference));

  return {
    roles: Object.fromEntries(Object.entries(lock.roles).map(([role, item]) => [role, item.substituteFor ? `${item.family} (for ${item.substituteFor})` : item.family])),
    families: lock.families.map((family) => `${family.family} ${family.weights.join('/')}${family.styles.includes('italic') ? ' +italic' : ''} (${family.source})${family.synthesized ? `, ${family.synthesized.join('/')} synthesized by the browser` : ''}`),
    files: files.size,
    downloads,
    removed,
    unused: lock.unused.map((item) => item.observed),
    strippedFaces,
  };
}

runMain(import.meta.url, async () => {
  cliArgs();
  console.log(JSON.stringify(await installFonts(), null, 2));
});
