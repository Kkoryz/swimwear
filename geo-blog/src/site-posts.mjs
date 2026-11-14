import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

// Articles the site already has (published or in review): the questions they answer are their H2 headings.
// `excludeSlug` is this run's own article; `config.replaces` names an older slug of it that a rewrite replaces.
export function sitePosts(config, { excludeSlug = null } = {}) {
  const own = new Set([excludeSlug, ...[config.replaces ?? []].flat()].filter(Boolean));
  const dir = config.site_dir ?? config.site_import?.cwd;
  const file = dir && join(dir, 'src/data/blog-posts.json');
  if (!file || !existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const posts = Array.isArray(data) ? data : data.posts ?? [];
  return posts
    .filter((p) => ['published', 'review'].includes(p.status) && !own.has(p.slug))
    .map((p) => ({ slug: p.slug, title: p.title, seoTitle: p.seo?.title ?? null, headings: (p.sections ?? []).map((s) => s.heading).filter(Boolean) }));
}

// Questions other runs for the same site have already picked (their articles may not be on the site yet), as posts.
export function siblingRuns(config) {
  const siteOf = (c) => { const s = c.site_dir ?? c.site_import?.cwd ?? c.site_sitemap; return s && resolve(s).replace(/[\\/]+$/, '').toLowerCase(); };
  const site = siteOf(config);
  if (!site) return [];
  const runsDir = dirname(config.runDir);
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && join(runsDir, d.name) !== config.runDir)
    .map((d) => join(runsDir, d.name))
    .filter((dir) => existsSync(join(dir, 'config.json')) && existsSync(join(dir, '01-questions.json')))
    .filter((dir) => { const c = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')); return siteOf(c) === site; })
    .map((dir) => ({ slug: `(run ${basename(dir)})`, title: '', seoTitle: null, headings: JSON.parse(readFileSync(join(dir, '01-questions.json'), 'utf8')).questions.map((q) => q.question) }));
}

// This run's article slug, when it has written one before (a rewrite keeps the site from counting it as another post).
export function ownSlug(config) {
  const article = join(config.runDir, '06-article.md');
  if (!existsSync(article)) return config.slug ?? null;
  return readFileSync(article, 'utf8').match(/^slug:\s*"?([^"\r\n]+)"?/m)?.[1] ?? config.slug ?? null;
}

const STOP = new Set('a an and are as at be by can could do does for from how i in into is it my of on or our should the their this to what when where which who why will with you your'.split(' '));
const words = (text) => new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.slice(0, 6)));

// Share of meaningful words two questions have in common (0–1).
export function overlap(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  const common = [...x].filter((w) => y.has(w)).length;
  return common / Math.min(x.size, y.size);
}

export const SAME_QUESTION = 0.6;

// Existing post headings a question repeats.
export function answeredBy(question, posts) {
  return posts.flatMap((p) => p.headings.filter((h) => overlap(question, h) >= SAME_QUESTION).map((h) => ({ slug: p.slug, heading: h })));
}

export function postsForPrompt(posts) {
  if (!posts.length) return '(none)';
  return posts.map((p) => `- /blog/${p.slug}/ — "${p.title}"\n${p.headings.map((h) => `    · ${h}`).join('\n')}`).join('\n');
}
