// The verified build (owner 2026-11-12: "不要把没跑完审计和整页评审的版本给业主看"): what the site's sources were when its
// layout audits passed and its design review was current and passed. The design gate records it
// (docs/research/verified-build.json); the preflight holds release and publish-preview.mjs refuses a preview while the
// sources differ from it, an audit has failures or the review is not of the current shots. Machine-checked pages the
// review did not look at are listed (auditedOnly): the review judges representative pages, not every route.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { readJson, writeJson } from './json-io.mjs';

export const VERIFIED_BUILD = 'docs/research/verified-build.json';
export const VERIFIED_SCHEMA = 'seo-site-verified-build-v1';

const walk = async (dir) => (existsSync(dir) ? (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])))).flat() : []);

// The sources a build is made from: every file of src by content, every file of public by path and size (photos are
// large and replaced whole). The release build reads the same sources, so its pages are the verified ones.
export async function sourceHash(root) {
  const hash = createHash('sha256');
  for (const file of (await walk(resolve(root, 'src'))).sort()) hash.update(relative(root, file).replaceAll('\\', '/')).update(await readFile(file));
  for (const file of (await walk(resolve(root, 'public'))).sort()) hash.update(relative(root, file).replaceAll('\\', '/')).update(String((await stat(file)).size));
  return hash.digest('hex').slice(0, 16);
}

// What the site's checks say now: the audits' failure counts (null: not run), the design review's status and whether
// it judged the current shots, the style board's status, the routes the review looked at.
export async function verificationState(root) {
  const data = (path) => readJson(resolve(root, path), null);
  const [layout, navigation, review, manifest, board] = await Promise.all(['docs/research/authoring-layout-audit.json', 'docs/research/navigation-shell-audit.json', 'docs/research/design-review.json', 'docs/research/design-review/manifest.json', 'docs/research/style-board-review.json'].map(data));
  return {
    layoutFailures: layout ? (layout.partial ? null : layout.failures?.length ?? 0) : null,
    navigationFailures: navigation ? navigation.failures?.length ?? 0 : null,
    review: review?.status ?? 'missing',
    reviewCurrent: Boolean(review && manifest && review.shots === manifest.id),
    reviewShots: manifest?.id ?? null,
    board: board?.status ?? 'missing',
    reviewed: [...new Set((manifest?.pages ?? []).map((page) => page.route).filter(Boolean))],
  };
}

// Why a build is not verified: [{ code, detail }].
export function verificationProblems(state) {
  const problems = [];
  if (state.layoutFailures === null) problems.push({ code: 'layout_audit_not_passed', detail: 'no full layout audit of this build (docs/research/authoring-layout-audit.json)' });
  else if (state.layoutFailures > 0) problems.push({ code: 'layout_audit_not_passed', detail: `the layout audit has ${state.layoutFailures} failure(s)` });
  if (state.navigationFailures === null) problems.push({ code: 'layout_audit_not_passed', detail: 'no navigation audit (docs/research/navigation-shell-audit.json)' });
  else if (state.navigationFailures > 0) problems.push({ code: 'layout_audit_not_passed', detail: `the navigation audit has ${state.navigationFailures} failure(s)` });
  if (state.board !== 'passed') problems.push({ code: 'design_review_not_current', detail: `the style board review is ${state.board}` });
  if (state.review !== 'passed') problems.push({ code: 'design_review_not_current', detail: `the page design review is ${state.review}` });
  else if (!state.reviewCurrent) problems.push({ code: 'design_review_not_current', detail: 'the page design review judged earlier shots than the current ones (docs/research/design-review/manifest.json)' });
  return problems;
}

// Records the verified build; throws with the problems when the checks do not all pass. routes: the site's built routes.
export async function recordVerifiedBuild(root, routes, { at = new Date().toISOString() } = {}) {
  const state = await verificationState(root);
  const problems = verificationProblems(state);
  if (problems.length) throw new Error(`not a verified build: ${problems.map((problem) => problem.detail).join('; ')}`);
  const reviewed = new Set(state.reviewed);
  const record = { schemaVersion: VERIFIED_SCHEMA, at, source: await sourceHash(root), reviewShots: state.reviewShots, reviewed: routes.filter((route) => reviewed.has(route)), auditedOnly: routes.filter((route) => !reviewed.has(route)) };
  await writeJson(resolve(root, VERIFIED_BUILD), record);
  return record;
}

// Whether the sources now are the verified ones, and what holds them: { record, current, problems }.
export async function verifiedNow(root) {
  const record = await readJson(resolve(root, VERIFIED_BUILD), null);
  const problems = verificationProblems(await verificationState(root));
  if (!record) problems.unshift({ code: 'verified_build_missing', detail: 'no verified build: run the pipeline through design-gate (docs/research/verified-build.json)' });
  else if (record.source !== await sourceHash(root)) problems.unshift({ code: 'verified_build_mismatch', detail: `the sources changed after the build was verified (${record.at}): audit and review this build` });
  return { record, current: problems.length === 0, problems };
}
