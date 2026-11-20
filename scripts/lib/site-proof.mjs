// The site's proof (src/data/site-proof.json, the owner's data): factory figures, certificates, clients, testimonials,
// case studies, history, the team (lib/site-people.mjs), the privacy facts (retention and contact, lib/data-practices.mjs)
// and the order terms (MOQ, sampling and lead times as one table, from the approved facts).
// Owner slots of the page blueprints render it; Site Factory never writes it. Values the owner states now and replaces
// before launch (every group but the terms) are listed in docs/research/release-signoff.json (pnpm proof:signoff).

import { CARDINALITY } from './authoring-contract.mjs';
import { indexBefore, openingEnd } from './block-position.mjs';
import { TEAM_HEADING, teamItems } from './site-people.mjs';
import { slotBlockId } from './slot-blocks.mjs';

export const PROOF_SCHEMA = 'seo-site-proof-v1';
// The privacy facts' source when they are Site Factory's (its package's data_practices: scaffold-site-proof.mjs packagePrivacy).
export const PRIVACY_FROM_PACKAGE = 'site-factory';
export const PROOF_GROUPS = Object.freeze(['factory', 'certifications', 'clients', 'testimonials', 'caseStudies', 'history', 'team']);

// The client wall (the logos slot: the named clients of site-proof.json) shows only where site.json says
// clientWall: true (owner 2026-11-20: "客户名单是指logo墙？这个可以做的开关关闭但是保留一键打开的选项"; the stand-in's six
// invented names stood beside copy calling its cases anonymised, three-site prelaunch review P2). Off (the default,
// new and earlier sites alike), the clients stay in site-proof.json and nothing shows or checks them: no logos block,
// no sign-off item, no proof check; clientWall: true and a rebuild bring the wall back as it was (site-run's patterns,
// import and data-checks steps take site.json#clientWall as an input, so the switch alone runs them again).
export const clientWallOn = (site) => site?.clientWall === true;
// The proof the pages are built and checked from: without its clients while the wall is off.
export const withClientWall = (proof, site) => (!proof || clientWallOn(site) ? proof : { ...proof, clients: [] });

// Owner slots each page type carries whatever its competitor page shows, after the SEO-strong manufacturer sites
// (Thygesen, Arcus, Apparel Production NY, Appareify): the home page proves the factory, its certificates, clients and
// results; the about page its figures and history; product and service pages the certificates, a case and a client's
// words. A slot is left out of a page while the site has no data for it. The case studies (with product photos) come
// last, right before the FAQ, so the text-only proof above them and the FAQ and sources below are not one long run.
// The about page names its people last (four-site audit 2026-11-17: no named person anywhere): the team section whose
// anchors the blog's bylines link to.
// The order routes (Site Factory's order_routes, lib/site-trust.mjs) open the ordering page and follow the home page's
// introduction, after swimwearbali.com and baliswim.com: two route cards, the other ways to start as a short list.
export const PROOF_SLOTS = Object.freeze({
  home: ['orderRoutes', 'factory', 'certifications', 'logos', 'testimonials', 'caseStudies'],
  about: ['factory', 'history', 'certifications', 'logos', 'testimonials', 'team'],
  product_manufacturer: ['orderTerms', 'certifications', 'testimonials', 'caseStudies'],
  product_wholesale: ['orderTerms', 'testimonials'],
  // a service page's order terms only as its own quick-view table (no site table on a service page; proofBlock siteTerms)
  solution: ['orderTerms', 'testimonials', 'caseStudies'],
  ordering: ['orderRoutes'],
});
// Owner slots a general page of the site tree carries by its tree name (site:<name>), as page-blueprints.mjs
// REQUIRED_BLOCKS does: the case studies page shows the site's case studies, a card each (four-site audit 2026-11-17,
// Fable's plan C9: every site's site:case_studies_portfolio, a "general" page, showed Site Factory's anonymised orders
// only while the caseStudies slot stood unused). A page type's PROOF_SLOTS would put them on every general page.
export const PAGE_PROOF_SLOTS = Object.freeze({ case_studies_portfolio: ['caseStudies'] });
export const pageProofSlots = (pageType, pageId = null) => (pageType === 'general' && pageId?.startsWith('site:') ? PAGE_PROOF_SLOTS[pageId.slice(5)] ?? [] : []);
// The owner slots of a page: its blueprint's, then the ones its tree name adds.
export function ownerSlotsOf(slots = [], pageType = null, pageId = null) {
  const own = slots.filter((slot) => slot.fill === 'owner');
  const added = pageProofSlots(pageType, pageId).filter((id) => !own.some((slot) => slot.id === id)).map((id) => ({ id, block: id, fill: 'owner', required: false, purpose: PURPOSE[id], page: true }));
  return [...own, ...added];
}
const PURPOSE = {
  factory: 'Factory figures the owner can state (capacity, lines, staff, floor area, founding year)',
  certifications: 'Certificates the production holds: name, issuer, scope, number, validity',
  logos: 'Client or certification logos the owner can show (real, with permission)',
  caseStudies: 'Client projects with measured results, told with permission',
  testimonials: 'Testimonials real clients agreed to publish',
  history: 'Milestones of the company, year by year',
  orderTerms: 'Order terms from the approved facts as one table: MOQ, sampling, lead times, fees',
  orderRoutes: 'How an order starts (Site Factory order_routes): two route cards, the other ways as a list',
  team: 'The people behind the company: name, role, years of experience, what they do (no photos of invented people)',
};

// The page type's slots with its proof slots added: one already placed (from the competitor page) stays where it is;
// the others go before the FAQ (or the closing call to action), in PROOF_SLOTS order; `except` are slots a person
// left out of the competitor's page (blueprint-choices.json).
export function withProofSlots(pageType, slots, except = []) {
  const wanted = (PROOF_SLOTS[pageType] ?? []).filter((id) => !except.includes(id) && !slots.some((slot) => slot.id === id));
  if (!wanted.length) return slots;
  const at = indexBefore(slots, ['faq', 'cta'], (slot) => slot.block);
  const slot = (id) => ({ id, block: id, fill: 'owner', required: false, purpose: PURPOSE[id] });
  const list = [...slots.slice(0, at), ...wanted.filter((id) => !['orderTerms', 'orderRoutes'].includes(id)).map(slot), ...slots.slice(at)];
  // The terms table sits right after the page's written terms (Site Factory's terms section), else first of the proof.
  if (wanted.includes('orderTerms')) { const terms = list.findIndex((item) => item.id === 'terms'); list.splice(terms >= 0 ? terms + 1 : at, 0, slot('orderTerms')); }
  // The order routes follow the page's opening section.
  if (wanted.includes('orderRoutes')) list.splice(openingEnd(list, (item) => item.block), 0, slot('orderRoutes'));
  return list;
}

// Items about this page first (their `pages` name its route), then the rest, up to `max`.
const forPage = (items, route, max) => [...items.filter((item) => item.pages?.includes(route)), ...items.filter((item) => !item.pages?.includes(route))].slice(0, max);
const most = (type) => CARDINALITY[type][1];

export const ORDER_ROUTES_HEADING = 'Ways to start your order';
// The group of site-proof.json each owner slot shows (also the key of its heading in `headings`).
const SLOT_GROUP = Object.freeze({ factory: 'factory', certifications: 'certifications', logos: 'clients', testimonials: 'testimonials', caseStudies: 'caseStudies', history: 'history', orderTerms: 'terms', orderRoutes: 'orderRoutes', team: 'team' });
// The id of the block that shows a proof group on a page.
export const proofGroupBlockId = (group) => slotBlockId('owner', Object.keys(SLOT_GROUP).find((slot) => SLOT_GROUP[slot] === group));

// The block an owner slot shows on a page, or none while the site has no data for it. What Site Factory gives comes
// first: the order routes, and the testimonials of the page (borrowed and anonymised until the owner replaces them)
// in place of the stand-in ones. The company's size facts (lib/site-trust.mjs) show in the trust bar on every page, so
// then the factory figures block (stand-in figures) is left out.
// quickView: the page's own quick-view table from Site Factory (its package page's quick_view, LLM search view B.3, owner
// 11-19 sample): the order terms of this page, one fixed row a term, in place of the site's terms table.
// siteTerms false (a service page): no site terms table in the slot, only the page's own quick view.
export function proofBlock(slotId, proof, { route = null, trust = null, testimonials = null, quickView = null, siteTerms = true } = {}) {
  const heading = proof?.headings?.[SLOT_GROUP[slotId]];
  const block = (type, fields) => ({ id: slotBlockId('owner', slotId), type, ...(heading ? { heading } : {}), ...fields });
  if (slotId === 'orderTerms' && quickView?.rows?.length) return block('table', { columns: quickView.columns, rows: quickView.rows });
  if (slotId === 'orderTerms' && !siteTerms) return null;
  const placeholder = (item) => (item.placeholder === false ? {} : { placeholder: true });
  if (slotId === 'orderRoutes') {
    return trust?.routes?.length ? block('orderRoutes', { heading: heading ?? ORDER_ROUTES_HEADING, items: trust.routes.slice(0, most('orderRoutes')).map((item) => ({ heading: item.heading, text: item.text, ...(item.placeholder ? { placeholder: true } : {}) })) }) : null;
  }
  // Three quotes at most: a band of testimonials, not a wall.
  if (slotId === 'testimonials' && testimonials?.length) return block('testimonials', { items: testimonials.slice(0, 3).map((item) => ({ quote: item.text, author: item.reviewer, ...placeholder(item) })) });
  if (slotId === 'factory' && trust?.items?.length >= 2) return null;
  if (!proof) return null;
  // Stand-ins show until the owner replaces them (owner 2026-09-26, again 2026-11-12: "直接用"), but a stand-in figure
  // shows only where a fact states it: an invented number contradicts the copy (the hotel site's "40 clients served"
  // beside its 60). Three figures at least: two alone read as a gap.
  const own = !proof.standIn;
  const figures = (proof.factory ?? []).filter((item) => own || item.factId);
  switch (slotId) {
    case 'factory':
      return figures.length >= 3 ? block('stats', { items: figures.slice(0, most('stats')).map(({ value, label, note }) => ({ value, label, ...(note ? { note } : {}) })) }) : null;
    case 'certifications':
      // A certificate's number and any look-up never reach the page (owner 2026-11-19: "不显示不要编号"); the number
      // stays in site-proof.json for the owner's sign-off list (proofSignoffItems)
      return proof.certifications?.length ? block('certifications', { items: proof.certifications.slice(0, most('certifications')).map(({ number, lookupUrl, ...item }) => item) }) : null;
    case 'logos':
      return proof.clients?.length >= 2 ? block('logos', { items: proof.clients.slice(0, most('logos')).map(({ name, note, media }) => ({ name, ...(note ? { note } : {}), ...(media ? { media } : {}) })) }) : null;
    case 'testimonials': {
      // A testimonial shows only on the pages it is assigned to (its `pages`; one with none, anywhere): the same three
      // about women's swimwear, one-pieces and bikinis stood on 19 unrelated pages (four-site audit 2026-11-17, C3;
      // site13 blind audit H2). A page with none of its own shows no testimonials section.
      const items = (proof.testimonials ?? []).filter((item) => !item.pages?.length || item.pages.includes(route)).slice(0, 3);
      return items.length ? block('testimonials', { items: items.map(({ pages, ...item }) => item) }) : null;
    }
    case 'caseStudies': {
      // A page with cases of its own shows only those; any other page the first few.
      const own = proof.caseStudies?.filter((item) => item.pages?.includes(route)) ?? [];
      const items = own.length ? own.slice(0, most('caseStudies')) : forPage(proof.caseStudies ?? [], route, most('caseStudies'));
      return items.length ? block('caseStudies', { items: items.map(({ pages, ...item }) => item) }) : null;
    }
    case 'orderTerms':
      return proof.terms?.rows?.length ? block('table', { columns: proof.terms.columns, rows: proof.terms.rows }) : null;
    case 'history':
      return proof.history?.length >= 2 ? block('process', { variant: 'photo-cards', steps: proof.history.map(({ year, event }) => ({ heading: String(year), text: event })) }) : null;
    case 'team': {
      const items = teamItems(proof.team).slice(0, most('team'));
      return items.length ? block('team', { heading: heading ?? TEAM_HEADING, items }) : null;
    }
    default:
      return null;
  }
}

// Blocks whose items Site Factory borrowed from competitors (placeholder: true): while a built page shows one, release
// holds (preflight hold) until the owner replaces them or confirms the sign-off item to launch with them.
export const PLACEHOLDER_BLOCKS = Object.freeze([
  { type: 'testimonials', signoff: 'placeholder-testimonials', hold: 'placeholder_testimonial', what: 'borrowed, anonymised testimonials' },
  { type: 'orderRoutes', signoff: 'placeholder-order-routes', hold: 'placeholder_order_route', what: 'order routes borrowed from competitors' },
  { type: 'orderCase', signoff: 'placeholder-cases', hold: 'placeholder_case', what: 'client cases borrowed from other makers and anonymised' },
  { type: 'featureGrid', signoff: 'placeholder-cards', hold: 'placeholder_card', what: 'card copy borrowed from competitors' },
  { type: 'iconList', signoff: 'placeholder-selling-points', hold: 'placeholder_selling_point', what: 'selling points borrowed from competitors' },
  { type: 'process', signoff: 'placeholder-steps', hold: 'placeholder_step', what: 'order steps borrowed from competitors' },
]);
// The routes of the pages showing a block of this type with a borrowed item (its items, or a process block's steps).
export const placeholderRoutes = (pages, type) => pages.filter((page) => (page.blocks ?? []).some((block) => block.type === type && (block.items ?? block.steps ?? []).some((item) => item?.placeholder))).map((page) => page.route);

// What the owner states now and replaces before launch, one sign-off item per group that has data.
export function proofSignoffItems(proof) {
  const list = (items, show) => items.map(show).join('; ');
  const describe = {
    factory: (items) => `factory figures: ${list(items, (item) => `${item.value} ${item.label}`)}`,
    certifications: (items) => `certificates (add each one's logo once it is held): ${list(items, (item) => `${item.name}${item.number ? ` no. ${item.number}` : ''}`)}`,
    clients: (items) => `client names: ${list(items, (item) => item.name)}`,
    testimonials: (items) => `testimonials: ${list(items, (item) => `${item.author}, ${item.company ?? ''}`)}`,
    caseStudies: (items) => `case studies: ${list(items, (item) => `${item.client}: ${item.title}`)}`,
    history: (items) => `history: ${list(items, (item) => `${item.year} ${item.event}`)}`,
    team: (items) => `team members: ${list(items, (item) => `${item.name}, ${item.role}${item.years ? `, ${item.years} years` : ''}`)}`,
  };
  const groups = PROOF_GROUPS.filter((group) => proof?.[group]?.length).map((group) => ({ id: `proof-${group}`, description: `Replace the stated ${describe[group](proof[group])} with real, permitted values (src/data/site-proof.json)`, status: 'pending' }));
  // The privacy facts the privacy page's "what this site collects" shows (lib/data-practices.mjs). Site Factory's
  // (scaffold-site-proof.mjs packagePrivacy, source site-factory) are the owner's project.yaml privacy: listed until the
  // owner has confirmed them (placeholder false), and corrected there, not here.
  const fromPackage = proof?.privacy?.source === PRIVACY_FROM_PACKAGE;
  const privacy = fromPackage && proof.privacy.placeholder === false ? [] : [proof?.privacy?.retention && `retention: ${proof.privacy.retention}`, proof?.privacy?.contact && `privacy contact: ${proof.privacy.contact}`].filter(Boolean);
  return [...groups, ...(privacy.length ? [{ id: 'proof-privacy', description: fromPackage ? `Confirm the stated privacy facts (${privacy.join('; ')}) or give the real ones (Site Factory project.yaml privacy)` : `Replace the stated privacy facts (${privacy.join('; ')}) with the owner's real ones (src/data/site-proof.json privacy)`, status: 'pending' }] : [])];
}
