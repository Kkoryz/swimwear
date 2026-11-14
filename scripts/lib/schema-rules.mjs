// JSON-LD rules per schema.org type for the types this template emits: required properties fail, recommended ones
// warn. Rules follow Google's structured data documentation (rich result requirements) and the per-type tables in
// claude-seo (MIT, AgriciDaniel/claude-seo: scripts/schema_ecommerce_validate.py, scripts/validate-schema.py,
// skills/seo/references/schema-types.md), ported here as data.

// Types Google retired from rich results or never shows for sites like these: valid markup, no rich result.
export const RETIRED_TYPES = Object.freeze(['FAQPage', 'HowTo', 'SpecialAnnouncement', 'CourseInfo', 'EstimatedSalary', 'LearningVideo', 'ClaimReview', 'VehicleListing']);
// Unfilled template values that must never reach a published page.
export const PLACEHOLDER_PATTERN = /\[Placeholder\]|\[(?:[A-Z][A-Za-z ]{2,40})\]|REPLACE_[A-Z_]+|lorem ipsum/i;

const has = (value) => value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()) && !(Array.isArray(value) && !value.length);

const RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo'] },
  WebSite: { required: ['name', 'url'], recommended: [] },
  Service: { required: ['name'], recommended: ['provider', 'description', 'areaServed', 'serviceType'] },
  Product: {
    required: ['name'],
    anyOf: [['offers', 'review', 'aggregateRating']],
    recommended: ['image', 'description', 'brand'],
  },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
};

// Problems for one JSON-LD node: [{ level: 'error' | 'warning', issue, detail }].
export function schemaProblems(node) {
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
    for (const property of rule.recommended) if (!has(node[property])) add('warning', 'json_ld_recommended_missing', `${type}.${property}`);
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
