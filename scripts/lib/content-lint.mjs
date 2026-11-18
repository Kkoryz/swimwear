// Content checks on the authored pages (Site Factory 07's copy as imported): what a page-by-page read found and no
// build check caught. Each issue names the page, the field and the text, so the list goes back to Site Factory as is;
// the template never rewrites copy.

// Working words of the pipeline that must not reach a reader.
const LEAKED = [
  [/\bfact basis\b/i, 'an internal column name'],
  [/\b(for|on|of) this page\b/i, 'the writer talking about the page'],
  [/\blines? available for this page\b/i, 'the writer talking about the page'],
  [/\[placeholder\]/i, 'placeholder text on an authored page'],
  [/\bknowledge card\b/i, 'a pipeline term'],
  [/\b(section_id|page_id|slot id)\b/i, 'a pipeline term'],
  [/\bTODO\b|\bTBD\b/, 'an unfinished note'],
];
// Research sources a sales page should not cite (the owner's sources rule): study databases.
const ACADEMIC_HOSTS = ['ncbi.nlm.nih.gov', 'pubmed', 'sciencedirect.com', 'researchgate.net', 'springer.com', 'wiley.com', 'mdpi.com'];
const COMMERCIAL = new Set(['home', 'product_manufacturer', 'product_wholesale', 'solution', 'place', 'products_hub', 'solutions_hub', 'places_hub', 'wholesale_hub']);
// Boilerplate: a block with at least BOILERPLATE_SENTENCES sentences (of MIN_SENTENCE_WORDS words or more) that stand
// word for word on at least REPEATED_ON_PAGES pages (the same terms paragraph with a new first line on every page).
const MIN_SENTENCE_WORDS = 8;
const REPEATED_ON_PAGES = 3;
const BOILERPLATE_SENTENCES = 3;

const plain = (text) => String(text ?? '').replace(/\[([^\]]+)\]\((?:\/[^)]*|https?:\/\/[^)]*)\)/g, '$1');
const normal = (text) => plain(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const sentencesOf = (text) => plain(text).split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);

// Every text field of a page with where it sits: [{ field, text, links: whether the field renders inline links }].
// Blocks the template builds itself (the owner's proof, the plan's cards, the form, the sources list) are the same on
// every page by design and are not Site Factory's copy.
const TEMPLATE_BLOCK = /^(owner-|plan-|media-module-|sources$)/;

export function pageTexts(page) {
  const list = [];
  const add = (field, text, links = false) => { if (typeof text === 'string' && text.trim()) list.push({ field, text, links }); };
  add('seo.title', page.seo?.title); add('seo.description', page.seo?.description); add('hero.heading', page.hero?.heading);
  for (const lead of page.hero?.lead ?? []) add('hero.lead', lead, true);
  for (const block of (page.blocks ?? []).filter((item) => !TEMPLATE_BLOCK.test(item.id) && item.type !== 'form')) {
    const at = (name) => `${block.id}.${name}`;
    add(at('heading'), block.heading);
    for (const paragraph of block.paragraphs ?? []) add(at('paragraph'), paragraph, true);
    for (const item of block.items ?? []) {
      add(at('item.heading'), item.heading); add(at('item.caption'), item.caption); add(at('item.question'), item.question);
      for (const paragraph of item.paragraphs ?? []) add(at('item.paragraph'), paragraph, true);
      for (const line of String(item.answer ?? '').split('\n')) add(at('item.answer'), line, true);
      add(at('item.text'), item.text, true); add(at('item.quote'), item.quote);
    }
    for (const step of block.steps ?? []) { if (typeof step === 'string') add(at('step'), step, true); else { add(at('step.heading'), step.heading); add(at('step.text'), step.text, true); } }
    for (const column of block.columns ?? []) add(at('column'), column);
    for (const row of block.rows ?? []) for (const cell of row) add(at('cell'), cell, true);
  }
  return list;
}

// A sentence that lists many names in a row ("…Bandeau, Micro Bikinis, Ribbed Tie Front Bikini, Skimpy Bikinis…").
export function keywordList(text) {
  for (const sentence of sentencesOf(text)) {
    const items = sentence.split(/,\s*|\s+and\s+/).map((item) => item.trim()).filter(Boolean);
    if (items.length < 6) continue;
    const named = items.filter((item) => /^([A-Z0-9][\w'’&-]*\s?){1,5}$/.test(item.replace(/^(and|or)\s+/i, '')));
    if (named.length >= 5 && named.length / items.length >= 0.6) return sentence.slice(0, 160);
  }
  return null;
}

// The owner's order terms (owner 2026-11-07: written out word for word on every product and service page): Site
// Factory's owner facts of AuthoringParams.terms_fact_types, cited by fact_ids. Their sentences are not boilerplate.
export const TERMS_FACT_IDS = Object.freeze(['moq', 'trial-order', 'lead-time', 'sample-time', 'sample-fee', 'trade-terms', 'typical-timeline', 'payment-terms'].map((type) => `owner:${type}`));
const citesTerms = (ids) => (ids ?? []).some((id) => TERMS_FACT_IDS.includes(id));

/**
 * The sentences of the owner's order terms in Site Factory's package (authoring_package.json), as lintContent's
 * exempt keys: an item citing a term (items[].fact_ids) is the term itself, all its sentences; a section citing one
 * (sections[].fact_ids, a prose section) holds the term fact's text (facts.yaml) word for word among the writer's own
 * sentences, which are checked as before. Site Factory's rule, 2026-11-14.
 * @param {{ pages?: { sections?: { fact_ids?: string[], items?: { title?: string, text?: string, fact_ids?: string[] }[] }[] }[] } | null} pkg
 * @param {Map<string, { text: string }>} [facts]
 */
// Sentences the owner requires word for word on every page they stand on (site.json verbatimSentences: Site Factory's
// order terms in sections that cite no fact_ids, aloha 2026-11-17), as exempt keys like termsSentences'.
export function verbatimKeys(sentences = []) {
  const keys = new Set();
  for (const text of sentences) for (const sentence of sentencesOf(String(text ?? ''))) keys.add(normal(sentence));
  return keys;
}

export function termsSentences(pkg, facts = new Map()) {
  const keys = new Set();
  const add = (text) => { for (const sentence of sentencesOf(String(text ?? ''))) if (sentence.split(/\s+/).length >= MIN_SENTENCE_WORDS) keys.add(normal(sentence)); };
  for (const page of pkg?.pages ?? []) for (const section of page.sections ?? []) {
    for (const id of (section.fact_ids ?? []).filter((item) => TERMS_FACT_IDS.includes(item))) add(facts.get(id)?.text);
    for (const item of section.items ?? []) if (citesTerms(item.fact_ids)) { add(item.title); add(item.text); }
  }
  return keys;
}

/** @param {any[]} pages @param {{ exempt?: Set<string> }} [options] exempt: sentence keys that are not boilerplate (termsSentences) */
export function lintContent(pages, { exempt = new Set() } = {}) {
  const issues = [];
  const sentences = [];
  for (const page of pages.filter((item) => item.status === 'authored')) {
    for (const { field, text, links } of pageTexts(page)) {
      for (const [pattern, why] of LEAKED) if (pattern.test(text)) issues.push({ route: page.route, kind: 'leaked_wording', field, why, text: text.slice(0, 160) });
      if (!links && /\]\((\/|https?:)/.test(text)) issues.push({ route: page.route, kind: 'raw_markdown', field, why: 'link markup in a field that shows text only', text: text.slice(0, 160) });
      const listed = keywordList(text);
      if (listed) issues.push({ route: page.route, kind: 'keyword_list', field, why: 'a run of product names instead of a sentence or a list', text: listed });
      for (const sentence of sentencesOf(text)) if (sentence.split(/\s+/).length >= MIN_SENTENCE_WORDS && !exempt.has(normal(sentence))) sentences.push({ route: page.route, block: field.split('.')[0], key: normal(sentence), sentence });
    }
    if (COMMERCIAL.has(page.pageType)) for (const block of (page.blocks ?? []).filter((item) => item.type === 'sources')) {
      for (const item of block.items ?? []) if (ACADEMIC_HOSTS.some((host) => String(item.url).includes(host))) issues.push({ route: page.route, kind: 'academic_source', field: `${block.id}.item`, why: 'a study database cited on a sales page', text: `${item.title} (${item.url})` });
    }
  }
  // Sentences standing word for word on several pages, then the blocks made mostly of them.
  const pagesOf = new Map();
  for (const item of sentences) pagesOf.set(item.key, new Set([...(pagesOf.get(item.key) ?? []), item.route]));
  const blocks = new Map();
  for (const item of sentences.filter((entry) => pagesOf.get(entry.key).size >= REPEATED_ON_PAGES)) {
    const at = `${item.route} ${item.block}`;
    blocks.set(at, [...(blocks.get(at) ?? []), item]);
  }
  for (const [at, repeated] of blocks) {
    const unique = [...new Map(repeated.map((item) => [item.key, item])).values()];
    if (unique.length < BOILERPLATE_SENTENCES) continue;
    const [route, block] = at.split(' ');
    const pages = Math.min(...unique.map((item) => pagesOf.get(item.key).size));
    issues.push({ route, kind: 'repeated_paragraph', field: block, why: `${unique.length} sentences stand word for word on ${pages} or more pages`, text: unique.map((item) => item.sentence).join(' ').slice(0, 160) });
  }
  issues.push(...hubsRepeatingChildren(pages), ...testimonialsOffPage(pages));
  return issues;
}

// A hub that writes its child pages out again (owner 2026-11-12: "关键是流程得判断这个是sf的活": the hotel site's
// /services/ ran twelve sections, each a service its child pages cover, 4,600px where the competitor's hub is a heading,
// a paragraph and its contact form). The page's structure is Site Factory's: the template renders it as written and
// the hub goes back to 07 with the sections that repeat a child page. A hub is a page whose cards link to its children
// (a gallery of page cards); a section repeats a child when its heading names the child's subject.
export const HUB_REPEAT_SECTIONS = 3;
const TOPIC_STOP = new Set(['hotel', 'hotels', 'motel', 'motels', 'management', 'manager', 'services', 'service', 'support', 'owner', 'owners', 'property', 'properties', 'and', 'the', 'for', 'with', 'from', 'your', 'our', 'into', 'across']);
const topicWords = (text) => String(text ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3 && !TOPIC_STOP.has(word)).map((word) => word.slice(0, 5));
export function hubsRepeatingChildren(pages) {
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const issues = [];
  for (const page of pages.filter((item) => item.status === 'authored')) {
    const children = (page.blocks ?? []).filter((block) => block.type === 'gallery').flatMap((block) => block.items ?? []).map((item) => byRoute.get(item.href)).filter(Boolean);
    if (children.length < 2) continue;
    const repeats = (page.blocks ?? []).filter((block) => block.heading && !['gallery', 'cta', 'form', 'faq', 'relatedPages', 'intro'].includes(block.type)).flatMap((block) => {
      const words = new Set(topicWords(block.heading));
      // The child whose subject shares most words with the heading (its title before the site name).
      const scored = children.map((item) => ({ item, shared: new Set(topicWords(`${item.hero?.heading ?? ''} ${String(item.seo?.title ?? '').split('|')[0]}`).filter((word) => words.has(word))).size })).sort((left, right) => right.shared - left.shared);
      return scored[0]?.shared ? [`"${block.heading}" (${scored[0].item.route})`] : [];
    });
    if (repeats.length >= HUB_REPEAT_SECTIONS) issues.push({ route: page.route, kind: 'hub_repeats_children', field: 'blocks', why: `the hub writes ${repeats.length} of its ${children.length} child pages out again; a hub introduces the services and links to each (the competitor's: a heading, a paragraph and its contact), the detail is the child pages'`, text: repeats.join('; ').slice(0, 400) });
  }
  return issues;
}

// A product page's testimonial about another of the site's products (aloha 2026-11-18, audit H-8: the swimwear page's
// three reviews were about aloha shirts, the one-piece page's about "every shirt"): the products are the site's product
// pages' slugs; a review names another one's and none of its own page's words. Report only: the reviews are Site
// Factory's (page testimonials), copied as written.
const PRODUCT_TYPES = new Set(['product_manufacturer', 'product_wholesale']);
const SLUG_STOP = new Set(['manufacturer', 'manufacturers', 'wholesale', 'supplier', 'factory', 'custom', 'private', 'label', 'and', 'for', 'the']);
const stem = (word) => word.replace(/(es|s)$/, '').slice(0, 5);
const slugWords = (route) => String(route).split('/').filter(Boolean).at(-1)?.split('-').filter((word) => word.length >= 3 && !SLUG_STOP.has(word)).map(stem) ?? [];
const textStems = (text) => new Set(String(text ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 3).map(stem));
export function testimonialsOffPage(pages) {
  const products = pages.filter((page) => PRODUCT_TYPES.has(page.pageType));
  const heads = new Map(products.map((page) => [page.route, slugWords(page.route).at(-1)]).filter(([, head]) => head));
  const issues = [];
  for (const page of products.filter((item) => item.status === 'authored')) {
    const own = new Set(slugWords(page.route));
    // What the page is about: its title and headings; and a product whose page shares a slug word with this one is of
    // its kind (the aloha work uniform page's reviews of shirts: the aloha shirt pages share "aloha").
    const subject = textStems([page.seo?.title, page.hero?.heading, ...(page.blocks ?? []).filter((item) => item.type !== 'testimonials').map((item) => item.heading)].join(' '));
    const kin = (head) => products.some((other) => heads.get(other.route) === head && slugWords(other.route).some((word) => own.has(word)));
    const others = new Set([...heads.values()].filter((head) => !own.has(head) && !subject.has(head) && !kin(head)));
    for (const block of (page.blocks ?? []).filter((item) => item.type === 'testimonials')) {
      for (const item of block.items ?? []) {
        const words = textStems(item.quote);
        const named = [...others].filter((head) => words.has(head));
        if (named.length && ![...own].some((word) => words.has(word))) issues.push({ route: page.route, kind: 'testimonial_off_page', field: `${block.id}.item`, why: `a review on this page names another product (${named.join(', ')}) and none of the page's own`, text: String(item.quote).slice(0, 160) });
      }
    }
  }
  return issues;
}

// The list for Site Factory 07, grouped by kind.
export function contentIssuesMarkdown(issues, { site = '' } = {}) {
  const kinds = { leaked_wording: 'Internal wording on the page', raw_markdown: 'Link markup shown as text', keyword_list: 'Keyword lists', repeated_paragraph: 'Boilerplate repeated across pages', academic_source: 'Study databases cited on sales pages', hub_repeats_children: 'Hub pages that rewrite their child pages', testimonial_off_page: 'Reviews about another product than their page' };
  const lines = [`# Content issues${site ? `: ${site}` : ''}`, '', `${issues.length} issue(s) found by scripts/audit-content.mjs. The template never rewrites copy: these go back to Site Factory 07.`, ''];
  for (const [kind, title] of Object.entries(kinds)) {
    const list = issues.filter((issue) => issue.kind === kind);
    if (!list.length) continue;
    lines.push(`## ${title} (${list.length})`, '');
    for (const issue of list) lines.push(`- \`${issue.route}\` ${issue.field}: ${issue.why}. "${issue.text}"`);
    lines.push('');
  }
  return lines.join('\n');
}
