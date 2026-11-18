// The enquiry form (config/lead-form.json, the form contract): the same on every page and every site, never written by
// Site Factory. Its status decides how every form of the site shows (the enquiry form and any other form posting to the
// same endpoint): "not-connected" disabled and without an action; "ready" (the default, owner 2026-11-17) and
// "connected" live, posting to the first-party endpoint, which forwards each enquiry to the recipient. The launch
// preflight holds until "connected" (a real POST tested on the server). The renderer's closing band and hero use it as
// well as the importer, so it stays apart from the blueprint builder.
import LEAD_FORM from '../../config/lead-form.json' with { type: 'json' };

// The statuses in which a form posts.
export const LIVE_FORM_STATUSES = Object.freeze(['ready', 'connected']);
/** @type {(status?: string | null) => boolean} */
export const formIsLive = (status) => LIVE_FORM_STATUSES.includes(status ?? '');
// The status every form of the site shows: the contract's, read when the page is built (a block written by an earlier
// import keeps the status it was imported with; the contract decides).
/** @type {(form?: { status?: string }) => string} */
export const formStatus = (form = LEAD_FORM) => form.status ?? 'not-connected';
// Where every form posts: the contract's endpoint on the site's own origin.
/** @type {(form?: { endpoint?: string }) => string | null} */
export const formEndpoint = (form = LEAD_FORM) => form.endpoint ?? null;

// The mailbox the endpoint forwards enquiries to: the address the site states (src/data/site-contact.json email: the
// one its visitors are told to write to; MotelPilot claude-seo audit 2026-11-17, M-10: enquiries went to info@ while the
// site named hello@), else the contract's recipient with {domain} the site's own (its identity's origin, without www),
// or null without an origin. It goes to the server (the Nginx config), never into a page.
/** @type {(origin?: string | null, form?: { recipient?: string }, contact?: { email?: string } | null) => string | null} */
export function formRecipient(origin, form = LEAD_FORM, contact = null) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact?.email ?? '')) return contact.email;
  if (!origin || !form.recipient) return null;
  const domain = new URL(origin).hostname.replace(/^www\./, '');
  return form.recipient.replace(/\{domain\}/g, domain);
}

// The privacy page the consent links to: the site's own page of type privacy (its route comes from the site tree, e.g.
// /privacy-policy/), else the contract's default.
/** @type {(pages?: { pageType: string, route: string }[], form?: { consent?: { privacyRoute?: string } }) => string | null} */
export const privacyRouteOf = (pages = [], form = LEAD_FORM) => pages.find((page) => page.pageType === 'privacy')?.route ?? form.consent?.privacyRoute ?? null;

// A field of the contract as a form block carries it: what it is for beside it (Modern Web Guidance, privacy.md).
// recorded: what the privacy page's table says the field records, where its label is no noun (lib/data-practices.mjs).
// min: a number field's least value (the browser says so when it is broken).
const fieldOf = ({ name, label, kind, required, autocomplete, purpose, options, min, recorded }) => ({ name, label, kind, required: Boolean(required), ...(autocomplete ? { autocomplete } : {}), ...(purpose ? { purpose } : {}), ...(options?.length ? { options } : {}), ...(typeof min === 'number' ? { min } : {}), ...(recorded ? { recorded } : {}) });
// What the form says around its fields: the asterisk's meaning and the live region's messages.
const formText = (form) => ({ ...(form.requiredNote ? { requiredNote: form.requiredNote } : {}), ...(form.messages ? { messages: form.messages } : {}) });

// The page types whose pages make a site a maker's (its product categories): the enquiry asks what product, how many and
// by when; a site without them is a service business's (site.json trade "service": site11's motels, site12's hotel
// revenue management) and asks which service and from when, never a quantity (site13 claude-seo audit 2026-11-17, M-15).
export const PRODUCT_PAGE_TYPES = Object.freeze(['product_manufacturer', 'product_wholesale']);
/** @type {(pages?: { pageType?: string }[]) => 'product' | 'service'} */
export const enquiryKind = (pages = []) => (pages.some((page) => PRODUCT_PAGE_TYPES.includes(page.pageType ?? '')) ? 'product' : 'service');
// A choice field (lead-form.json ask): the site's own pages of its pageTypes as a list, by the plan's label (else the
// title), and the field's other; a site without such a page names it in a text box. A page held out of the index is no
// choice.
function askField(field, pages) {
  if (field.kind !== 'choice') return field;
  const options = [...new Set(pages.filter((page) => field.pageTypes.includes(page.pageType) && page.status !== 'hold').map((page) => page.planned?.label ?? page.hero?.heading).filter(Boolean))];
  return options.length ? { ...field, kind: 'select', options: [...options, field.other] } : { ...field, kind: 'text' };
}
// The enquiry form's fields: the contract's, and before the message the ask fields of the site's kind (none without
// one: the form as an import writes it into a page, which the renderer then asks in full, LeadForm.astro).
export function enquiryFields(form = LEAD_FORM, { kind = null, pages = [] } = {}) {
  const ask = kind ? (form.ask?.[kind] ?? []).map((field) => askField(field, pages)) : [];
  const at = form.fields.findIndex((field) => field.name === 'message');
  const cut = at < 0 ? form.fields.length : at;
  return [...form.fields.slice(0, cut), ...ask, ...form.fields.slice(cut)].map(fieldOf);
}

// The form's block: never its recipient (the page never names the mailbox). kind and pages: the site's (enquiryKind),
// for its ask fields.
export function leadFormBlock(id, form = LEAD_FORM, { kind = null, pages = [] } = {}) {
  return {
    id, type: 'form', heading: form.heading,
    fields: enquiryFields(form, { kind, pages }),
    consent: form.consent, honeypot: form.honeypot, endpoint: form.endpoint, status: formStatus(form), submitLabel: form.submitLabel, ...formText(form),
  };
}

// The site's own enquiry form as its pages ask it: the contract's fields and the ask fields of the site's kind, the
// choices its own pages (the renderer, the privacy table and the preflight read the same).
/** @type {(id: string, pages?: any[], form?: any) => any} */
export const siteEnquiryForm = (id, pages = [], form = LEAD_FORM) => leadFormBlock(id, form, { kind: enquiryKind(pages), pages });

// The form as a WebMCP declarative tool (four-site audit 2026-11-17, Fable's plan A7; WebMCP is a W3C Web Machine
// Learning Community Group draft, the declarative form attributes Chrome-only, checked 2026-09-23 in claude-seo
// skills/seo-agentic/references/webmcp.md): the form names itself (toolname, tooldescription) and every control it
// sends says what it is (toolparamdescription), all or none: Lighthouse's webmcp-schema-validity counts a parameter
// without one as a failure ("Annotate fully or not at all", lighthouse-agentic-category.md). No toolautosubmit: an agent
// fills the form, the person sends it. A form that does not post (not-connected) is no tool.
// The values the page fills in itself, by control name.
export const TOOL_PAGE_FIELDS = Object.freeze({
  site_id: 'The site the enquiry comes from, filled in by the page',
  request_type: 'What kind of request this is, filled in by the page',
  page_url: 'The page the enquiry is sent from, filled in by the page',
  referrer: 'The page the visitor came from, filled in by the page',
  utm_source: 'The campaign source of the visit, filled in by the page',
  utm_medium: 'The campaign medium of the visit, filled in by the page',
  utm_campaign: 'The campaign of the visit, filled in by the page',
  utm_term: 'The campaign term of the visit, filled in by the page',
  utm_content: 'The campaign content of the visit, filled in by the page',
});
/** @typedef {{ id: string, request?: string, requestType?: string, submitLabel: string, honeypot?: string, consent?: { label: string }, fields: { name?: string, label: string, purpose?: string }[] }} ToolForm */
/** @type {(block: ToolForm, live: boolean) => { name: string, description: string, params: Record<string, string> } | null} */
export function formTool(block, live) {
  if (!live) return null;
  const resource = block.request === 'resource';
  const name = `${resource ? 'request_resource' : 'send_enquiry'}_${String(block.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  const description = resource
    ? `Requests a resource${block.requestType ? ` (${block.requestType})` : ''} from the company with this page's form, as its "${block.submitLabel}" button does.`
    : `Sends an enquiry to the company with this page's form, as its "${block.submitLabel}" button does.`;
  /** @type {Record<string, string>} */
  const params = {};
  for (const [index, field] of block.fields.entries()) params[field.name ?? `field-${index}`] = field.purpose ?? field.label;
  if (block.consent) params.consent = block.consent.label;
  if (block.honeypot) params[block.honeypot] = 'Leave empty: a check against automated spam';
  return { name, description, params: { ...params, ...TOOL_PAGE_FIELDS } };
}

// The resource request form (owner 2026-11-17: "做成表单发到我们邮箱"): on a page that offers guides, templates or
// downloads with no file to take (lib/resource-promise.mjs), the visitor's name, email and the resource they want,
// posted to the enquiry form's endpoint with a hidden request_type the owner's mailbox sorts by. options: the resources
// the page names (resourceOptions), a choice among them and "something else"; none, the visitor names it. Connected
// when the enquiry form is, by the same contract.
export function resourceFormBlock(id, options = [], form = LEAD_FORM) {
  const request = form.resourceRequest;
  const which = request.resourceField;
  const resource = options.length
    ? { name: which.name, label: which.label, kind: 'select', required: true, purpose: which.purpose, options: [...options, which.other] }
    : { name: which.name, label: which.label, kind: 'text', required: true, purpose: which.purpose };
  return {
    id, type: 'form', request: 'resource', requestType: request.requestType, heading: request.heading, paragraphs: [request.intro],
    fields: [...request.fields, resource, request.noteField].map(fieldOf),
    consent: { ...form.consent, ...request.consent }, honeypot: form.honeypot, endpoint: form.endpoint, status: formStatus(form), submitLabel: request.submitLabel, ...formText(form),
  };
}
