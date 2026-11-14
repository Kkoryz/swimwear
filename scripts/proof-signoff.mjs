#!/usr/bin/env node

// Lists the site's stated proof (src/data/site-proof.json: factory figures, certificates, clients, testimonials, case
// studies, history) in the owner's release sign-off (docs/research/release-signoff.json), one item per group, so stage
// 11 holds release until the owner has put in the real values and confirmed each (pnpm signoff --confirm <id>). An item
// whose values changed since it was confirmed is pending again; a group the file no longer has is dropped.
// Usage: node scripts/proof-signoff.mjs

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { REVIEW_SIGNOFF, reviewSignoffItem } from './lib/review-markup.mjs';
import { PLACEHOLDER_BLOCKS, PROOF_GROUPS, PROOF_SCHEMA, placeholderRoutes, proofGroupBlockId, proofSignoffItems } from './lib/site-proof.mjs';
import { SIGNOFF_SCHEMA } from './signoff.mjs';

// What Site Factory borrowed from competitors (placeholder: true) on the built pages, testimonials and order routes:
// one sign-off item each that the owner confirms to launch with them (the preflight holds until then).
export function placeholderItems(pages) {
  return PLACEHOLDER_BLOCKS.flatMap(({ type, signoff, what }) => {
    const routes = placeholderRoutes(pages, type);
    return routes.length ? [{ id: signoff, description: `Replace the ${what} on ${routes.join(', ')} with real, permitted ones, or confirm to launch with them`, status: 'pending' }] : [];
  });
}
const isPlaceholderItem = (id) => PLACEHOLDER_BLOCKS.some((entry) => entry.signoff === id);

// The stated proof the built pages show: a group no page shows (Site Factory's own testimonials, cases or size facts
// took its place everywhere) is not listed for sign-off.
export function shownProof(proof, pages) {
  const blocks = pages.flatMap((page) => page.blocks ?? []);
  // A testimonials block of the page's own (placeholder) reviews is not the stated proof.
  const shows = (group) => blocks.some((block) => block.id === proofGroupBlockId(group) && (group !== 'testimonials' || block.items?.some((item) => !item.placeholder)));
  return Object.fromEntries(Object.entries(proof).map(([key, value]) => [key, PROOF_GROUPS.includes(key) && !shows(key) ? [] : value]));
}

// Site Factory's owner to-do (its handoff's owner/todo.json, sf/handoff-owner-todo/v1): each blocking item is one
// sign-off item, so stage 11 holds release on it as on our own (the hotel handoffs listed real contact details and a
// hard-facts table there, and 08 never read it). Its evidence file is named, in the package.
export const OWNER_TODO_SCHEMA = 'sf/handoff-owner-todo/v1';
export function ownerTodoItems(todo) {
  if (!todo) return [];
  if (todo.schema_version !== OWNER_TODO_SCHEMA) throw new Error(`unsupported owner to-do schema: ${todo.schema_version}`);
  return (todo.items ?? []).filter((item) => item.blocking).map((item) => ({
    id: `sf-${item.id}`,
    description: `Site Factory: ${[item.ask, item.field ? `${item.field}: ${item.text}` : item.text].filter(Boolean).join(' | ')}${item.evidence ? ` (see the handoff's ${item.evidence})` : ''}`,
    status: 'pending',
    // Where it shows (Site Factory's page and section), so the gate names the page.
    ...(item.page_id ? { pageId: item.page_id } : {}),
    ...(item.section_id ? { sectionId: item.section_id } : {}),
  }));
}

// The trust bar's figures from facts the owner has not confirmed (the import's trustBarUnconfirmed): one sign-off item
// per fact, citing it, so the gate lists the pages that show it (the hotel site's "since 2016" and "60 hotels and
// motels" stood on the trust bar from an unverified source, and nothing held them).
export function trustBarItems(imported) {
  const byFact = new Map();
  for (const entry of imported?.trustBarUnconfirmed ?? []) byFact.set(entry.factId, [...(byFact.get(entry.factId) ?? []), entry.value]);
  return [...byFact].map(([factId, values]) => ({ id: `trust-${factId}`, description: `Confirm or replace the trust bar's figures from the unconfirmed fact ${factId}: ${values.join('; ')}`, status: 'pending', factId }));
}

export function mergeProofItems(signoff, proof, pages = [], todo = null, imported = null) {
  const wanted = [...proofSignoffItems(proof), ...placeholderItems(pages), reviewSignoffItem(pages), ...ownerTodoItems(todo), ...trustBarItems(imported)].filter(Boolean);
  const kept = signoff.items.filter((item) => !item.id.startsWith('proof-') && !item.id.startsWith('sf-') && !item.id.startsWith('trust-') && !isPlaceholderItem(item.id) && item.id !== REVIEW_SIGNOFF);
  const merged = wanted.map((item) => {
    const before = signoff.items.find((entry) => entry.id === item.id);
    return before && before.description === item.description ? before : item;
  });
  return { ...signoff, items: [...kept, ...merged] };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'owner-todo': { type: 'string' } });
  const todo = values['owner-todo'] ? await readJson(resolve(values['owner-todo']), null) : null;
  const proof = await readJson(resolve('src/data/site-proof.json'));
  if (proof.schemaVersion !== PROOF_SCHEMA) throw new Error(`unsupported proof schema: ${proof.schemaVersion}`);
  const path = resolve('docs/research/release-signoff.json');
  const signoff = await readJson(path, { schemaVersion: SIGNOFF_SCHEMA, items: [] });
  const pages = [...await readJson(resolve('src/data/authoring-pages.json'), []), ...await readJson(resolve('src/data/placeholder-pages.json'), [])];
  const imported = await readJson(resolve('docs/research/site-factory-import.json'), null);
  const next = mergeProofItems(signoff, shownProof(proof, pages), pages, todo, imported);
  await writeJson(path, next);
  for (const item of next.items.filter((entry) => entry.id.startsWith('proof-') || entry.id.startsWith('sf-') || entry.id.startsWith('trust-') || isPlaceholderItem(entry.id))) console.log(`${item.status === 'confirmed' ? 'x' : ' '} ${item.id}`);
});
