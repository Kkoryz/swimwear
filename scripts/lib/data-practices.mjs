// What this site collects, on its privacy policy (four-site audit 2026-11-17: the privacy pages did not say what the
// sites actually collect; claude-seo seo-content counts the privacy policy among the trust signals). A site-level
// module like the contact page's form (owner 2026-11-17): stage 08 writes it from the site's own configuration, the
// enquiry form's fields (config/lead-form.json), what each enquiry carries with it (LeadForm.astro), the analytics,
// chat and newsletter in the site runtime, and the owner's privacy facts (src/data/site-proof.json privacy: how long
// enquiries are kept, whom to ask), after Site Factory's text, never in place of it. A service the site does not run
// is not listed.
// Since Site Factory integ deb67119 (2026-11-17) Site Factory builds the table itself: its package's privacy page
// carries data_practices, the items below the site has on, word for word, read from config/site-collection.json (this
// module's items, exported by scripts/export-site-collection.mjs and copied byte for byte into Site Factory's
// domain/site-collection.json). That table is rendered as given; an older package has none, and the table is written
// here as before.

import { resourceFormBlock, siteEnquiryForm } from './lead-form.mjs';
import { isResourceForm } from './resource-promise.mjs';

export const DATA_PRACTICES_HEADING = 'What this site collects';
export const DATA_PRACTICES_COLUMNS = Object.freeze(['What', 'What is recorded', 'Why']);
// What every enquiry carries besides its fields (LeadForm.astro's hidden fields; a test keeps the two the same).
export const ENQUIRY_CONTEXT = Object.freeze(['page_url', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

// The privacy policy among a site's legal pages (the privacy page type holds the terms as well): the one its route or
// heading calls privacy.
export const isPrivacyPolicy = ({ route = '', label = '' } = {}) => /privacy/i.test(route) || /privacy/i.test(label);

// The module's block: no copy of its own, the renderer writes it from the configuration (DataPracticesBlock.astro).
// practices: the privacy page's table as Site Factory's package gives it (AuthoredPage.data_practices, Site Factory
// integ deb67119, 2026-11-17: its rows are this module's items, word for word, through config/site-collection.json;
// its retention and contact the owner's project.yaml privacy, '' when none is stated), rendered as given; the
// preflight compares its rows with this module's (collection_mismatch). An older package has none.
export const dataPracticesBlock = (id, practices = null) => ({ id, type: 'dataPractices', heading: DATA_PRACTICES_HEADING, ...(practices ? { practices: packagePractices(practices) } : {}) });
// The package's table as the block keeps it: each row's four fields, the retention and contact ('' none stated), and
// whether they still wait for the owner (placeholder, true unless the package says false: the contract's default).
const packagePractices = (given) => ({
  rows: (given.rows ?? []).map(({ id, what, recorded, why }) => ({ id, what, recorded, why })),
  retention: String(given.retention ?? ''), contact: String(given.contact ?? ''), placeholder: given.placeholder !== false,
});

const join = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const lower = (label) => label.toLowerCase();
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// What a form records: its required fields, then its optional ones "if you give them", then a field's own words for
// what it records where its label is no noun (lead-form.json `recorded`: the resource form's "Anything else" read
// "your anything else if you give it", Site Factory integ deb67119, 2026-11-17).
function recordedBy(fields) {
  const named = fields.filter((field) => !field.recorded);
  const required = named.filter((field) => field.required).map((field) => lower(field.label));
  const optional = named.filter((field) => !field.required).map((field) => lower(field.label));
  // (The enquiry's ask fields share one such phrase: it is said once.)
  const parts = [required.length && `your ${join(required)}`, optional.length && `your ${join(optional)} if you give ${optional.length > 1 ? 'them' : 'it'}`, ...new Set(fields.filter((field) => field.recorded).map((field) => field.recorded))];
  return capital(parts.filter(Boolean).join('; '));
}
const labelled = (form) => (form?.fields ?? []).filter((field) => field.label);

// The switches that turn the items on (config/site-collection.json `when`), in Site Factory's words (its project.yaml
// site_services; copy_07.collection_switches). COLLECTION_DEFAULTS: the template's, for a site that sets none: Umami on
// every site (stage 09 site:config writes it; the preflight's analytics_not_configured holds a site without it), no
// live chat, WhatsApp or newsletter until the site's registry row gives one. resource_form: a page of the site carries
// the resource request form (Site Factory: the site has its resources page).
export const COLLECTION_DEFAULTS = Object.freeze({ analytics: 'umami', chat: 'none', whatsapp: false, newsletter: false });
export const RESOURCE_FORM_SWITCH = 'resource_form';
// The switches a site's own configuration sets: runtime src/data/site-runtime.json, resourceForm as dataPractices'.
export function collectionSwitches({ runtime = null, resourceForm = null } = {}) {
  const chat = runtime?.chat || null;
  return { analytics: runtime?.analytics?.provider ?? 'none', chat: chat?.chatwoot ? 'chatwoot' : 'none', whatsapp: Boolean(chat?.whatsapp?.length), newsletter: Boolean(runtime?.newsletter), [RESOURCE_FORM_SWITCH]: labelled(resourceForm).length > 0 };
}
const isOn = (when, switches) => when === 'always' || Object.entries(when).every(([key, value]) => switches[key] === value);

// Every item the site may collect, in the table's order, whatever is on: { id, when, what, recorded, why, labels }
// (config/site-collection.json items; labels: the words a privacy page sentence repeating the row would hold, Site
// Factory's S07-12). The enquiry form's items and the resource form's are there when the form has fields.
/** @param {{ form: any, resourceForm?: any }} input */
export function collectionItems({ form, resourceForm = null }) {
  const items = [];
  const fields = labelled(form);
  if (fields.length) {
    items.push({ id: 'enquiry-form', when: 'always', what: 'The enquiry form', recorded: `${recordedBy(fields)}${form.consent ? ', and that you agreed to this use' : ''}`, why: 'To answer your enquiry', labels: fields.map((field) => lower(field.label)) });
    items.push({ id: 'enquiry-context', when: 'always', what: 'With each enquiry', recorded: 'The page you sent it from, the page that linked you here (referrer) and any campaign tags in the link you followed (UTM)', why: 'To know which pages and campaigns bring enquiries', labels: ['referrer', 'UTM', 'campaign tags'] });
  }
  const resourceFields = labelled(resourceForm);
  if (resourceFields.length) items.push({ id: 'resource-request', when: { [RESOURCE_FORM_SWITCH]: true }, what: 'The resource request form', recorded: `${recordedBy(resourceFields)}${resourceForm.consent ? ', and that you agreed to this use' : ''}; it carries the same page, referrer and campaign tags as an enquiry`, why: 'To send you the resource you asked for', labels: resourceFields.filter((field) => !field.recorded).map((field) => lower(field.label)) });
  items.push(
    { id: 'analytics', when: { analytics: 'umami' }, what: 'Visit statistics (Umami)', recorded: 'Pages viewed, the site you came from, browser, device type and country, and when a form is sent; counted without cookies and without identifying you', why: 'To see which pages help visitors', labels: ['pages viewed', 'browser', 'device type', 'country'] },
    { id: 'chat', when: { chat: 'chatwoot' }, what: 'Live chat', recorded: 'Your messages and, if you leave it, your email address', why: 'To answer you in the chat', labels: ['your messages', 'email address'] },
    { id: 'whatsapp', when: { whatsapp: true }, what: 'WhatsApp', recorded: 'Nothing on this site: the button opens WhatsApp with a message naming the page, and the conversation continues there under WhatsApp\'s terms', why: 'To answer you where you prefer', labels: [] },
    { id: 'newsletter', when: { newsletter: true }, what: 'The newsletter', recorded: 'Your email address, when you subscribe', why: 'To send the newsletter; every issue has a link to unsubscribe', labels: ['email address'] },
  );
  return items;
}

// The package's rows (Site Factory's data_practices) against the site's own (dataPractices' items), row by row: what
// differs, [] when they are the same (Site Factory integ deb67119, 2026-11-17: a table that is not what the site
// collects is the preflight's collection_mismatch, and the site is not released).
const ROW_FIELDS = Object.freeze(['id', 'what', 'recorded', 'why']);
export function collectionMismatch(given = [], own = []) {
  const problems = [];
  for (let index = 0; index < Math.max(given.length, own.length); index += 1) {
    const [theirs, ours] = [given[index], own[index]];
    if (!theirs) problems.push(`row ${index + 1}: the site collects ${ours.id} (${ours.what}), the table does not list it`);
    else if (!ours) problems.push(`row ${index + 1}: the table lists ${theirs.id} (${theirs.what}), the site does not collect it`);
    else for (const field of ROW_FIELDS.filter((key) => theirs[key] !== ours[key])) problems.push(`row ${index + 1} ${field}: "${theirs[field]}", the site's "${ours[field]}"`);
  }
  return problems;
}

// The table's rows and the notes under it. form: the form contract; runtime: src/data/site-runtime.json; privacy: the
// owner's facts ({ retention, contact }); contactEmail: the company's own address (site-contact.json, when real).
// resourceForm: the resource request form, when a page of the site carries one (lib/lead-form.mjs resourceFormBlock).
// copy: the privacy page's own text (Site Factory's, the other blocks of the page): its contact and its retention are
// the page's one source (four-site audit 2026-11-17, C4: site13's policy named sales@ and "as long as order records
// require" and this module privacy@ and "24 months"). Where the copy states one, a stand-in fact (privacy.standIn)
// gives way: the copy's single address is the contact and no second period is stated; the owner's own facts are
// shown, and a page left with two is the SEO audit's privacy_contradiction.
// items: the rows with their ids (collectionItems' that the site has on), as Site Factory's data_practices has them.
/** @param {{ form: any, resourceForm?: any, runtime?: any, privacy?: { retention?: string | null, contact?: string | null, standIn?: boolean } | null, contactEmail?: string | null, copy?: string }} input @returns {{ rows: string[][], items: { id: string, what: string, recorded: string, why: string }[], retention: string | null, contact: string | null }} */
export function dataPractices({ form, resourceForm = null, runtime = null, privacy = null, contactEmail = null, copy = '' }) {
  const switches = collectionSwitches({ runtime, resourceForm });
  const items = collectionItems({ form, resourceForm }).filter((item) => isOn(item.when, switches)).map(({ id, what, recorded, why }) => ({ id, what, recorded, why }));
  const rows = items.map((item) => [item.what, item.recorded, item.why]);
  const standIn = privacy?.standIn === true;
  const stated = [...new Set(emailsIn(copy))];
  const own = privacy?.contact ?? contactEmail ?? null;
  // A stand-in contact gives way too where the copy already says how to reach the company about one's details without
  // an address ("To see, correct or delete your information, email our team."): one way in, not two (aloha claude-seo
  // audit 2026-11-18, L-10: the copy's "email our team" and the stand-in's privacy@ stood on one page).
  const contact = standIn && stated.length === 1 ? stated[0] : standIn && !stated.length && rightsRoutesIn(copy).length ? null : own;
  const retention = standIn && retentionsIn(copy).length ? null : privacy?.retention ?? null;
  return { rows, items, retention, contact };
}

// The forms the site's pages carry, as the table reads them: the enquiry form (the contract's, with the ask fields of the
// site's kind: lib/lead-form.mjs siteEnquiryForm) and the resource request form when a page carries one
// (lib/resource-promise.mjs). The renderer and the preflight read the same.
/** @param {{ blocks?: any[] }[]} pages */
export const siteForms = (pages = []) => ({ form: siteEnquiryForm('form', pages), resourceForm: pages.some((page) => (page.blocks ?? []).some(isResourceForm)) ? resourceFormBlock('resource-request') : null });

// The sentences of a text that tell a person how to see, correct or delete what is held about them and whom to ask.
const RIGHTS = /\b(?:see|access|correct|delete|erase|remove)\b/i;
const ROUTE = /\b(?:email|e-mail|write|contact|message|ask)\b/i;
export const rightsRoutesIn = (text) => String(text ?? '').split(/(?<=[.!?])\s+|\n+/).filter((sentence) => RIGHTS.test(sentence) && ROUTE.test(sentence));
// The addresses a text names (lower case).
export const emailsIn = (text) => [...String(text ?? '').matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((match) => match[0].replace(/\.$/, '').toLowerCase());
// The periods a text states for keeping what it holds: "24 months", "as long as order records require", "until you ask us
// to delete them", each in a sentence about keeping, holding or storing (lower case, one per sentence).
const KEEPING = /\b(?:keep|keeps|kept|retain|retains|retained|store|stores|stored|hold|holds|held)\b/i;
const PERIOD = /\b(?:\d+|one|two|three|four|five|six|seven|ten|twelve)\s+(?:day|week|month|year)s?\b|\bas\s+long\s+as\s+[^.;,]+|\buntil\s+[^.;,]+/i;
export function retentionsIn(text) {
  return String(text ?? '').split(/(?<=[.!?])\s+|\n+/).filter((sentence) => KEEPING.test(sentence)).map((sentence) => sentence.match(PERIOD)?.[0]?.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
}
