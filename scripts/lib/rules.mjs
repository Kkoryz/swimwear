// Values several stages must agree on, kept in one place. Each says why it is what it is.

// The photography classes of a reference's pictures: what a photo shows decides where it may go (a product photo on a
// product card, a process photo beside a how-we-work section), so pools, slots and blocks all name these.
export const MEDIA_KINDS = Object.freeze(['product', 'process', 'material', 'lifestyle', 'portrait']);
// Classes shown the same on every page (a testimonial's author is one person site-wide), never per product category.
export const SITE_WIDE_KINDS = Object.freeze(['portrait']);
// Classes a visitor reads as real: the manufacturer's own factory, process and staff, and a client's face. The
// pre-launch handoff marks their stand-ins "必须实拍替换"; the owner replaces them before launch (owner, 2026-10-24).
export const REAL_ONLY_KINDS = Object.freeze(['process', 'portrait']);
// Classes made once for the whole site, never per product category: a factory floor looks the same whatever it makes
// (owner, 2026-10-27: site10's 47 per-category process stand-ins became the site's three).
export const SHARED_KINDS = Object.freeze(['process']);
// Photo classes that may show a person wearing or using the product (the hero included).
export const PERSON_KINDS = Object.freeze(['hero', 'product', 'lifestyle', 'portrait']);

// Word bands of one section's body: under `standard` words it reads as a short card, from `long` words on it needs a
// full-width long-form row. The importer groups sections by them and the renderer picks a block's density by them.
export const SECTION_WORDS = Object.freeze({ standard: 60, long: 120 });

// Longest alt text: screen readers read alt in one go, and 125 characters is the usual accessibility guidance.
export const ALT_MAX_CHARS = 125;
// Shortest alt text for an image that is not decorative: fewer characters cannot say what the image shows.
export const ALT_MIN_CHARS = 10;

// The folder a page type's competitor page is captured to (docs/research/reference-pages/<folder>/,
// capture-reference-pages.mjs): product pages by their role; site-template.json's representatives use the same names.
export const CAPTURE_FOLDER = Object.freeze({ product_manufacturer: 'manufacturer', product_wholesale: 'wholesale' });
export const captureFolder = (pageType) => CAPTURE_FOLDER[pageType] ?? pageType;

// The most cards an equal grid sets side by side: four only while every card is short. Four cards of 40 words and more
// at 1440 left each a column of about 220px and thirty-odd characters a line (hotel-rm's style board, 2026-11-14: two
// P1 findings no repair of the site's stylesheet mended); three at most then, so four such cards go two by two. The
// competitor set its 45-word values three to a row.
export const CARD_GRID = Object.freeze({ max: 4, longMax: 3, longWords: 40 });
export const cardGridMax = (longestWords = 0) => (longestWords >= CARD_GRID.longWords ? CARD_GRID.longMax : CARD_GRID.max);

// The most steps a process shows as numbered cards over a photo of the work: on a phone the steps stack and the photo
// stretches behind them all, about 270px a step (hotel-rm's four steps ran 1,240px, five 1,510px, the photo a narrow
// slice); more are a list (lib/media-slots.mjs).
export const MAX_PHOTO_STEPS = 3;
