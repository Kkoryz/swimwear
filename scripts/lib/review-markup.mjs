// Review markup in a page's structured data. Google requires reviews and ratings in markup to come from real buyers,
// so a release holds while Site Factory marks any of them (or a price) a placeholder (page structuredDataPlaceholders,
// never confirmable), and while review markup ships that the owner has not confirmed as real (sign-off review-source).

export const REVIEW_SIGNOFF = 'review-source';
const REVIEW_TYPES = new Set(['Review', 'AggregateRating']);
const REVIEW_PROPERTIES = ['review', 'aggregateRating'];

// Where a JSON-LD node (with its @graph and nested nodes) carries reviews or ratings: ["Product.review", ...].
export function reviewMarkup(node, owner = null) {
  if (Array.isArray(node)) return node.flatMap((item) => reviewMarkup(item, owner));
  if (!node || typeof node !== 'object') return [];
  const type = [node['@type']].flat().find(Boolean) ?? owner ?? 'node';
  const found = [];
  if (REVIEW_TYPES.has(node['@type'])) found.push(node['@type']);
  for (const property of REVIEW_PROPERTIES) if (node[property] != null) found.push(`${type}.${property}`);
  for (const [key, value] of Object.entries(node)) if (value && typeof value === 'object' && !REVIEW_PROPERTIES.includes(key)) found.push(...reviewMarkup(value, key === '@graph' ? null : type));
  return [...new Set(found)];
}

// Site Factory's placeholder properties of a page: ["Product.offers", ...].
export const placeholderProperties = (page) => (page.structuredDataPlaceholders ?? []).flatMap((entry) => (entry.properties ?? []).map((property) => `${entry['@type']}.${property}`));

// The owner's sign-off item for the review markup the pages carry, or null when none does. Its description names the
// pages, so a page that gains reviews makes a confirmed item pending again.
export function reviewSignoffItem(pages) {
  const routes = pages.filter((page) => reviewMarkup(page.jsonLd ?? []).length).map((page) => page.route);
  return routes.length ? { id: REVIEW_SIGNOFF, description: `Confirm the reviews and ratings in the structured data of ${routes.join(', ')} come from real buyers (Google's review snippet policy)`, status: 'pending' } : null;
}
