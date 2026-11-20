// The competitor page a page type of ours goes by, where the competitor has none of its own (the design review sets it
// beside that page; the first screen takes its height, lib/hero-heights.mjs). A hub lists the pages of its kind, so it
// goes by that kind's page; a general, legal, ordering or blog page is mostly text sections, as an about page is.
export const NEAREST_PAGE_TYPES = Object.freeze({
  products_hub: ['product_manufacturer', 'product_wholesale', 'solution'],
  solutions_hub: ['solution', 'product_manufacturer', 'product_wholesale'],
  // A city page beside the competitor's market page, else its service page; their hub beside a market page too.
  place: ['solution', 'about'],
  places_hub: ['place', 'solution'],
  general: ['about', 'solution', 'product_manufacturer', 'product_wholesale'],
  ordering: ['contact', 'about'],
  privacy: ['about', 'contact'],
  blog_hub: ['about', 'solution'],
  blog_post: ['about', 'solution'],
});
export function referenceType(pageType, referenceTypes) {
  if (referenceTypes.includes(pageType)) return pageType;
  return [...(NEAREST_PAGE_TYPES[pageType] ?? []), 'about', 'solution', 'product_manufacturer', 'home'].find((type) => referenceTypes.includes(type)) ?? referenceTypes[0] ?? null;
}
