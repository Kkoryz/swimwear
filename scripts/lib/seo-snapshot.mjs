// SEO snapshot of a build and the drift between two snapshots. A release build records what search engines will read
// on every page; stage 11 compares it with the last approved baseline so a release cannot silently remove a page,
// add noindex, move a canonical or drop structured data. Rules follow claude-seo's drift comparison
// (MIT, AgriciDaniel/claude-seo: skills/seo-drift/references/comparison-rules.md), ported and kept in the project
// (no home-directory database).

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parsePage, readBuiltPages } from './built-site.mjs';
import { readJson, writeJson } from './json-io.mjs';
import { loadSitePages } from './site-pages.mjs';

export const SNAPSHOT_SCHEMA = 'seo-site-snapshot-v1';

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);

// What one built page says to search engines. Heading and content text keep their own normalisation: accepted
// baselines were hashed with it.
export function pageSnapshot(html) {
  const page = parsePage(html);
  const headings = (level) => page.headings.filter((heading) => heading.level === level).map((heading) => text(heading.html));
  const main = html.split('<main')[1]?.split('</main>')[0] ?? '';
  return {
    title: page.title,
    description: page.description,
    canonical: page.canonical,
    robots: page.robots,
    h1: headings(1)[0] ?? null,
    h2: headings(2),
    schemaTypes: page.jsonLd.flatMap((block) => (block.data === undefined ? ['invalid'] : [block.data['@type']].flat())).sort(),
    schemaHash: hash(page.jsonLd.map((block) => block.text).join('\n')),
    ogImage: page.meta.get('og:image') ?? null,
    contentHash: hash(text(main)),
  };
}

// The snapshot of the current build. pages and built (html by route) may be passed in by a caller that has read them.
export async function buildSnapshot(root = process.cwd(), { pages = null, built = null } = {}) {
  pages ??= await loadSitePages(root);
  built ??= await readBuiltPages(root, pages);
  const snapshot = {};
  for (const page of pages) if (built.get(page.route)) snapshot[page.route] = pageSnapshot(built.get(page.route));
  return { schemaVersion: SNAPSHOT_SCHEMA, takenAt: new Date().toISOString(), pages: snapshot };
}

export async function writeSnapshot(root = process.cwd()) {
  const snapshot = await buildSnapshot(root);
  await writeJson(resolve(root, 'docs/research/seo-snapshot.json'), snapshot);
  return snapshot;
}

export async function acceptSnapshot({ root = process.cwd(), by }) {
  if (!by) throw new Error('--by is required to accept a baseline');
  const snapshot = await readJson(resolve(root, 'docs/research/seo-snapshot.json'));
  const baseline = { ...snapshot, acceptedBy: by, acceptedAt: new Date().toISOString() };
  await writeJson(resolve(root, 'docs/research/seo-baseline.json'), baseline);
  return baseline;
}

// Word-set similarity of two short texts (0 to 1).
function similarity(left, right) {
  const words = (value) => new Set(String(value ?? '').toLowerCase().split(/\W+/).filter(Boolean));
  const a = words(left);
  const b = words(right);
  if (!a.size && !b.size) return 1;
  return [...a].filter((word) => b.has(word)).length / new Set([...a, ...b]).size;
}

// Changes from a baseline snapshot to a new one: critical ones hold a release until reviewed.
export function snapshotDrift(baseline, next) {
  const changes = [];
  const add = (level, route, rule, detail = '') => changes.push({ level, route, rule, detail });
  for (const [route, before] of Object.entries(baseline.pages)) {
    const after = next.pages[route];
    if (!after) { add('critical', route, 'page_removed'); continue; }
    if (!before.robots?.includes('noindex') && after.robots?.includes('noindex')) add('critical', route, 'noindex_added');
    if (before.canonical !== after.canonical) add('critical', route, 'canonical_changed', `${before.canonical} -> ${after.canonical}`);
    for (const type of before.schemaTypes) if (!after.schemaTypes.includes(type)) add('critical', route, 'schema_removed', type);
    if (before.title && !after.title) add('critical', route, 'title_removed');
    if (before.h1 && !after.h1) add('critical', route, 'h1_removed');
    if (before.title && after.title && before.title !== after.title) add('warning', route, 'title_changed', `${before.title} -> ${after.title}`);
    if (before.description !== after.description) add('warning', route, 'description_changed');
    if (before.h1 && after.h1 && similarity(before.h1, after.h1) < 0.5) add('warning', route, 'h1_changed', `${before.h1} -> ${after.h1}`);
    if (JSON.stringify(before.h2) !== JSON.stringify(after.h2)) add('info', route, 'h2_structure_changed');
    if (before.ogImage && !after.ogImage) add('warning', route, 'og_image_removed');
    if (before.schemaHash !== after.schemaHash) add('info', route, 'schema_changed');
    if (before.contentHash !== after.contentHash) add('info', route, 'content_changed');
  }
  for (const route of Object.keys(next.pages)) if (!baseline.pages[route]) add('info', route, 'page_added');
  return changes;
}

// Routes whose search-visible content changed, appeared or went away (IndexNow submits all three after a deploy).
export const changedRoutes = (changes) => [...new Set(changes.filter((change) => ['page_added', 'page_removed', 'content_changed', 'title_changed', 'description_changed', 'schema_changed', 'h1_changed', 'canonical_changed'].includes(change.rule)).map((change) => change.route))];
