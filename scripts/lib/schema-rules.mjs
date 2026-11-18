// JSON-LD rules per schema.org type for the types this template emits: required properties fail, recommended ones
// warn. Rules follow Google's structured data documentation (rich result requirements) and the per-type tables in
// claude-seo (MIT, AgriciDaniel/claude-seo: scripts/schema_ecommerce_validate.py, scripts/validate-schema.py,
// skills/seo/references/schema-types.md), ported here as data.

// Types Google retired from rich results or never shows for sites like these: valid markup, no rich result.
export const RETIRED_TYPES = Object.freeze(['FAQPage', 'HowTo', 'SpecialAnnouncement', 'CourseInfo', 'EstimatedSalary', 'LearningVideo', 'ClaimReview', 'VehicleListing']);
// Unfilled template values that must never reach a published page.
export const PLACEHOLDER_PATTERN = /\[Placeholder\]|\[(?:[A-Z][A-Za-z ]{2,40})\]|REPLACE_[A-Z_]+|lorem ipsum/i;

const has = (value) => value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()) && !(Array.isArray(value) && !value.length);

// Service: claude-seo's key properties (schema-types.md: name, provider, areaServed, description); areaServed is
// required once the site states its service area (lib/site-company.mjs; options.serviceArea). The page nodes (T-3,
// T-4 of the four-site audit 2026-11-17) carry their URL, name and last change.
const RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'description', 'contactPoint'] },
  WebSite: { required: ['name', 'url'], recommended: [] },
  Service: { required: ['name', 'provider'], recommended: ['description', 'areaServed', 'serviceType'] },
  WebPage: { required: ['url', 'name'], recommended: ['dateModified'] },
  AboutPage: { required: ['url', 'name'], recommended: ['dateModified', 'about'] },
  ContactPage: { required: ['url', 'name'], recommended: ['dateModified', 'about'] },
  Blog: { required: ['url', 'name'], recommended: ['publisher', 'dateModified'] },
  Product: {
    required: ['name'],
    anyOf: [['offers', 'review', 'aggregateRating']],
    recommended: ['image', 'description', 'brand'],
  },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
};

// ISO 8601 dates (claude-seo: "Invalid date formats"): a year, a date, or a date and time with its zone.
export const ISO_DATE = /^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;
const DATE_KEYS = new Set(['datePublished', 'dateModified', 'dateCreated', 'foundingDate', 'uploadDate']);
// A telephone in E.164: + and the country code, digits only (lib/site-company.mjs e164).
export const E164 = /^\+[1-9]\d{6,14}$/;

// Every [key, value] in a node and the nodes inside it.
function entries(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => entries(item, found));
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { found.push([key, item]); entries(item, found); }
  return found;
}

// Problems for one JSON-LD node: [{ level: 'error' | 'warning', issue, detail }]. serviceArea: the site states where
// it serves (src/data/site-company.json serviceArea), so an Organization or Service without areaServed is an error.
const AREA_TYPES = new Set(['Place', 'AdministrativeArea', 'Country', 'State', 'City', 'GeoShape', 'GeoCircle']);
export function schemaProblems(node, { serviceArea = false } = {}) {
  const problems = [];
  const add = (level, issue, detail) => problems.push({ level, issue, detail });
  const types = [node['@type']].flat().filter(Boolean);
  if (!node['@context'] || !String(node['@context']).includes('schema.org')) add('error', 'json_ld_context', `${types.join('/') || 'node'} has no schema.org @context`);
  if (!types.length) add('error', 'json_ld_type_missing', JSON.stringify(node).slice(0, 80));
  if (PLACEHOLDER_PATTERN.test(JSON.stringify(node))) add('error', 'json_ld_placeholder', types.join('/'));
  for (const type of types) {
    if (RETIRED_TYPES.includes(type)) add('warning', 'json_ld_no_rich_result', `${type} is valid markup but Google shows no rich result for it`);
    const rule = RULES[type];
    if (!rule) continue;
    for (const property of rule.required) if (!has(node[property])) add('error', 'json_ld_required_missing', `${type}.${property}`);
    for (const group of rule.anyOf || []) if (!group.some((property) => has(node[property]))) add('error', 'json_ld_required_missing', `${type} needs one of ${group.join(', ')}`);
    for (const property of rule.recommended) if (!has(node[property]) && !(serviceArea && property === 'areaServed')) add('warning', 'json_ld_recommended_missing', `${type}.${property}`);
  }
  // Where the company serves (claude-seo seo-local: a service-area business states areaServed).
  for (const type of ['Organization', 'Service']) if (serviceArea && types.includes(type) && !has(node.areaServed)) add('error', 'service_area_missing', `${type}.areaServed`);
  // areaServed as schema.org has it (AdministrativeArea, GeoShape, Place or Text): text, or a named place (a Country,
  // a City, the worldwide Place) or a shape (owner 2026-11-17: the worldwide default is a Place named Worldwide).
  for (const area of [node.areaServed ?? []].flat()) {
    const named = area && typeof area === 'object' && AREA_TYPES.has(area['@type']) && (has(area.name) || has(area.geo) || area['@type'].startsWith('Geo'));
    if (!(typeof area === 'string' && area.trim()) && !named) add('error', 'area_served_invalid', `areaServed ${JSON.stringify(area).slice(0, 80)} is not text or a named Place, AdministrativeArea or GeoShape`);
  }
  // The company as an entity (T-1): its postal address and public profiles (its legal name is withheld for now, owner
  // 2026-11-17: lib/seo-head.mjs WITHHELD_COMPANY_KEYS).
  if (types.includes('Organization')) {
    const thin = ['address', 'sameAs'].filter((property) => !has(node[property]));
    if (thin.length) add('warning', 'organization_thin', `Organization has no ${thin.join(', ')}`);
    if (typeof node.address === 'string') add('warning', 'address_not_structured', 'Organization.address is text, not a PostalAddress');
    else if (node.address && node.address['@type'] !== 'PostalAddress') add('error', 'address_not_structured', 'Organization.address is not a PostalAddress');
    else if (node.address && !has(node.address.addressCountry)) add('warning', 'json_ld_recommended_missing', 'PostalAddress.addressCountry');
  }
  for (const [key, value] of entries(node)) {
    if (DATE_KEYS.has(key) && !(typeof value === 'string' && ISO_DATE.test(value))) add('error', 'json_ld_date_invalid', `${key}: ${JSON.stringify(value)}`);
    if (key === 'telephone' && !(typeof value === 'string' && E164.test(value))) add('error', 'json_ld_telephone_format', `telephone ${JSON.stringify(value)} is not E.164 (+ and the country code, digits only)`);
  }
  if (types.includes('BreadcrumbList')) {
    const items = node.itemListElement || [];
    items.forEach((item, index) => {
      if (item.position !== index + 1) add('error', 'breadcrumb_position', `item ${index + 1} has position ${item.position}`);
      if (!has(item.name)) add('error', 'breadcrumb_name_missing', `item ${index + 1}`);
      // Every crumb but the last must link to its page.
      if (index < items.length - 1 && !has(item.item)) add('error', 'breadcrumb_item_missing', `item ${index + 1}`);
    });
  }
  if (types.includes('FAQPage')) {
    for (const [index, question] of (node.mainEntity || []).entries()) {
      if (!has(question.name) || !has(question.acceptedAnswer?.text)) add('error', 'faq_question_incomplete', `question ${index + 1}`);
    }
  }
  return problems;
}
