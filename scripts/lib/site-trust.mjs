// The site-wide trust bar (src/data/site-trust.json): the company's size facts Site Factory 07 lists in the package's
// trust_bar (each word for word from an approved fact), with the founding year and the location from facts.yaml. A
// compact band under every page's hero shows up to TRUST_BAR_ITEMS of them, and a site with real size facts shows no
// stand-in factory figures module. The package's order_routes (how an order starts: ready
// designs, custom designs, a starter kit...) fill the order routes block of the ordering page and the home page; one
// whose fact is not in facts.yaml word for word is borrowed from a competitor and marked a placeholder.

import { factApproved, factConfirmed } from './facts.mjs';
import { NO_BAND_PAGE_TYPES, SITE_BAND_PAGE_TYPES } from './page-figures.mjs';

export const TRUST_SCHEMA = 'seo-site-trust-v1';
export const TRUST_BAR_ITEMS = 5;
// A trust bar item is a figure ("22,000 pieces", "25 to 45 pieces"), not a sentence; a longer value stays off the bar
// and is reported back to Site Factory (trustBarRefused).
export const TRUST_VALUE_MAX_WORDS = 5;
const isFigure = (item) => item?.value && item?.label && item.value.trim().split(/\s+/).length <= TRUST_VALUE_MAX_WORDS;

// The package's trust bar items too long for the bar: { fact_id, label, value }.
export const trustBarRefused = (authoringPackage) => (authoringPackage?.trust_bar ?? []).filter((item) => item?.value && item?.label && !isFigure(item)).map(({ fact_id: factId, label, value }) => ({ factId, label, value }));

// Every fact the package knows: facts.yaml's and capabilities' (facts: a Map of fact_id -> { text, approved,
// confirmed }) and its pages' own.
const allFacts = (authoringPackage, facts) => new Map([...(facts || []), ...(authoringPackage?.pages ?? []).flatMap((page) => page.facts ?? []).filter((fact) => fact.fact_id && fact.text).map((fact) => [fact.fact_id, { text: fact.text, approved: factApproved(fact), confirmed: factConfirmed(fact) }])]);
// A trust bar figure stands on a fact approved for the page's copy that states it word for word (site10's package listed
// a founding year with no fact behind it). One the owner has not confirmed yet shows like the rest of the copy and is
// on the pre-launch replacements (owner 2026-11-12: unconfirmed hard facts are written now and replaced before launch;
// the hotel site's bar showed one of its three figures). confirmedFigure: the owner's own.
const approvedFigure = (item, known) => Boolean(item.fact_id && known.get(item.fact_id)?.approved && known.get(item.fact_id).text.includes(item.value));
const confirmedFigure = (item, known) => approvedFigure(item, known) && Boolean(known.get(item.fact_id)?.confirmed);

// The package's trust bar figures kept off the bar for want of a confirmed fact that states them: { factId, label, value }.
export const trustBarUnconfirmed = (authoringPackage, facts = null) => {
  const known = allFacts(authoringPackage, facts);
  return (authoringPackage?.trust_bar ?? []).filter((item) => isFigure(item) && !confirmedFigure(item, known)).map(({ fact_id: factId, label, value }) => ({ factId: factId ?? null, label, value }));
};

// The figures a reader of the trade gains nothing from (config/wording.<trade>.json trustBarLeaveOut: a service
// business's team size) stay off the bar while another figure is there; the rest keep the package's order.
export function readerFigures(items, leaveOut = []) {
  const patterns = leaveOut.map((source) => new RegExp(source, 'i'));
  const useful = items.filter((item) => !patterns.some((pattern) => pattern.test(`${item.label} ${item.value}`)));
  return useful.length ? useful : items;
}

// The trust data from a Site Factory package and its facts, or null. leaveOut: the trade's patterns of figures a reader
// gains nothing from (readerFigures).
export function trustFromPackage(authoringPackage, facts = null, { leaveOut = [] } = {}) {
  const known = allFacts(authoringPackage, facts);
  // Every figure the package gives shows (owner 2026-11-12: "不要卡这个": the hotel site's bar showed one of its three, the
  // other two standing on a brief that did not state them word for word); one the owner has not confirmed is on the
  // pre-launch replacements (trustBarUnconfirmed) like the rest of the copy.
  const items = readerFigures((authoringPackage?.trust_bar ?? []).filter(isFigure), leaveOut).map((item) => ({ value: item.value, label: item.label, ...(item.note ? { note: item.note } : {}), ...(item.fact_id ? { factId: item.fact_id } : {}), ...(confirmedFigure(item, known) ? {} : { unconfirmed: true }) }));
  const fact = (id) => (known.get(id)?.confirmed ? known.get(id).text : null);
  const founded = fact('founded')?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
  // Where the company is: the confirmed fact named for its location, whatever the trade (location, location-<place>).
  const locationId = [...known.keys()].find((id) => /(^|:)location(-|$)/.test(id) && known.get(id)?.confirmed);
  const location = (locationId ? fact(locationId) : null)?.match(/\bin ([^;.]+?)(?:[.;]|$)/)?.[1]?.trim() ?? null;
  const routes = orderRoutesFrom(authoringPackage, known);
  const certifications = certificatesIn(fact('certifications'));
  if (!items.length && !founded && !routes.length && !certifications.length) return null;
  return { schemaVersion: TRUST_SCHEMA, items, ...(founded ? { founded } : {}), ...(location ? { location } : {}), ...(certifications.length ? { certifications } : {}), ...(routes.length ? { routes } : {}) };
}

// The certificates the approved fact names, each word for word and in its order ("OEKO-TEX Standard 100", "GRS"...),
// never a number: the trust bar's certificate line (the blind judges, 2026-09-28: "credibility would be stronger with
// named certificates"). A longer name wins over one it contains (amfori BSCI over BSCI).
export const CERTIFICATES = Object.freeze(['OEKO-TEX Standard 100', 'OEKO-TEX', 'GOTS', 'GRS', 'RCS', 'OCS', 'Better Cotton', 'BCI', 'ISO 9001', 'ISO 14001', 'WRAP', 'amfori BSCI', 'BSCI', 'SA8000', 'bluesign', 'Sedex', 'SMETA', 'FSC', 'Fair Trade', 'Higg Index']);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function certificatesIn(text) {
  if (!text) return [];
  const found = [];
  for (const name of [...CERTIFICATES].sort((a, b) => b.length - a.length)) {
    for (const match of text.matchAll(new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'g'))) {
      const at = match.index;
      if (!found.some((item) => at < item.at + item.name.length && item.at < at + name.length)) found.push({ name, at });
    }
  }
  return [...new Map(found.sort((a, b) => a.at - b.at).map((item) => [item.name, item.name])).values()];
}

// The order routes (07 order_routes, label = the route's name, value = its text): a placeholder until the owner's
// facts.yaml holds its fact (order-1...) confirmed (lib/facts.mjs) and containing the text word for word.
export function orderRoutesFrom(authoringPackage, facts = null) {
  return (authoringPackage?.order_routes ?? []).filter((item) => item?.label && item?.value).map((item) => {
    const fact = item.fact_id ? facts?.get(item.fact_id) : null;
    const real = Boolean(fact?.confirmed && fact.text.includes(item.value));
    return { heading: item.label, text: item.value, ...(item.fact_id ? { factId: item.fact_id } : {}), ...(real ? {} : { placeholder: true }) };
  });
}

// What a page's trust bar shows (TrustBar.astro; the layout plan counts its height): the page's own figures
// (page-figures.json; none, no band) on pages that have them read, the site-wide band (its items and certificates) on
// the home and about pages and while no figures are read. own: the page's own figures, or null for the site band.
/** @returns {{ own: { value: string, label: string }[] | null, items: { value: string, label: string }[], certifications: string[] }} */
export function trustBarContent(page, pageFigures, trust) {
  const own = page && pageFigures && !SITE_BAND_PAGE_TYPES.includes(page.pageType) ? (NO_BAND_PAGE_TYPES.includes(page.pageType) ? [] : pageFigures[page.route] ?? []) : null;
  return { own, items: own ?? trustBarItems(trust), certifications: own ? [] : trust?.certifications ?? [] };
}

// What the band shows: the size facts first, then the founding year while there is room and no item shows it already
// (site10's trust bar "Since 2011" had "2011 founded" beside it).
export function trustBarItems(trust, max = TRUST_BAR_ITEMS) {
  if (!trust) return [];
  const list = [...(trust.items ?? [])];
  const shown = list.some((item) => String(item.value).includes(trust.founded));
  if (trust.founded && !shown && list.length < max) list.push({ value: trust.founded, label: 'founded', factId: 'founded' });
  return list.slice(0, max);
}
