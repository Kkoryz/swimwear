#!/usr/bin/env node

// Writes the collection contract config/site-collection.json (lib/site-collection.mjs) from the form contract and the
// privacy table's items (lib/data-practices.mjs), and prints its sha256 as Site Factory fingerprints it. Site Factory
// (integ deb67119, 2026-11-17) copies the file byte for byte to domain/site-collection.json: export again after a change
// to what the sites collect, and tell Site Factory to copy it again (the import refuses a handoff that names another
// sha256). --check: write nothing, exit 1 when the file is not the export.
// Usage: node scripts/export-site-collection.mjs [--check]

import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readText } from './lib/json-io.mjs';
import { SITE_COLLECTION_PATH, collectionSha256, siteCollectionText } from './lib/site-collection.mjs';

export async function exportSiteCollection({ root = process.cwd(), check = false } = {}) {
  const path = resolve(root, SITE_COLLECTION_PATH);
  const text = siteCollectionText();
  const current = await readText(path, null);
  const same = current !== null && current.replace(/\r\n/g, '\n') === text;
  if (!check && !same) await writeFile(path, text);
  return { path, sha256: collectionSha256(text), same };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ check: { type: 'boolean' } });
  const result = await exportSiteCollection({ check: Boolean(values.check) });
  if (values.check && !result.same) {
    console.error(`${SITE_COLLECTION_PATH} is not the export: run node scripts/export-site-collection.mjs`);
    process.exitCode = 1;
    return;
  }
  console.log(`${SITE_COLLECTION_PATH} ${result.same ? 'unchanged' : 'written'}, sha256 ${result.sha256}`);
});
