// A Site Factory handoff (sf/handoff/v1: handoff.json beside the package/ folder the site is built from): what 08
// takes from it besides the package. Its pages' statuses (a withheld page is in the tree but not delivered: no page,
// no placeholder, out of the menus, links to it plain text), its route aliases (a link the copy writes to a route the
// site plan names otherwise), and its contracts: the handoff and the package are checked against Site Factory's
// schemas (config/sf-contracts/, copied byte for byte) and the fingerprints it planned with must be the ones 08 holds.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson } from './json-io.mjs';
import { SITE_COLLECTION_PATH, collectionSha256 } from './site-collection.mjs';

export const HANDOFF_SCHEMA = 'sf/handoff/v1';

// The site plan with the handoff's page statuses marked: a withheld page (withheld: its reason), and a menu heading
// without a page (nav_only: the tree may not say so; the handoff does). Unchanged without a handoff.
export function handoffStatuses(plan, handoff) {
  const statuses = new Map((handoff?.pages ?? []).filter((page) => ['withheld', 'nav_only'].includes(page.status)).map((page) => [page.page_id, page]));
  if (!statuses.size) return plan;
  const marked = (page) => {
    const status = statuses.get(page.page_id);
    if (!status) return page;
    return status.status === 'withheld' ? { ...page, withheld: status.reason ?? 'withheld' } : { ...page, nav_only: true };
  };
  return { ...plan, pages: plan.pages.map(marked) };
}

// The handoff's route aliases: route the copy writes -> route the site plan names.
export const routeAliases = (handoff) => new Map((handoff?.route_aliases ?? []).filter((alias) => alias.from && alias.to).map((alias) => [alias.from, alias.to]));

// A package value with every link to an aliased route pointed at its route: a field that is the route itself, a
// Markdown link's target in copy. The copy's words are not touched.
export function aliasRoutes(value, aliases) {
  if (!aliases.size) return value;
  if (typeof value === 'string') {
    if (aliases.has(value)) return aliases.get(value);
    return value.replace(/\]\(([^)\s]+)\)/g, (link, target) => (aliases.has(target) ? `](${aliases.get(target)})` : link));
  }
  if (Array.isArray(value)) return value.map((item) => aliasRoutes(item, aliases));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, aliasRoutes(item, aliases)]));
  return value;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// config/block-kinds.json as Site Factory names it (handoff contracts.block_kinds.sha256): its text with LF line endings,
// whatever the checkout wrote (core.autocrlf). One statement for the handoff check and the report back (sf-report.mjs).
export const blockKindsSha256 = async (root) => sha256((await readFile(resolve(root, 'config/block-kinds.json'), 'utf8')).replace(/\r\n/g, '\n'));

// Earlier contract versions 08 keeps beside the current copies (config/sf-contracts/versions/<file stem>/<sha256>.json):
// packages made by Site Factory's older code name them (2026-11-17: swim_1117c came from integ deb67119 while
// rm_1117b, str_1117a and full_1117a, of the same day, came from the code before it). A handoff is checked against the
// version it names when 08 holds it; one 08 does not hold is refused as before.
export const CONTRACT_VERSIONS = 'config/sf-contracts/versions';
export async function contractBytes(contracts, file, named = null) {
  const current = await readFile(resolve(contracts, file)).catch(() => null);
  if (!named) return current;
  if (current && sha256(current) === named) return current;
  const kept = await readFile(resolve(contracts, 'versions', file.replace(/\.json$/, ''), `${named}.json`)).catch(() => null);
  return kept && sha256(kept) === named ? kept : null;
}

// What is wrong with a handoff before anything is imported from it (empty when nothing): its schema version, the
// handoff and the package against Site Factory's schemas, the contract copies 08 holds against the fingerprints the
// handoff names, and the block-kinds table Site Factory planned with against 08's (LF line endings, as both keep it).
// The company's identity the handoff delivers (identity.project_yaml, relative to the handoff) must be the file it
// names by sha256.
export async function handoffProblems({ handoff, authoringPackage, root = process.cwd(), dir = null }) {
  if (handoff?.schema_version !== HANDOFF_SCHEMA) return [`handoff.json schema_version is ${handoff?.schema_version}, not ${HANDOFF_SCHEMA}`];
  const problems = [];
  const contracts = resolve(root, 'config/sf-contracts');
  const held = { authoring_schema_sha256: 'authoring.schema.json', handoff_schema_sha256: 'handoff.schema.json', requires_schema_sha256: 'handoff-requires.schema.json', owner_todo_schema_sha256: 'handoff-owner-todo.schema.json', report_schema_sha256: 'handoff-report.schema.json' };
  const named = {};
  for (const [key, file] of Object.entries(held)) {
    const bytes = await contractBytes(contracts, file, handoff.contracts?.[key]);
    if (handoff.contracts?.[key] && !bytes) problems.push(`config/sf-contracts/${file} is not the contract this handoff names (${handoff.contracts[key].slice(0, 12)}…), nor a version kept in ${CONTRACT_VERSIONS}/: copy Site Factory's contracts/ again`);
    if (bytes) named[file] = bytes;
  }
  const identity = handoff.identity;
  if (dir && identity?.project_yaml) {
    const given = await readFile(resolve(dir, identity.project_yaml)).then(sha256, () => null);
    if (given !== identity.project_yaml_sha256) problems.push(`${identity.project_yaml} ${given ? 'is not the file the handoff names' : 'is missing'}`);
  }
  const kinds = await blockKindsSha256(root);
  if (handoff.contracts?.block_kinds?.sha256 && handoff.contracts.block_kinds.sha256 !== kinds) problems.push(`Site Factory planned with block-kinds ${handoff.contracts.block_kinds.sha256.slice(0, 12)}… (08 ${handoff.contracts.block_kinds.commit ?? '?'}), 08 holds ${kinds.slice(0, 12)}…`);
  // The collection contract the privacy page's table was built from (Site Factory integ deb67119, 2026-11-17:
  // contracts.site_collection_sha256, its copy of config/site-collection.json, LF line endings) must be 08's own
  // export: else the table lists what another configuration collects. An older handoff has no such field, and a null
  // one means Site Factory had no contract (its package then has no table): neither is checked.
  const planned = handoff.contracts?.site_collection_sha256;
  if (typeof planned === 'string') {
    const ours = await readFile(resolve(root, SITE_COLLECTION_PATH), 'utf8').then(collectionSha256, () => null);
    if (planned !== ours) problems.push(`Site Factory built the privacy table from site-collection ${planned.slice(0, 12)}…, 08 exports ${ours ? `${ours.slice(0, 12)}…` : 'none'} (${SITE_COLLECTION_PATH}: run node scripts/export-site-collection.mjs, and have Site Factory copy it again)`);
  }
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [file, data, what] of [['handoff.schema.json', handoff, 'handoff.json'], ['authoring.schema.json', authoringPackage, 'the authoring package']]) {
    const validate = ajv.compile(named[file] ? JSON.parse(named[file].toString('utf8')) : await readJson(resolve(contracts, file)));
    if (!validate(data)) problems.push(...validate.errors.slice(0, 20).map((error) => `${what}${error.instancePath || ''}: ${error.message}`));
  }
  return problems;
}
