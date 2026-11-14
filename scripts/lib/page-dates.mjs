// When each page's content last changed (src/data/page-dates.json: { route: { hash, modified } }), for the sitemap's
// lastmod. Google uses lastmod only when it is consistently accurate; Bing treats it as a key freshness signal. The
// date moves only when the page's own content (SEO fields, hero, blocks) changes, is recorded with the content (the
// importer updates it) and is output only while the recorded hash still matches the page, so a stale record never
// claims a wrong date. Never the build time.

import { createHash } from 'node:crypto';

export const pageHash = (page) => createHash('sha256').update(JSON.stringify({ seo: page.seo, hero: page.hero, blocks: page.blocks })).digest('hex').slice(0, 16);

export function updatePageDates(pages, previous = {}, today = new Date().toISOString().slice(0, 10)) {
  return Object.fromEntries(pages.map((page) => {
    const hash = pageHash(page);
    const before = previous[page.route];
    return [page.route, before?.hash === hash ? before : { hash, modified: today }];
  }));
}

// The page's lastmod, only when the record matches its current content. An article carries its own modified date.
export const lastModified = (page, dates) => page.article?.dateModified ?? (dates?.[page.route]?.hash === pageHash(page) ? dates[page.route].modified : null);
