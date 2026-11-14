// The site's proof (src/data/site-proof.json, the owner's data): factory figures, certificates, clients, testimonials,
// case studies, history, and the order terms (MOQ, sampling and lead times as one table, from the approved facts).
// Owner slots of the page blueprints render it; Site Factory never writes it. Values the owner states now and replaces
// before launch (every group but the terms) are listed in docs/research/release-signoff.json (pnpm proof:signoff).

import { CARDINALITY } from './authoring-contract.mjs';
import { indexBefore, openingEnd } from './block-position.mjs';
import { slotBlockId } from './slot-blocks.mjs';

export const PROOF_SCHEMA = 'seo-site-proof-v1';
export const PROOF_GROUPS = Object.freeze(['factory', 'certifications', 'clients', 'testimonials', 'caseStudies', 'history']);

// Owner slots each page type carries whatever its competitor page shows, after the SEO-strong manufacturer sites
// (Thygesen, Arcus, Apparel Production NY, Appareify): the home page proves the factory, its certificates, clients and
// results; the about page its figures and history; product and service pages the certificates, a case and a client's
// words. A slot is left out of a page while the site has no data for it. The case studies (with product photos) come
// last, right before the FAQ, so the text-only proof above them and the FAQ and sources below are not one long run.
// The order routes (Site Factory's order_routes, lib/site-trust.mjs) open the ordering page and follow the home page's
// introduction, after swimwearbali.com and baliswim.com: two route cards, the other ways to start as a short list.
export const PROOF_SLOTS = Object.freeze({
  home: ['orderRoutes', 'factory', 'certifications', 'logos', 'testimonials', 'caseStudies'],
  about: ['factory', 'history', 'certifications', 'logos', 'testimonials'],
  product_manufacturer: ['orderTerms', 'certifications', 'testimonials', 'caseStudies'],
  product_wholesale: ['orderTerms', 'testimonials'],
  solution: ['testimonials', 'caseStudies'],
  ordering: ['orderRoutes'],
});
const PURPOSE = {
  factory: 'Factory figures the owner can state (capacity, lines, staff, floor area, founding year)',
  certifications: 'Certificates the production holds: name, issuer, scope, number, validity',
  logos: 'Client or certification logos the owner can show (real, with permission)',
  caseStudies: 'Client projects with measured results, told with permission',
  testimonials: 'Testimonials real clients agreed to publish',
  history: 'Milestones of the company, year by year',
  orderTerms: 'Order terms from the approved facts as one table: MOQ, sampling, lead times, fees',
  orderRoutes: 'How an order starts (Site Factory order_routes): two route cards, the other ways as a list',
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
const SLOT_GROUP = Object.freeze({ factory: 'factory', certifications: 'certifications', logos: 'clients', testimonials: 'testimonials', caseStudies: 'caseStudies', history: 'history', orderTerms: 'terms', orderRoutes: 'orderRoutes' });
// The id of the block that shows a proof group on a page.
export const proofGroupBlockId = (group) => slotBlockId('owner', Object.keys(SLOT_GROUP).find((slot) => SLOT_GROUP[slot] === group));

// The block an owner slot shows on a page, or none while the site has no data for it. What Site Factory gives comes
// first: the order routes, and the testimonials of the page (borrowed and anonymised until the owner replaces them)
// in place of the stand-in ones. The company's size facts (lib/site-trust.mjs) show in the trust bar on every page, so
// then the factory figures block (stand-in figures) is left out.
export function proofBlock(slotId, proof, { route = null, trust = null, testimonials = null } = {}) {
  const heading = proof?.headings?.[SLOT_GROUP[slotId]];
  const block = (type, fields) => ({ id: slotBlockId('owner', slotId), type, ...(heading ? { heading } : {}), ...fields });
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
      return proof.certifications?.length ? block('certifications', { items: proof.certifications.slice(0, most('certifications')) }) : null;
    case 'logos':
      return proof.clients?.length >= 2 ? block('logos', { items: proof.clients.slice(0, most('logos')).map(({ name, note, media }) => ({ name, ...(note ? { note } : {}), ...(media ? { media } : {}) })) }) : null;
    case 'testimonials':
      return proof.testimonials?.length ? block('testimonials', { items: forPage(proof.testimonials, route, 3).map(({ pages, ...item }) => item) }) : null;
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
  };
  return PROOF_GROUPS.filter((group) => proof?.[group]?.length).map((group) => ({ id: `proof-${group}`, description: `Replace the stated ${describe[group](proof[group])} with real, permitted values (src/data/site-proof.json)`, status: 'pending' }));
}
