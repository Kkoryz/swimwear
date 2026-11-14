// The kinds of image the reference site uses (owner 2026-10-28: its banners, portraits, detail crops, collages,
// boards, swatch charts and factory photos are each made their own way, and every kind of ours is made the same way):
// each reference photo described with where it sits on the site, grouped into kinds with a generic recipe another
// brand could follow (no place, prop or garment of the reference's own), and each planned photo given the kind the
// reference uses for that job. generate:images makes a photo from its kind's recipe and the reference photos of that
// kind (their light, colour and camera language only), with our own place, pose and design.

import { basename } from 'node:path';

export const IMAGE_TYPES_SCHEMA = 'seo-site-image-types-v1';
// What a kind shows: the product on a person, the product alone, the factory, its workers or its process (only a real
// photo can show those: a generated one is a stand-in), or a drawing, board or diagram.
export const SHOWS = ['worn', 'product', 'making', 'chart'];
export const FACES = ['shown', 'cropped', 'none'];
export const BACKGROUNDS = ['place', 'plain'];
// Logos, icons and photos that are not of the product, its making or its use.
export const NOT_PRODUCT = 'not product imagery';
export const DESCRIBE_BATCH = 16;
const NO_CHANGE = 'Do not generate or edit any image and do not change any file.';

// The last JSON line of a reply. A reply cut short by its closing brackets (site10's grouping lost its final "]}") is
// read with them put back.
export function replyJson(reply) {
  const line = reply.trim().split('\n').reverse().find((text) => text.trim().startsWith('{'))?.trim();
  if (!line) return null;
  for (const end of ['', ']}', '}]}']) {
    try { return JSON.parse(line + end); } catch {}
  }
  return null;
}

const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const HEADING = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;

// For each reference photo, the pages it appears on and the headings around it there, from the captured pages
// (pages: [{ page, html, map }], map: the page's asset map, remote URL to local file).
export function photoContexts(paths, pages) {
  return paths.map((path) => {
    const uses = [];
    for (const { page, html, map } of pages) {
      const urls = (Array.isArray(map) ? map : Object.entries(map)).filter(([, local]) => basename(local) === basename(path)).map(([url]) => url);
      for (const url of urls) {
        // A resized copy (name-300x200.jpg) is the same photo.
        const name = basename(new URL(url).pathname).replace(/-\d+x\d+(?=\.)/, '').replace(/\.[a-z]+$/i, '');
        // Found as a path in the markup, not as a word of its text ("fabric" in a heading "Our fabrics").
        const at = html.indexOf(`/${name}`);
        if (at < 0) continue;
        const before = [...html.slice(0, at).matchAll(HEADING)].map((match) => strip(match[1])).filter(Boolean);
        const after = [...html.slice(at).matchAll(HEADING)].slice(0, 1).map((match) => strip(match[1]));
        uses.push({ page, heading: before.at(-1) ?? '', next: after[0] ?? '' });
        break;
      }
    }
    return { path, uses };
  });
}

// One batch of reference photos (attached in order), each described for a photographer who must make the same kind.
export function describePrompt(batch, start, siteKind) {
  return [
    `The ${batch.length} attached images are, in order, photos ${start + 1} to ${start + batch.length} of the website of ${siteKind}. Where each sits on the site: ${JSON.stringify(batch.map((item, index) => ({ photo: start + index + 1, sections: item.uses.map((use) => `${use.page} page, near "${use.heading || use.next}"`) })))}`,
    'Describe each photo for a photographer or designer who must make the same kind of image: what kind of image it is, whether a person is in it and how much of them, the background, the light, the framing, what it shows and what job it does on the page.',
    NO_CHANGE,
    'Reply with only this JSON on one line, English strings: {"photos":[{"photo":n,"kind":"a short name for this kind of image","person":"none|whole|cropped body|hands","background":"...","light":"...","framing":"...","shows":"...","job":"..."}]}',
  ].join('\n');
}

export function parseDescribed(reply, start, count) {
  const photos = replyJson(reply)?.photos;
  const numbers = Array.from({ length: count }, (_, index) => start + index + 1);
  if (!Array.isArray(photos) || !numbers.every((number) => photos.some((item) => item?.photo === number && typeof item.kind === 'string'))) throw new Error(`descriptions need photos ${start + 1}-${start + count}, each with a kind`);
  return numbers.map((number) => photos.find((item) => item.photo === number));
}

// The kinds, from all descriptions at once (a text-only reading).
export function typesPrompt(described, siteKind) {
  return [
    `Here are ${described.length} photos of the website of ${siteKind}, each described: ${JSON.stringify(described)}`,
    `Group them into the kinds of image the site uses (merge only kinds a viewer would call the same). For each kind write a generic recipe another brand could follow: the framing, how much of a person appears, the kind of background and light, the layout. Leave out the particular places, props, cars, animals and garments of these photos: those belong to this site. Put logos, icons and anything that is not a photo or drawing of the product, its making or its use in a kind named "${NOT_PRODUCT}".`,
    'For each kind also say what it shows: "worn" (the product on a person), "product" (the product alone), "making" (the factory, its workers or its process) or "chart" (a drawing, board or diagram); whether a person\'s face is in it ("shown", "cropped" or "none"); and whether its background is a "place" or a "plain" backdrop.',
    NO_CHANGE,
    `Reply with only this JSON on one line, English strings: {"types":[{"name":"...","shows":"${SHOWS.join('|')}","face":"${FACES.join('|')}","background":"${BACKGROUNDS.join('|')}","recipe":"...","jobs":["..."],"photos":[n]}]}`,
  ].join('\n');
}

export function parseTypes(reply, count) {
  const types = replyJson(reply)?.types;
  const valid = (type) => typeof type?.name === 'string' && type.name.trim() && typeof type.recipe === 'string' && type.recipe.trim()
    && SHOWS.includes(type.shows) && FACES.includes(type.face) && BACKGROUNDS.includes(type.background)
    && Array.isArray(type.jobs) && Array.isArray(type.photos) && type.photos.length && type.photos.every((photo) => Number.isInteger(photo) && photo >= 1 && photo <= count);
  if (!Array.isArray(types) || !types.length || !types.every(valid)) throw new Error('kinds of image need [{ name, shows, face, background, recipe, jobs, photos }] with photos 1-' + count);
  return types.map((type) => ({ ...type, name: type.name.trim(), recipe: type.recipe.trim() }));
}

// The planned photos a kind is chosen for: not a client portrait, not a phone twin (it takes its hero's kind), not a
// product shown on its own (made for children: the reference's kinds show it worn).
export const typed = (entry) => entry.kind !== 'portrait' && !entry.phoneOf && !entry.productOnly && entry.status !== 'retired';

// The kinds a planned photo may take: a process photo (the factory, its people, its process) only a kind that shows
// making; a material photo only a chart with no figure in it (its subject is the fabric: site10's children's fabric
// photos were given model photos, then design boards with garments drawn on bodies); a chart only a photo of a section or of the material (a page-wide photo is shown without its text, and a
// chart without labels then says nothing: site10's general product photo was given an order-quantity diagram); every
// other photo any other kind of product imagery.
export function allowedTypes(entry, types) {
  const fits = (type) => {
    if (type.name === NOT_PRODUCT) return false;
    // What the page shows is not worn (a service's packaging or hardware, parseProducts): no photo of it on a model.
    if (entry.notWorn && (type.shows === 'worn' || type.shows === 'making')) return false;
    if ((entry.kind === 'process') !== (type.shows === 'making')) return false;
    if (entry.kind === 'material') return type.shows === 'chart' && type.face === 'none';
    return type.shows !== 'chart' || Boolean(entry.topic);
  };
  return types.map((type, index) => ({ type, index })).filter(({ type }) => fits(type)).map(({ index }) => index);
}

// What a photo is for: its section, else what its class shows (a fabric photo described as a product photo for the
// whole page was given an order-quantity diagram on site10's children's pages).
const FOR_CLASS = { hero: 'the page hero', material: 'a photo of the fabric the product is made of', process: 'a photo of the factory and how the product is made', lifestyle: 'a photo of the product in use' };
export const section = (entry) => entry.topic ?? FOR_CLASS[entry.kind] ?? 'a photo of the product for the page as a whole';

// The sections of the reference's pages a kind's photos sit in ("home: Example Prices"), from their contexts.
export function usedFor(type, contexts) {
  return [...new Set(type.photos.flatMap((photo) => (contexts[photo - 1]?.uses ?? []).map((use) => `${use.page}: ${use.heading || use.next}`)))];
}

// One page's photos given kinds (a text-only reading): the kind the reference uses for that job, spread over the page.
// Each kind comes with the reference's own sections that show it (site10's order-quantity diagram, shown by the
// reference only under "MOQs", was given fabric photos and a private-label section when its jobs alone were listed).
export function slotsPrompt(category, entries, types, siteKind) {
  return [
    `The ${category} page of the website of ${siteKind} needs these images: ${JSON.stringify(entries.map((entry) => ({ id: entry.id, section: section(entry), kinds: allowedTypes(entry, types).map((index) => index + 1) })))}`,
    `The reference site uses these kinds of image for these jobs, in these sections of its pages: ${JSON.stringify(types.map((type, index) => ({ kind: index + 1, name: type.name, shows: type.shows, jobs: type.jobs, sections: type.usedFor ?? [] })))}`,
    'Give each image one of the kinds listed for it: the kind the reference uses for that job. Where several kinds fit an image\'s job equally, spread them so the page is not one kind throughout, the way the reference mixes them.',
    NO_CHANGE,
    'Reply with only this JSON on one line: {"slots":[{"id":"...","kind":n}]}',
  ].join('\n');
}

// A page's kinds spread: on a page of four or more typed photos no kind takes more than half of them; the photos past
// that are made without one (site10's hardware page was six assortment diagrams of parts on white).
export function spreadSlots(slots, entries) {
  const typedIds = entries.map((entry) => entry.id).filter((id) => Number.isInteger(slots[id]));
  const limit = typedIds.length >= 4 ? Math.ceil(typedIds.length / 2) : Infinity;
  const taken = {};
  return Object.fromEntries(typedIds.filter((id) => (taken[slots[id]] = (taken[slots[id]] ?? 0) + 1) <= limit).map((id) => [id, slots[id]]));
}

// { id: kind index }; every photo given one of its allowed kinds.
export function parseSlots(reply, entries, types) {
  const slots = replyJson(reply)?.slots;
  if (!Array.isArray(slots)) throw new Error('kinds for the page need {"slots":[{ id, kind }]}');
  return Object.fromEntries(entries.map((entry) => {
    const kind = slots.find((slot) => slot?.id === entry.id)?.kind;
    if (!allowedTypes(entry, types).includes(kind - 1)) throw new Error(`${entry.id} was given kind ${kind ?? 'none'}, not one of ${allowedTypes(entry, types).map((index) => index + 1).join(', ')}`);
    return [entry.id, kind - 1];
  }));
}

// The garments each page's photos show, named concretely (a text-only reading of the categories and their headings):
// a category name alone left the image model to guess, and site10's watersports apparel came out as bikinis.
// A page about a service or an item nobody wears (site10's packaging and hardware pages) says so: its photos show the
// item, never a model (worn false).
export function productsPrompt(pages, siteKind) {
  return [
    `The website of ${siteKind} has these pages, each with its headings: ${JSON.stringify(pages)}`,
    'For each category, name in a few words what its photos show: the garments a buyer expects to see worn (for example "long-sleeve rash guards, surf leggings and paddle suits" for watersports apparel), or, for a page about a service or an item nobody wears (packaging, labels, hardware), the items themselves. Keep the category\'s own garment where its name is one already. worn: whether a person wears what the photos show. printed: whether it is made of fabric that can carry a printed pattern.',
    NO_CHANGE,
    'Reply with only this JSON on one line, English strings: {"products":{"<category>":{"shows":"...","worn":true,"printed":true}}}',
  ].join('\n');
}

// { by: category -> what its photos show, worn and printed: category -> boolean }. Whether a photo's product carries a
// print is the reading's, never assumed: every photo given a fabric print put site10's hardware rings in florals.
export function parseProducts(reply, categories) {
  const products = replyJson(reply)?.products;
  const shows = (value) => (typeof value === 'string' ? value : value?.shows);
  const missing = categories.filter((category) => typeof shows(products?.[category]) !== 'string' || !shows(products[category]).trim());
  if (missing.length) throw new Error(`products are missing for ${missing.join(', ')}`);
  return {
    by: Object.fromEntries(categories.map((category) => [category, shows(products[category]).trim()])),
    worn: Object.fromEntries(categories.map((category) => [category, products[category]?.worn !== false])),
    printed: Object.fromEntries(categories.map((category) => [category, products[category]?.printed !== false])),
  };
}

// The entry marked notWorn when the products reading says its category's photos show nothing worn.
export const notWornIn = (imageTypes, entry) => (imageTypes?.products?.worn?.[entry.category] === false ? { ...entry, notWorn: true } : entry);

// The kind a planned photo is made as (a phone twin: its hero's), with the reference photos of that kind; null when the
// kinds were not read or the photo takes none.
export function typeOf(imageTypes, entry) {
  entry = notWornIn(imageTypes, entry);
  const index = imageTypes?.pages?.[entry.category]?.slots?.[entry.phoneOf ?? entry.id];
  // A kind read before a rule changed that the photo may no longer take is not used.
  const type = Number.isInteger(index) && allowedTypes(entry, imageTypes.types).includes(index) ? imageTypes.types[index] : null;
  return type ? { ...type, refs: type.photos.map((photo) => imageTypes.refs[photo - 1]) } : null;
}
