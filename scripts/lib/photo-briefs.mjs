// What each page section's photo shows when Site Factory gave it no visual: planned from the page's own copy
// (plan-photo-briefs.mjs; owner 2026-11-06: a site's photos follow what its pages say, not a trade's stock subjects).
// src/data/photo-briefs.json holds them, route -> block id -> photo visuals ({ id, type: "photo", content, setting,
// caption }); withPhotoBriefs lays them on the pages' blocks as Site Factory's own visuals would be, so the renderer,
// the image plan and the audits all see one set of pages (lib/site-pages.mjs, src/lib/site-data.ts).

import { allocateSite } from './media-allocation.mjs';

export const PHOTO_BRIEFS_SCHEMA = 'seo-site-photo-briefs-v1';
// Sections whose photo positions a brief does not describe: cards (each photo is its card's, image-plan.mjs topic
// photos) and the text sections that would turn into a photo row when given a photo visual (media-slots.mjs askedPhoto).
export const UNBRIEFED_BLOCKS = new Set(['featureGrid', 'gallery', 'caseStudies', 'styleGrid', 'testimonials', 'intro', 'proof']);
// Pages whose photos are not planned here: the blog's own (its articles bring their pictures) and the legal page.
const UNBRIEFED_PAGES = new Set(['blog_hub', 'blog_post', 'privacy']);

// The pages with the briefs laid on their blocks: a block with photo visuals of its own (Site Factory's) keeps them.
export function withPhotoBriefs(pages, briefs) {
  if (!briefs) return pages;
  return pages.map((page) => {
    const own = briefs[page.route];
    if (!own || !page.blocks) return page;
    return { ...page, blocks: page.blocks.map((block) => (own[block.id]?.length && !(block.visuals ?? []).some((visual) => visual.type === 'photo') ? { ...block, visuals: [...(block.visuals ?? []), ...own[block.id]] } : block)) };
  });
}

// The photo positions a brief describes, by route: [{ blockId, heading, kind, count }] in page order (the site's
// allocation run on an empty library, as the image plan probes it).
export function briefSlots(pages, components) {
  const built = new Set(pages.map((page) => page.route));
  const briefed = pages.filter((page) => !UNBRIEFED_PAGES.has(page.pageType) && page.blocks?.length);
  const { unfilled } = allocateSite({ pages: briefed, components: { ...components, media: { placeholders: [] } }, isBuilt: (href) => !href.startsWith('/') || built.has(href) });
  const slots = {};
  for (const page of briefed) {
    const blocks = new Map(page.blocks.map((block) => [block.id, block]));
    for (const request of unfilled.filter((item) => item.route === page.route && !item.intent && blocks.has(item.blockId))) {
      const block = blocks.get(request.blockId);
      if (UNBRIEFED_BLOCKS.has(block.type) || (block.visuals ?? []).some((visual) => visual.type === 'photo')) continue;
      const list = (slots[page.route] ||= []);
      const same = list.find((slot) => slot.blockId === request.blockId);
      if (same) same.count += 1;
      else list.push({ blockId: request.blockId, heading: block.heading ?? null, kind: request.kind, count: 1 });
    }
  }
  return slots;
}

// The judge's reply: one photo per position, every position filled ({ blockId: [visual] }).
export function parseBriefs(reply, slots) {
  const line = reply.trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  if (!line) throw new Error('the reply has no JSON line');
  const photos = JSON.parse(line).photos;
  if (!Array.isArray(photos)) throw new Error('the reply has no photos list');
  const byBlock = {};
  for (const photo of photos) {
    const slot = slots.find((item) => item.blockId === photo?.section);
    if (!slot) throw new Error(`the reply names a section with no photo position: ${photo?.section}`);
    if (typeof photo.content !== 'string' || !photo.content.trim()) throw new Error(`a photo of ${photo.section} says nothing it shows`);
    const list = (byBlock[slot.blockId] ||= []);
    if (list.length >= slot.count) throw new Error(`more photos than positions for ${slot.blockId}`);
    list.push({ id: `brief-${slot.blockId}-${list.length + 1}`, type: 'photo', content: photo.content.trim(), ...(photo.setting ? { setting: String(photo.setting).trim() } : {}), ...(photo.caption ? { caption: String(photo.caption).trim() } : {}) });
  }
  const short = slots.filter((slot) => (byBlock[slot.blockId]?.length ?? 0) < slot.count);
  if (short.length) throw new Error(`no photo for ${short.map((slot) => slot.blockId).join(', ')}`);
  return byBlock;
}
