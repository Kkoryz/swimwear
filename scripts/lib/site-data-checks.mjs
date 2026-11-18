// Checks that need only the site's data, no build, no photo, no model (four-site audit 2026-11-17, Fable's plan V-5):
// run right after the import (scripts/check-site-data.mjs) so that a page the template cannot ship, or copy Site
// Factory has to fix, stops the run in seconds instead of at the audits forty minutes later; the stage 10 SEO audit runs
// the same functions on the build. Each finding is { route, issue, detail, level: 'error' | 'warning' }; who clears it
// is lib/issue-owners.mjs's (ownerOf).

import { requiredBlocks } from './page-blueprints.mjs';
import { isEnquiryForm, isResourceForm, resourcePromise } from './resource-promise.mjs';
import { isIndexable } from './seo-head.mjs';
import { proofProblems } from './proof-consistency.mjs';
import { trustValueProblem } from './figure-reads.mjs';

const error = (route, issue, detail) => ({ route, issue, detail, level: 'error' });
const warning = (route, issue, detail) => ({ route, issue, detail, level: 'warning' });

// The pages that must carry the enquiry form (REQUIRED_BLOCKS: the contact and the inquiry page) carry it in their data
// (Strandmill audit 2026-11-17: three of four sites' "Request a quote" page had none).
export const formSlotProblems = (pages) => pages.filter((page) => requiredBlocks(page.pageType, page.id).includes('form') && !(page.blocks ?? []).some(isEnquiryForm)).map((page) => error(page.route, 'form_slot_missing', `a ${page.pageType === 'general' ? page.id : page.pageType} page with no enquiry form block`));

// An indexable blog hub lists at least one indexable post (lib/blog.mjs hubPages holds a hub with none published).
export function emptyBlogProblems(pages) {
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  return pages.filter((page) => page.pageType === 'blog_hub' && isIndexable(page)).filter((page) => !(page.blocks ?? []).some((block) => block.type === 'postList' && (block.items ?? []).some((item) => byRoute.get(item.href) && isIndexable(byRoute.get(item.href))))).map((page) => ({ route: page.route, issue: 'empty_blog_indexed', detail: 'an indexable blog hub with no published post' }));
}

export { FUNCTION_WORDS, trustValueProblem } from './figure-reads.mjs';
const words = (text) => String(text ?? '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
const singular = (word) => word.replace(/ies$/, 'y').replace(/(ch|sh|x|ss)es$/, '$1').replace(/s$/, '');

// The site's trust bar (src/data/site-trust.json) and each page's own figures (src/data/page-figures.json): every
// figure that does not read, where it shows (four-site audit 2026-11-17: swimwear's "65 that", hotel-rm's
// "5 years / Years experience").
export function trustValueProblems({ trust = null, pageFigures = null } = {}) {
  const found = [];
  for (const item of trust?.items ?? []) { const why = trustValueProblem(item); if (why) found.push(error('src/data/site-trust.json', 'trust_value_malformed', why)); }
  for (const [route, items] of Object.entries(pageFigures ?? {})) {
    if (!route.startsWith('/') || !Array.isArray(items)) continue;
    // A page's own figures are labelled by 08's page-figures step (derive-page-figures.mjs), not written by Site Factory.
    for (const item of items) { const why = trustValueProblem(item); if (why) found.push(error(route, 'page_figure_malformed', why)); }
  }
  return found;
}

// An indexable page whose copy promises a file (a download, a free guide) or that is the site tree's resources page,
// with no file linked and no resource request form (lib/resource-promise.mjs): the visitor has no way to get it.
export const promiseProblems = (pages) => pages.filter((page) => isIndexable(page) && !(page.blocks ?? []).some(isResourceForm)).flatMap((page) => {
  const promise = resourcePromise(page);
  return promise ? [error(page.route, 'promise_without_asset', promise.phrase ? `"${promise.phrase}" with no file link and no resource request form` : 'the resources page with no file link and no resource request form')] : [];
});

// Meta descriptions written from one skeleton (four-site audit 2026-11-17: 11 of the motel site's supporting pages):
// more than TEMPLATED_DESCRIPTIONS indexable pages whose description is the same once its own page's name (title, H1
// and main keyword words, the site name) and its numbers are taken out, or whose description names its own page as a
// subject in mid-text, as its title writes it ("…our team of 25. About Us introduces the people behind MotelPilot.",
// "Contact Us connects you with…": the motel's eleven). A warning for Site Factory, never a rewrite.
export const TEMPLATED_DESCRIPTIONS = 3;
// Fewer words left than this say nothing about a skeleton.
const MIN_SKELETON_WORDS = 6;
// A page's name as its title gives it: the title before its first separator (":", "|", " - ", " – ").
export const pageNameOf = (page) => String(page.seo?.title ?? '').split(/\s*(?::|\||\s[-–—]\s)\s*/)[0].trim();
export function templatedDescriptions(pages, { keywords = new Map(), siteName = '' } = {}) {
  const groups = new Map();
  const selfNamed = [];
  for (const page of pages.filter((item) => isIndexable(item) && item.seo?.description)) {
    const description = String(page.seo.description);
    const own = new Set([page.seo.title, page.hero?.heading, keywords.get(page.route), siteName].flatMap(words).map(singular));
    const skeleton = description.toLowerCase().replace(/\d[\d,.]*/g, '#').match(/[a-z#]+(?:'[a-z]+)?/g)?.filter((word) => word === '#' || !own.has(singular(word))) ?? [];
    if (skeleton.filter((word) => word !== '#').length >= MIN_SKELETON_WORDS) {
      const key = skeleton.join(' ');
      groups.set(key, [...(groups.get(key) ?? []), page.route]);
    }
    // The name in capitals as the title has it, not where the description opens on it; a one-word name only inside a
    // sentence ("our Resources"), where a capital is no sentence's first letter.
    const name = pageNameOf(page);
    const at = name && /^[A-Z]/.test(name) ? description.indexOf(name) : -1;
    if (at > 0 && (/\s/.test(name) || /[a-z,]\s$/.test(description.slice(0, at)))) selfNamed.push(page.route);
  }
  return [
    ...[...groups].filter(([, routes]) => routes.length > TEMPLATED_DESCRIPTIONS).map(([key, routes]) => warning(routes.join(' '), 'description_templated', `${routes.length} descriptions share one skeleton once the page's name is out: "${key.slice(0, 100)}"`)),
    ...(selfNamed.length > TEMPLATED_DESCRIPTIONS ? [warning(selfNamed.join(' '), 'description_templated', `${selfNamed.length} descriptions name their own page as its title does ("<page name> explains…"): one sentence pattern`)] : []),
  ];
}

// Every data check, in the order the early step reports them.
// proof, demo, facts: the stand-in proof, its trade's config and the approved facts (lib/proof-consistency.mjs).
export function siteDataProblems({ pages, trust = null, pageFigures = null, keywords = new Map(), siteName = '', proof = null, demo = null, facts = new Map() }) {
  return [
    ...formSlotProblems(pages),
    ...emptyBlogProblems(pages).map((problem) => ({ ...problem, level: 'error' })),
    ...trustValueProblems({ trust, pageFigures }),
    ...promiseProblems(pages),
    ...templatedDescriptions(pages, { keywords, siteName }),
    ...proofProblems({ proof, demo, pages, facts }),
  ];
}
