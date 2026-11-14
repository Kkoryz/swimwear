#!/usr/bin/env node

// Rebuilds the site's blueprints from its competitor's pages without capturing them again: every page type follows the
// competitor page in docs/research/pattern-inventory.json (lib/page-blueprints.mjs competitorBlueprints). Writes the
// placeholder pages, the menus, docs/research/slot-manifest.json (for Site Factory 06) and, the first time,
// docs/research/blueprint-choices.json (enabled: false; turn it on to leave competitor sections out).
// Usage: node scripts/competitor-blueprint.mjs [--pages-plan <pages.json>]  (default: the plan the importer recorded)

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { writeBlueprintPages } from './scaffold-placeholder-pages.mjs';

export async function competitorBlueprint({ root = process.cwd(), pagesPlanPath = null } = {}) {
  const recorded = (await readJson(resolve(root, 'docs/research/site-factory-import.json'), null))?.inputs?.pagesPlan;
  const path = pagesPlanPath ?? recorded;
  if (!path) throw new Error('no site plan: pass --pages-plan <pages.json> (or import the Site Factory package first)');
  const { pages, blueprints } = await writeBlueprintPages({ root, pagesPlan: await readJson(resolve(path)) });
  return { placeholders: pages.length, pageTypes: Object.fromEntries(Object.entries(blueprints).map(([type, slots]) => [type, slots.map((slot) => `${slot.id}${slot.variant ? `:${slot.variant}` : ''}${slot.fill === 'owner' ? '(owner)' : ''}`).join(' > ')])) };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'pages-plan': { type: 'string' } });
  console.log(JSON.stringify(await competitorBlueprint({ pagesPlanPath: values['pages-plan'] ?? null }), null, 2));
});
