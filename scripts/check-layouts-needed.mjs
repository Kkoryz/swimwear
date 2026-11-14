#!/usr/bin/env node

// Checks the layouts Site Factory needs against config/block-kinds.json (owner 2026-10-02: 06/07 say which layouts a
// run needs, 08 builds them): each section's kind must offer its presentation, with the component planned for and a
// word range the component holds. Reads 07's authoring package (every kind and presentation its sections use) or 06's
// list (sf/layouts-needed/v1). Exits 1 with what is missing, so a new need is built before the package is imported.
// Usage: node scripts/check-layouts-needed.mjs <authoring_package.json | layouts_needed.json>

import { resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { BLOCK_KINDS } from './lib/sf-kinds.mjs';

// The layouts an authoring package uses: one per kind and presentation, with the pages that use it.
export function layoutsOfPackage(authoringPackage) {
  const layouts = new Map();
  for (const page of authoringPackage.pages ?? []) {
    for (const section of page.sections ?? []) {
      if (section.kind == null) continue;
      const key = `${section.kind}/${section.presentation ?? ''}`;
      if (!layouts.has(key)) layouts.set(key, { kind: section.kind, presentation: section.presentation ?? null, pages: [] });
      if (!layouts.get(key).pages.includes(page.page_id)) layouts.get(key).pages.push(page.page_id);
    }
  }
  return [...layouts.values()];
}

export function missingLayouts(needed, table = BLOCK_KINDS) {
  if (needed?.schema_version === 'sf/authoring/v1') return missingLayouts({ schema_version: 'sf/layouts-needed/v1', layouts: layoutsOfPackage(needed) }, table);
  if (needed?.schema_version !== 'sf/layouts-needed/v1') throw new Error(`unsupported layouts list: ${needed?.schema_version}`);
  return (needed.layouts ?? []).flatMap((layout) => {
    const where = `${layout.kind} as ${layout.presentation} (pages ${(layout.pages ?? []).join(', ')})`;
    const kind = table.kinds[layout.kind];
    if (!kind) return [`${where}: the table has no kind ${layout.kind}`];
    const component = kind.presentations[layout.presentation ?? kind.default];
    if (!component) return [`${where}: ${layout.kind} has no ${layout.presentation} layout (it has ${Object.keys(kind.presentations).join(', ')})`];
    const problems = [];
    if (layout.component && layout.component !== component) problems.push(`${where}: planned for ${layout.component}, the table renders it with ${component}`);
    const [min, max] = (kind.words ?? table.components[component].words ?? {}).body ?? [0, Infinity];
    if (layout.words && (layout.words[0] < min || layout.words[1] > max)) problems.push(`${where}: ${layout.words.join('-')} words, ${component} holds ${min}-${max}`);
    return problems;
  });
}

runMain(import.meta.url, async () => {
  const { positionals } = cliArgs();
  if (!positionals[0]) return usage('Usage: node scripts/check-layouts-needed.mjs <authoring_package.json | layouts_needed.json>');
  const missing = missingLayouts(await readJson(resolve(positionals[0])));
  if (!missing.length) { console.log('every layout Site Factory needs is in config/block-kinds.json'); return; }
  console.log(missing.map((line) => `- ${line}`).join('\n'));
  process.exitCode = 1;
});
