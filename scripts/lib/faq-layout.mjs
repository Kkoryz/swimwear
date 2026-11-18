// Whether an FAQ block shows as an open list (four-site audit 2026-11-17, G3): each question an h3 and its answer shown
// under it, no disclosure. claude-seo seo-geo scores question headings; Modern Web Guidance (html.md) keeps headings out
// of a <summary> (b600760 moved the questions out of their h3 for that), so a list that must show its questions as
// headings shows its answers too. The FAQ page's blocks and long FAQ blocks (FAQ_OPEN_LIST_ITEMS questions or more)
// are open lists; a short FAQ keeps the reference's disclosure. Either way the block keeps its variant (the reference's
// look: rows, bars, cards), the FAQPage structured data is Site Factory's and unchanged.

// Questions from which an FAQ block is long enough to show as an open list (site13: FAQ blocks of 3 to 7 questions;
// the 6- and 7-question blocks ran their questions past a phone screen as closed rows).
export const FAQ_OPEN_LIST_ITEMS = 6;

// The site's FAQ page: its page type, its id (site:faq) or its route.
export const isFaqPage = (page) => Boolean(page) && (page.pageType === 'faq' || /(^|:)faq$/.test(String(page.id ?? '')) || /^\/faqs?\/$/.test(String(page.route ?? '')));

// Variants that show every answer already (their questions are headings, never a summary).
const OPEN_VARIANTS = new Set(['open-list', 'cards']);

/** @param {{ items?: unknown[] }} block @param {string | undefined} variant @param {any} [page] */
export function faqOpenList(block, variant, page = null) {
  if (OPEN_VARIANTS.has(String(variant))) return true;
  return isFaqPage(page) || (block.items?.length ?? 0) >= FAQ_OPEN_LIST_ITEMS;
}
