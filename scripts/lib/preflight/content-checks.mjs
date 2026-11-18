// Preflight checks on the content: Site Factory's record and holds, the owner's sign-off, placeholders.
import { placeholderProperties } from '../review-markup.mjs';
import { sitePeople } from '../site-people.mjs';
import { PLACEHOLDER_BLOCKS, placeholderRoutes } from '../site-proof.mjs';
import { found } from './findings.mjs';
import { hasLaunchReason } from './owner-pack-checks.mjs';

export const CONTENT_CHECKS = [
  // A record a check depends on that is missing holds the release; it never reads as "nothing to report".
  { code: 'import_record_missing', level: 'hold', run: (ctx) => !ctx.imported && ctx.pages.some((page) => page.status === 'authored' && !page.pageType.startsWith('blog_')) && { detail: 'authored pages without docs/research/site-factory-import.json (Site Factory holds cannot be checked): run the importer' } },
  // A release is built from content a clean Site Factory commit made (a -dirty code version cannot be reproduced).
  { code: 'upstream_uncommitted', level: 'hold', run: (ctx) => /-dirty$/.test(ctx.imported?.upstream?.codeVersion ?? '') && { detail: `the Site Factory package was made by uncommitted code (${ctx.imported.upstream.codeVersion}): import one made from a clean commit` } },
  { code: 'slot_manifest_mismatch', level: 'hold', run: (ctx) => ctx.imported?.upstream?.slotManifestMatches === false && { detail: `the pages were planned on ${ctx.imported.upstream.plannedSlotManifest}, not the slot manifest they were imported with: import with that manifest, or have Site Factory plan on this one` } },
  // Site Factory holds, unchanged and first: the pages it holds and builds for review (held), then the ones it does not.
  { code: 'inherited', level: 'hold', run: (ctx) => [...(ctx.imported?.held || []), ...(ctx.imported?.skipped || [])].flatMap((skipped) => (skipped.holdReasons?.length ? skipped.holdReasons : [skipped.reason]).map((reason) => ({ code: `inherited:${reason}`, detail: `Site Factory held ${skipped.pageId}`, items: [skipped.pageId] }))) },
  // Owner sign-off: what the owner must replace or confirm before launch (docs/research/release-signoff.json); a fact
  // item names the pages citing that fact.
  { code: 'release_signoff_missing', level: 'hold', run: (ctx) => !ctx.signoff && { detail: 'no docs/research/release-signoff.json: list what the owner must replace or confirm before launch' } },
  // What Site Factory borrowed from competitors (placeholder: true), testimonials and order routes, on a built page holds
  // release until the owner replaces it or confirms its sign-off item (pnpm signoff --confirm placeholder-testimonials).
  ...PLACEHOLDER_BLOCKS.map(({ type, signoff, hold, what }) => ({ code: hold, level: 'hold', run: (ctx) => {
    const confirmed = (ctx.signoff?.items || []).some((entry) => entry.id === signoff && entry.status === 'confirmed');
    const routes = placeholderRoutes(ctx.pages, type);
    return !confirmed && routes.length > 0 && { detail: `pages show ${what} (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm ${signoff}`, items: routes };
  } })),
  // Placeholder prices, reviews or ratings in structured data (Site Factory structuredDataPlaceholders): no sign-off
  // releases them; only real values do.
  { code: 'placeholder_structured_data', level: 'hold', run: (ctx) => found('structured data with placeholder prices, reviews or ratings (Site Factory structured_data_placeholders): real values are needed, no sign-off releases them', ctx.pages.flatMap((page) => placeholderProperties(page).map((property) => `${page.route} ${property}`))) },
  // An item Site Factory gave a launch reason (scope_unconfirmed, needs_owner_number) holds under that code instead.
  { code: 'owner_signoff_pending', level: 'hold', run: (ctx) => (ctx.signoff?.items || []).filter((entry) => entry.status !== 'confirmed' && !PLACEHOLDER_BLOCKS.some((block) => block.signoff === entry.id) && !hasLaunchReason(entry)).map((item) => ({ detail: `${item.id}: ${item.description}`, items: item.factId ? (ctx.imported?.pages || []).filter((page) => (page.citedFacts || []).includes(item.factId)).map((page) => page.route) : item.pageId ? ctx.pages.filter((page) => page.id === item.pageId).map((page) => `${page.route}${item.sectionId ? ` ${item.sectionId}` : ''}`) : [] })) },
  // Named people (four-site audit 2026-11-17): the owner may name nobody, so a site without them is a notice, never a
  // hold; stand-in people hold through their sign-off item (proof-team) like every stand-in.
  { code: 'people_missing', level: 'notice', run: (ctx) => !sitePeople(ctx.pages) && { detail: 'no named people on the site (src/data/site-proof.json team: the about page\'s team section, the blog\'s author): allowed, but it lowers E-E-A-T and GEO (who stands behind the site, who wrote its articles)' } },
  // Pages still holding placeholder copy (noindex, not in the sitemap).
  { code: 'placeholder_page_present', level: 'hold', run: (ctx) => found('pages still show placeholder copy and are noindex', ctx.pages.filter((page) => page.status === 'placeholder').map((page) => page.route)) },
  // Articles built for review (blog-posts.json status review, e.g. imported by blog:geo): published only through the
  // blog queue's checks and a person's review (blog:publish).
  { code: 'blog_post_in_review', level: 'hold', run: (ctx) => found('articles are built for review only (noindex): review them and publish them with blog:publish', ctx.pages.filter((page) => page.pageType === 'blog_post' && page.status === 'hold').map((page) => page.route)) },
];
