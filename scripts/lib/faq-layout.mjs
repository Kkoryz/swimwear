// How questions and answers show. Every FAQ folds, as the competitors' FAQ pages and sections do (owner 2026-11-18: "FAQ
// 也没折叠"; the reference's /faqs and /management, Awning, Evolve and Vacasa: every answer closed under its question),
// the FAQ page and long FAQ blocks included: the four-site audit's open lists (2026-11-17, G3) ran the FAQ page several
// screens long. A question stays the summary's own text (Modern Web Guidance, html.md: a heading inside a <summary>
// loses its heading role); the answers stay in the page's HTML, closed or open, and Site Factory's FAQPage structured
// data is unchanged. Only the open variants (open-list, cards) show every answer, their questions as h3 headings.

// Questions from which the photo plan measured an FAQ block as an open list (the 2026-11-17 rule). The site's photos
// were placed with that measure; the hand fix of 2026-11-18 folds the FAQs but keeps the measure (faqPlannedOpen), so
// no photo wall or photo is dropped or moves (owner 2026-11-18: no fewer photos).
export const FAQ_OPEN_LIST_ITEMS = 6;

// The site's FAQ page: its page type, its id (site:faq) or its route.
export const isFaqPage = (page) => Boolean(page) && (page.pageType === 'faq' || /(^|:)faq$/.test(String(page.id ?? '')) || /^\/faqs?\/$/.test(String(page.route ?? '')));

// Variants that show every answer already (their questions are headings, never a summary).
const OPEN_VARIANTS = new Set(['open-list', 'cards']);

// Whether the block renders as an open list (FaqBlock.astro): the open variants only.
/** @param {{ items?: unknown[] }} _block @param {string | undefined} variant @param {any} [_page] */
export function faqOpenList(_block, variant, _page = null) {
  return OPEN_VARIANTS.has(String(variant));
}

// Whether the photo plan measures the block as an open list (lib/media-slots.mjs modelVariant): the measure the site's
// photos were placed with, kept (the FAQ page and long FAQ blocks, FAQ_OPEN_LIST_ITEMS questions or more).
/** @param {{ items?: unknown[] }} block @param {string | undefined} variant @param {any} [page] */
export function faqPlannedOpen(block, variant, page = null) {
  if (OPEN_VARIANTS.has(String(variant))) return true;
  return isFaqPage(page) || (block.items?.length ?? 0) >= FAQ_OPEN_LIST_ITEMS;
}

// Blocks that never fold on the FAQ page: the FAQ (it folds by itself), the calls, forms and links, the photo walls.
const NEVER_FOLDS = new Set(['faq', 'cta', 'form', 'contactChannels', 'relatedPages', 'gallery', 'figure', 'band']);
const asksQuestion = (heading) => /\?\s*$/.test(String(heading ?? '').trim());

// The FAQ page's sections that answer one question in another presentation than an FAQ block (Staylumen 2026-11-18: its
// FAQ page answered "How soon can my home go live?" in a split row with its timeline and the contract terms in a check
// list, every answer shown): each folds under its question as an FAQ item does, the blocks going on from it (continues)
// with it. Returns each folded block's fold: { head: the block whose heading is the question, question }.
/** @param {any} page @param {{ id: string, type: string, heading?: string, continues?: string }[]} blocks */
export function faqPageFolds(page, blocks = page?.blocks ?? []) {
  const folds = new Map();
  if (!isFaqPage(page)) return folds;
  for (const block of blocks) {
    const from = block.continues != null ? folds.get(block.continues) : null;
    if (from) folds.set(block.id, from);
    else if (!NEVER_FOLDS.has(block.type) && asksQuestion(block.heading)) folds.set(block.id, { head: block.id, question: String(block.heading).trim() });
  }
  return folds;
}
