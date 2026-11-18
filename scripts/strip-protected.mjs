#!/usr/bin/env node
// Takes out of src/styles/reference.css every declaration that undoes a template decision (lib/protected-rules.mjs),
// before each build (site-run step "build"): what a repair wrote before a rule was protected goes too, not only what the
// next repair writes (the hotel site's sheet still tinted sections by their neighbours, and two grey sections met).
// Where the site's secondary surface has its own ink (components.secondaryInk), a rule painting that surface another
// colour gains the ink that reads on it too (lib/token-contrast.mjs inkLocalSurfaces; four-site audit 2026-11-17).
// Usage: node scripts/strip-protected.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { stripProtected } from './lib/protected-rules.mjs';
import { inkLocalSurfaces, rootTokens, tokenSheets } from './lib/token-contrast.mjs';

export async function stripSheet(root = process.cwd()) {
  const sheet = resolve(root, 'src/styles/reference.css');
  if (!existsSync(sheet)) return [];
  const { css, removed } = stripProtected(await readFile(sheet, 'utf8'));
  if (removed.length) await writeFile(sheet, css);
  return removed;
}

// [{ selector, surface, ink }] of the rules that gained an ink (none without the flag or a global.css).
export async function inkSheet(root = process.cwd()) {
  const sheet = resolve(root, 'src/styles/reference.css');
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'), null);
  if (!existsSync(sheet) || !existsSync(resolve(root, 'src/styles/global.css')) || variants?.components?.secondaryInk !== true) return [];
  const { css, added } = inkLocalSurfaces(await readFile(sheet, 'utf8'), rootTokens(await tokenSheets(root)));
  if (added.length) await writeFile(sheet, css);
  return added;
}

runMain(import.meta.url, async () => {
  const removed = await stripSheet();
  console.log(removed.length ? `took out ${removed.length} declaration(s) undoing a template decision:\n${removed.map((item) => `- ${item.selector} { ${item.property} }: ${item.rule}`).join('\n')}` : 'no declaration undoes a template decision');
  const inked = await inkSheet();
  if (inked.length) console.log(`gave ${inked.length} rule(s) painting the secondary surface another colour the ink that reads on it:\n${inked.map((item) => `- ${item.selector} { --surface-secondary: ${item.surface} } -> --secondary-ink: ${item.ink}`).join('\n')}`);
});
