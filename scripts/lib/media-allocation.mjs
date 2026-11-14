// Which photo goes where, for the whole site at once (the renderer places it, the image plan generates what is
// missing). Each image position asks for a photography class about something: the product category its heading or
// card names, else its page's category, with the heading as its topic. It takes only a photo of that category (the
// line's general photos only where neither names one), the photo made for its topic first, then the one used least
// on the site so far. With none left it stays an image slot, never another product's photo. Classes waiting for the
// manufacturer's own photos (the factory) take the site photo whose description shares most words with the heading.

import { galleryShown } from './gallery.mjs';
import { fitsFrames, slotFrames } from './media-ratio.mjs';
import { mediaIntents, mediaSlots, mediaTopics, resolveVariant, withMediaModules } from './media-slots.mjs';
import { SHARED_KINDS, SITE_WIDE_KINDS } from './rules.mjs';

// The key of a photo made for one section's visual: its page and the visual's id.
export const intentKey = (route, id) => `${route}#${id}`;

export const GENERAL = 'general';

const STOP = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'with', 'our', 'your', 'we', 'you', 'by', 'from', 'at', 'is', 'are', 'how', 'what', 'why']);
// Words of a heading or description, plural "s" dropped ("socks" matches "sock"; "dress" stays).
export const topicWords = (text) => new Set(String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
  .filter((word) => word.length > 1 && !STOP.has(word)).map((word) => word.replace(/(?<=\p{L}{2}[^s])s$/u, '')));

// The product category a text names: the one with the most words, all of them in the text ("sports bra" over "bra").
export function namedCategory(text, categories) {
  const words = topicWords(text);
  let best = null;
  for (const category of categories) {
    const needed = topicWords(category);
    if (needed.size && [...needed].every((word) => words.has(word)) && (!best || needed.size > topicWords(best).size)) best = category;
  }
  return best;
}

const overlap = (text, words) => [...topicWords(text)].filter((word) => words.has(word)).length;

// Kinds a slot may fall back to when its own class has no photo of the right category. Fabric and trims are not a
// product, so a category page may show the line's general material photo.
const FALLBACK = { product: ['product'], process: ['process'], material: ['material'], lifestyle: ['lifestyle'], portrait: ['portrait'] };
const CATEGORY_FREE = new Set(['material']);

// The template's photos as one list with their category: pools are the line's general photos, routePools a product
// page's own (their category from the image plan, else the route itself).
export function templateLibrary(media = {}) {
  const library = [];
  const seen = new Set();
  const add = (item, kind, category) => { if (!seen.has(item.src)) { seen.add(item.src); library.push({ ...item, kind, category: item.category ?? category }); } };
  for (const [route, pools] of Object.entries(media.routePools ?? {})) for (const [kind, items] of Object.entries(pools)) for (const item of items) add(item, kind, media.routeCategories?.[route] ?? route);
  const shared = media.pools ?? { process: media.pool ?? [] };
  for (const [kind, items] of Object.entries(shared)) for (const item of items) add(item, kind, GENERAL);
  return library;
}

// A page's category: the image plan's (routeCategories), else the category of the page's own photos, else general.
export function routeCategoryOf(route, media = {}) {
  if (media.routeCategories?.[route]) return media.routeCategories[route];
  return media.routePools?.[route] ? Object.values(media.routePools[route]).flat()[0]?.category ?? route : GENERAL;
}

// Every page's photos. Returns { byRoute: route -> per-block media lists (null: no photo), unfilled: slot requests }.
// sitePhotos: the manufacturer's own photos (site-media.json); placeholders: classes only they may fill.
/** @param {{ pages: any[], components: any, sitePhotos?: any[], isBuilt?: (href: string) => boolean }} input @returns {{ byRoute: Record<string, any[][]>, unfilled: any[] }} */
export function allocateSite({ pages, components, sitePhotos = [], isBuilt = () => true }) {
  const media = components.media ?? {};
  const library = templateLibrary(media);
  const placeholders = new Set(media.placeholders ?? []);
  const categories = [...new Set([...library.map((photo) => photo.category), ...Object.values(media.routeCategories ?? {})])].filter((category) => category !== GENERAL && !category.startsWith('/'));
  const siteUse = new Map();
  const byRoute = {};
  const unfilled = [];
  const options = { isBuilt };
  for (const page of pages) {
    const pageCategory = routeCategoryOf(page.route, media);
    const used = new Set();
    // Reference photos are development placeholders from a small pool: once a page has used each, it shows them again
    // (the least used first) rather than an empty image slot. A site's own library never repeats on a page.
    const repeatable = media.origin === 'reference-placeholder';
    // frames: the shape of a place that does not follow its photo (lib/media-ratio.mjs slotFrames): a photo that shows
    // enough of itself there comes first, so the module keeps its layout.
    const pick = (candidates, topic, frames = null) => {
      const words = topicWords(topic);
      const unused = candidates.filter((photo) => !used.has(photo.src));
      const fit = (photo) => (frames && !fitsFrames(frames, photo) ? 0 : 1);
      const ranked = (unused.length || !repeatable ? unused : candidates).map((photo, order) => ({ photo, order, fit: fit(photo), score: topic ? overlap(`${photo.topic ?? ''} ${photo.topic ? '' : photo.alt}`, words) : 0 }))
        .sort((a, b) => b.fit - a.fit || b.score - a.score || (siteUse.get(a.photo.src) ?? 0) - (siteUse.get(b.photo.src) ?? 0) || a.order - b.order);
      const chosen = ranked[0]?.photo;
      if (!chosen) return null;
      used.add(chosen.src);
      siteUse.set(chosen.src, (siteUse.get(chosen.src) ?? 0) + 1);
      return chosen;
    };
    // The owner's own photo of a class the library also makes (product, material, lifestyle): before any generated or
    // competitor photo, for this page when it names pages, the one whose description shares most words with the topic.
    const ownPhoto = (kind, topic) => {
      const words = topicWords(topic);
      const own = sitePhotos.filter((photo) => photo.class === kind && (!photo.pages || photo.pages.includes(page.route)) && !used.has(photo.src))
        .map((photo, order) => ({ photo, order, score: overlap(photo.alt, words) }))
        .sort((a, b) => b.score - a.score || (siteUse.get(a.photo.src) ?? 0) - (siteUse.get(b.photo.src) ?? 0) || a.order - b.order)[0]?.photo;
      if (!own) return null;
      used.add(own.src);
      siteUse.set(own.src, (siteUse.get(own.src) ?? 0) + 1);
      return { src: own.src, srcset: own.srcset, width: own.width, height: own.height, alt: own.alt };
    };
    // linked: the category of the page a card links to. intent: the photo the section asks for (Site Factory's visual:
    // what it shows, where), made for this position alone (image-plan.mjs) and found by its key.
    const take = (kind, topic, blockId, linked = null, frames = null, intent = null) => {
      if (intent && !placeholders.has(kind)) {
        const key = intentKey(page.route, intent.id);
        const own = library.find((photo) => photo.intent === key);
        if (own) { const { kind: _kind, category: _category, topic: _topic, intent: _intent, ...shown } = own; return shown; }
        // The page's own category, whatever the class: the photo shows this page's product (a shared class would name
        // the whole line, "our swimwear", on the boardshorts page).
        unfilled.push({ route: page.route, status: page.status, blockId, kind, category: pageCategory, topic, intent: { ...intent, key } });
        return { src: '', alt: '', slot: kind };
      }
      if (!placeholders.has(kind) && !SITE_WIDE_KINDS.includes(kind)) {
        const own = ownPhoto(kind, topic);
        if (own) return own;
      }
      if (placeholders.has(kind)) {
        const words = topicWords(topic);
        const own = sitePhotos.filter((photo) => photo.class === kind && !used.has(photo.src))
          .map((photo, order) => ({ photo, order, score: overlap(`${photo.alt} ${photo.src.split('/').at(-1)}`, words) }))
          .sort((a, b) => b.score - a.score || (siteUse.get(a.photo.src) ?? 0) - (siteUse.get(b.photo.src) ?? 0) || a.order - b.order)[0]?.photo;
        if (own) {
          used.add(own.src);
          siteUse.set(own.src, (siteUse.get(own.src) ?? 0) + 1);
          return { src: own.src, srcset: own.srcset, width: own.width, height: own.height, alt: own.alt };
        }
        unfilled.push({ route: page.route, status: page.status, blockId, kind, category: GENERAL, topic });
        return { src: '', alt: '', slot: kind };
      }
      // A portrait is of one person: only the photo made for that person, never another's face.
      if (SITE_WIDE_KINDS.includes(kind)) {
        const own = library.find((photo) => photo.kind === kind && photo.topic === topic);
        if (own) { const { kind: _kind, category: _category, topic: _topic, ...shown } = own; return shown; }
        unfilled.push({ route: page.route, status: page.status, blockId, kind, category: GENERAL, topic });
        return { src: '', alt: '', slot: kind };
      }
      // A shared class (rules.mjs SHARED_KINDS) shows the site's own set on every page.
      const category = SHARED_KINDS.includes(kind) ? GENERAL : linked ?? namedCategory(topic, categories) ?? pageCategory;
      for (const candidateKind of FALLBACK[kind].filter((name) => !placeholders.has(name))) {
        // A photo made for one section's visual is that section's alone.
        const own = library.filter((photo) => !photo.intent && photo.kind === candidateKind && photo.category === category);
        const general = category === GENERAL || CATEGORY_FREE.has(candidateKind) ? library.filter((photo) => !photo.intent && photo.kind === candidateKind && photo.category === GENERAL) : [];
        const chosen = pick(own, topic, frames) ?? pick(general, topic, frames);
        if (chosen) {
          const { kind: _kind, category: _category, topic: _topic, ...shown } = chosen;
          return shown;
        }
      }
      unfilled.push({ route: page.route, status: page.status, blockId, kind, category, topic });
      return { src: '', alt: '', slot: kind };
    };
    let splitIndex = 0;
    byRoute[page.route] = withMediaModules(page, components, options).map((block) => {
      const variant = resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splitIndex++ : 0, components);
      const topics = mediaTopics(block, variant, components, options);
      const intents = mediaIntents(block, variant, components, options);
      const cards = block.type === 'gallery' ? galleryShown(block, options?.isBuilt ?? (() => true)).cards : [];
      const linked = (index) => { const href = block.type === 'caseStudies' ? block.items[index]?.href : cards[index]?.item.href; const category = href ? routeCategoryOf(href, media) : GENERAL; return category === GENERAL ? null : category; };
      return mediaSlots(block, variant, components, options).map((slot, index) => (slot === null ? null : typeof slot === 'string' ? take(slot, topics[index], block.id, linked(index), slotFrames(block, variant, index), intents[index]) : slot));
    });
  }
  return { byRoute, unfilled };
}
