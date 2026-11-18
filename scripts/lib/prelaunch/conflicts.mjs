// Prelaunch check 6, site-wide conflicts: the site's pages and articles held to Site Factory's site fact library. The
// judgment is Site Factory's (owner 2026-11-18: its fact library and its prompts; never moved into the template): the
// conflicts step (scripts/site-conflicts.mjs) runs the command site.json siteConflicts names, on this machine, and
// reads the results it writes; this check reads what that step recorded (docs/research/prelaunch/conflicts-source.json)
// and holds it to the content as it is now.
// site.json siteConflicts: { command: [program, ...args], cwd?, results } - results is the folder the command writes:
// library_check.json ({ confirmed: [[row, ...]] }: library rows that contradict each other), pages.json and blogs.json
// ([{ sentence, docs: [page id | post slug], label: 'consistent' | 'not_in_library' | 'other' | 'conflicts:<row id>',
// row }]); the shape of Site Factory's sitecheck (stage_review/sitecheck_1118/run_sitecheck.py) of 2026-11-18.
// Where Site Factory cannot run (GitHub Actions) and no result of this machine stands for the content as it is, the
// check says it needs a run on this machine: never a pass.

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readJson } from '../json-io.mjs';

export const SOURCE_SCHEMA = 'seo-site-conflicts-source-v1';
export const SOURCE_PATH = 'docs/research/prelaunch/conflicts-source.json';
// What Site Factory's check reads of the site: its pages' copy and its articles.
export const CONTENT_FILES = Object.freeze(['src/data/authoring-pages.json', 'src/data/blog-posts.json']);

// The content the check judged, as data (line endings and indentation of a checkout aside).
export async function contentKey(root) {
  const hash = createHash('sha256');
  for (const file of CONTENT_FILES) hash.update(file).update('\0').update(JSON.stringify(await readJson(resolve(root, file), null))).update('\0');
  return hash.digest('hex').slice(0, 16);
}

export const onCi = (env = process.env) => env.GITHUB_ACTIONS === 'true' || env.CI === 'true';

// Findings of Site Factory's results: [{ level, kind: 'library' | 'page' | 'blog', route?, detail, ... }].
// routeOf: page id -> route.
export function sfConflictFindings({ library = null, pages = [], blogs = [] }, routeOf = new Map()) {
  const findings = [];
  for (const group of library?.confirmed ?? []) findings.push({ level: 'issue', kind: 'library', rows: group.map((row) => row.id), detail: `site facts that contradict each other: ${group.map((row) => `${row.id} (${row.topic ?? ''}) ${row.text}`).join(' / ')}` });
  for (const [kind, list] of [['page', pages], ['blog', blogs]]) {
    for (const item of list ?? []) {
      if (!String(item.label ?? '').startsWith('conflicts:')) continue;
      const routes = (item.docs ?? []).map((doc) => (kind === 'blog' ? `/blog/${doc}/` : routeOf.get(doc) ?? doc));
      findings.push({ level: 'issue', kind, route: routes.join(' '), routes, row: item.row?.id ?? item.label.slice('conflicts:'.length), detail: `"${item.sentence}" contradicts ${item.row?.id ?? item.label.slice('conflicts:'.length)}: ${item.row?.text ?? ''}${item.row?.condition ? ` (${item.row.condition})` : ''}` });
    }
  }
  return findings;
}

// The check: { status?, findings, notes }. status 'needs_local' when no result of this machine stands for the content.
export async function conflictFindings({ root, env = process.env }) {
  const source = await readJson(resolve(root, SOURCE_PATH), null);
  const key = await contentKey(root);
  const needsLocal = (why) => ({ status: 'needs_local', findings: [{ level: 'issue', kind: 'needs_local', detail: `needs a run on this machine (node scripts/site-conflicts.mjs, site-run's conflicts step): ${why}` }], notes: [onCi(env) ? 'Site Factory does not run here (GitHub Actions): a result of this machine for this content is needed, never a pass' : 'run the conflicts step on this machine'] });
  if (!source || source.schemaVersion !== SOURCE_SCHEMA) return needsLocal('no recorded result');
  if (source.content !== key) return needsLocal(`the pages or articles changed since it ran (${source.checkedAt})`);
  return { findings: source.findings, notes: [`Site Factory's check of ${source.checkedAt} (${source.results}), for this content${onCi(env) ? ' (run on the owner\'s machine)' : ''}`] };
}
