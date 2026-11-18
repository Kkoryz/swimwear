// A long content page's table of contents (four-site audit 2026-11-17, G5 and the site13 blind audit L8: the site's
// pages ran about 14,800px on a phone, the longest 24,900px; claude-seo seo-content "Table of contents for long-form
// content"): under the hero, a list of the page's sections linking to each one's own anchor (the section's id is its
// block's id, PageView.astro). Only a page of TOC_MIN_WORDS words or more with TOC_MIN_SECTIONS headed sections gets
// one; the home and contact pages and the blog (a post has its own contents) get none, nor does a placeholder page.
// The table is the template's: it names the sections as Site Factory headed them and changes no copy.

import { copyWords } from './media-slots.mjs';

// Words from which a page counts as long (site13: commercial pages of 1,050 to 3,100 words; the blog's posts take a
// contents box from 2,000, claude-blog blog_hygiene; a page's sections are shorter than an article's).
export const TOC_MIN_WORDS = 1500;
// Headed sections a table needs: fewer are found by scrolling.
export const TOC_MIN_SECTIONS = 4;
export const TOC_HEADING = 'On this page';
export const UNLISTED_PAGE_TYPES = Object.freeze(['home', 'contact', 'blog_hub', 'blog_post']);
// Sections that are no part of the page's subject: the closing call and the links to other pages.
const UNLISTED_BLOCKS = new Set(['cta', 'relatedPages']);
// The table's place in the page's sections (lib/section-surfaces.mjs tintedSections, the layout plan).
export const PAGE_TOC = Object.freeze({ id: 'page-toc', type: 'pageToc' });

// An anchor a URL fragment and an id can both carry: the block's id as it is (FormBlock.astro already uses it).
const anchorable = (id) => /^[A-Za-z][\w.:-]*$/.test(String(id ?? '')) && id !== 'main';

// The page's table: [{ anchor, heading }] for its headed sections in page order, or [] when it takes none.
/** @param {any} page @param {any[]} [blocks] the blocks the page renders (its own and the photo walls joined to them) */
export function pageToc(page, blocks = page.blocks ?? []) {
  if (!page || UNLISTED_PAGE_TYPES.includes(page.pageType) || page.status === 'placeholder') return [];
  if (copyWords(page.hero ?? {}) + copyWords(blocks) < TOC_MIN_WORDS) return [];
  const entries = blocks.filter((block) => block.heading && !block.continues && !UNLISTED_BLOCKS.has(block.type) && anchorable(block.id)).map((block) => ({ anchor: block.id, heading: String(block.heading).trim() }));
  return entries.length >= TOC_MIN_SECTIONS ? entries : [];
}
