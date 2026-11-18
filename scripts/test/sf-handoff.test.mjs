import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { aliasRoutes, handoffProblems, routeAliases, handoffStatuses } from '../lib/sf-handoff.mjs';
import { siteNavFromPlan } from '../lib/site-plan.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('a withheld page of the handoff is marked in the site plan and kept out of the menus (a heading when pages hang under it)', () => {
  const plan = {
    pages: [{ page_id: 'home', url: '/' }, { page_id: 'fabrics', url: '/fabrics/' }, { page_id: 'guides', url: '/guides/' }, { page_id: 'guide-1', url: '/guides/one/' }],
    header_nav: [{ label: 'Fabrics', page_id: 'fabrics', children: [] }, { label: 'Guides', page_id: 'guides', children: [{ label: 'One', page_id: 'guide-1', children: [] }] }],
  };
  const handoff = { pages: [{ page_id: 'fabrics', status: 'withheld', reason: '08_table' }, { page_id: 'guides', status: 'withheld' }, { page_id: 'home', status: 'frozen' }] };
  const marked = handoffStatuses(plan, handoff);
  assert.deepEqual(marked.pages.map((page) => page.withheld ?? null), [null, '08_table', 'withheld', null]);
  assert.equal(handoffStatuses(plan, null), plan);
  assert.deepEqual(siteNavFromPlan(marked).header, [{ label: 'Guides', route: null, children: [{ label: 'One', route: '/guides/one/', children: [] }] }]);
});

test("a nav_only page of the handoff is a menu heading without a page, though the tree does not say so (site10's /products/ was built as a placeholder)", () => {
  const plan = { pages: [{ page_id: 'home', url: '/' }, { page_id: 'products', url: '/products/', page_type: 'products_hub' }, { page_id: 'bikini', url: '/bikini/', parent_page_id: 'products' }], header_nav: [{ label: 'Products', page_id: 'products', children: [{ label: 'Bikini', page_id: 'bikini', children: [] }] }] };
  const marked = handoffStatuses(plan, { pages: [{ page_id: 'products', status: 'nav_only' }, { page_id: 'bikini', status: 'frozen' }] });
  assert.deepEqual(marked.pages.map((page) => page.nav_only ?? false), [false, true, false]);
  assert.deepEqual(siteNavFromPlan(marked).header, [{ label: 'Products', route: null, children: [{ label: 'Bikini', route: '/bikini/', children: [] }] }]);
});

test("the handoff's route aliases point the copy's links at the plan's routes, and nothing else changes", () => {
  const aliases = routeAliases({ route_aliases: [{ from: '/cover-ups/', to: '/cover-up-manufacturer/', page_id: 'x' }] });
  const page = { url: '/', links: [{ href: '/cover-ups/' }], sections: [{ body: 'See [our cover-ups](/cover-ups/) and [bikinis](/bikini-manufacturer/); /cover-ups/ in prose stays.' }] };
  assert.deepEqual(aliasRoutes(page, aliases), { url: '/', links: [{ href: '/cover-up-manufacturer/' }], sections: [{ body: 'See [our cover-ups](/cover-up-manufacturer/) and [bikinis](/bikini-manufacturer/); /cover-ups/ in prose stays.' }] });
  assert.equal(aliasRoutes(page, new Map()), page);
});

test('a handoff that does not check out stops the import: another schema version, contracts 08 does not hold, another block-kinds table, a package off its schema', async () => {
  const kinds = sha256((await readFile(new URL('../../config/block-kinds.json', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  const authoring = sha256(await readFile(new URL('../../config/sf-contracts/authoring.schema.json', import.meta.url)));
  assert.deepEqual(await handoffProblems({ handoff: { schema_version: 'sf/handoff/v0' } }), ['handoff.json schema_version is sf/handoff/v0, not sf/handoff/v1']);
  const handoff = { schema_version: 'sf/handoff/v1', contracts: { authoring_schema_sha256: '0'.repeat(64), block_kinds: { sha256: '1'.repeat(64), commit: 'abc1234' } } };
  const problems = await handoffProblems({ handoff, authoringPackage: { schema_version: 'sf/authoring/v1' } });
  assert.ok(problems.some((problem) => /authoring\.schema\.json is not the contract this handoff names/.test(problem)));
  assert.ok(problems.some((problem) => /planned with block-kinds 111111111111/.test(problem)));
  assert.ok(problems.some((problem) => /^handoff\.json/.test(problem)), 'the handoff is checked against its schema');
  assert.ok(problems.some((problem) => /^the authoring package/.test(problem)), 'and so is the package');
  // The fingerprints 08 holds raise nothing on their own.
  const clean = await handoffProblems({ handoff: { ...handoff, contracts: { authoring_schema_sha256: authoring, block_kinds: { sha256: kinds } } }, authoringPackage: { schema_version: 'sf/authoring/v1' } });
  assert.ok(!clean.some((problem) => /contract this handoff names|planned with block-kinds/.test(problem)));
});

test("the handoff's identity file must be the one it names by sha256", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'handoff-identity-'));
  await mkdir(join(dir, 'package/identity'), { recursive: true });
  await writeFile(join(dir, 'package/identity/project.yaml'), 'site_name: Strandmill\n');
  const named = (sha) => ({ schema_version: 'sf/handoff/v1', identity: { project_yaml: 'package/identity/project.yaml', project_yaml_sha256: sha } });
  const identityProblems = async (handoff) => (await handoffProblems({ handoff, authoringPackage: {}, dir })).filter((problem) => /^package\/identity\//.test(problem));
  assert.deepEqual(await identityProblems(named(sha256('site_name: Strandmill\n'))), []);
  assert.deepEqual(await identityProblems(named('0'.repeat(64))), ['package/identity/project.yaml is not the file the handoff names']);
  assert.deepEqual(await identityProblems({ ...named('0'.repeat(64)), identity: { project_yaml: 'package/identity/gone.yaml', project_yaml_sha256: '0'.repeat(64) } }), ['package/identity/gone.yaml is missing']);
});

test("a handoff naming an earlier contract version 08 keeps is checked against it; one 08 does not hold is refused (2026-11-17)", async () => {
  const { contractBytes } = await import('../lib/sf-handoff.mjs');
  const { createHash } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const contracts = 'config/sf-contracts';
  const current = await readFile(`${contracts}/authoring.schema.json`);
  assert.equal(sha(await contractBytes(contracts, 'authoring.schema.json', sha(current))), sha(current), 'the current copy');
  const kept = '35ab40678795d9e7f8cb59e6c70ccc67fdb52c2c976e5f4281510e255fc3313e';
  assert.equal(sha(await contractBytes(contracts, 'authoring.schema.json', kept)), kept, "the version the 16408acb packages name");
  assert.equal(await contractBytes(contracts, 'authoring.schema.json', 'f'.repeat(64)), null, 'a version 08 does not hold');
  assert.equal(sha(await contractBytes(contracts, 'authoring.schema.json')), sha(current), 'none named: the current copy');
});
