// Copy that promises a file the visitor can have: a download, a PDF, a free guide or template (four-site audit
// 2026-11-17: the hotel and the short-let sites' resources pages offered guides, templates and checklists with no file
// on the page and no way to ask for one). Such a page carries a file link or the resource request form (owner
// 2026-11-17: "做成表单发到我们邮箱"; lib/lead-form.mjs resourceFormBlock); promise_without_asset fails a page with
// neither. Below the blueprint builder: the importer, the blueprint builder, the data checks and the SEO audit read it.

import { indexBefore } from './block-position.mjs';
import { resourceFormBlock } from './lead-form.mjs';

// A promise of a file the visitor takes away: "download our/the/every…", "downloadable", a free, printable or
// downloadable guide, template or checklist, a PDF guide or brochure, an e-book or white paper. A file format the
// visitor sends ("your AI or PDF artwork") or a report a service delivers ("a PDF report within 10 days", "a file
// download within 5 business days") is no such promise (the four sites' product and service pages, 2026-11-17).
const RESOURCE_NOUN = '(?:guides?|templates?|checklists?|worksheets?|workbooks?|toolkits?|calculators?|planners?|playbooks?|handbooks?|spreadsheets?)';
export const PROMISE = new RegExp([
  '\\bdownload(?:ing)?\\s+(?:our|the|this|these|a|any|every|each|all|it|them|free|here|now)\\b',
  '\\bdownloadable\\b',
  '\\bfree\\s+downloads?\\b',
  `\\b(?:free|printable)\\s+(?:[\\w-]+\\s+){0,2}${RESOURCE_NOUN}\\b`,
  `\\bpdf\\s+(?:${RESOURCE_NOUN.slice(3, -1)}|brochures?|catalogu?es?|catalogs?|versions?|copy|copies)\\b`,
  '\\be-?books?\\b',
  '\\bwhite ?papers?\\b',
].join('|'), 'i');
// A link to a file the visitor gets (the asset the promise names).
export const FILE_EXTENSIONS = Object.freeze(['pdf', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'zip', 'csv', 'epub']);
const FILE_PATH = new RegExp(`\\.(?:${FILE_EXTENSIONS.join('|')})(?:[?#][^"')\\s]*)?$`, 'i');
export const isFileHref = (href) => FILE_PATH.test(String(href ?? '').trim());
// The resources page of Site Factory's site tree (site:resources_guides), which offers guides and templates by kind.
export const RESOURCE_PAGE_NAMES = Object.freeze(['resources_guides', 'resources']);
// Pages whose copy is legal text (privacy, terms): "download your data" there is no promise of a file.
const LEGAL_PAGE_TYPES = Object.freeze(['privacy']);

// A text without the words of the links it cites on other sites: a cited article's title is that site's words, no
// promise of this page (site13 2026-11-18: a blog post citing "Fashion Tech Pack Template (Free Download + Checklist)").
export const withoutCitations = (text) => String(text ?? '').replace(/\[[^\]]*\]\(https?:\/\/[^)\s]*\)/gi, ' ');

// The words of a promise in a text, a few words either side, or null.
export function promiseIn(text) {
  const match = PROMISE.exec(String(text ?? ''));
  if (!match) return null;
  const before = text.slice(0, match.index).split(/\s+/).slice(-4).join(' ');
  const after = text.slice(match.index + match[0].length).split(/\s+/).slice(0, 4).join(' ');
  return `${before} ${match[0]} ${after}`.replace(/\s+/g, ' ').trim();
}

// Keys whose strings are not copy a visitor reads.
const NOT_COPY = new Set(['id', 'type', 'variant', 'href', 'src', 'srcset', 'url', 'route', 'canonical', 'sourceSectionIds', 'photoCandidates', 'media', 'factId', 'anchor', 'name', 'kind', 'autocomplete', 'endpoint', 'status', 'honeypot', 'privacyRoute', 'request', 'requestType']);
// An entry that points at another site (a post's source: { title, url: "https://…" }).
const citesElsewhere = (value) => [value.url, value.href].some((link) => typeof link === 'string' && /^https?:\/\//i.test(link));
// Every string of copy a page's data holds (hero and blocks), in order; citations: false leaves out the entries that
// point at another site, whose words are that site's.
export function pageStrings(page, { citations = true } = {}) {
  const found = [];
  const walk = (value, key = null) => {
    if (typeof value === 'string') { if (!NOT_COPY.has(key)) found.push(value); return; }
    if (Array.isArray(value)) { value.forEach((item) => walk(item, key)); return; }
    if (value && typeof value === 'object' && !(citations === false && citesElsewhere(value))) for (const [name, item] of Object.entries(value)) walk(item, name);
  };
  walk(page.hero);
  walk((page.blocks ?? []).filter((block) => block.type !== 'form'));
  return found;
}

// A markdown link to a file in a page's copy ([label](/files/guide.pdf)).
const copyFileLinks = (page) => [...JSON.stringify([page.hero, page.blocks] ?? '').matchAll(/\]\(([^)\s"]+)\)/g)].map((match) => match[1]).filter(isFileHref);

export const isResourceForm = (block) => block?.type === 'form' && block.request === 'resource';
export const isEnquiryForm = (block) => block?.type === 'form' && block.request !== 'resource';
const treeName = (page) => (String(page.id ?? page.page_id ?? '').startsWith('site:') ? String(page.id ?? page.page_id).slice(5) : null);
export const isResourcePage = (page) => RESOURCE_PAGE_NAMES.includes(treeName(page));

// Why a page (authoring page data: id, pageType, hero, blocks) must offer its resources by request: the site tree's
// resources page, or copy that promises a file with no file linked. null when it need not.
export function resourcePromise(page) {
  if (LEGAL_PAGE_TYPES.includes(page.pageType ?? page.page_type)) return null;
  if (copyFileLinks(page).length) return null;
  const phrase = pageStrings(page, { citations: false }).map((text) => promiseIn(withoutCitations(text))).find(Boolean);
  if (phrase) return { phrase };
  return isResourcePage(page) ? { phrase: null } : null;
}

// The resources a page names, for the form's choice: headings of its cards and list items, and the first cells of its
// table rows, that end in a resource noun ("Rate strategy guide", "OTA listing checklist"), each once, in page order.
const NAMED_RESOURCE = new RegExp(`\\b(?:${RESOURCE_NOUN.slice(3, -1)}|glossary|glossaries|reports?|e-?books?|white ?papers?|brochures?|catalogues?|catalogs?)$`, 'i');
export function resourceOptions(page) {
  const names = [];
  const plain = (text) => String(text ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  for (const block of page.blocks ?? []) {
    if (block.type === 'form' || block.type === 'faq') continue;
    for (const item of block.items ?? []) names.push(plain(item.heading ?? item.title ?? item.name));
    for (const row of block.table?.rows ?? block.rows ?? []) if (Array.isArray(row)) names.push(plain(row[0]));
  }
  return [...new Set(names.filter((name) => name && name.length <= 60 && NAMED_RESOURCE.test(name)))];
}

// The resource request form on a page that needs one (resourcePromise) and has none: before its related pages, FAQ or
// closing call, after the copy that lists the resources. Returns the block placed, or null.
export function placeResourceForm(blocks, page) {
  if (blocks.some(isResourceForm) || !resourcePromise({ ...page, blocks })) return null;
  const taken = new Set(blocks.map((block) => block.id));
  let id = 'resource-request';
  for (let n = 2; taken.has(id); n += 1) id = `resource-request-${n}`;
  const block = resourceFormBlock(id, resourceOptions({ ...page, blocks }));
  blocks.splice(indexBefore(blocks, ['relatedPages', 'faq', 'cta']), 0, block);
  return block;
}
