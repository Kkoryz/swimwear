// Prelaunch check 3, near-duplicate content between pages of one kind (the same pageType, indexable): each pair's
// main text compared as the cross-site check compares sites (lib/content-fingerprint.mjs: 5-word shingles, MinHash),
// and its paragraphs compared one by one (the share of 5-word shingles two paragraphs share, Jaccard). A pair whose
// texts are PAGE_NEAR alike is an issue, with its alike paragraphs; a pair under it whose paragraphs repeat
// (PARAGRAPH_NEAR alike) is information, the paragraphs listed. Site Factory's sibling_similarity is not filled in its
// packages (null on every page of the Staylumen package of 2026-11-18), so the built pages are compared here.

import { decode } from '../built-site.mjs';
import { minhash, shingles, similarity, textWords } from '../content-fingerprint.mjs';
import { isIndexable } from '../seo-head.mjs';

export const PAGE_NEAR = 0.35;
export const PARAGRAPH_NEAR = 0.6;
// A paragraph shorter than this says too little to count as repeated copy (a label, a button, a list item of a word).
export const PARAGRAPH_MIN_WORDS = 12;
const PARAGRAPHS_LISTED = 10;

const plain = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// The page's paragraphs and list items in <main>, without its <nav> parts, scripts, styles, its asides (an article's
// author card) and the template's own reviewed-by line (p.page-updated): the same words on every page, not copy.
export function paragraphsOf(html) {
  const main = (html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '').replace(/<(script|style|noscript|nav|aside)\b[\s\S]*?<\/\1>/g, ' ').replace(/<p\b[^>]*\sclass="[^"]*\bpage-updated\b[^"]*"[\s\S]*?<\/p>/g, ' ');
  // A list item that is a link (a card of related pages or articles: their titles) is not copy either.
  const linkOnly = (inner) => plain(inner.replace(/<a\b[\s\S]*?<\/a>/g, ' ')).split(' ').filter(Boolean).length < 3;
  return [...main.matchAll(/<(p|li|blockquote|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)].filter((match) => !linkOnly(match[2])).map((match) => plain(match[2])).filter((text) => text.split(' ').length >= PARAGRAPH_MIN_WORDS);
}

const jaccard = (left, right) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
};

// pages: the site's pages; built: html by route; mainText(html): the page's main text (built-site parsePage).
export function nearFindings(pages, built, mainText) {
  const items = pages.filter((page) => isIndexable(page) && built.get(page.route)).map((page) => {
    const html = built.get(page.route);
    const paragraphs = paragraphsOf(html).map((text) => ({ text, set: shingles(textWords(text)) }));
    return { page, hash: minhash(shingles(mainText(html))), paragraphs };
  });
  const findings = [];
  const byType = Map.groupBy(items, (item) => item.page.pageType);
  for (const [pageType, group] of byType) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        const score = Number(similarity(a.hash, b.hash).toFixed(2));
        const alike = [];
        for (const left of a.paragraphs) {
          let best = null;
          for (const right of b.paragraphs) { const value = jaccard(left.set, right.set); if (value >= PARAGRAPH_NEAR && (!best || value > best.similarity)) best = { similarity: Number(value.toFixed(2)), text: left.text, other: right.text }; }
          if (best) alike.push(best);
        }
        if (score < PAGE_NEAR && !alike.length) continue;
        alike.sort((left, right) => right.similarity - left.similarity);
        findings.push({ level: score >= PAGE_NEAR ? 'issue' : 'info', kind: score >= PAGE_NEAR ? 'page_pair' : 'paragraphs', pageType, route: a.page.route, other: b.page.route, similarity: score, paragraphCount: alike.length, paragraphs: alike.slice(0, PARAGRAPHS_LISTED), detail: `${score} alike, ${alike.length} paragraph(s) repeated` });
      }
    }
  }
  return findings.sort((left, right) => right.similarity - left.similarity || right.paragraphCount - left.paragraphCount);
}
