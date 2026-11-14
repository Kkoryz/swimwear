#!/usr/bin/env node
// Takes out of src/styles/reference.css every declaration that undoes a template decision (lib/protected-rules.mjs),
// before each build (site-run step "build"): what a repair wrote before a rule was protected goes too, not only what the
// next repair writes (the hotel site's sheet still tinted sections by their neighbours, and two grey sections met).
// Usage: node scripts/strip-protected.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { stripProtected } from './lib/protected-rules.mjs';

export async function stripSheet(root = process.cwd()) {
  const sheet = resolve(root, 'src/styles/reference.css');
  if (!existsSync(sheet)) return [];
  const { css, removed } = stripProtected(await readFile(sheet, 'utf8'));
  if (removed.length) await writeFile(sheet, css);
  return removed;
}

runMain(import.meta.url, async () => {
  const removed = await stripSheet();
  console.log(removed.length ? `took out ${removed.length} declaration(s) undoing a template decision:\n${removed.map((item) => `- ${item.selector} { ${item.property} }: ${item.rule}`).join('\n')}` : 'no declaration undoes a template decision');
});
