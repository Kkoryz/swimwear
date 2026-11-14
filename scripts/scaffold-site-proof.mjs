#!/usr/bin/env node

// Writes a site's stand-in proof (src/data/site-proof.json) when it has none, so the proof modules show from the first
// build (the owner, 2026-09-26: show them now, replace with real, permitted values before launch). Certificates, the
// founding year and the order terms come from the approved facts; clients, people and projects from
// config/demo-proof.json (invented names, no real brand), tied to the site's product pages. The file says standIn: true:
// what comes from the facts (founding year, history, certificates, order terms) follows them on every run, so a new
// founding year or location shows everywhere at once; the rest (clients, people, projects, perhaps tailored to the
// line) is kept. A file without standIn is the owner's and never touched (the owner removes standIn when putting in
// real values). Then `pnpm proof:signoff` lists what is stated for the owner's sign-off.
// Usage: node scripts/scaffold-site-proof.mjs --facts <facts.yaml> --package <authoring_package.json> --pages-plan <pages.json>

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { factsFromFile } from './lib/facts.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { PROOF_SCHEMA } from './lib/site-proof.mjs';
import { DEFAULT_TRADE, siteTrade, tradeConfigPath } from './lib/trade.mjs';

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// The product a page is about: its plan label without the page kind ("Bikini Manufacturer" -> "bikini").
export const productOf = (label) => label.replace(/\b(manufacturers?|manufacturing|wholesale|suppliers?|factory|custom)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();

// services: the service pages, [{ service, route }].
export function demoProof({ demo, facts, products, services = [], line }) {
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
      const match = fact.approved ? fact.text.match(new RegExp(item.measure, 'i')) : null;
      if (match) return { value: `${match[1]}${item.unit ?? ''}`, factId: id };
    }
    return null;
  };
  const factory = demo.factory.map(({ measure, unit, ...item }) => ({ ...item, label: fill(item.label, { product: line }), ...figure({ measure, unit }) }));
  return {
    schemaVersion: PROOF_SCHEMA,
    standIn: true,
    note: 'Stand-in proof (scripts/scaffold-site-proof.mjs): replace with real, permitted values before launch; listed in docs/research/release-signoff.json. The order terms are the approved facts.',
    headings: demo.headings,
    // The founding line in the trade's words (demo.foundedLabel: a service business was not founded as a factory).
    factory: [...(founded ? [{ value: String(founded), label: fill(demo.foundedLabel ?? 'factory founded in {location}', { location: location.split(',')[0] }) }] : []), ...factory],
    certifications,
    // A manufacturer's clients are brands of its own sector; a service's are other businesses (demo.clientNote).
    clients: demo.clients.map((client) => ({ name: client.name, note: fill(demo.clientNote ?? '{sector}, {country}', { sector, country: client.country }) })),
    testimonials: products.length ? demo.testimonials.map((item, index) => {
      const person = demo.people[index % demo.people.length];
      const client = demo.clients[index % demo.clients.length];
      return { headline: item.headline, quote: fill(item.quote, { product: pick(index).product }), author: person.author, role: person.role, company: client.name, country: person.country, pages: [pick(index).route] };
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
  };
}

// A stand-in's groups that come from the facts, from a freshly made stand-in; everything else stays as it is, except
// testimonials and case studies tied to product pages the site no longer has (routes: its product pages now), which
// are made again for the current ones (site10's cases linked to an earlier plan's /bikinis-manufacturer/), and case
// studies that leave a product page without its own.
const FOUNDED = /^(factory )?founded in /;
const fromFacts = (item) => FOUNDED.test(item.label) || Boolean(item.factId);
export function withFacts(existing, made, routes = null) {
  const stated = made.factory.filter(fromFacts);
  const current = (items = []) => !routes || items.every((item) => [item.href, ...(item.pages ?? [])].filter(Boolean).every((route) => routes.has(route)));
  return { ...existing, certifications: made.certifications, history: made.history, terms: made.terms,
    factory: [...stated, ...(existing.factory ?? []).filter((item) => !fromFacts(item) && !stated.some((fact) => fact.label === item.label))],
    testimonials: current(existing.testimonials) ? existing.testimonials : made.testimonials,
    // Kept while every page has its own and every client is one of the stand-in's (a case naming a brand is made again).
    caseStudies: current(existing.caseStudies) && (!routes || [...routes].every((route) => existing.caseStudies?.some((item) => item.pages?.includes(route)))) && (existing.caseStudies ?? []).every((item) => made.caseStudies.some((own) => own.client === item.client)) ? existing.caseStudies : made.caseStudies };
}

export async function scaffoldSiteProof({ root = process.cwd(), factsPaths, packagePath, pagesPlanPath }) {
  const target = resolve(root, 'src/data/site-proof.json');
  const existing = existsSync(target) ? await readJson(target) : null;
  if (existing && existing.standIn !== true) return { written: false, path: target };
  let facts = new Map();
  for (const path of factsPaths) facts = new Map([...facts, ...factsFromFile(path, await readText(resolve(path)))]);
  const authored = new Set(((await readJson(resolve(packagePath))).pages ?? []).filter((page) => page.release_status === 'ready_for_template').map((page) => page.url));
  const plan = await readJson(resolve(pagesPlanPath));
  const products = plan.pages.filter((page) => page.page_type === 'product_manufacturer' && authored.has(page.url)).map((page) => ({ product: productOf(page.label), route: page.url }));
  const services = plan.pages.filter((page) => page.page_type === 'solution' && authored.has(page.url)).map((page) => ({ service: productOf(page.label), route: page.url }));
  const home = plan.pages.find((page) => page.page_type === 'home');
  const line = productOf(home?.primary_query ?? '') || 'garments';
  // The trade's stand-ins (config/demo-proof.json, or config/demo-proof.<trade>.json: lib/trade.mjs).
  const { trade } = await siteTrade(root);
  const made = demoProof({ demo: await readJson(tradeConfigPath('demo-proof', trade)), facts, products, services, line });
  const proof = trade === DEFAULT_TRADE ? made : { ...made, trade };
  // A stand-in made for another trade is made again whole (site11's motel site kept the clothing factory's figures).
  const kept = existing && (existing.trade ?? DEFAULT_TRADE) === trade ? existing : null;
  await mkdir(dirname(target), { recursive: true });
  await writeJson(target, kept ? withFacts(kept, proof, new Set([...products, ...services].map((item) => item.route))) : proof);
  return { written: true, path: target };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ facts: { type: 'string', multiple: true }, package: { type: 'string' }, 'pages-plan': { type: 'string' } });
  if (!values.facts?.length || !values.package || !values['pages-plan']) return usage('Usage: node scripts/scaffold-site-proof.mjs --facts <facts.yaml> --package <authoring_package.json> --pages-plan <pages.json>');
  const result = await scaffoldSiteProof({ factsPaths: values.facts, packagePath: values.package, pagesPlanPath: values['pages-plan'] });
  console.log(result.written ? `wrote ${result.path} (stand-in)` : `kept ${result.path} (the owner's)`);
});
