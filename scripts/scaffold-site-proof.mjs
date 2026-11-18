#!/usr/bin/env node

// Writes a site's stand-in proof (src/data/site-proof.json) when it has none, so the proof modules show from the first
// build (the owner, 2026-09-26: show them now, replace with real, permitted values before launch). Certificates, the
// founding year and the order terms come from the approved facts; clients, people and projects from
// config/demo-proof.json (invented names, no real brand), tied to the site's product pages. The file says standIn: true:
// what comes from the facts (founding year, history, certificates, order terms) follows them on every run, so a new
// founding year or location shows everywhere at once; the rest (clients, people, projects, the team, perhaps tailored to
// the line) is kept. A file without standIn is the owner's and never touched (the owner removes standIn when putting in
// real values). Then `pnpm proof:signoff` lists what is stated for the owner's sign-off.
// Usage: node scripts/scaffold-site-proof.mjs --facts <facts.yaml> --package <authoring_package.json> --pages-plan <pages.json>

import { countMatches } from './lib/figure-reads.mjs';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { factsFromFile } from './lib/facts.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { PRIVACY_FROM_PACKAGE, PROOF_SCHEMA } from './lib/site-proof.mjs';
import { clientsKeptPrivate, copyStrings, withPrivateClients } from './lib/proof-consistency.mjs';
import { DEFAULT_TRADE, siteTrade, tradeConfigPath } from './lib/trade.mjs';

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// The product a page is about: its plan label without the page kind ("Bikini Manufacturer" -> "bikini").
export const productOf = (label) => label.replace(/\b(manufacturers?|manufacturing|wholesale|suppliers?|factory|custom)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();

// A site's own stand-in clients (owner 2026-11-17: the motel, hotel-rm and Staylumen sites showed the same six, plainly
// made up): count of them, each a first part, a second part and a place from the trade's name parts
// (demo.clientNames), shuffled by the site's name (seed): the same site gets the same clients, two sites rarely share one.
export function standInClients(names, count, seed) {
  const shuffled = seededShuffle(seed);
  const [first, second, places] = [shuffled(names.first), shuffled(names.second), shuffled(names.places)];
  return Array.from({ length: Math.min(count, first.length) }, (_, index) => ({ name: `${first[index]} ${second[index % second.length]}`.trim(), country: places[index % places.length] }));
}

// Shuffles lists in an order fixed by the seed (one stream: lists shuffled in the same order come out the same).
export function seededShuffle(seed) {
  let pool = createHash('sha256').update(String(seed)).digest();
  let at = 0;
  const next = () => { if (at + 4 > pool.length) { pool = createHash('sha256').update(pool).digest(); at = 0; } const value = pool.readUInt32BE(at); at += 4; return value; };
  return (items) => { const copy = [...items]; for (let index = copy.length - 1; index > 0; index -= 1) { const other = next() % (index + 1); [copy[index], copy[other]] = [copy[other], copy[index]]; } return copy; };
}

// A site's own stand-in team (owner 2026-11-17, four-site audit: no named person anywhere): one person per role of the
// trade (team.members: the role, years of experience, what they do; never a credential or a certificate number),
// each an invented name from the trade's name parts (team.names; a factory's staff are Chinese, owner 2026-10-30),
// picked by the site's name as its clients are. No photos: the team section shows none of invented people.
export function standInTeam(team, seed, words = {}) {
  const shuffled = seededShuffle(`${seed}:team`);
  const [first, second] = [shuffled(team.names.first), shuffled(team.names.second)];
  return team.members.map((member, index) => ({ name: `${first[index % first.length]} ${second[index % second.length]}`, role: member.role, ...(member.years ? { years: member.years } : {}), bio: fill(member.bio, words), ...(member.blogAuthor ? { blogAuthor: true } : {}), ...(member.reviews?.length ? { reviews: member.reviews } : {}) }));
}

// services: the service pages, [{ service, route }]. seed: the site's name, for its own stand-in clients and team.
// host: the site's domain, for the stand-in privacy contact.
// copy: the ready pages' copy ([{ route, text }]): a stand-in figure it states is its number (four-site audit 2026-11-17, C2).
// practices: the privacy page's table as the package gives it (data_practices), or null (packagePrivacy).
export function demoProof({ demo, facts, products, services = [], line, seed = null, host = null, copy = [], practices = null }) {
  const clients = seed && demo.clientNames ? standInClients(demo.clientNames, demo.clients.length, seed) : demo.clients;
  const text = (id) => facts.get(id)?.approved ? facts.get(id).text : null;
  const founded = Number(text('founded')?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
  const location = text(demo.locationFact ?? 'location-china')?.match(/\bin ([^;.]+?)(?:[.;]|$)/)?.[1]?.trim() ?? 'our home town';
  const certificateText = text('certifications') ?? '';
  const named = new Set();
  for (const [alias, name] of Object.entries(demo.certificateAliases)) if (certificateText.includes(alias)) named.add(name);
  const certifications = demo.certificates.filter((name) => named.has(name) || certificateText.includes(name.replace(/ \(.*\)$/, ''))).map((name) => ({ name }));
  const pick = (index) => products[index % products.length];
  const sector = capital(line);
  // A stand-in figure the approved facts state (its measure, config/demo-proof.json) is the facts' figure: the stand-in
  // never contradicts the copy (site10 showed 150,000 pieces a month beside the copy's 30,000).
  const figure = (item) => {
    if (!item.measure) return null;
    for (const [id, fact] of facts) {
      const match = fact.approved ? countMatches(fact.text, item.measure)[0] : null;
      if (match) return { value: `${match[1]}${item.unit ?? ''}`, factId: id };
    }
    // The copy's figure where no fact states one (site13: the stand-in's 150,000 pieces a month beside the copy's
    // 100,000): never shown for it (only a fact's figure shows), but never a second number either.
    for (const { route, text } of copy) {
      const match = countMatches(text, item.measure)[0];
      if (match) return { value: `${match[1]}${item.unit ?? ''}`, fromCopy: route };
    }
    return null;
  };
  // A figure the facts or the copy give keeps only its label's head: the rest is the demo's own invented detail, which
  // the copy may say otherwise (aloha 2026-11-17: "staff, 18 in design and patterns" beside a 62-person studio of 7
  // pattern makers).
  const factory = demo.factory.map(({ measure, unit, ...item }) => { const found = figure({ measure, unit }); const label = fill(item.label, { product: line }); return { ...item, label: found ? label.split(',')[0].trim() : label, ...found }; });
  return {
    schemaVersion: PROOF_SCHEMA,
    standIn: true,
    note: 'Stand-in proof (scripts/scaffold-site-proof.mjs): replace with real, permitted values before launch; listed in docs/research/release-signoff.json. The order terms are the approved facts.',
    headings: demo.headings,
    // The founding line in the trade's words (demo.foundedLabel: a service business was not founded as a factory).
    factory: [...(founded ? [{ value: String(founded), label: fill(demo.foundedLabel ?? 'factory founded in {location}', { location: location.split(',')[0] }) }] : []), ...factory],
    certifications,
    // A manufacturer's clients are brands of its own sector; a service's are other businesses (demo.clientNote).
    clients: clients.map((client) => ({ name: client.name, note: fill(demo.clientNote ?? '{sector}, {country}', { sector, country: client.country }) })),
    ...(seed && demo.clientNames ? { clientsFor: seed } : {}),
    testimonials: products.length ? demo.testimonials.map((item, index) => {
      const person = demo.people[index % demo.people.length];
      const client = clients[index % clients.length];
      // The person is of the client's country, as the client wall says (site13 blind audit H2: Seafern Label was UK on
      // the wall and France in its testimonial).
      return { headline: item.headline, quote: fill(item.quote, { product: pick(index).product }), author: person.author, role: person.role, company: client.name, country: client.country ?? person.country, pages: [pick(index).route] };
    }) : [],
    // One case per product page, about its product, and one per service page, about its service: a page shows its own
    // (site10's men's swimwear page showed the women's, one-piece and bikini cases of the three it had for the whole
    // site). Its client is a role, a city and a country, never an invented brand name (owner 2026-10-30).
    caseStudies: [
      ...products.map(({ product, route }, index) => ({ item: demo.caseStudies[index % demo.caseStudies.length], words: { product, Product: capital(product) }, route })),
      ...services.map(({ service, route }, index) => ({ item: demo.serviceCaseStudies[index % demo.serviceCaseStudies.length], words: { service, Service: capital(service) }, route })),
    ].map(({ item, words, route }, index) => {
      const customer = demo.customers[index % demo.customers.length];
      return { client: capital(fill(customer.role, { line })), market: `${customer.city}, ${customer.country}`, title: fill(item.title, words), summary: fill(item.summary, words), results: item.results, href: route, pages: [route] };
    }),
    history: founded ? demo.history.filter((item) => founded + item.after <= new Date().getFullYear()).map((item) => ({ year: founded + item.after, event: fill(item.event, { location, product: line }) })) : [],
    terms: { columns: demo.termsColumns ?? ['Order step', 'Terms'], rows: demo.terms.filter((row) => text(row.fact)).map((row) => [row.label, text(row.fact)]) },
    // Invented names until the owner names the real people (listed for sign-off; the preflight holds).
    ...(seed && demo.team ? { team: standInTeam(demo.team, seed, { line }) } : {}),
    // How long enquiries are kept and whom to ask about them, for the privacy page's "what this site collects": the
    // package's (packagePrivacy) when it gives the table, else the trade's stand-ins (an older package: its sites keep
    // the "24 months" and privacy@ they were built with, listed for sign-off as before).
    ...(practices ? { privacy: packagePrivacy(practices) } : demo.privacy ? { privacy: { retention: demo.privacy.retention, contact: host ? `privacy@${host}` : null } } : {}),
  };
}

// The privacy facts of the package's table (Site Factory integ deb67119, 2026-11-17: data_practices carries the owner's
// project.yaml privacy, and Site Factory gives no stand-in): its retention and contact as given, none where it is
// empty (no period is stated then, and the owner pack holds the launch until the owner gives one), and whether the owner
// has confirmed them (placeholder false). source: they are Site Factory's, made again on every run.
export function packagePrivacy(practices) {
  const retention = String(practices.retention ?? '').trim();
  const contact = String(practices.contact ?? '').trim();
  return { source: PRIVACY_FROM_PACKAGE, ...(retention ? { retention } : {}), ...(contact ? { contact } : {}), placeholder: practices.placeholder !== false };
}

// A stand-in's groups that come from the facts, from a freshly made stand-in; everything else stays as it is, except
// testimonials and case studies tied to product pages the site no longer has (routes: its product pages now), which
// are made again for the current ones (site10's cases linked to an earlier plan's /bikinis-manufacturer/), and case
// studies that leave a product page without its own.
const FOUNDED = /^(factory )?founded in /;
// A stand-in testimonial takes its client's country from the client wall (site13 blind audit H2): one made before
// with the person's own country is corrected on the next run. The wall's note ends with the country (the trades'
// clientNote: "{sector}, {country}", "{country}").
const clientCountry = (client) => client.country ?? (client.note ? String(client.note).split(',').at(-1).trim() || null : null);
const ofClientCountry = (testimonials, clients) => {
  const countries = new Map((clients ?? []).map((client) => [client.name, clientCountry(client)]));
  return testimonials?.map((item) => (item.company && countries.get(item.company) && item.country !== countries.get(item.company) ? { ...item, country: countries.get(item.company) } : item));
};
// A stand-in team made before the reviewers were (four-site audit 2026-11-17, C10) takes each role's page types from
// the made team; a person who has their own keeps them.
// A stand-in team (the proof's standIn) takes its roles' page types from the trade's config every run: they are the
// template's, not the owner's (aloha 2026-11-18, L-13: the founder now reviews the service pages).
const withReviews = (team, made = [], standIn = false) => team.map((person) => {
  const role = made.find((own) => own.role === person.role)?.reviews;
  const reviews = standIn && role ? role : person.reviews ?? role;
  return reviews?.length ? { ...person, reviews } : person;
});
const fromFacts = (item) => FOUNDED.test(item.label) || Boolean(item.factId) || Boolean(item.fromCopy);
export function withFacts(existing, made, routes = null) {
  const stated = made.factory.filter(fromFacts);
  const current = (items = []) => !routes || items.every((item) => [item.href, ...(item.pages ?? [])].filter(Boolean).every((route) => routes.has(route)));
  // Clients made for another site or before they were made per site (no clientsFor) are the site's own now, and the
  // testimonials naming the earlier ones with them; clients made for this site stay as they are (edits kept).
  const ownClients = !made.clientsFor || existing.clientsFor === made.clientsFor;
  const names = new Set((ownClients ? existing.clients ?? [] : made.clients).map((client) => client.name));
  // The team is the site's own as its clients are (a stand-in from before the team was made gets one); a privacy fact
  // the stand-in has no value for yet takes the made one.
  const known = (values = {}) => Object.fromEntries(Object.entries(values).filter(([, value]) => value != null));
  return { ...existing, certifications: made.certifications, history: made.history, terms: made.terms,
    ...(ownClients ? {} : { clients: made.clients, clientsFor: made.clientsFor }),
    ...(made.team && !(ownClients && existing.team?.length) ? { team: made.team } : existing.team?.length ? { team: withReviews(existing.team, made.team, existing.standIn === true) } : {}),
    // The package's privacy facts are Site Factory's on every run (a stand-in "24 months" of an earlier import gives way).
    ...(made.privacy ? { privacy: made.privacy.source === PRIVACY_FROM_PACKAGE ? made.privacy : { ...made.privacy, ...known(existing.privacy ?? {}) } } : {}),
    factory: [...stated, ...(existing.factory ?? []).filter((item) => !fromFacts(item) && !stated.some((fact) => fact.label === item.label))],
    testimonials: ofClientCountry(current(existing.testimonials) && (ownClients || (existing.testimonials ?? []).every((item) => !item.company || names.has(item.company))) ? existing.testimonials : made.testimonials, ownClients ? existing.clients ?? [] : made.clients),
    // Kept while every page has its own and every client is one of the stand-in's (a case naming a brand is made again).
    caseStudies: current(existing.caseStudies) && (!routes || [...routes].every((route) => existing.caseStudies?.some((item) => item.pages?.includes(route)))) && (existing.caseStudies ?? []).every((item) => made.caseStudies.some((own) => own.client === item.client)) ? existing.caseStudies : made.caseStudies };
}

// The site's name (its identity's project.yaml site_name, through site.json identity), else its folder's name.
async function siteName(root) {
  const site = await readJson(resolve(root, 'site.json'), null);
  const identity = site?.identity ? resolve(root, site.identity, 'project.yaml') : null;
  const text = identity && existsSync(identity) ? await readText(identity) : '';
  return text.match(/["']?site_name["']?\s*:\s*["']?([^"',\n]+)/)?.[1]?.trim() || basename(resolve(root));
}

export async function scaffoldSiteProof({ root = process.cwd(), factsPaths, packagePath, pagesPlanPath }) {
  const target = resolve(root, 'src/data/site-proof.json');
  const existing = existsSync(target) ? await readJson(target) : null;
  if (existing && existing.standIn !== true) return { written: false, path: target };
  let facts = new Map();
  for (const path of factsPaths) facts = new Map([...facts, ...factsFromFile(path, await readText(resolve(path)))]);
  const packaged = (await readJson(resolve(packagePath))).pages ?? [];
  const ready = packaged.filter((page) => page.release_status === 'ready_for_template');
  // The privacy page's table (Site Factory integ deb67119, 2026-11-17), whatever the page's status: its privacy facts.
  const practices = packaged.find((page) => page.data_practices)?.data_practices ?? null;
  const authored = new Set(ready.map((page) => page.url));
  const copy = ready.map((page) => ({ route: page.url, text: copyStrings({ title: page.title, h1: page.h1, lead: page.hero_lead, sections: page.sections }).join('\n') }));
  const plan = await readJson(resolve(pagesPlanPath));
  const products = plan.pages.filter((page) => page.page_type === 'product_manufacturer' && authored.has(page.url)).map((page) => ({ product: productOf(page.label), route: page.url }));
  const services = plan.pages.filter((page) => page.page_type === 'solution' && authored.has(page.url)).map((page) => ({ service: productOf(page.label), route: page.url }));
  const home = plan.pages.find((page) => page.page_type === 'home');
  const line = productOf(home?.primary_query ?? '') || 'garments';
  // The trade's stand-ins (config/demo-proof.json, or config/demo-proof.<trade>.json: lib/trade.mjs).
  const { trade } = await siteTrade(root);
  const origin = (await readJson(resolve(root, 'src/data/site-identity.json'), null))?.origin;
  const made = demoProof({ demo: await readJson(tradeConfigPath('demo-proof', trade)), facts, products, services, line, seed: await siteName(root), host: origin ? new URL(origin).hostname.replace(/^www\./, '') : null, copy, practices });
  const proof = trade === DEFAULT_TRADE ? made : { ...made, trade };
  // A stand-in made for another trade is made again whole (site11's motel site kept the clothing factory's figures).
  const kept = existing && (existing.trade ?? DEFAULT_TRADE) === trade ? existing : null;
  await mkdir(dirname(target), { recursive: true });
  const written = kept ? withFacts(kept, proof, new Set([...products, ...services].map((item) => item.route))) : proof;
  // The copy keeps the clients' names private (site13 blind audit H-1): the stand-in names none either.
  await writeJson(target, clientsKeptPrivate(copy.map((page) => page.text)) ? withPrivateClients(written) : written);
  return { written: true, path: target };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ facts: { type: 'string', multiple: true }, package: { type: 'string' }, 'pages-plan': { type: 'string' } });
  if (!values.facts?.length || !values.package || !values['pages-plan']) return usage('Usage: node scripts/scaffold-site-proof.mjs --facts <facts.yaml> --package <authoring_package.json> --pages-plan <pages.json>');
  const result = await scaffoldSiteProof({ factsPaths: values.facts, packagePath: values.package, pagesPlanPath: values['pages-plan'] });
  console.log(result.written ? `wrote ${result.path} (stand-in)` : `kept ${result.path} (the owner's)`);
});
