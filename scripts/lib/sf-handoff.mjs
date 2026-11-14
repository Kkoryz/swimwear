// A Site Factory handoff (sf/handoff/v1: handoff.json beside the package/ folder the site is built from): what 08
// takes from it besides the package. Its pages' statuses (a withheld page is in the tree but not delivered: no page,
// no placeholder, out of the menus, links to it plain text), its route aliases (a link the copy writes to a route the
// site plan names otherwise), and its contracts: the handoff and the package are checked against Site Factory's
// schemas (config/sf-contracts/, copied byte for byte) and the fingerprints it planned with must be the ones 08 holds.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson } from './json-io.mjs';

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
  for (const [key, file] of Object.entries(held)) {
    const ours = await readFile(resolve(contracts, file)).then(sha256, () => null);
    if (handoff.contracts?.[key] && handoff.contracts[key] !== ours) problems.push(`config/sf-contracts/${file} is not the contract this handoff names (${handoff.contracts[key].slice(0, 12)}…): copy Site Factory's contracts/ again`);
  }
  const identity = handoff.identity;
  if (dir && identity?.project_yaml) {
    const given = await readFile(resolve(dir, identity.project_yaml)).then(sha256, () => null);
    if (given !== identity.project_yaml_sha256) problems.push(`${identity.project_yaml} ${given ? 'is not the file the handoff names' : 'is missing'}`);
  }
  const kinds = sha256((await readFile(resolve(root, 'config/block-kinds.json'), 'utf8')).replace(/\r\n/g, '\n'));
  if (handoff.contracts?.block_kinds?.sha256 && handoff.contracts.block_kinds.sha256 !== kinds) problems.push(`Site Factory planned with block-kinds ${handoff.contracts.block_kinds.sha256.slice(0, 12)}… (08 ${handoff.contracts.block_kinds.commit ?? '?'}), 08 holds ${kinds.slice(0, 12)}…`);
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [file, data, what] of [['handoff.schema.json', handoff, 'handoff.json'], ['authoring.schema.json', authoringPackage, 'the authoring package']]) {
    const validate = ajv.compile(await readJson(resolve(contracts, file)));
    if (!validate(data)) problems.push(...validate.errors.slice(0, 20).map((error) => `${what}${error.instancePath || ''}: ${error.message}`));
  }
  return problems;
}
