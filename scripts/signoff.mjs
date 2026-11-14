#!/usr/bin/env node

// The owner's release sign-off (docs/research/release-signoff.json): what must be replaced with real values or
// confirmed before launch (for example a founding year, certificates, stand-in photos, a capabilities list). Stage 11
// holds release on every item that is not confirmed and names the pages citing a listed fact.
// Usage: node scripts/signoff.mjs [--list] | --confirm <id> --by "<name>" [--note "<what was done>"]

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

export const SIGNOFF_SCHEMA = 'seo-site-release-signoff-v1';

export function confirmItem(signoff, { id, by, note = null, at = new Date().toISOString() }) {
  if (!by) throw new Error('--by is required');
  const item = signoff.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`no sign-off item ${id}`);
  Object.assign(item, { status: 'confirmed', confirmedBy: by, confirmedAt: at, ...(note ? { note } : {}) });
  return item;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ list: { type: 'boolean' }, confirm: { type: 'string' }, by: { type: 'string' }, note: { type: 'string' } });
  const path = resolve('docs/research/release-signoff.json');
  const signoff = await readJson(path);
  if (signoff.schemaVersion !== SIGNOFF_SCHEMA) throw new Error(`unsupported sign-off schema: ${signoff.schemaVersion}`);
  if (values.confirm) {
    const item = confirmItem(signoff, { id: values.confirm, by: values.by, note: values.note ?? null });
    await writeJson(path, signoff);
    console.log(`confirmed ${item.id}`);
  } else {
    for (const item of signoff.items) console.log(`${item.status === 'confirmed' ? 'x' : ' '} ${item.id}: ${item.description}`);
  }
});
