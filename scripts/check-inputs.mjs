#!/usr/bin/env node

// The site's inputs checked before site:run starts any step (no browser, no network, no model, nothing written): each
// check is an error a later step threw on its inputs, minutes to half an hour into a run. Every check calls the code
// that throws (or its rule) rather than a copy of it, so the two cannot drift apart. Paths in site.json are absolute
// or relative to the site's root. With siteFactoryProject the site plan is made in memory from the project, as the
// run's freeze makes it (freeze-site-factory.mjs projectPlan), so this can run before the freeze; else the snapshot
// site.json names (siteFactory) is read.
// Usage: node scripts/check-inputs.mjs [siteRoot]   (default: the current folder; exit 1 when a check fails)

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parsePageArgs } from './capture-reference-pages.mjs';
import { normalizeReferenceUrl } from './capture-reference.mjs';
import { SNAPSHOT_FILES, missingProjectFiles, patchedProject, projectPlan } from './freeze-site-factory.mjs';
import { BRAND_FILES, imageSize, projectIdentity } from './import-brand-kit.mjs';
import { BUILT_STATUSES, SUPPORTED_PACKAGE_SCHEMA } from './import-site-factory.mjs';
import { KIND_TO_CLASS } from './import-site-media.mjs';
import { identityErrors, identityFromFiles } from './lib/brand-kit.mjs';
import { runMain } from './lib/cli.mjs';
import { factsFromFile } from './lib/facts.mjs';
import { readJson, readText } from './lib/json-io.mjs';
import { readPackagePatches } from './lib/package-patches.mjs';
import { captureFolder } from './lib/rules.mjs';
import { CORE_MANIFEST, coreSourceOf } from './lib/template-core.mjs';
import { aliasRoutes, handoffProblems, routeAliases } from './lib/sf-handoff.mjs';
import { isKindPage, verifyKindFacts, withSiteModules } from './lib/sf-kinds.mjs';
import { pageFactsOf, verifySectionFacts, verifyStructured } from './lib/sf-structured.mjs';
import { siteNavFromPlan } from './lib/site-plan.mjs';
import { DEFAULT_TRADE } from './lib/trade.mjs';
import { suppliedKit } from './site-brand.mjs';

// The files a frozen snapshot must hold: site-run's import and proof steps pass them by name (--package, --pages-plan,
// --facts) and fail on a missing one only when they get there.
export const SNAPSHOT_REQUIRED = Object.freeze(['authoring_package.json', 'pages.json', 'facts.yaml']);

// The trade's config files the steps read from the site's config/ (lib/trade.mjs tradeConfigPath names them; an
// unknown trade fails there rather than falling back to clothing): wording (import), image-briefs (patterns, images),
// demo-proof (proof, handoff) for every trade, blueprint-wording (patterns) for a trade other than the default.
export const TRADE_FILES = Object.freeze(['wording', 'image-briefs', 'demo-proof']);
// The words the importer requires of the trade's wording file (import-site-factory.mjs runImport).
export const WORDING_KEYS = Object.freeze(['relatedHeading', 'caseHeading', 'caseLink']);

const message = (error) => error?.message ?? String(error);

// Every problem with the site's inputs: [{ check, detail }], empty when the run may start.
export async function inputProblems({ root = process.cwd(), site }) {
  const problems = [];
  const add = (check, detail) => problems.push({ check, detail });
  const at = (path) => resolve(root, path);

  // site-run.mjs steps() throws at once on a site that shows the competitor's photos (owner 2026-11-12).
  if ((site.images ?? 'generate') !== 'generate') add('images', `site.json images: "${site.images}": a site makes its own photos ("generate"); the competitor's are never shown (owner 2026-11-12)`);
  // The preview steps serve dist on site.port (http://127.0.0.1:${site.port}/): without one the style board, the
  // audits and the design shots open http://127.0.0.1:undefined/, half an hour into the run.
  if (!Number.isInteger(site.port) || site.port < 1 || site.port > 65535) add('port', `site.json port must be a port number (the preview steps serve the site on it), got: ${JSON.stringify(site.port)}`);
  // The images step passes --line site.line to plan-images.mjs: a missing line is no argument at all (spawn refuses
  // a non-string), late in the run.
  if (typeof site.line !== 'string' || !site.line.trim()) add('line', 'site.json line must name the line\'s product (the images step passes it to plan-images.mjs --line)');

  // site-run.mjs adds the core step only where template-core.json's source still holds the template: else the whole run
  // uses the site's last copy of the template and says nothing (a site made by hand has no manifest).
  const core = await readJson(at(CORE_MANIFEST), null);
  if (core && !coreSourceOf(root, core)) add('template-core', `template-core.json source "${core.source}" holds no scripts/sync-template-core.mjs: the run would skip the core step and use the site's own copy of template commit ${core.commit ?? '(unknown)'}; point source at the template repository`);

  await referenceProblems(site, add);
  await identityProblems(at, site, add);
  await tradeProblems(at, site, add);
  await siteFactoryProblems(root, at, site, add);
  return problems;
}

// The reference pages as the capture step gets them. rm r1 ("expected <type>=/path/, got: blog_hub=/press") and
// motel run1 (blog_hub=/news/): site-run passes `${captureFolder(type)}=${path}` to capture-reference-pages.mjs, whose
// parsePageArgs takes a lower-case type of letters, digits and hyphens and a path on the reference's origin; blog_hub
// fails it after the home page's whole capture. The same function checks every entry here.
async function referenceProblems(site, add) {
  const reference = site.reference;
  if (!reference || typeof reference.origin !== 'string' || !reference.pages || typeof reference.pages !== 'object' || !Object.keys(reference.pages).length) {
    add('reference', 'site.json reference needs an origin and pages ({ page type: path }): steps() reads both before any step runs');
    return;
  }
  try { normalizeReferenceUrl(reference.origin); } catch (error) { add('reference', `site.json reference.origin ${reference.origin}: ${message(error)}`); return; }
  for (const [type, path] of Object.entries(reference.pages)) {
    try { parsePageArgs(reference.origin, [`${captureFolder(type)}=${path}`]); } catch (error) { add('reference-pages', `site.json reference.pages.${type}: ${message(error)}`); }
  }
  // steps() makes a URL of each of these on the origin (the density and article steps): one that does not parse
  // throws in steps() itself.
  const others = [
    ...(reference.article != null ? [['reference.article', reference.article]] : []),
    ...(site.densityPages ?? []).map((path, index) => [`densityPages[${index}]`, path]),
    ...Object.entries(site.densityPageTypes ?? {}).flatMap(([type, paths]) => [paths].flat().map((path) => [`densityPageTypes.${type}`, path])),
  ];
  for (const [where, path] of others) {
    try { new URL(path, reference.origin); } catch { add('reference-urls', `site.json ${where}: ${JSON.stringify(path)} is not a URL or a path on ${reference.origin}`); }
  }
}

// The brand step (site-brand.mjs) and the site-media step read site.json identity.
async function identityProblems(at, site, add) {
  if (typeof site.identity !== 'string' || !site.identity.trim()) { add('identity', 'site.json identity must name the brand kit folder (the one holding project.yaml)'); return; }
  const project = at(site.identity);
  // rm r2 ("project.yaml needs site_name and web_domain"): the brand step reads the name and the domain from it,
  // after the capture, the analysis and the treatment.
  const yaml = await readText(resolve(project, 'project.yaml'), null);
  if (yaml === null) add('identity', `${resolve(project, 'project.yaml')} is missing: the brand step reads site_name and web_domain from it`);
  else {
    try { projectIdentity(yaml); } catch (error) { add('identity', `${resolve(project, 'project.yaml')}: ${message(error)}`); }
  }
  // A missing brand/ folder is no failure (site-brand.mjs draws a wordmark, else typesets one). A folder with a logo is
  // brought in as it is, and import-brand-kit.mjs refuses a kit the site identity would be incomplete with: the same
  // identity is made here from the same files, without copying them.
  if (await suppliedKit(project)) {
    const brandDir = resolve(project, 'brand');
    const present = new Set(await readdir(brandDir));
    const files = {};
    for (const name of BRAND_FILES.filter((file) => present.has(file))) files[name] = imageSize(name, await readFile(resolve(brandDir, name))) ?? {};
    // The name and the domain are checked above (project.yaml); only the kit's files are judged here.
    const errors = identityErrors(identityFromFiles({ siteName: 'check', origin: 'https://example.com', source: 'stage-00', files }));
    if (errors.length) add('brand-kit', `${brandDir}: stage 00 brand kit is incomplete: ${errors.join('; ')}`);
  }
  // import-site-media.mjs refuses a photo of an unknown kind, without alt text, or with pages that are not routes, and
  // fails on a file that is not there (no media/media.json is no failure: the project has no photos of its own).
  const media = await readJson(resolve(project, 'media/media.json'), null).catch((error) => { add('site-media', `${resolve(project, 'media/media.json')}: ${message(error)}`); return null; });
  if (!media) return;
  if (media.schema_version !== 'sf/media/v1') { add('site-media', `unsupported media schema: ${media.schema_version}`); return; }
  for (const photo of media.photos || []) {
    if (!KIND_TO_CLASS[photo.kind]) add('site-media', `${photo.file}: unknown photo kind ${photo.kind}`);
    if (!photo.alt?.trim()) add('site-media', `${photo.file}: alt text is required`);
    if (photo.pages != null && !(Array.isArray(photo.pages) && photo.pages.every((route) => /^\/.*\/$|^\/$/.test(route)))) add('site-media', `${photo.file}: pages must list routes like /bikini/`);
    if (!existsSync(resolve(project, 'media', String(photo.file)))) add('site-media', `${photo.file}: the photo file is missing from ${resolve(project, 'media')}`);
  }
}

// The trade's config files in the site's config/ (site-run lists config/blueprint-wording.<trade>.json and
// config/demo-proof.<trade>.json among its steps' inputs): a trade without one fails the patterns, proof or import step.
async function tradeProblems(at, site, add) {
  const trade = site.trade ?? DEFAULT_TRADE;
  const file = (name) => `config/${trade === DEFAULT_TRADE ? `${name}.json` : `${name}.${trade}.json`}`;
  for (const name of [...TRADE_FILES, ...(trade === DEFAULT_TRADE ? [] : ['blueprint-wording'])]) {
    if (!existsSync(at(file(name)))) add('trade-config', `site.json trade "${trade}" has no ${file(name)}`);
  }
  const wording = await readJson(at(file('wording')), null).catch(() => null);
  for (const key of WORDING_KEYS) if (wording && !wording[key]) add('trade-config', `${file('wording')} has no ${key}`);
}

// Where each Site Factory input is: the project's own place (siteFactoryProject, which the run freezes first) or the
// snapshot's file. null when the run cannot get that far.
async function siteFactorySource(root, at, site, add) {
  if (site.siteFactoryProject) {
    // site-run.mjs freezeForRun throws before the first step without the folder the snapshots go to.
    if (!site.siteFactoryFreeze) add('site-factory', 'site.json names siteFactoryProject but not siteFactoryFreeze (the folder its snapshots go to)');
    const project = at(site.siteFactoryProject);
    const missing = missingProjectFiles(project);
    if (missing.length) { add('site-factory', `${project} lacks ${missing.join(', ')}`); return null; }
    // motel full-run6 ("site plan has no route for c-c48d984954c3:service"): the freeze makes the site plan from the
    // tree and its routes (lib/site-tree.mjs sitePlanFromTree), and a tree page without a route, a route without a
    // tree page, a page under one not built, or a page type the template lacks stops it. The same plan is made here.
    let pagesPlan;
    // With the site's own patches (content/package-patches/), as the freeze applies them.
    let patches;
    try { patches = await readPackagePatches(root); } catch (error) { add('package-patches', message(error)); return null; }
    try { pagesPlan = await projectPlan(project, { navOnly: site.navOnly ?? [], patches }); } catch (error) { add('site-plan', message(error)); return null; }
    const file = (name) => (existsSync(resolve(project, SNAPSHOT_FILES[name])) ? resolve(project, SNAPSHOT_FILES[name]) : null);
    return { file, pagesPlan, ...(patches.length ? { authoringPackage: (await patchedProject(project, patches)).authoringPackage } : {}) };
  }
  if (typeof site.siteFactory !== 'string' || !site.siteFactory.trim()) { add('site-factory', 'site.json needs siteFactory (a frozen snapshot folder) or siteFactoryProject'); return null; }
  const snap = at(site.siteFactory);
  const missing = SNAPSHOT_REQUIRED.filter((name) => !existsSync(resolve(snap, name)));
  if (missing.length) { add('site-factory', `the Site Factory snapshot ${snap} lacks ${missing.join(', ')}`); return null; }
  const file = (name) => (existsSync(resolve(snap, name)) ? resolve(snap, name) : null);
  try { return { file, pagesPlan: await readJson(file('pages.json')) }; } catch (error) { add('site-plan', `${file('pages.json')}: ${message(error)}`); return null; }
}

async function siteFactoryProblems(root, at, site, add) {
  const source = await siteFactorySource(root, at, site, add);
  if (!source) return;
  const { file, pagesPlan, authoringPackage: patchedPackage } = source;
  if (!Array.isArray(pagesPlan?.pages)) { add('site-plan', 'the site plan (pages.json) has no pages list'); return; }
  // scaffold-placeholder-pages.mjs (patterns step, after the capture's browser work) and competitor-blueprint.mjs
  // (import step) throw "the site plan has no contact page": every placeholder's call to action links to it.
  if (!pagesPlan.pages.some((page) => page.page_type === 'contact')) add('contact-page', 'the site plan has no contact page');
  // Both write the menus from the plan (lib/site-plan.mjs siteNavFromPlan), which throws on a menu entry naming a page
  // the plan does not have.
  try { siteNavFromPlan(pagesPlan); } catch (error) { add('navigation', message(error)); }

  let authoringPackage;
  try { authoringPackage = patchedPackage ?? await readJson(file('authoring_package.json')); } catch (error) { add('package', `authoring_package.json: ${message(error)}`); return; }
  // The import step checks a handoff beside the package against Site Factory's contracts (config/sf-contracts/) and
  // the block-kinds table before anything is imported (import-site-factory.mjs runImport), then points the copy's
  // links at the handoff's route aliases.
  const handoffPath = file('handoff.json');
  const handoff = handoffPath ? await readJson(handoffPath).catch((error) => { add('handoff', `${handoffPath}: ${message(error)}`); return null; }) : null;
  if (handoff) {
    try {
      for (const problem of await handoffProblems({ handoff, authoringPackage, root, dir: dirname(handoffPath) })) add('handoff', problem);
    } catch (error) { add('handoff', message(error)); }
  }
  // The importer's checks of the package itself (import-site-factory.mjs importSiteFactory), in its order.
  if (authoringPackage?.schema_version !== SUPPORTED_PACKAGE_SCHEMA) { add('package', `unsupported authoring package schema: ${authoringPackage?.schema_version}`); return; }
  let pkg;
  try { pkg = withSiteModules(handoff ? aliasRoutes(authoringPackage, routeAliases(handoff)) : authoringPackage); } catch (error) { add('package', message(error)); return; }
  for (const key of ['page_id', 'url']) {
    const seen = new Set();
    for (const item of pkg.pages) {
      if (seen.has(item[key])) add('package', `the authoring package has two pages with ${key} ${item[key]}`);
      seen.add(item[key]);
    }
  }
  const ids = new Set(pkg.pages.map((item) => item.page_id));
  for (const item of pkg.pages) if (item.replaces && item.replaces !== item.page_id && ids.has(item.replaces)) add('package', `${item.page_id} replaces ${item.replaces}, which is still in the authoring package`);

  // The facts site-run passes the importer: facts.yaml, and capabilities.json where the snapshot has it.
  let facts = new Map();
  for (const name of ['facts.yaml', 'capabilities.json']) {
    const path = file(name);
    if (!path) continue;
    try { facts = new Map([...facts, ...factsFromFile(path, await readText(path))]); } catch (error) { add('facts', `${path}: ${message(error)}`); }
  }
  const byUrl = new Map(pagesPlan.pages.map((item) => [item.url, item]));
  for (const page of pkg.pages) {
    if (!BUILT_STATUSES.includes(page.release_status)) continue;
    // Every page the package builds needs its route in the site plan ("<page_id>: url <url> is not in the site plan").
    const planned = byUrl.get(page.url);
    if (!planned) { add('package-routes', `${page.page_id}: url ${page.url} is not in the site plan`); continue; }
    if (planned.page_type === 'blog_hub') continue;
    // Every fact a built page cites must exist, be approved where it must, and state the figure shown with it.
    try {
      const own = pageFactsOf(page, facts);
      verifySectionFacts(page, own);
      if (isKindPage(page)) verifyKindFacts(page, own);
      if (page.structured) verifyStructured(page.page_id, page.structured, own);
    } catch (error) { add('facts', message(error)); }
  }
}

runMain(import.meta.url, async () => {
  const root = resolve(process.argv.slice(2).find((arg) => arg !== '--') ?? '.');
  const started = Date.now();
  const site = await readJson(resolve(root, 'site.json'), null);
  const problems = site ? await inputProblems({ root, site }) : [{ check: 'site-json', detail: `${resolve(root, 'site.json')} is missing` }];
  if (problems.length) {
    for (const { check, detail } of problems) console.error(`${check}: ${detail}`);
    console.error(`check-inputs: ${problems.length} problem(s) in ${root} (${Date.now() - started} ms)`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-inputs: OK (${root}, ${Date.now() - started} ms)`);
});
