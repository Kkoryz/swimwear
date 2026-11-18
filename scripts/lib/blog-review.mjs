// The AI review a GEO article passes before it is published (owner 2026-11-16, through Site Factory): always on, no
// person in the loop and no switch to turn it off. Light on purpose: figures, sources, conflicts and competitors are
// checked while the article is written, so only what can change after that is looked at here: our own claims the
// writer left as placeholders, links the site cannot open, pictures off the subject (the image judge,
// judge-image-fit.mjs) and an article broken on its way in. An article that passes goes to the publishing queue
// (content/blog-queue/approved); one that fails stays in drafts with the reasons.

import { join } from 'node:path';
import { inlineLinks, sectionTexts } from './blog.mjs';

export const REVIEWER = 'ai-review';

// The run's final files: the naturalized article and its replacement list when the writer made them
// (06-article.natural.md, 06-replacements.natural.json), else the first draft's. exists: (path) => boolean.
export function articleFiles(runDir, exists) {
  const pick = (natural, plain) => [natural, plain].map((name) => join(runDir, name).replace(/\\/g, '/')).find(exists) ?? null;
  return { article: pick('06-article.natural.md', '06-article.md'), replacements: pick('06-replacements.natural.json', '06-replacements.json') };
}

// The writer's replacement list applied to the article. An entry with real replaces its text; one with status removed
// drops it; an example (a worked figure the writer labels as assumed) stays as written; any other kind without real is
// our own claim (a case, a test result ...) still a stand-in: it stays in the text and is pending, for the owner to fill
// or remove. A text the article does not hold exactly once cannot be replaced: the article broke on its way in.
export function applyReplacements(markdown, replacements = []) {
  let text = markdown;
  const pending = [];
  const broken = [];
  for (const entry of replacements) {
    const real = typeof entry.real === 'string' ? entry.real.trim() : '';
    const removed = entry.status === 'removed';
    if (!real && !removed) {
      if (entry.kind !== 'example') pending.push({ id: entry.id, kind: entry.kind, section: entry.section ?? null, needed: entry.needed ?? null });
      continue;
    }
    const count = text.split(entry.text).length - 1;
    if (count !== 1) { broken.push(`replacement ${entry.id}: its text occurs ${count} times in the article (needs exactly 1)`); continue; }
    text = text.replace(entry.text, () => (removed ? '' : real));
  }
  return { markdown: text, pending, broken };
}

// Links the writer placed for routes the site names otherwise, moved by a map { "/writer/route/": "/site/route/" }.
export const rerouteLinks = (markdown, routes = {}) => markdown.replace(/\]\((\/[^)\s#?]*)([^)\s]*)\)/g, (link, route, rest) => (routes[route] ? `](${routes[route]}${rest})` : link));

const routeOf = (href) => href.replace(/[#?].*$/, '');
const postTexts = (post) => [...(post.lead ?? []), ...(post.sections ?? []).flatMap((section) => [...sectionTexts(section), ...(section.body ?? []).flatMap((part) => part.table?.rows.flat() ?? [])])];

// Our claims still the writer's stand-ins, as the review reports them (not failures).
export const reviewPlaceholders = (pending = []) => pending.map((item) => `placeholder: ${item.id} (${item.kind}) is still the writer's stand-in for our own claim; fill real or remove it${item.needed ? `: ${item.needed}` : ''}`);

// The review's failures (an empty list passes). pages: the site's built pages; pending: our claims still placeholders
// (applyReplacements); pictures: the made visuals the page shows, with the judge's label (fits, or why not) and a
// look-alike; missing: visuals the page places that were not made; seoMissing: frontmatter fields the article lacks;
// broken: what broke on the way in.
export function reviewArticle({ post, pages = [], pending = [], pictures = [], missing = [], seoMissing = [], broken = [] }) {
  // Our claims still the writer's stand-ins (`pending`) hold nothing (owner 2026-11-18: an article with stand-ins is
  // published; the package keeps the list, publishing reports it): reviewPlaceholders names them.
  const failures = [];
  const built = new Set(pages.map((page) => page.route));
  for (const link of postTexts(post).flatMap(inlineLinks)) if (link.href.startsWith('/') && !built.has(routeOf(link.href))) failures.push(`link: "${link.label}" goes to ${link.href}, which the site does not have`);
  for (const picture of pictures) {
    if (picture.fit !== 'fits') failures.push(`picture: ${picture.id} does not fit its section (judge: ${picture.fit})`);
    if (picture.lookAlike) failures.push(`picture: ${picture.id} looks like ${picture.lookAlike}`);
  }
  for (const id of missing) failures.push(`picture: ${id} is placed in the article but was not made`);
  for (const field of seoMissing) failures.push(`article: the frontmatter has no ${field}`);
  for (const item of broken) failures.push(`article: ${item}`);
  return failures;
}
