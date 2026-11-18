#!/usr/bin/env node

// One command for one site, stages 08 to 11: every step in order, each skipped while its inputs are unchanged since it
// last passed, logs in .pipeline/logs, state in .pipeline/state.json. A step only a person or an agent can do (the
// reference analysis and treatment, image approval, the owner's sign-off) stops the run with exit code 2 and says what
// it waits for; a failing step stops it with exit code 1. The site's inputs are in site.json:
//   { "reference": { "origin": "https://…", "pages": { "home": "/", "about": "/about/", "contact": "/contact/",
//       "product_manufacturer": "/…/", "product_wholesale": "/…/", "solution": "/…/" } },
//     "siteFactoryProject": "<Site Factory project>", "siteFactoryFreeze": "<folder its snapshots go to>",
//     "siteFactory": "<frozen stage 07 snapshot folder>", "identity": "<brand kit folder>", "line": "activewear",
//     "port": 4324, "images": "generate", "agent": "codex" }
// With siteFactoryProject, every run freezes the project first and points siteFactory at the snapshot (unchanged
// inputs: the same snapshot). The judgment steps (reference analysis, section modules, treatment, design review) are
// done by Codex (lib/agent-step.mjs, config/agent-steps/); "agent": "none" leaves them to a person (the run waits).
// The design is settled before the pages are: the treatment, then the copy imported, then the style board (every
// module with our longest and shortest copy, reviewed module by module), then the pages and their review.
// images: "generate" (the default) makes the site's own library (Codex, at most 12 photos a run) once the style board
// has passed on grey frames. The competitor's photos are never shown on a site (owner 2026-11-12: "因为你盲目的塞了竞品的
// 图 这个必须避免"): "reference", which showed them as placeholders, is refused.
// trade (default "apparel"): a service business names "service" (lib/trade.mjs): its photos are scenes of its work,
// each section's planned from the page's copy (the photo-briefs step), its stand-in proof and placeholder purposes in its
// words; siteKind says what the site is in the image prompts and imageSubjects (by class) the scenes of its trade.
// Each site keeps its own local git repository (lib/site-repo.mjs): a commit after every step that changed files.
// Two modes (Fable's 11-17 plan, 5.1; owner 2026-11-17, site13's 40-minute run): a certification run (the default)
// runs every step that is due, model calls and photos included, and is the only one that records the verified build;
// --iterate runs the build and the deterministic checks only (the audits measure the pages whose output changed): no
// model is called (lib/model-calls.mjs refuses one), no photo made, no review read, nothing verified.
// Every run ends with its summary: each step that ran, why (the inputs that changed), its seconds and its model calls
// (.pipeline/runs/<run>.json).
// Usage: node scripts/site-run.mjs [--iterate] [--from <step>] [--to <step>] [--list]

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeSiteFactory } from './freeze-site-factory.mjs';
import { readPackagePatches } from './lib/package-patches.mjs';
import { siteRules, stripProtected } from './lib/protected-rules.mjs';
import { REVIEW_RULES, REVIEW_SCHEMA, SCOPES, SEVERITIES, blockIdRules, minorFindings, openFindings, readReviews, reviewCurrent, reviewKey } from './design-review.mjs';
import { AGENT_UNAVAILABLE, imagesIn, runAgentStep } from './lib/agent-step.mjs';
import { codeClosure } from './lib/module-graph.mjs';
import { sourceDigest } from './lib/source-norm.mjs';
import { coreSourceOf } from './lib/template-core.mjs';
import { serveStatic } from './lib/static-server.mjs';
import { isProcessCrash, takeRunLock } from './lib/audit-runtime.mjs';
import { AUDIT_OWNERS, byOwner } from './lib/issue-owners.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { NO_MODELS, modelCallsOf } from './lib/model-calls.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { changedFiles, changedSince, commitSite, ensureSiteRepo, headCommit, ownedBy, restoreFrom, restoreOutside } from './lib/site-repo.mjs';
import { agentKey, recordAnswer, restoreAnswer } from './lib/agent-cache.mjs';
import { captureFolder } from './lib/rules.mjs';
import { DENSITY_EXEMPT_PAGE_TYPES } from './lib/density.mjs';
import { FOCUS_BATCH, focusPath, photosInUse } from './lib/photo-focus.mjs';
import { navigationProblems } from './lib/navigation-problems.mjs';
import { lockPalette, offPalette, stylesheetColours } from './lib/visual-checks.mjs';
import { latestAudit, llmAuditOn } from './lib/claude-seo-audit.mjs';

const node = (script, ...args) => ['node', `scripts/${script}`, ...args];
// The exit code of a command that ran and now waits for a person (preflight holds, a release build refusing reference
// photos); any other non-zero code is a failure.
export const WAITS = 2;
// pnpm is a .cmd script on Windows: run through cmd.exe with its arguments as given (no shell string).
const pnpm = (...args) => (process.platform === 'win32' ? [process.env.ComSpec ?? 'cmd.exe', '/d', '/c', 'pnpm', ...args] : ['pnpm', ...args]);

// Steps in order. inputs: files and folders whose content decides whether the step must run again ("site.json#reference":
// only those top-level fields of a JSON file, so pointing the site at a new Site Factory snapshot does not capture the
// reference again). done: what must exist for a step a person or an agent does.
// What the layout plan reads (plan-layout.mjs planSite): the pages, the site's choices and model, the trust bar's figures
// (each page's estimate counts its bar), the heading measures of the last audit: its results only (the report's port
// and its count of pages reused change every run, and planned, calibrated and shot the style board again each time:
// owner 2026-11-17, site13's 40-minute run). The treatment's stylesheet sets the hero title's face, whose real widths
// fit the title (heading-fit.mjs titleMetrics, 2026-11-18).
const PLAN_INPUTS = Object.freeze(['src/data/authoring-pages.json', 'src/data/placeholder-pages.json', 'src/data/blog-posts.json', 'src/data/photo-briefs.json', 'src/data/template-variants.json', 'src/data/phone-heroes.json', 'src/data/page-figures.json', 'src/data/site-trust.json', 'site.json#trade', 'docs/research/authoring-layout-audit.json#results', 'src/styles/reference.css', 'code:scripts/plan-layout.mjs']);

export function steps(site, { coreSource = null } = {}) {
  const snap = site.siteFactory;
  // Capture folders are named manufacturer and wholesale (lib/rules.mjs); the pattern scaffold takes page types and full URLs.
  const captures = Object.entries(site.reference.pages).map(([type, path]) => `${captureFolder(type)}=${path}`);
  const references = Object.entries(site.reference.pages).map(([type, path]) => `${type}=${new URL(path, site.reference.origin).href}`);
  const densityUrls = densityTargets(site);
  // The capabilities are optional facts (a snapshot without them imports with facts.yaml alone).
  const facts = ['facts.yaml', 'capabilities.json'].filter((name) => name === 'facts.yaml' || existsSync(`${snap}/${name}`)).flatMap((name) => ['--facts', `${snap}/${name}`]);
  const importArgs = ['--package', `${snap}/authoring_package.json`, '--pages-plan', `${snap}/pages.json`, ...facts];
  // Site Factory's owner to-do, where the handoff has one: its blocking items join the release sign-off.
  const ownerTodo = existsSync(`${snap}/owner-todo.json`) ? ['--owner-todo', `${snap}/owner-todo.json`] : [];
  // What the judgment steps look at: the competitor's full pages, or one page type's section crops per run.
  const referenceShots = async (root) => (await Promise.all(Object.keys(site.reference.pages).map((type) => imagesIn(resolve(root, 'docs/research/reference-pages', captureFolder(type), 'design-references'))))).flat();
  // The crops of the reference's page types only (a page type the site no longer has keeps its folder).
  const pageTypes = Object.keys(site.reference.pages);
  const crops = async (root) => {
    const dir = resolve(root, 'docs/research/pattern-sections');
    const types = pageTypes.filter((pageType) => existsSync(resolve(dir, pageType))).sort();
    return Promise.all(types.map(async (pageType) => ({ values: { pageType }, images: await imagesIn(resolve(dir, pageType)) })));
  };
  // The review runs: only the pages whose shots changed since their review (after a repair, the ones it touched). A
  // run's pageType is the review's key (<key>.review.json: the page type, or <type>--shortest).
  // The site's own layout rules, in every review and repair (config/agent-steps {{siteRules}}, lib/protected-rules.mjs
  // siteRules): a review that knows them does not ask to copy the competitor's fixed values where the template decided
  // otherwise, and a repair does not write them (the hotel site's repairs set titles and photos back to the competitor's).
  const rulesOf = async (root) => siteRules((await readJson(resolve(root, 'src/data/template-variants.json'), null))?.components ?? {});
  const reviewRuns = async (root) => {
    const manifest = await readJson(resolve(root, 'docs/research/design-review/manifest.json'));
    const reviews = await readReviews(root, manifest);
    const siteRules = await rulesOf(root);
    return manifest.pages.filter((page) => !reviewCurrent(page, reviews[reviewKey(page)])).map((page) => ({ values: { pageType: reviewKey(page), route: page.route, siteRules, shots: page.shots, rules: page.rules, images: page.images.join(', ') }, images: page.images.map((path) => resolve(root, path)) }));
  };
  // The style board's review runs: one per module whose shots changed (the same instructions as a page's review; the
  // route names the module and says when no competitor section shows it).
  const boardRuns = async (root) => {
    const manifest = await readJson(resolve(root, 'docs/research/design-review/manifest.json'));
    const board = manifest.board ?? [];
    const reviews = await readReviews(root, manifest, board);
    const siteRules = await rulesOf(root);
    return board.filter((entry) => !reviewCurrent(entry, reviews[entry.key])).map((entry) => ({ values: { pageType: entry.key, route: `${entry.route} (the style board: module ${entry.module}, longest and shortest copy, photos as grey frames${entry.unbacked ? '; no competitor section shows this module' : ''})`, siteRules, shots: entry.shots, rules: entry.rules, images: entry.images.join(', ') }, images: entry.images.map((path) => resolve(root, path)) }));
  };
  // What a trade other than the default adds to the image steps' inputs (an apparel site's steps keep their inputs, so
  // their recorded state stays current).
  const tradeInputs = (site.trade ?? 'apparel') !== 'apparel' ? ['src/data/photo-briefs.json', 'site.json#trade,siteKind,imageSubjects'] : [];
  // Every trade plans its section photos from its pages' copy before any photo is made (owner 2026-11-17, aloha: a
  // clothing site's stock subjects drew "a model wearing packaging" and 44 photos off their pages' subjects): the
  // briefs are an input of the photo steps on every site.
  const briefInputs = ['src/data/photo-briefs.json'];
  const briefsConfig = `config/image-briefs${(site.trade ?? 'apparel') === 'apparel' ? '' : `.${site.trade}`}.json`;
  if ((site.images ?? 'generate') !== 'generate') throw new Error(`site.json images: "${site.images}": a site makes its own photos ("generate"); the competitor's are never shown (owner 2026-11-12)`);
  const generate = true;
  return [
    // The template core first, every run: the site gets this template's latest scripts, components and styles (the
    // repository it was made from, template-core.json source).
    ...(coreSource ? [{ id: 'core', kind: 'auto', always: true, inputs: [], run: [['node', `${coreSource}/scripts/sync-template-core.mjs`, '--committed', '.']] }] : []),
    // The site's inputs checked in seconds before anything costs (check-inputs.mjs: the reference's page types, the
    // identity's project.yaml, the site plan against the package, the trade's config; Fable's 08-onward plan 2026-11-14:
    // hotel-rm's r1, r2 and r4 and motel's run1 and full-run6 failed on such inputs 2 to 33 minutes into their runs). After
    // the core: its checks read the site's config/.
    { id: 'inputs', kind: 'auto', always: true, inputs: [], run: [node('check-inputs.mjs', '.')] },
    // adopt: a site captured before site:run tracked it keeps its capture (no second visit to the competitor's site).
    { id: 'capture', kind: 'auto', inputs: ['site.json#reference'], adopt: ['docs/research/raw/capture-summary.json'], run: [node('capture-reference.mjs', site.reference.origin), node('capture-reference-pages.mjs', site.reference.origin, ...captures)] },
    // The competitor's density right after its capture: it needs nothing but the competitor's pages, and the capture's
    // check reads it.
    { id: 'density', kind: 'auto', inputs: ['site.json#reference,densityPages,densityPageTypes', 'code:scripts/measure-reference-density.mjs'], run: [node('measure-reference-density.mjs', ...densityUrls)] },
    // The capture checked before any model looks at it (check-reference-capture.mjs): a screenshot band left blank by
    // content that fades in on scroll, a fixed banner over the page, a hero photo the density measure missed, a title it
    // could not find, a page cut into no sections (hotel-rm 2026-11-13/14: each found only after the analysis, by a
    // person). It stops the run; site.json captureWaivers excuses a page's check with a reason.
    // Of docs/design-references, the origin's shots it reads (the navigation audit writes our pages' shots beside them,
    // in routes/, every run).
    { id: 'capture-check', kind: 'auto', inputs: ['site.json#reference,captureWaivers', 'docs/research/raw', 'docs/research/reference-pages', 'docs/design-references/desktop-1440.png', 'docs/design-references/tablet-768.png', 'docs/design-references/mobile-390.png', 'code:scripts/check-reference-capture.mjs'], run: [node('check-reference-capture.mjs', '.')] },
    { id: 'analysis', kind: 'agent', prompt: 'analysis', writes: WRITES.analysis, reads: READS.analysis, runs: async (root) => [{ values: {}, images: await referenceShots(root) }], done: ['docs/research/analysis/design-lock.json', 'docs/research/analysis/media.json'], waits: 'the reference analysis (seo-site-template skill, stage 08 step 3): design-lock, font roles, media pools, components' },
    // The design lock only: the reference photos are installed once, by the images step (use-reference-media.mjs).
    // Then its colour pairs: one below WCAG AA stops the run here, named, not at the audits after the build (four-site
    // audit 2026-11-17; check-token-contrast.mjs).
    { id: 'apply-analysis', kind: 'auto', inputs: ['docs/research/analysis/design-lock.json', 'code:scripts/apply-reference-analysis.mjs', 'code:scripts/check-token-contrast.mjs'], run: [node('apply-reference-analysis.mjs', '--design-lock', 'docs/research/analysis/design-lock.json'), node('check-token-contrast.mjs', '.')] },
    // The brand once the site's colours and type are set: the project's own logo kit, else a wordmark drawn for the site.
    { id: 'brand', kind: 'auto', models: true, inputs: [site.identity, 'src/styles/global.css', 'code:scripts/site-brand.mjs'], run: [node('site-brand.mjs', '--project', site.identity)] },
    // The competitor's sections, one crop each (pattern-inventory.json), and first placeholder pages.
    { id: 'patterns', kind: 'auto', inputs: ['site.json#reference', `${snap}/pages.json`, ...(tradeInputs.length ? [`config/blueprint-wording.${site.trade}.json`, tradeInputs[1]] : []), 'code:scripts/scaffold-placeholder-pages.mjs'], run: [node('scaffold-placeholder-pages.mjs', '--pages-plan', `${snap}/pages.json`, ...references)] },
    { id: 'modules', kind: 'agent', prompt: 'modules', writes: WRITES.modules, reads: READS.modules, runs: crops, reply: moduleReply, join: (root) => joinSectionModules(root, pageTypes), done: ['docs/research/analysis/section-modules.json'], current: (root) => modulesCurrent(root, pageTypes), waits: 'the module of every competitor section (docs/research/analysis/section-modules.json, skill stage 08 step 3): read each section crop and name the template module that renders it' },
    // What the template cannot render (collect-template-gaps.mjs: the section modules' gaps, the reviews' template
    // findings, notes.md's "Template gaps"), listed in docs/research/TEMPLATE_GAPS.md every time one of them changes. A
    // layout the competitor's home or content page is largely built from (lib/template-gaps.mjs HOLD_SHARE) holds the
    // run, before the treatment, until a person decides: made in the template, or the nearest module accepted
    // (docs/research/template-gap-decisions.json).
    { id: 'template-gaps', kind: 'auto', inputs: ['docs/research/analysis/section-modules.json', 'docs/research/pattern-inventory.json', 'docs/research/template-gap-decisions.json', 'docs/research/analysis/notes.md', 'docs/research/design-review', 'code:scripts/collect-template-gaps.mjs'], run: [node('collect-template-gaps.mjs', '.', '--hold')], waitsOnExit: 'a decision on each large competitor layout the template cannot render (docs/research/TEMPLATE_GAPS.md lists them; record "template" or "accept" for each in docs/research/template-gap-decisions.json)' },
    // The template ships an empty reference.css: the treatment is done when it holds rules.
    { id: 'treatment', kind: 'agent', prompt: 'treatment', writes: WRITES.treatment, reads: READS.treatment, runs: async (root) => [{ values: {}, images: await referenceShots(root) }], done: ['src/styles/reference.css', 'docs/research/analysis/treatment.md'], ready: { 'src/styles/reference.css': hasCssRules }, current: treatmentInPalette, waits: 'the reference treatment in the design lock colours (src/styles/reference.css, template-variants.json components incl. blog), skill stage 08 step 4' },
    // The fonts by code, never by hand or agent (install-fonts.mjs): each role's family in the weights the reference
    // shows, commercial ones replaced (lib/font-licenses.mjs), downloaded from Google Fonts into public/fonts/, recorded in
    // docs/research/installed-fonts.json and declared in the generated src/styles/fonts.css. The treatment is an input:
    // @font-face rules it writes are taken out again.
    { id: 'fonts', kind: 'auto', inputs: ['docs/research/analysis/font-roles.json', 'docs/research/raw/font-lock.json', 'src/styles/reference.css', 'code:scripts/install-fonts.mjs'], run: [node('install-fonts.mjs')] },
    // The owner's proof (certificates, clients, testimonials, cases): stand-ins from the facts and config/demo-proof.json
    // when the site has none yet, listed for the owner's sign-off; an existing src/data/site-proof.json is kept.
    { id: 'proof', kind: 'auto', inputs: [`${snap}/facts.yaml`, `${snap}/authoring_package.json`, `${snap}/pages.json`, 'src/data/site-proof.json', 'config/demo-proof.json', ...(tradeInputs.length ? [`config/demo-proof.${site.trade}.json`, tradeInputs[1]] : []), 'code:scripts/scaffold-site-proof.mjs', 'code:scripts/proof-signoff.mjs'], run: [node('scaffold-site-proof.mjs', '--facts', `${snap}/facts.yaml`, '--package', `${snap}/authoring_package.json`, '--pages-plan', `${snap}/pages.json`), node('proof-signoff.mjs', ...ownerTodo)] },
    // The blueprint follows the named modules; the pages are imported on it (again when the template's import code changes).
    // Then the company behind the site from the package, the identity and the facts, stand-ins for the rest
    // (scaffold-site-company.mjs, four-site audit 2026-11-17), listed for sign-off with the proof.
    { id: 'import', kind: 'auto', inputs: ['content/replacements', 'code:scripts/apply-replacements.mjs', `${snap}/authoring_package.json`, `${snap}/pages.json`, ...facts.filter((arg) => arg !== '--facts'), 'docs/research/analysis/section-modules.json', 'docs/research/pattern-inventory.json', 'docs/research/slot-manifest.json', 'src/data/site-proof.json', 'config/page-blueprints.default.json', ...(tradeInputs.length ? [`config/blueprint-wording.${site.trade}.json`, tradeInputs[1]] : []), 'config/block-kinds.json', site.identity, 'src/data/site-company.json', 'code:scripts/import-site-factory.mjs', 'code:scripts/competitor-blueprint.mjs', 'code:scripts/scaffold-site-company.mjs', 'code:scripts/proof-signoff.mjs'], run: [node('competitor-blueprint.mjs', '--pages-plan', `${snap}/pages.json`), node('import-site-factory.mjs', ...importArgs, '--blueprints', 'docs/research/slot-manifest.json'), node('apply-replacements.mjs'), node('competitor-blueprint.mjs'), node('scaffold-site-company.mjs', '--package', `${snap}/authoring_package.json`, ...facts), node('proof-signoff.mjs', ...ownerTodo)] },
    // The site's data checked before any photo or model call (check-site-data.mjs, Fable's plan V-5, four-site audit
    // 2026-11-17): the enquiry form on the inquiry page, posts on an indexable blog hub, trust figures that read, no
    // promised file without a way to get it; a failure stops the run here, named with who clears it.
    { id: 'data-checks', kind: 'auto', inputs: ['src/data/authoring-pages.json', 'src/data/placeholder-pages.json', 'src/data/blog-posts.json', 'src/data/site-trust.json', 'src/data/site-identity.json', 'code:scripts/check-site-data.mjs'], run: [node('check-site-data.mjs', '.')] },
    { id: 'site-media', kind: 'auto', inputs: [site.identity], run: [node('import-site-media.mjs', '--project', site.identity)] },
    // Whether each page's copy fits the competitor's density band, with how many photo walls (at most three, owner
    // 2026-11-14), or not at all and by how much (plan-layout.mjs --feasibility, arithmetic only): what does not fit goes
    // to Site Factory's report (sf-report.mjs) and the owner's list; it never stops the run.
    { id: 'feasibility', kind: 'auto', inputs: PLAN_INPUTS, run: [node('plan-layout.mjs', '.', '--feasibility'), node('sf-report.mjs')] },
    // The layout plan (docs/research/layout-plan.json and .md): every block's variant, columns, card title level, surface,
    // photo slots and estimate, by the functions the renderer calls; then its gate: an assertion of the template or the
    // plan that fails holds the run before any photo is made (owner 2026-11-14); a page that does not fit is reported.
    { id: 'layout-plan', kind: 'auto', inputs: PLAN_INPUTS, run: [node('plan-layout.mjs', '.')] },
    { id: 'plan-gate', kind: 'auto', inputs: ['docs/research/layout-plan.json', 'docs/research/plan-waivers.json', 'code:scripts/plan-layout.mjs'], run: [node('plan-layout.mjs', '.', '--gate')] },
    // The grey-frame trial build (Fable's plan, stage 2): the site built with a grey frame in every photo position, each
    // content page measured, the block model fitted until the plan's estimate meets the measure (calibrate-plan.mjs; no
    // model call, no photo); held where the plan calls a page inside its band and the build measures it outside. The
    // model it leaves is the plan's: made and gated again.
    { id: 'calibrate', kind: 'auto', inputs: [...PLAN_INPUTS, 'src/styles', 'src/components', 'src/lib', 'src/layouts', 'src/pages', 'public/fonts', 'docs/research/plan-waivers.json', 'code:scripts/calibrate-plan.mjs'], run: [node('calibrate-plan.mjs', '.'), node('plan-layout.mjs', '.'), node('plan-layout.mjs', '.', '--gate')] },
    // The reference blog's article rhythm for our articles (site.json reference.article, else its blog's first article).
    { id: 'article-rhythm', kind: 'auto', inputs: ['site.json#reference', 'code:scripts/measure-reference-article.mjs'], run: [node('measure-reference-article.mjs', site.reference.origin, ...(site.reference.article ? [new URL(site.reference.article, site.reference.origin).href] : []))] },
    // What each section's photo shows, planned from the page's copy, for every trade whose image briefs say so
    // (config/image-briefs*.json planFromCopy; every trade since 2026-11-17): plan-photo-briefs.mjs, one judgment per
    // page, kept by its copy.
    // Site Factory's photo candidates of a section (photoCandidates) are its briefs as they are; a position whose library
    // photo the last image-fit judgment found on its page keeps it (docs/research/image-fit.json), and a page whose
    // briefs are all made keeps them when only the instructions change (docs/research/image-plan.json): no batch
    // remakes (owner 2026-11-17).
    ...((site.images ?? 'generate') === 'generate' ? [{ id: 'photo-briefs', kind: 'codex', inputs: ['docs/research/images/text-check.json', 'src/data/authoring-pages.json', 'src/data/placeholder-pages.json', 'src/data/template-variants.json', 'site.json#trade,siteKind', briefsConfig, 'docs/research/image-fit.json', 'docs/research/image-plan.json', 'config/agent-steps/photo-briefs.md', 'code:scripts/plan-photo-briefs.mjs', 'code:scripts/lib/photo-briefs.mjs'], run: [node('plan-photo-briefs.mjs')] }] : []),
    // The style board before any photo (build-style-board.mjs, lib/style-board.mjs): every module the pages use, with
    // the longest and the shortest copy written for it and grey frames for its photos, built and shot at both widths;
    // each module is reviewed against the competitor sections it renders (the design review's instructions, one run
    // per module), and a gate holds the run on an open P0/P1 of the site's treatment, with the design gate's repair.
    // The modules no competitor section shows are listed (docs/research/style-board/modules.md).
    { id: 'style-board', kind: 'preview', paid: true, inputs: ['src/styles', 'src/components', 'src/lib', 'src/layouts', 'src/pages', 'src/data/authoring-pages.json', 'src/data/template-variants.json', 'src/data/photo-briefs.json', 'public/fonts', 'docs/research/analysis/section-modules.json', 'docs/research/pattern-sections', 'code:scripts/build-style-board.mjs', 'code:scripts/design-review.mjs', ...REVIEW_RULES], run: [node('build-style-board.mjs'), pnpm('build'), node('design-review.mjs', 'board', `http://127.0.0.1:${site.port}/`)] },
    { id: 'style-board-review', kind: 'agent', prompt: 'design-review', writes: WRITES.review, reads: READS.review, runs: boardRuns, reply: reviewReply, done: ['docs/research/design-review/manifest.json'], current: boardReviewsCurrent, waits: 'the review of every module on the style board (docs/research/design-review/board--<module>.review.json, config/agent-steps/design-review.md)' },
    { id: 'style-board-gate', kind: 'auto', certify: true, always: true, inputs: [], repair: { prompt: 'repair-design', writes: WRITES.repair, problems: boardProblems, report: 'docs/research/style-board-review.json', rebuild: [], restart: 'style-board', onWaits: true }, run: [node('design-review.mjs', 'board-gate')], waitsOnExit: 'design fixes on the style board: the open P0/P1 findings in docs/research/style-board-review.json' },
    // A site that makes its own photos makes them once the style board has passed (its modules are reviewed on grey
    // frames, so the design comes before the photos: owner 2026-09-26), and its pages are reviewed with them. The
    // competitor's photos are never shown in their place (owner 2026-11-12: "不要用竞品的图"); a library already made is
    // applied again and only what is missing is made (docs/research/image-plan.json, public/media/photos).
    !generate
      ? { id: 'images', kind: 'auto', inputs: ['docs/research/analysis/media.json', 'site.json#images,line'], run: [node('use-reference-media.mjs')] }
      : // The plan's code is an input: a new rule for where photos go (lib/media-slots.mjs) plans the library again (the hotel
      // site's new photo bands stayed empty slots while the images step was "unchanged").
      // Its input is the photo demand, not the site's whole settings file (Fable's plan, stage 3, Q12): a setting that
      // moves no photo position (a heading's fit, a colour; the trial build's model only where it moves a wall) makes no
      // photo again. Each command keeps what it made
      // while its own inputs are unchanged (the plan its generated entries, the readings, the scores, the review).
      // Before any photo is made (owner 2026-11-17, via Site Factory: the four sites' photos were found off their pages
      // by the audits after they were built, and libraries were made again in batches): each photo's class is planned
      // and every photo to make is checked against its page's H1 and copy by code (plan-images.mjs,
      // check-photo-text.mjs: one that does not match is reported); then one photo of each class is made and judged
      // by the image-fit judge (generate-images.mjs --samples, judge-image-fit.mjs --samples), and the rest is made
      // whatever the verdicts, which samples.md reports. Image problems are reported, never holding the run (owner
      // 2026-11-18: "不要硬卡这些图了"); only the cap on remaking photos already made still waits for a go-ahead.
      // The photos the library review sends back are planned again before they are made (plan-images.mjs: a new scene,
      // the next look; on a service site a generic scene becomes the online-service class) and checked with the rest
      // (site14 2026-11-17: five scenes it sent back were queued with their old subjects, unchecked, and held the
      // library for a "scene" sample; text-check.md counted only the one photo planned before the review).
      { id: 'images', kind: 'codex', inputs: ['plan:photo-slots', 'src/data/site-media.json', 'src/data/site-nav.json', 'site.json#line,trade', 'docs/research/image-plan.json', 'docs/research/image-slots.json', 'docs/research/photo-text-waivers.json', ...new Set([...briefInputs, ...tradeInputs]), 'config/photo-text-check.json', 'code:scripts/plan-images.mjs', 'code:scripts/check-photo-text.mjs', 'code:scripts/lib/photo-class.mjs'], run: [node('plan-images.mjs', '--line', site.line), node('analyze-image-types.mjs'), node('analyze-image-style.mjs'), node('generate-images.mjs', '--samples'), node('judge-image-fit.mjs', '--samples'), node('generate-images.mjs'), node('score-image-style.mjs'), node('review-image-library.mjs'), node('plan-images.mjs', '--line', site.line), node('generate-images.mjs', '--samples'), node('judge-image-fit.mjs', '--samples'), node('generate-images.mjs'), node('score-image-style.mjs'), node('render-web-images.mjs', '--over-budget'), node('apply-image-library.mjs'), node('check-photo-text.mjs', '--gate')], waitsOnExit: 'a person: the go-ahead to make again more photos already made than a run makes at once (docs/research/images/remake-hold.md lists each and why), a sample photo the image-fit judge found off its page, which holds the rest of the library (docs/research/images/samples.md), or a photo whose subject does not match its page\'s H1 and copy (docs/research/images/text-check.md; docs/research/photo-text-waivers.json accepts one as it is)' },
    // The subject of every photo, named once by a vision judge (lib/photo-focus.mjs): frames that cut a photo centre on
    // it, and the phone crops of photos too wide for the competitor's phone frames (the sections' 390px shapes in the
    // pattern inventory, matched to our blocks through the section modules) are cut round it.
    { id: 'photo-focus', kind: 'agent', prompt: 'photo-focus', writes: WRITES.focus, reads: [], runs: focusRuns, reply: focusReply, done: [], current: async (root) => (await focusRuns(root)).length === 0, waits: 'the subject of every photo the site shows (docs/research/photo-focus/, config/agent-steps/photo-focus.md)' },
    { id: 'phone-heroes', kind: 'auto', inputs: ['src/data/template-variants.json', 'src/data/site-media.json', 'src/data/authoring-pages.json', 'src/data/placeholder-pages.json', ...briefInputs, 'docs/research/pattern-inventory.json', 'docs/research/analysis/section-modules.json', 'docs/research/photo-focus', 'code:scripts/derive-phone-heroes.mjs'], run: [node('derive-phone-heroes.mjs')] },
    // Each page's own key figures for the band under its hero (derive-page-figures.mjs, one judgment per page, kept by
    // its text).
    { id: 'page-figures', kind: 'codex', inputs: ['src/data/authoring-pages.json', 'src/data/placeholder-pages.json', 'config/agent-steps/page-figures.md', 'code:scripts/derive-page-figures.mjs', 'code:scripts/lib/page-figures.mjs'], run: [node('derive-page-figures.mjs')] },
    // The site shows what it will ship: no placeholder posts (an earlier run's are removed); the hub shows its own copy
    // until posts are written (lib/blog.mjs).
    { id: 'blog', kind: 'auto', inputs: ['src/data/template-variants.json', 'src/data/authoring-pages.json', 'src/data/placeholder-pages.json', 'code:scripts/scaffold-blog.mjs'], run: [node('scaffold-blog.mjs', '--remove')] },
    // The template's own checks (its tests, the template contract, the types) run when its code changes, not after
    // every repair of the site's stylesheet or copy (each rebuild ran them all again, 40-75s; Fable's review 11-14).
    { id: 'template-check', kind: 'auto', raw: true, inputs: ['scripts', 'src/components', 'src/layouts', 'src/lib', 'src/pages', 'src/hooks', 'src/types', 'src/styles/template.css', 'src/styles/patterns.css'], run: [Object.assign(pnpm('test'), { ownModels: true }), pnpm('validate:template'), pnpm('typecheck')] },
    // What undoes a template decision goes from the site's stylesheet before every build (strip-protected.mjs); the
    // header logo is fitted again to the header the treatment and its repairs have coloured since the brand step
    // (fit-header-logo.mjs, four-site audit 2026-11-17).
    { id: 'build', kind: 'auto', raw: true, inputs: ['src', 'public', 'scripts'], run: [node('strip-protected.mjs'), node('fit-header-logo.mjs'), pnpm('build'), pnpm('audit:seo'), node('check-image-slots.mjs')] },
    // Whether each photo of the site's own library shows its page's subject (judge-image-fit.mjs, one judgment per photo
    // and page subject, kept by content); the competitor's placeholder photos never ship and are not judged.
    ...(generate ? [{ id: 'image-fit', kind: 'codex', inputs: ['dist', 'config/agent-steps/image-fit.md', 'code:scripts/judge-image-fit.mjs'], run: [node('judge-image-fit.mjs')] }] : []),
    // The library photos judged off their page's subject go back to generation once and the run goes again from the
    // images (send-back-misfits.mjs); none to send back, it goes on (never a wait).
    ...(generate ? [{ id: 'image-refit', kind: 'auto', certify: true, always: true, inputs: [], repair:{ fix: node('send-back-misfits.mjs'), rebuild: [], restart: 'images', onWaits: true, optional: true, problems: async () => [] }, run: [node('send-back-misfits.mjs', '--check')] }] : []),
    // The copy as Site Factory wrote it: leaked wording, link markup, keyword lists, boilerplate, study sources
    // (docs/research/content-issues.md goes back to Site Factory 07; it never fails the run).
    { id: 'content', kind: 'auto', inputs: ['src/data/authoring-pages.json', `${snap}/authoring_package.json`, 'code:scripts/audit-content.mjs', 'code:scripts/lib/content-lint.mjs'], run: [node('audit-content.mjs'), node('sf-report.mjs')] },
    // Besides the build, what the audit compares it with: the competitor's module runs, density bands and palette.
    // Both audits always run (keepGoing): a failing navigation audit left the layout report of the run before, which the
    // repair then read as "no failures". The agent repairs only the failures of the site's stylesheet (SITE_CSS_ISSUES);
    // any other stops the run with its report.
    { id: 'audits', kind: 'preview', inputs: ['dist', 'docs/research/analysis/section-modules.json', 'docs/research/raw/reference-density.json', 'docs/research/analysis/design-lock.json', 'code:scripts/audit-authoring-layout.mjs', 'code:scripts/audit-navigation-shell.mjs'], repair: { prompt: 'repair-audits', writes: WRITES.repair, problems: auditProblems, agentFixes: siteCssProblem, report: 'docs/research/authoring-layout-audit.json', rebuild: [pnpm('build')], restart: (site.images ?? 'generate') === 'generate' ? 'images' : 'audits', restartFor: (changed) => (changed.includes('src/data/template-variants.json') ? null : 'audits') }, run: [node('audit-navigation-shell.mjs', `http://127.0.0.1:${site.port}/`), node('audit-authoring-layout.mjs', `http://127.0.0.1:${site.port}/`)], keepGoing: true },
    // The prelaunch checks after the audits (owner 2026-11-18, scripts/prelaunch.mjs): links, cannibalisation,
    // near-duplicate pages, the owner's materials list, technical checks, the site-wide conflict check's place; each
    // switched in site.json prelaunch, reports by default, no model call (a second or two, so every run). Here it only
    // reports (--no-hold): a check set to "block" holds the release, not the run before the design review; the release
    // step runs them again on the release build, before the preflight, which holds on a blocked summary.
    { id: 'prelaunch', kind: 'auto', always: true, inputs: [], run: [node('prelaunch.mjs', '--no-hold')] },
    // The design proofread against the competitor, section by section (design-review.mjs): new shots whenever the
    // build changes, a review of the longest and the shortest page of each page type on them (a page type the
    // competitor lacks beside its nearest), and a gate that waits while a P0/P1 finding is open.
    { id: 'design-shots', kind: 'preview', certify: true, inputs: ['dist', 'docs/research/reference-pages', 'code:scripts/design-review.mjs', ...REVIEW_RULES], run: [node('design-review.mjs', 'prepare', `http://127.0.0.1:${site.port}/`)] },
    { id: 'design-review', kind: 'agent', prompt: 'design-review', writes: WRITES.review, reads: READS.review, runs: reviewRuns, reply: reviewReply, done: ['docs/research/design-review/manifest.json'], current: reviewsCurrent, waits: 'the design review of every reviewed page against the competitor (docs/research/design-review/<key>.review.json, config/agent-steps/design-review.md)' },
    { id: 'design-gate', kind: 'auto', certify: true, always: true, inputs: [], repair: { prompt: 'repair-design', writes: WRITES.repair, problems: designProblems, report: 'docs/research/design-review.json', rebuild: [pnpm('build')], restart: 'audits', onWaits: true }, run: [node('design-review.mjs', 'gate'), node('verified-build.mjs', 'record')], waitsOnExit: 'design fixes: the open P0/P1 findings in docs/research/design-review.json' },
    // The small findings the gate lets through get the same repairs (owner 2026-10-30); what they cannot mend is left
    // in the report and the run goes on (optional: never a wait). One repair a run, every small finding in it (once,
    // V-3 of Fable's 11-17 plan: three rounds of about 12 minutes each on Strandmill 2026-11-17): the repaired site is
    // built, audited and shot again, and only the pages that look different are reviewed, for the gate.
    { id: 'design-polish', kind: 'auto', certify: true, always: true, inputs: [], repair: { prompt: 'repair-design', writes: WRITES.repair, problems: minorProblems, report: 'docs/research/design-review.json', rebuild: [pnpm('build')], restart: 'audits', onWaits: true, optional: true, once: true }, run: [node('design-review.mjs', 'minor')] },
    // The claude-seo full audit of the release build, the only model audit, after the design gate (owner 2026-11-17:
    // "在站点完成之后默认加一次claude seo全盘审计然后手改并且做流程修复"; it replaced the blind llm-audit: "有claude seo就行了"; on
    // unless site.json says llmAudit: false). Its inputs are what the release build, its Nginx config and the
    // instructions are made from (source files counted without their comments, lib/source-norm.mjs); when they changed
    // but the build and the config came out the same, the script keeps the last audit (lib/claude-seo-audit.mjs
    // releaseKey). docs/research/seo-audit-N/: findings.json, findings_sf.json; the preflight holds on the critical and
    // high items code and the verification both confirm.
    // Three independent auditors run it at once on one set of measurements, their findings merged (owner 2026-11-17:
    // "可以 而且可以并行不是吗"; config/claude-seo-auditors.json, whose models, and the site's agent, are inputs).
    // It runs before the GEO blog posts (2026-11-17): a site waiting for its posts (no GEO module, a sign-in) is audited
    // all the same; posts brought in later change the build, and the next run audits again.
    ...(llmAuditOn(site) ? [{ id: 'claude-seo-audit', kind: 'codex', inputs: ['src', 'public', 'config/lead-form.json', 'docs/research/audit-waivers.json', 'site.json#siteKind,claudeSeoDir,agent', 'config/agent-steps/claude-seo-audit.md', 'config/agent-steps/claude-seo-verify.md', 'config/claude-seo-findings.schema.json', 'config/claude-seo-auditors.json', 'code:scripts/claude-seo-audit.mjs'], run: [node('build-release.mjs'), node('claude-seo-audit.mjs'), pnpm('build')], waitsOnExit: 'the claude-seo audit: a release build the release guard refused (the preflight lists why), the judge cannot be asked now (usage limit or sign-in), or the local Google rules library does not answer' }] : []),
    // The site's GEO blog posts, after the site's audit (owner 2026-10-31): the GEO module picks the topics and writes them, each brought
    // in for review by import-geo-article.mjs (geo-blogs.mjs); every run asks, and it ends at once when the posts are there.
    { id: 'geo-blogs', kind: 'auto', models: true, always: true, inputs: [], run: [node('geo-blogs.mjs')], waitsOnExit: 'the GEO blog posts: the GEO module (site.json geoBlog.dir or GEO_BLOG_DIR), a sign-in, or a quote over the owner\'s limit' },
    // The release build replaces dist (without the reference placeholders), so the preflight judges what would ship;
    // the development build is made again afterwards, or the site's preview would show broken images.
    { id: 'release', kind: 'auto', certify: true, raw: true, inputs: ['src', 'public', 'docs/research/image-plan.json'], run: [node('build-release.mjs'), node('build-nginx-config.mjs'), node('sf-report.mjs'), node('check-cross-site.mjs', '--hold'), node('handoff.mjs'), node('prelaunch.mjs'), node('preflight.mjs'), pnpm('build')], keepGoing: true, waitsOnExit: 'the owner: the launch preflight holds (docs/research/launch-preflight.json)' },
  ];
}

// What the density step measures (measure-reference-density.mjs arguments). The benchmark: densityPages when the site
// names its pages (any site's: owner 2026-11-10, two competitors' content pages; its own field, so naming them captures
// nothing again), else the reference's pages but the utility ones (a contact page is not a content page) and those
// measured on their own. The page types measured on their own (owner 2026-11-12: the competitor's home is mostly
// full-width photos, its service pages are not): site.json densityPageTypes ({ page type: path or paths }), else the
// reference's home for the home page; every other page type is held to the benchmark.
export function densityTargets(site) {
  const own = site.densityPageTypes ?? (site.reference.pages.home ? { home: site.reference.pages.home } : {});
  const url = (path) => new URL(path, site.reference.origin).href;
  const benchmark = site.densityPages ?? Object.entries(site.reference.pages).filter(([type]) => !DENSITY_EXEMPT_PAGE_TYPES.includes(type) && !(type in own)).map(([, path]) => path);
  return [...benchmark.map(url), ...Object.entries(own).flatMap(([type, paths]) => [paths].flat().map((path) => `${type}=${url(path)}`))];
}

// What each agent step may write (lib/site-repo.mjs restoreOutside puts back anything else it changed): a judgment
// step its own outputs only, so the reference analysis cannot write the treatment and make that step look done.
export const WRITES = Object.freeze({
  analysis: ['docs/research/analysis/design-lock.json', 'docs/research/analysis/font-roles.json', 'docs/research/analysis/media.json', 'docs/research/analysis/components.md', 'docs/research/analysis/behaviors.md', 'docs/research/analysis/notes.md', 'docs/research/components/'],
  modules: ['docs/research/analysis/section-modules/', 'docs/research/analysis/section-modules.json'],
  treatment: ['src/styles/reference.css', 'src/data/template-variants.json', 'docs/research/analysis/treatment.md', 'docs/research/analysis/notes.md'],
  review: ['docs/research/design-review/'],
  focus: ['docs/research/photo-focus/'],
  repair: ['src/styles/reference.css', 'src/data/template-variants.json', 'docs/research/analysis/notes.md'],
});

// The section modules of every page type, each written by its own run (section-modules/<pageType>.json), joined into
// section-modules.json; a page type with no part keeps its entries. With pageTypes (the reference's), a page type the
// site no longer has is left out.
export async function joinSectionModules(root, pageTypes = null) {
  const dir = resolve(root, 'docs/research/analysis/section-modules');
  const kept = (pageType) => !pageTypes || pageTypes.includes(pageType);
  const parts = existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.json') && kept(name.replace(/\.json$/, ''))).sort() : [];
  const written = new Map();
  for (const name of parts) written.set(name.replace(/\.json$/, ''), await readJson(resolve(dir, name)));
  const path = resolve(root, 'docs/research/analysis/section-modules.json');
  const others = (await readJson(path, [])).filter((item) => !written.has(item.pageType) && kept(item.pageType));
  await writeJson(path, [...others, ...[...written.values()].flat()]);
}

// The section modules name the current crops: one entry per crop (docs/research/pattern-sections/<pageType>/
// <index>-<pattern>.png, by index) of every page type of the reference, and none of a page type it no longer has. A
// new capture with other sections makes them stale: their indexes would name other sections, with no error anywhere.
export async function modulesCurrent(root, pageTypes) {
  const named = await readJson(resolve(root, 'docs/research/analysis/section-modules.json'), []);
  if (!Array.isArray(named) || named.some((item) => !pageTypes.includes(item.pageType))) return false;
  const sorted = (indexes) => JSON.stringify(indexes.sort((left, right) => left - right));
  for (const pageType of pageTypes) {
    const crops = (await imagesIn(resolve(root, 'docs/research/pattern-sections', pageType))).map((path) => Number.parseInt(basename(path), 10));
    if (sorted(crops) !== sorted(named.filter((item) => item.pageType === pageType).map((item) => item.index))) return false;
  }
  return true;
}

// The files the module and review runs answer with (lib/agent-step.mjs reply): the agent replies with the JSON, the
// run's own fields (page type, route, shots) come from the run, not from the agent. A reply of another shape is an
// error (the run fails), never an empty answer: no modules for a page type, or no findings and a passed design gate.
const listIn = (json, field) => (Array.isArray(json) ? json : json?.[field]);
export const moduleReply = ({ pageType }, json) => {
  const sections = listIn(json, 'sections');
  if (!Array.isArray(sections) || sections.some((item) => !Number.isInteger(item?.index) || typeof item.module !== 'string')) throw new Error('expected a JSON array of { index, module }');
  return { path: `docs/research/analysis/section-modules/${pageType}.json`, data: sections.map((item) => ({ ...item, pageType })) };
};
export const reviewReply = ({ pageType, route, shots, rules }, json) => {
  const findings = listIn(json, 'findings');
  if (!Array.isArray(findings)) throw new Error('expected { "findings": [...] }');
  const wrong = findings.find((finding) => typeof finding?.block !== 'string' || !finding.block.trim() || !SEVERITIES.includes(finding.severity) || (finding.scope !== undefined && !SCOPES.includes(finding.scope)));
  if (wrong) throw new Error(`a finding names its block, a severity of ${SEVERITIES.join(', ')} and a scope of ${SCOPES.join(', ')}: ${JSON.stringify(wrong)}`);
  return { path: `docs/research/design-review/${pageType}.review.json`, data: { schemaVersion: REVIEW_SCHEMA, shots, rules, pageType, route, findings } };
};

// The site's photos without a judged subject yet (lib/photo-focus.mjs), FOCUS_BATCH to a run; a run's photos are
// numbered in its prompt and in its images' order.
export const focusRuns = async (root) => {
  const components = (await readJson(resolve(root, 'src/data/template-variants.json'))).components;
  const sitePhotos = (await readJson(resolve(root, 'src/data/site-media.json'), { photos: [] })).photos ?? [];
  // A point judged by other instructions is judged again (each answer records the instructions it followed), and so is
  // a photo made again under the same name (each answer records the bytes it was judged on: Strandmill's six photos
  // remade on 2026-11-17 kept the points of the photos they replaced). An answer from before it recorded them counts
  // for a photo no newer than the answer.
  const rules = createHash('sha256').update(await readFile(resolve(root, 'config/agent-steps/photo-focus.md'), 'utf8')).digest('hex').slice(0, 16);
  const fileOf = (src) => resolve(root, 'public', src.replace(/^\//, ''));
  const shaOf = async (src) => createHash('sha256').update(await readFile(fileOf(src)).catch(() => Buffer.from('missing'))).digest('hex').slice(0, 24);
  const judged = async (src, sha) => {
    const record = await readJson(resolve(root, focusPath(src)), null);
    if (record?.rules !== rules) return false;
    if (record.sha) return record.sha === sha;
    const [photo, answer] = await Promise.all([stat(fileOf(src)).catch(() => null), stat(resolve(root, focusPath(src))).catch(() => null)]);
    return !photo || Boolean(answer && photo.mtimeMs <= answer.mtimeMs);
  };
  const open = [];
  for (const photo of photosInUse(components, sitePhotos)) { const sha = await shaOf(photo.src); if (!(await judged(photo.src, sha))) open.push({ src: photo.src, sha }); }
  open.sort((left, right) => left.src.localeCompare(right.src));
  return Array.from({ length: Math.ceil(open.length / FOCUS_BATCH) }, (_, index) => open.slice(index * FOCUS_BATCH, (index + 1) * FOCUS_BATCH))
    .map((batch) => ({ values: { photos: batch.map(({ src }, index) => `${index + 1}. ${src}`).join('\n'), srcs: JSON.stringify(batch.map(({ src }) => src)), shas: JSON.stringify(batch.map(({ sha }) => sha)), rules }, images: batch.map(({ src }) => fileOf(src)) }));
};
// A point inside each photo of the run, by its number; a missing photo or a point outside fails the run.
export const focusReply = ({ srcs, shas = '[]', rules }, json) => {
  const photos = JSON.parse(srcs);
  const digests = JSON.parse(shas);
  const inside = (value) => typeof value === 'number' && value >= 0 && value <= 1;
  const points = listIn(json, 'photos');
  if (!Array.isArray(points)) throw new Error('expected [{ "index", "x", "y", "subject" }]');
  return photos.map((src, index) => {
    const point = points.find((item) => item?.index === index + 1);
    if (!inside(point?.x) || !inside(point?.y)) throw new Error(`photo ${index + 1} needs { "index": ${index + 1}, "x": 0..1, "y": 0..1 }`);
    return { path: focusPath(src), data: { src, x: point.x, y: point.y, subject: String(point.subject ?? ''), rules, ...(digests[index] ? { sha: digests[index] } : {}) } };
  });
};

// Repair rounds a step may get in one run, each only while its open problems keep going down.
export const REPAIR_ROUNDS = 3;
// Times a step goes back to its best state in one run, after repairs (its own or a later step's) leave it worse.
export const MAX_RESTORES = 3;

// What a repair would start from: its instructions (their text, and the shared treatment practice they follow) and the
// files it may change, as they are now. The same situation repaired once already is not repaired again (the same
// files would get the same answer); better instructions are a new situation.
export async function repairSituation(root, repair, problems = []) {
  const hash = createHash('sha256').update(repair.prompt);
  // The problems it would be asked about count too: the same treatment with other problems (the template changed
  // under it) is a new situation.
  hash.update([...problems].sort().join('\n'));
  for (const name of [`${repair.prompt}.md`, 'treatment-practice.md']) hash.update(await readFile(resolve(root, 'config/agent-steps', name)).catch(() => 'missing'));
  // So does what the template can do (its hooks and variants): a repair that had no value to set may find one now.
  hash.update(await readFile(resolve(root, 'docs/research/CSS_HOOKS.md')).catch(() => 'missing'));
  for (const path of repair.writes.filter((write) => !write.endsWith('/'))) hash.update(path).update(await readFile(resolve(root, path)).catch(() => 'missing'));
  return hash.digest('hex').slice(0, 24);
}

// The layout and navigation audits' failures the site's treatment is where to fix (src/styles/reference.css,
// template-variants.json): its colours (contrast, an overlay over a photo, colours off the competitor's palette),
// overflow and overlapping text, the measure of running text, the spacing between sections and the size of a control.
// Every other failure (density, a photo's crop, grids, copy not placed, a module repeated, a missing page) is a rule's: patched in the stylesheet it comes back on the next page or site (the
// hotel site's 95 repair and rule-fix commits, one per failure). Density failures stop the run like the others: the
// trial build (calibrate-plan.mjs) fitted the plan before the photos; a refit after them moved the photos.
// A heading off the axis, a row whose texts start apart, a split row's photo off its copy's edges and a button away
// from its copy (split_edges, action_detached) are the site's too: the template sets them right (data-heading-align,
// subgrid rows, split rows on shared edges, a button in its copy's flow), so what moves them is a rule of the site's
// stylesheet (the hotel site's style-board repairs centred a heading, gave a lone card's text a lead's margin, fixed a
// photo's shape beside copy of any length and pinned a button to a band's foot, copying the competitor). Where the
// template is the cause after all, the repair rounds run out and the run stops as before.
// Who clears each audit failure: lib/issue-owners.mjs (the site's stylesheet, Site Factory's copy, a template rule).
export const SITE_CSS_ISSUES = AUDIT_OWNERS['site-css'];
// A problem line's issue (route|viewport|issue).
const problemIssue = (problem) => problem.split('|').at(-1);
export const siteCssProblem = (problem) => SITE_CSS_ISSUES.includes(problemIssue(problem));

// The open problems of the layout audit and of the design review, one line each (their count measures progress).
// The navigation audit's failures count too (lib/navigation-problems.mjs).
const auditProblems = async (root) => [
  ...((await readJson(resolve(root, 'docs/research/authoring-layout-audit.json'), null))?.failures ?? []).map((failure) => `${failure.route ?? ''}|${failure.viewport ?? ''}|${failure.issue}`),
  ...navigationProblems((await readJson(resolve(root, 'docs/research/navigation-shell-audit.json'), null))?.failures),
];
const minorProblems = async (root) => [
  ...minorFindings((await readJson(resolve(root, 'docs/research/design-review.json'), null))?.findings ?? []).map((finding) => `${finding.review ?? finding.pageType}|${finding.viewport ?? ''}|${finding.block}`),
  ...blockIdRules(await readFile(resolve(root, 'src/styles/reference.css'), 'utf8').catch(() => '')).map((id) => `css|block-id|${id}`),
];
const boardProblems = async (root) => openFindings((await readJson(resolve(root, 'docs/research/style-board-review.json'), null))?.findings ?? []).map((finding) => `${finding.review}|${finding.viewport ?? ''}|${finding.block}`);
const designProblems = async (root) => openFindings((await readJson(resolve(root, 'docs/research/design-review.json'), null))?.findings ?? []).map((finding) => `${finding.review ?? finding.pageType}|${finding.viewport ?? ''}|${finding.block}`);

// The files each judgment step's instructions name (the agent cache's key covers them, lib/agent-cache.mjs).
export const READS = Object.freeze({
  analysis: ['AGENTS.md', '.claude/skills/seo-site-template/SKILL.md', 'docs/research/raw/capture-summary.json', 'docs/research/raw/font-lock.json', 'site.json#reference', 'code:scripts/apply-reference-analysis.mjs', 'code:scripts/validate-template.mjs'],
  modules: ['AGENTS.md', '.claude/skills/seo-site-template/SKILL.md', 'code:scripts/lib/authoring-contract.mjs'],
  treatment: ['AGENTS.md', '.claude/skills/seo-site-template/SKILL.md', 'docs/research/CSS_HOOKS.md', 'config/agent-steps/treatment-practice.md', 'docs/research/analysis/design-lock.json', 'docs/research/analysis/font-roles.json', 'docs/research/analysis/components.md', 'docs/research/analysis/behaviors.md', 'docs/research/analysis/section-modules.json', 'docs/research/components', 'src/data/site-identity.json', 'src/data/template-variants.json'],
  review: ['config/agent-steps/treatment-practice.md', 'docs/research/analysis/section-modules.json', 'docs/research/analysis/components.md'],
});

// A stylesheet with at least one rule outside comments.
export const hasCssRules = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').includes('{');

// The treatment's colours are the competitor's (the design lock's palette, a shade or tint of one included).
export async function treatmentInPalette(root) {
  const lock = await readJson(resolve(root, 'docs/research/analysis/design-lock.json'), null);
  const css = await readFile(resolve(root, 'src/styles/reference.css'), 'utf8').catch(() => '');
  return offPalette(stylesheetColours(css), lockPalette(lock)).length === 0;
}

// Every page type of the current design shots has a review of those shots.
export async function reviewsCurrent(root) {
  const manifest = await readJson(resolve(root, 'docs/research/design-review/manifest.json'), null);
  if (!manifest) return false;
  const reviews = await readReviews(root, manifest);
  return manifest.pages.every((page) => reviewCurrent(page, reviews[reviewKey(page)]));
}

// Every module of the style board's current shots has a review of those shots.
export async function boardReviewsCurrent(root) {
  const manifest = await readJson(resolve(root, 'docs/research/design-review/manifest.json'), null);
  if (!manifest) return false;
  const board = manifest.board ?? [];
  const reviews = await readReviews(root, manifest, board);
  return board.every((entry) => reviewCurrent(entry, reviews[entry.key]));
}

// An agent step is done when its outputs are there (with content where it names a check) and, for a step whose output
// must match the current build (the design review), current.
// The steps that call a model (kind agent or codex, or paid: the style board's review) this run is to run as far as the
// inputs say now: an agent step whose outputs are not there, any other whose inputs changed since it last passed (a
// step before it that runs may change more; a repair calls a model too). Fable's plan, stage 3: a run says at its start
// what it will spend.
export async function pendingPaidSteps(root, list, state) {
  const pending = [];
  for (const step of list) {
    if (!['agent', 'codex'].includes(step.kind) && !step.paid) continue;
    if (step.kind === 'agent' ? !(await agentStepDone(root, step)) : !(state[step.id]?.status === 'passed' && state[step.id].hash === (await inputsHash(root, step.inputs, { raw: step.raw })))) pending.push(step);
  }
  return pending;
}

export async function agentStepDone(root, step) {
  for (const path of step.done) {
    if (!existsSync(resolve(root, path))) return false;
    if (step.ready?.[path] && !step.ready[path](await readFile(resolve(root, path), 'utf8'))) return false;
  }
  return step.current ? step.current(root) : true;
}

// site.json may name the Site Factory project (siteFactoryProject) and where its snapshots go (siteFactoryFreeze):
// the run freezes it first (unchanged inputs give the same snapshot back) and points siteFactory at the snapshot, so a
// new 07 package or site tree needs no hand step.
export async function freezeForRun(root, site, freeze = freezeSiteFactory) {
  if (!site.siteFactoryProject) return site;
  if (!site.siteFactoryFreeze) throw new Error('site.json names siteFactoryProject but not siteFactoryFreeze (the folder its snapshots go to)');
  // The site's own changes to the project (content/package-patches/: pages merged away, sections added) go into the
  // snapshot, so every import has them (lib/package-patches.mjs).
  const { folder } = await freeze({ project: resolve(root, site.siteFactoryProject), out: resolve(root, site.siteFactoryFreeze), navOnly: site.navOnly ?? [], patches: await readPackagePatches(root) });
  const snapshot = folder.replaceAll('\\', '/');
  if (site.siteFactory === snapshot) return site;
  // Read again before writing: only the snapshot's place changes, never a field edited while the snapshot was made.
  const next = { ...(await readJson(resolve(root, 'site.json'), site)), siteFactory: snapshot };
  await writeJson(resolve(root, 'site.json'), next);
  return next;
}

// Content hash of the step's inputs, so an unchanged step is not run again. An input is a file, every file of a
// folder, named fields of a JSON file ("file.json#a,b"), or the code a script runs ("code:scripts/x.mjs": the script
// and every file it imports, lib/module-graph.mjs). A file counts by its content under a label (its place in the list,
// its path inside a folder or the code closure), never its absolute path: the same snapshot in another folder is the
// same input. A source file (a script, a stylesheet, a component) counts by what runs or renders of it, without its
// comments (lib/source-norm.mjs; owner 2026-11-17, site13's 40-minute run): a commit that only rewrote comments runs
// nothing again. raw (the template's own checks, the build, the release) counts every byte: its tests read the
// sources, and the verified build is of the sources as they are.
// Each input has its own digest (inputDigests), so a run can say which input sent a step to run again.
export async function inputDigests(root, inputs = [], { raw = false } = {}) {
  const digests = [];
  for (const [index, input] of inputs.entries()) {
    const hash = createHash('sha256');
    const add = async (path, label, normalise) => {
      const info = await stat(path).catch(() => null);
      if (!info) { hash.update(`missing:${label}`); return; }
      if (info.isFile()) { hash.update(label); const bytes = await readFile(path); hash.update(normalise ? sourceDigest(path, bytes) : bytes); return; }
      for (const entry of (await readdir(path)).sort()) if (entry !== 'node_modules' && entry !== '.pipeline') await add(join(path, entry), `${label}/${entry}`, normalise);
    };
    if (input.startsWith('code:')) {
      for (const file of await codeClosure(root, [input.slice('code:'.length)])) await add(resolve(root, file), `code:${file}`, !raw);
    } else if (input === 'plan:photo-slots') {
      // The photo demand (plan-images.mjs imageDemand): every position the site asks a photo for and the style
      // references, as the image plan reads them; null where the site's data is not there yet.
      const { imageDemand } = await import('./plan-images.mjs');
      hash.update(`plan:${index}`);
      hash.update(JSON.stringify(await imageDemand(root).catch(() => null)));
    } else {
      const [file, fields] = input.split('#');
      if (!fields) await add(resolve(root, input), `input:${index}`, !raw);
      else {
        const data = await readJson(resolve(root, file), null);
        hash.update(`fields:${index}:${fields}`);
        hash.update(JSON.stringify(fields.split(',').map((field) => data?.[field] ?? null)));
      }
    }
    digests.push(hash.digest('hex').slice(0, 16));
  }
  return digests;
}
export const digestsHash = (digests) => createHash('sha256').update(digests.map((digest, index) => `${index}:${digest}`).join('\n')).digest('hex').slice(0, 16);
export async function inputsHash(root, inputs = [], options = {}) {
  return digestsHash(await inputDigests(root, inputs, options));
}

// Why a step runs this time: the inputs whose digests differ from those recorded when it last passed (by name; a
// record from before per-input digests: "its inputs").
export function changedInputs(inputs = [], before = null, now = []) {
  if (!Array.isArray(before) || before.length !== now.length) return ['its inputs'];
  return inputs.filter((_, index) => before[index] !== now[index]).map((input) => input.replace(/^[A-Z]:[\\/].*[\\/](?=[^\\/]+$)/i, '…/'));
}

// The hash before source files counted without their comments (every byte, one stream): a state recorded with it is
// moved to today's hash when its inputs are unchanged, instead of running the step again.
export async function rawInputsHash(root, inputs = []) {
  const hash = createHash('sha256');
  const add = async (path, label) => {
    const info = await stat(path).catch(() => null);
    if (!info) { hash.update(`missing:${label}`); return; }
    if (info.isFile()) { hash.update(label); hash.update(await readFile(path)); return; }
    for (const entry of (await readdir(path)).sort()) if (entry !== 'node_modules' && entry !== '.pipeline') await add(join(path, entry), `${label}/${entry}`);
  };
  for (const [index, input] of inputs.entries()) {
    if (input.startsWith('code:')) {
      for (const file of await codeClosure(root, [input.slice('code:'.length)])) await add(resolve(root, file), `code:${file}`);
      continue;
    }
    // The photo demand (plan-images.mjs imageDemand): every position the site asks a photo for and the style
    // references, as the image plan reads them; null where the site's data is not there yet.
    if (input === 'plan:photo-slots') {
      const { imageDemand } = await import('./plan-images.mjs');
      hash.update(`plan:${index}`);
      hash.update(JSON.stringify(await imageDemand(root).catch(() => null)));
      continue;
    }
    const [file, fields] = input.split('#');
    if (!fields) { await add(resolve(root, input), `input:${index}`); continue; }
    const data = await readJson(resolve(root, file), null);
    hash.update(`fields:${index}:${fields}`);
    hash.update(JSON.stringify(fields.split(',').map((field) => data?.[field] ?? null)));
  }
  return hash.digest('hex').slice(0, 16);
}

// The hash before content-only inputs (absolute paths in it), and before named fields (the whole file): a state
// recorded with either is moved to today's hash when its inputs are unchanged, instead of running the step again.
export async function legacyInputsHash(root, inputs = []) {
  const hash = createHash('sha256');
  const add = async (path) => {
    const info = await stat(path).catch(() => null);
    if (!info) { hash.update(`missing:${path}`); return; }
    if (info.isFile()) { hash.update(path); hash.update(await readFile(path)); return; }
    for (const entry of (await readdir(path)).sort()) if (entry !== 'node_modules' && entry !== '.pipeline') await add(join(path, entry));
  };
  for (const input of inputs) {
    const [file, fields] = input.split('#');
    if (!fields) { await add(resolve(root, input)); continue; }
    const data = await readJson(resolve(root, file), null);
    hash.update(input);
    hash.update(JSON.stringify(fields.split(',').map((field) => data?.[field] ?? null)));
  }
  return hash.digest('hex').slice(0, 16);
}

export async function upgradeLegacyHashes(root, state, list) {
  let changed = false;
  for (const step of list) {
    if (state[step.id]?.status !== 'passed') continue;
    const hash = await inputsHash(root, step.inputs, { raw: step.raw });
    if (state[step.id].hash === hash) continue;
    // A state of every byte (rawInputsHash) moves with its digests, so the next change names its input.
    if (state[step.id].hash === await rawInputsHash(root, step.inputs)) { state[step.id] = { ...state[step.id], hash, inputs: await inputDigests(root, step.inputs, { raw: step.raw }) }; changed = true; continue; }
    if (step.inputs?.some((input) => input.startsWith('code:'))) continue;
    const before = [await legacyInputsHash(root, step.inputs), await legacyInputsHash(root, [...new Set(step.inputs.map((input) => input.split('#')[0]))])];
    if (before.includes(state[step.id].hash)) { state[step.id].hash = hash; changed = true; }
  }
  return changed;
}

// The template's own tests call their stand-in models (ownModels): an iteration run's refusal is not theirs (Strandmill
// 2026-11-18: every model test failed under --iterate, template-check with them).
const runOnce = (command, root, log) => new Promise((done) => {
  const [program, ...args] = command;
  const env = command.ownModels ? Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== NO_MODELS)) : process.env;
  const child = spawn(program, args, { cwd: root, env });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => chunks.push(chunk));
  child.on('close', async (code) => { await writeFile(log, Buffer.concat(chunks), { flag: 'a' }); done(code ?? 1); });
});
// A command whose process crashed or did not start (a Windows NTSTATUS exit, lib/audit-runtime.mjs) runs once more:
// the hotel run of 2026-11-12 stopped at its audits on 0xC0000142, a process the machine failed to start.
const run = async (command, root, log) => {
  const code = await runOnce(command, root, log);
  if (!isProcessCrash(code)) return code;
  await writeFile(log, `\nthe process crashed (exit ${code}); running it once more\n`, { flag: 'a' });
  return runOnce(command, root, log);
};

// A preview server for the audits: `astro preview` on the site's port, stopped afterwards.
// The built site served on the site's port for the steps that open its pages: a static server in this process
// (lib/static-server.mjs), up before the step starts and closed after it (Astro's preview runs as a background daemon
// that could outlive a step and keep the next from starting). A taken port fails the step at once.
async function withPreview(root, port, work) {
  const server = await serveStatic(resolve(root, 'dist'), port);
  try { return await work(); } finally { await server.close(); }
}

// The steps an iteration run (--iterate) leaves to certification: those that call a model or make a photo (agent,
// codex, paid, models), those that read the reviews or record the verified build (certify).
export const certificationOnly = (step) => ['agent', 'codex'].includes(step.kind) || Boolean(step.paid || step.models || step.certify);

// A run: its steps (runSteps), with SITE_RUN_ID and SITE_RUN_STEP set for the commands it runs (their model calls are
// counted by step, lib/model-calls.mjs) and, in an iteration run, SITE_RUN_NO_MODELS (any model call is refused). The
// result's report says what ran, why, for how long and at what cost; it is kept in .pipeline/runs/<run>.json.
export async function siteRun(options = {}) {
  const root = options.root ?? process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const saved = Object.fromEntries(['SITE_RUN_ID', 'SITE_RUN_STEP', NO_MODELS].map((name) => [name, process.env[name]]));
  process.env.SITE_RUN_ID = stamp;
  if (options.iterate) process.env[NO_MODELS] = '1';
  const started = Date.now();
  try {
    const result = await runSteps({ ...options, root }, stamp);
    result.report = await runReport(root, stamp, result.summary, { mode: options.iterate ? 'iterate' : 'certify', seconds: Math.round((Date.now() - started) / 1000), code: result.code });
    return result;
  } finally {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}

// What a run did, by step (a step run again after a repair counts each time): { mode, seconds, calls, ran, unchanged }.
export async function runReport(root, stamp, summary, { mode, seconds, code }) {
  const calls = await modelCallsOf(root, stamp);
  const ran = [];
  const unchanged = [];
  for (const item of summary) {
    if (item.status === 'unchanged' || (item.status === 'done' && !item.why)) { unchanged.push(item.step); continue; }
    if (item.seconds === undefined && !item.why) continue;
    ran.push({ step: item.step, status: item.status, seconds: item.seconds ?? 0, why: item.why ?? null });
  }
  for (const [step, count] of Object.entries(calls)) { const last = ran.findLast((item) => item.step === step); if (last) last.calls = count; }
  const total = Object.values(calls).reduce((sum, count) => ({ judge: sum.judge + count.judge, image: sum.image + count.image }), { judge: 0, image: 0 });
  // The issue list of the site's latest claude-seo audit and Site Factory's part of it, named in every summary (owner
  // 2026-11-17: the run summary prints both paths; the main session tells Site Factory).
  const audit = await latestAudit(root).catch(() => null);
  const seoAudit = audit ? { dir: audit.dir, findings: audit.data.artifacts.findings, findingsSf: audit.data.artifacts.findings_sf, holds: audit.check.holds.length } : null;
  const report = { run: stamp, mode, code, seconds, calls: total, callsByStep: calls, ran, unchanged, seoAudit };
  await writeJson(resolve(root, '.pipeline/runs', `${stamp}.json`), report);
  return report;
}

// The report as lines for the console.
export function reportLines(report) {
  const cost = (calls) => (calls ? `${calls.judge} model call(s)${calls.image ? `, ${calls.image} image(s)` : ''}` : 'no model call');
  return [
    `run summary (${report.mode}): ${report.seconds}s, ${cost(report.calls)}; ${report.ran.length} step run(s), ${report.unchanged.length} unchanged`,
    ...report.ran.map((item) => `  ${item.step}: ${item.seconds}s, ${item.status}${item.why ? `; why: ${item.why}` : ''}; ${cost(item.calls)}`),
    ...(report.seoAudit ? [`claude-seo audit ${report.seoAudit.dir} (${report.seoAudit.holds} item(s) hold the launch): findings ${report.seoAudit.findings}; for Site Factory ${report.seoAudit.findingsSf}`] : []),
  ];
}

async function runSteps({ root = process.cwd(), from = null, to = null, runner = run, repo = runner === run, agent = undefined, iterate = false } = {}, stamp) {
  const site = await freezeForRun(root, await readJson(resolve(root, 'site.json')));
  // The judgment steps' agent: Codex in a real run unless site.json says "agent": "none"; none in a test or an
  // iteration run.
  const doAgent = iterate ? null : agent !== undefined ? agent : runner === run && site.agent !== 'none' ? runAgentStep : null;
  const statePath = resolve(root, '.pipeline/state.json');
  const state = await readJson(statePath, {});
  const logs = resolve(root, '.pipeline/logs', stamp);
  await mkdir(logs, { recursive: true });
  const [program, ...args] = pnpm('--version');
  if (runner === run && spawnSync(program, args, { stdio: 'ignore' }).status !== 0) throw new Error('pnpm is not on PATH (on Windows Git Bash, add it as /c/…, not C:/…)');
  const core = await readJson(resolve(root, 'template-core.json'), null);
  const coreSource = coreSourceOf(root, core);
  const list = steps(site, { coreSource });
  if (await upgradeLegacyHashes(root, state, list)) await writeJson(statePath, state);
  // The site's own history: what changed by hand since the last run is recorded before the run changes more.
  if (repo && await ensureSiteRepo(root)) commitSite(root, 'site-run: changes made outside the run');
  const first = from ? list.findIndex((step) => step.id === from) : 0;
  const last = to ? list.findIndex((step) => step.id === to) : list.length - 1;
  if (first < 0 || last < 0) throw new Error(`unknown step: ${from ?? to} (steps: ${list.map((step) => step.id).join(', ')})`);
  // What this run will spend, as far as the inputs say now (a real run; a test's runner runs nothing).
  if (runner === run && !iterate) {
    const paid = await pendingPaidSteps(root, list.slice(first, last + 1), state);
    console.log(paid.length ? `steps that call a model this run (at least): ${paid.map((step) => `${step.id} (${step.kind})`).join(', ')}` : 'no step that calls a model is to run (unless a step before it changes its inputs)');
  }
  const summary = [];
  // Repair rounds of this run by step ({ rounds, open }), and the treatments a repair was ever tried on.
  const repairs = new Map();
  // Rule fixes of this run by step (their count).
  const fixes = new Map();
  const triedPath = resolve(root, '.pipeline/repairs.json');
  const tried = new Set((await readJson(triedPath, { situations: [] })).situations);
  // One agent step or repair: what it was given is committed first, and whatever it changed outside its own outputs
  // is put back afterwards (and said in its log and the run's summary).
  // A judgment step asked exactly what it was asked before gets its recorded answer back (lib/agent-cache.mjs), not a
  // new agent run; a repair is never cached (its own record of situations tried keeps it from repeating).
  const runAgent = async (agentStep, log) => {
    if (repo) commitSite(root, `site-run: before ${agentStep.id}`);
    const key = repo && agentStep.reads ? await agentKey(root, agentStep, { inputsHash }) : null;
    const restored = await restoreAnswer(root, key);
    if (restored) {
      await writeFile(log, `restored from the agent cache (${key}): ${restored.join(', ')}\n`, { flag: 'a' });
      summary.push({ step: agentStep.id, status: 'answer restored from the agent cache' });
      return 0;
    }
    const code = await doAgent({ step: agentStep, root, log });
    if (repo && agentStep.writes) {
      const strays = restoreOutside(root, agentStep.writes);
      if (strays.length) {
        await writeFile(log, `put back ${strays.length} file(s) ${agentStep.id} changed outside its outputs: ${strays.join(', ')}\n`, { flag: 'a' });
        summary.push({ step: agentStep.id, status: `put back ${strays.length} file(s) outside its outputs` });
      }
      // Only an answer that completes the step is kept: an incomplete one restored would leave the step waiting for good.
      if (code === 0 && key && await agentStepDone(root, agentStep)) await recordAnswer(root, key, agentStep, changedFiles(root).map((file) => file.path).filter(ownedBy(agentStep.writes)));
    }
    return code;
  };
  // The repair's rebuild: the first failing command's exit code, else 0.
  const rebuild = async (step, log) => {
    let built = 0;
    for (const command of step.repair.rebuild) built ||= await runner(command, root, log);
    return built;
  };
  // A rule that fixes some of the step's problems (repair.fix, e.g. a photo row where text runs on) goes before any
  // agent: when it changed the site, the site is built and the step runs again ({ restart }); with nothing to do (exit
  // 2) the agent repair follows (null); a rule that crashed fails the step ({ failed }), it did not find nothing to do.
  // At most REPAIR_ROUNDS rule fixes a step in a run (the rule also caps what it adds).
  const ruleFix = async (step, log) => {
    const fixed = fixes.get(step.id) ?? 0;
    if (!step.repair.fix || fixed >= REPAIR_ROUNDS) return null;
    const result = await runner(step.repair.fix, root, log);
    if (result === WAITS) return null;
    if (result !== 0) {
      summary.push({ step: `${step.id}-fix`, status: `the rule fix failed (exit ${result}, its log says why)` });
      return { failed: true };
    }
    fixes.set(step.id, fixed + 1);
    if (await rebuild(step, log) !== 0) {
      summary.push({ step: `${step.id}-fix`, status: 'the site does not build after the rule fix' });
      return { failed: true };
    }
    summary.push({ step: `${step.id}-fix`, status: 'done by rule' });
    if (repo) commitSite(root, `site-run: ${step.id} (rule fix)`);
    return { restart: true };
  };
  // The state with the fewest open problems each step's repairs reached in this run ({ open, commit }).
  const best = new Map();
  // An agent repair of the site's treatment from the step's report and a rebuild ({ restart }: the run goes on again
  // from the step the repair names, the audit itself; the design shots, so the review sees the repaired pages). Up to
  // REPAIR_ROUNDS rounds, each only while the last one made progress — fewer problems open, or none of the ones it was
  // asked about (it fixed them and others came up: removing a heavy hero shade left white text on bright photos, for
  // the next round) — and never twice on the same treatment (a repair tried on these very files, in this run or an
  // earlier one, is not tried again): null then. The repairs never leave the site worse than they found it: when they
  // stop on more problems than their best state had, the files they write go back to that state ({ restart }, once).
  // A step whose repair names what the agent may fix (agentFixes: the layout audit's site-CSS failures) gives it
  // nothing while another failure is open: that one shows a rule's gap, and the run stops on it and reports it (going
  // back to the best state first, as when a repair stops).
  const agentRepair = async (step, log) => {
    if (!doAgent || !step.repair.prompt) return null;
    const open = await step.repair.problems(root);
    const before = repairs.get(step.id);
    if (repo && (!best.has(step.id) || open.length < best.get(step.id).open)) best.set(step.id, { open: open.length, commit: headCommit(root) });
    const situation = await repairSituation(root, step.repair, open);
    const moved = before?.problems?.length > 0 && before.problems.every((problem) => !open.includes(problem));
    const outside = step.repair.agentFixes ? open.filter((problem) => !step.repair.agentFixes(problem)) : [];
    const notAgain = outside.length ? `not given to the agent: ${byOwner(outside.map(problemIssue)).join('; ')}; see ${step.repair.report}` : before && step.repair.once && before.rounds >= 1 ? 'not tried again: one repair a run for these findings (what is left stays in the report)' : before && before.rounds >= REPAIR_ROUNDS ? `not tried again: ${REPAIR_ROUNDS} rounds done` : before && open.length >= before.open && !moved ? `not tried again: no progress (${open.length} open, ${before.open} before)` : tried.has(situation) ? 'not tried again: tried on this very treatment before' : null;
    if (notAgain) {
      summary.push({ step: `${step.id}-repair`, status: notAgain });
      const top = best.get(step.id);
      if (!repo || !top || open.length <= top.open || (before?.restored ?? 0) >= MAX_RESTORES) return null;
      // Its report goes back with the files (Staylumen 2026-11-17: the treatment restored, the audit unchanged since its
      // best state and not run again, its report still held the 23 failures of the repair undone and the verified build
      // refused the release).
      restoreFrom(root, top.commit, [...step.repair.writes, ...(step.repair.report ? [step.repair.report] : [])]);
      if (await rebuild(step, log) !== 0) {
        summary.push({ step: `${step.id}-repair`, status: 'the site does not build after going back to its best state' });
        return { failed: true };
      }
      commitSite(root, `site-run: ${step.id} (back to its best state: ${top.open} open)`);
      summary.push({ step: `${step.id}-repair`, status: `back to the state with the fewest problems (${top.open} open; ${open.length} after the last repair)` });
      // Back at its best state the rounds used still count, but what the audit finds there next is judged afresh: the
      // hotel run of 2026-11-14 came back to 0 open, then one detached button found after the rebuild was never given
      // to the agent (all three rounds were marked done). It goes back to its best state up to MAX_RESTORES times a run
      // (restored): each design repair that breaks it again is undone too (Staylumen 2026-11-17: the design polish's
      // repair was undone, the design gate's next one stayed and the run stopped on its 91 failures). The design repairs
      // themselves are bounded (one a situation, rounds while they make progress), so this ends.
      repairs.set(step.id, { rounds: before?.rounds ?? 0, open: Infinity, problems: [], restored: (before?.restored ?? 0) + 1 });
      return { restart: true };
    }
    repairs.set(step.id, { rounds: (before?.rounds ?? 0) + 1, open: open.length, problems: open });
    tried.add(situation);
    await writeJson(triedPath, { situations: [...tried] });
    const repair = { id: `${step.id}-repair`, prompt: step.repair.prompt, writes: step.repair.writes, runs: async () => [{ values: { report: step.repair.report, log, siteRules: siteRules((await readJson(resolve(root, 'src/data/template-variants.json'), null))?.components ?? {}) }, images: [] }] };
    const start = repo ? headCommit(root) : null;
    const repaired = await runAgent(repair, log);
    // An agent that gave no answer (it could not be asked, its usage limit; it crashed or timed out) tried nothing: the
    // repair is still to be tried.
    if (repaired !== 0) {
      tried.delete(situation);
      await writeJson(triedPath, { situations: [...tried] });
      summary.push({ step: `${step.id}-repair`, status: repaired === AGENT_UNAVAILABLE ? 'not done: the agent is unavailable (usage limit); run again once it is back' : `not done: the agent run failed (exit ${repaired}, its log says why)` });
      return null;
    }
    // What the repair wrote that undoes a template decision is taken out by code before the rebuild (lib/protected-rules.mjs).
    const sheet = resolve(root, 'src/styles/reference.css');
    if (existsSync(sheet)) {
      const { css, removed } = stripProtected(await readFile(sheet, 'utf8'));
      if (removed.length) {
        await writeFile(sheet, css);
        await writeFile(log, `\ntook out ${removed.length} declaration(s) that undo a template decision:\n${removed.map((item) => `- ${item.selector} { ${item.property} }: ${item.rule}`).join('\n')}\n`, { flag: 'a' });
        summary.push({ step: `${step.id}-repair`, status: `took out ${removed.length} declaration(s) undoing a template decision (${[...new Set(removed.map((item) => item.property))].join(', ')})` });
      }
    }
    // The agent builds nothing itself: a repair the site does not build with stops the run here.
    if (await rebuild(step, log) !== 0) {
      summary.push({ step: `${step.id}-repair`, status: 'the site does not build after the repair (its commit "site-run: before" holds the version before)' });
      return { failed: true };
    }
    summary.push({ step: `${step.id}-repair`, status: 'done by agent' });
    if (repo) commitSite(root, `site-run: ${step.id} (agent repair)`);
    // Where the run goes back to: what the repair changed decides (restartFor), else the step the repair names.
    const target = (repo && step.repair.restartFor ? step.repair.restartFor(changedSince(root, start)) : null) ?? step.repair.restart;
    // The step the run goes back to judges a site another repair changed: its problems are counted afresh (its
    // rounds still count), not against the ones it had before that repair.
    const back = repairs.get(target);
    if (target !== step.id && back) repairs.set(target, { ...back, open: Infinity });
    return { restart: true, at: target };
  };
  for (let at = first; at <= last; at += 1) {
    const step = list[at];
    const began = Date.now();
    process.env.SITE_RUN_STEP = step.id;
    // seconds: how long the step took this time (where the run's time goes, Fable's review 11-14); why: what sent it
    // to run (the run's summary).
    let why = null;
    const save = async (status, now = digests) => { const seconds = Math.round((Date.now() - began) / 1000); state[step.id] = { status, hash: digestsHash(now), inputs: now, at: new Date().toISOString(), seconds, log: `.pipeline/logs/${stamp}/${step.id}.log` }; await writeJson(statePath, state); summary.push({ step: step.id, status, seconds, ...(why ? { why } : {}) }); };
    // A step whose time has not come (or has passed: the placeholders once the site's own photos are made) says why
    // and the run goes on; nothing is recorded, so it runs once its time comes.
    const skipped = step.skip ? await step.skip(root) : null;
    if (skipped) { summary.push({ step: step.id, status: `skipped: ${skipped}` }); continue; }
    // An iteration run leaves the steps that call a model or read the reviews to the certification run.
    if (iterate && certificationOnly(step)) { summary.push({ step: step.id, status: 'skipped: certification only' }); continue; }
    const digests = await inputDigests(root, step.inputs, { raw: step.raw });
    const hash = digestsHash(digests);
    if (step.kind === 'agent') {
      if (await agentStepDone(root, step)) { await save('done'); continue; }
      why = 'its outputs are missing or not of the current shots';
      // The agent does the step; whether it is done is judged by its outputs, as for a person.
      if (doAgent && step.prompt) {
        const code = await runAgent(step, join(logs, `${step.id}.log`));
        if (code === 0 && await agentStepDone(root, step)) {
          await save('done');
          summary.at(-1).status = 'done by agent';
          if (repo) commitSite(root, `site-run: ${step.id} (agent)`);
          continue;
        }
        if (code === AGENT_UNAVAILABLE) summary.push({ step: step.id, status: 'not done: the agent is unavailable (usage limit); run again once it is back' });
      }
      await save('waiting');
      return { code: 2, waits: step.waits, summary };
    }
    // A step this run has no record of, whose outputs (adopt) are already there, is recorded as done without running.
    if (!from && !state[step.id] && step.adopt?.every((path) => existsSync(resolve(root, path)))) { await save('passed'); summary.at(-1).status = 'adopted'; continue; }
    // Unchanged inputs since the step last passed: nothing to do (a step before it ran again changes its inputs).
    // A step with a repair is at its best state there, as when it passes: a later repair (the design gate's) that breaks
    // it goes back to here (Staylumen 2026-11-17: its audits unchanged, the design gate's repair left 69 failures and no
    // state to go back to, so the run stopped on them).
    if (!from && !step.always && state[step.id]?.status === 'passed' && state[step.id].hash === hash) {
      summary.push({ step: step.id, status: 'unchanged' });
      if (repo && step.repair && !best.has(step.id)) best.set(step.id, { open: 0, commit: headCommit(root) });
      continue;
    }
    why = from ? `--from ${from}` : step.always ? 'runs every time' : !state[step.id] ? 'no record of it' : state[step.id].status !== 'passed' ? `it was ${state[step.id].status}` : `changed: ${changedInputs(step.inputs, state[step.id].inputs, digests).join(', ')}`;
    const log = join(logs, `${step.id}.log`);
    // keepGoing: every command runs (the preflight reports even when the release build refuses reference photos). A
    // command's exit code 2 means it waits for a person (WAITS); any other failure wins over it.
    const commands = async () => {
      let worst = 0;
      for (const command of step.run) {
        const code = await runner(command, root, log);
        if (code !== 0 && !step.keepGoing) return code;
        if (code !== 0 && (worst === 0 || worst === WAITS)) worst = code;
      }
      return worst;
    };
    // A test's runner runs no server.
    const preview = runner === run ? withPreview : (_root, _port, work) => work();
    const code = step.kind === 'preview' ? await preview(root, site.port, commands) : await commands();
    // A step with a repair (the layout audit, the design gate): a rule fix, else an agent repair; after either the run
    // goes on again from the step the repair names. Otherwise it stops for a person.
    const repairable = !iterate && step.repair && (code === WAITS ? step.repair.onWaits : code !== 0);
    const repaired = repairable ? (await ruleFix(step, log)) ?? (await agentRepair(step, log)) : null;
    if (repaired?.failed) { await save('failed'); return { code: 1, failed: step.id, log, summary }; }
    if (repaired?.restart) { at = list.findIndex((item) => item.id === (repaired.at ?? step.repair.restart)) - 1; continue; }
    // An optional repair that has done what it can (the small design findings): what is left stays in its report.
    if (code === WAITS && step.repair?.optional) {
      summary.push({ step: step.id, status: `${(await step.repair.problems(root)).length} left after the repairs (${step.repair.report})` });
      await save('passed');
      if (repo) commitSite(root, `site-run: ${step.id}`);
      continue;
    }
    // A step that ran and now waits for a person (the preflight's holds) still wrote its reports: they are recorded.
    if (code === WAITS && step.waitsOnExit) { await save('waiting'); if (repo) commitSite(root, `site-run: ${step.id} (waiting)`); return { code: 2, waits: step.waitsOnExit, summary }; }
    if (code !== 0) { await save('failed'); return { code: 1, failed: step.id, log, summary }; }
    // The hash after the run: a step that rewrites one of its own inputs (apply-image-library writes
    // template-variants.json) is not run again for its own output.
    await save('passed', await inputDigests(root, step.inputs, { raw: step.raw }));
    if (repo) commitSite(root, `site-run: ${step.id}`);
    // A step with a repair that passes is at its best state: a later repair (the design gate's) that breaks it and
    // cannot mend it goes back to here.
    if (repo && step.repair) best.set(step.id, { open: 0, commit: headCommit(root) });
    // The template core brought a new site-run.mjs: the rest of the run is the new one's (restart).
    if (step.id === 'core' && runner === run && await fileHash(resolve(root, 'scripts/site-run.mjs')) !== ownHash) return { code: 0, restart: true, summary };
  }
  return { code: 0, summary };
}

const fileHash = async (path) => createHash('sha256').update(await readFile(path).catch(() => '')).digest('hex');
// This orchestrator's own content when it started.
const ownHash = await fileHash(fileURLToPath(import.meta.url));

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ from: { type: 'string' }, to: { type: 'string' }, list: { type: 'boolean' }, iterate: { type: 'boolean' } });
  if (values.list) { console.log(steps(await readJson(resolve('site.json'))).map((step) => `${step.id} (${step.kind})`).join('\n')); return; }
  // One run on a site at a time (two hotel runs started together made its photo briefs twice): the lock is let go
  // before a restarted run takes it.
  const release = await takeRunLock(process.cwd());
  const result = await siteRun({ from: values.from ?? null, to: values.to ?? null, iterate: values.iterate === true }).finally(release);
  console.log(result.summary.map((item) => `${item.step}: ${item.status}`).join('\n'));
  console.log(reportLines(result.report).join('\n'));
  if (values.iterate) console.log('an iteration run: no model was called and nothing was verified; certify with site-run without --iterate');
  if (result.restart) {
    console.log('site-run.mjs changed with the template core: running the new one');
    process.exitCode = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1;
    return;
  }
  if (result.code === 2) console.log(`waiting for ${result.waits}`);
  if (result.code === 1) console.log(`failed at ${result.failed}; log: ${result.log}`);
  process.exitCode = result.code;
});
