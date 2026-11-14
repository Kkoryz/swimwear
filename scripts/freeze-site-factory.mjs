#!/usr/bin/env node

// Freezes what stage 08 builds from a Site Factory project into one snapshot folder (site.json siteFactory): the
// authoring package (07_1_draft), the site tree (04_1_site_tree) and its routes (06_1_plan), the main keywords
// (05_3_page_keywords), facts.yaml and the capabilities (05_7_facts), and pages.json, the whole site's plan made from
// the tree and its routes (lib/site-tree.mjs). Site Factory's folder names live here only (its stage numbering as of
// beta 0.0.0.5, 2026-10-24). The folder is named by the content hash of every file it freezes: unchanged inputs give
// the existing snapshot back, changed ones (a new tree, a rewritten page) a new folder; a snapshot is never overwritten.
// Site Factory's project is only read. site:run freezes by itself when site.json names the project (siteFactoryProject).
// Usage: node scripts/freeze-site-factory.mjs --project <site-factory project> --out <freeze folder>/<line>

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { handoffStatuses } from './lib/sf-handoff.mjs';
import { sitePlanFromTree } from './lib/site-tree.mjs';

// Snapshot file name -> its place in the Site Factory project; optional ones may be missing.
export const SNAPSHOT_FILES = Object.freeze({
  'authoring_package.json': 'artifacts/07_1_draft/authoring_package.json',
  'tree.json': 'artifacts/04_1_site_tree/tree.json',
  'site_plan.json': 'artifacts/06_1_plan/site_plan.json',
  'keywords.json': 'artifacts/05_3_page_keywords/keywords.json',
  'facts.yaml': 'facts.yaml',
  'capabilities.json': 'artifacts/05_7_facts/capabilities.json',
  'slot-manifest.json': 'slot-manifest.json',
  // 07's run record (its frozen pages, code version), read beside the package by the importer.
  'manifest.json': 'artifacts/07_1_draft/manifest.json',
  // A Site Factory handoff (sf handoff: the project is its package/ folder): its page statuses, route aliases and
  // contract fingerprints (lib/sf-handoff.mjs).
  'handoff.json': '../handoff.json',
  // The identity it delivers, at its path from the handoff, which the snapshot stands for (lib/sf-handoff.mjs checks it).
  'package/identity/project.yaml': 'identity/project.yaml',
  // What the owner must supply or confirm before launch (sf/handoff-owner-todo/v1): its blocking items hold release
  // (proof-signoff.mjs ownerTodoItems).
  'owner-todo.json': '../owner/todo.json',
});
export const OPTIONAL = new Set(['keywords.json', 'capabilities.json', 'slot-manifest.json', 'manifest.json', 'handoff.json', 'package/identity/project.yaml', 'owner-todo.json']);

// The project's places of the files a snapshot cannot be made without.
export const missingProjectFiles = (project) => Object.entries(SNAPSHOT_FILES).filter(([name, path]) => !OPTIONAL.has(name) && !existsSync(resolve(project, path))).map(([, path]) => path);

// The whole site's plan (the snapshot's pages.json) from the project's tree and its routes, made in memory: the input
// check (check-inputs.mjs) runs it before anything is frozen. A page the package types itself (page_type: a legal page
// is privacy) takes that type.
// navOnly (site.json): tree pages the owner leaves unbuilt, kept as menu headings, as a handoff's nav_only status does
// (owner 2026-11-14, Strandmill: the /products/ and /solutions/ hubs the package has no copy for, "先不建").
export async function projectPlan(project, { navOnly = [] } = {}) {
  const read = (name) => (existsSync(resolve(project, SNAPSHOT_FILES[name])) ? readJson(resolve(project, SNAPSHOT_FILES[name])) : null);
  const pageTypes = new Map(((await read('authoring_package.json'))?.pages ?? []).filter((page) => page.page_type).map((page) => [page.page_id, page.page_type]));
  const handoff = await read('handoff.json');
  const plan = sitePlanFromTree({ tree: await read('tree.json'), sitePlan: await read('site_plan.json'), keywords: await read('keywords.json'), pageTypes });
  const unknown = navOnly.filter((id) => !plan.pages.some((page) => page.page_id === id));
  if (unknown.length) throw new Error(`site.json navOnly names ${unknown.join(', ')}, which the site tree does not have`);
  const owned = navOnly.map((page_id) => ({ page_id, status: 'nav_only' }));
  return handoffStatuses(plan, owned.length ? { ...handoff, pages: [...(handoff?.pages ?? []), ...owned] } : handoff);
}

export async function freezeSiteFactory({ project, out, navOnly = [] }) {
  const missing = missingProjectFiles(project);
  if (missing.length) throw new Error(`${project} lacks ${missing.join(', ')}`);
  const hash = createHash('sha256');
  for (const [name, path] of Object.entries(SNAPSHOT_FILES)) if (existsSync(resolve(project, path))) hash.update(name).update(await readFile(resolve(project, path)));
  // The owner's menu headings make a snapshot of their own; none leaves the hash as it was.
  if (navOnly.length) hash.update('navOnly').update(JSON.stringify([...navOnly].sort()));
  const version = hash.digest('hex').slice(0, 10);
  const folder = resolve(out, `s07-${version}`);
  // The same inputs were frozen before: that snapshot is the one (complete: pages.json is written last).
  if (existsSync(resolve(folder, 'pages.json'))) return { folder, version, existed: true };
  if (existsSync(folder)) throw new Error(`${folder} is an unfinished snapshot: remove it and freeze again`);
  // The whole site's plan from the tree and its routes, before anything is copied (a broken tree freezes nothing).
  const plan = await projectPlan(project, { navOnly });
  await mkdir(folder, { recursive: true });
  const copied = [];
  for (const [name, path] of Object.entries(SNAPSHOT_FILES)) {
    if (!existsSync(resolve(project, path))) continue;
    await mkdir(dirname(resolve(folder, name)), { recursive: true });
    await copyFile(resolve(project, path), resolve(folder, name));
    copied.push(name);
  }
  await writeJson(resolve(folder, 'pages.json'), plan);
  return { folder, version, existed: false, files: [...copied, 'pages.json'], pages: plan.pages.length };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ project: { type: 'string' }, out: { type: 'string' } });
  if (!values.project || !values.out) return usage('Usage: node scripts/freeze-site-factory.mjs --project <site-factory project> --out <freeze folder>/<line>');
  const result = await freezeSiteFactory({ project: resolve(values.project), out: resolve(values.out) });
  console.log(result.existed ? `${result.folder}: already frozen (unchanged inputs)` : `${result.folder} (${result.pages} pages): ${result.files.join(', ')}\nset site.json "siteFactory" to this folder`);
});
