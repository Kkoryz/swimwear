// The stand-in proof agrees with itself and with Site Factory's copy (four-site audit 2026-11-17, C2; site13 blind
// audit H2: a client was UK on the client wall and France in its testimonial; the stand-in's 150,000 pieces a month
// beside the copy's 100,000). Each finding is proof_inconsistent, an error: the stand-in is the template's
// (scripts/scaffold-site-proof.mjs makes it), so the template clears it, never Site Factory's copy. An owner's own
// proof (no standIn) is the owner's and not checked here.

import { countMatches } from './figure-reads.mjs';
import { resolve } from 'node:path';
import { siteTrade, tradeConfigPath } from './trade.mjs';
import { readJson } from './json-io.mjs';
import { withClientWall } from './site-proof.mjs';

// Copy that keeps the clients' names private ("with client names kept private", "We keep our private-label clients
// anonymous": site13's case page, blind audit 2026-11-17 H-1, beside a stand-in wall of six named brands).
export const PRIVATE_CLIENTS = /\bclients?['’]?\s+names?\s+(?:are\s+|stay\s+|remain\s+)?(?:kept\s+)?(?:private|confidential|anonymous)\b|\bkeep\s+(?:our\s+|all\s+|every\s+)?(?:[\w-]+\s+){0,2}clients?\s+(?:anonymous|confidential|private)\b|\bclients?\s+(?:remain|stay|are\s+kept)\s+(?:anonymous|confidential|private)\b/i;
export const clientsKeptPrivate = (texts = []) => texts.some((text) => PRIVATE_CLIENTS.test(String(text ?? '')));
// A stand-in that names no client where the copy keeps them private: no client wall, testimonials without a company.
export function withPrivateClients(proof) {
  return { ...proof, clients: [], clientsPrivate: true, testimonials: (proof.testimonials ?? []).map(({ company, ...item }) => item) };
}

const error = (route, detail) => ({ route, issue: 'proof_inconsistent', detail, level: 'error' });
const PROOF_FILE = 'src/data/site-proof.json';
const number = (text) => String(text ?? '').match(/\d[\d,.]*/)?.[0]?.replace(/,/g, '') ?? null;
// The client wall's country: the note's last part ("Swimwear, UK"), as scaffold-site-proof writes it.
const countryOf = (client) => client?.country ?? (client?.note ? String(client.note).split(',').at(-1).trim() || null : null);

// The strings of a page's copy (its SEO fields, hero and blocks; no ids or links).
const SKIP = new Set(['id', 'type', 'href', 'src', 'srcset', 'variant', 'sourceSectionIds', 'photoCandidates', 'route', 'canonical', 'anchor']);
export const copyStrings = (value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(copyStrings) : value && typeof value === 'object' ? Object.entries(value).filter(([key]) => !SKIP.has(key)).flatMap(([, item]) => copyStrings(item)) : []);

// The trade's stand-in figure a proof figure was made from (its label, the {product} filled), with its measure.
export function figureMeasure(item, demo) {
  for (const entry of demo?.factory ?? []) {
    if (!entry.measure) continue;
    // The demo's label, or its head (a figure the facts or the copy give keeps only that: scaffold-site-proof.mjs).
    const pattern = (text) => new RegExp(`^${text.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`, 'i');
    if ([entry.label, entry.label.split(',')[0].trim()].some((text) => pattern(text).test(String(item.label ?? '')))) return new RegExp(entry.measure, 'gi');
  }
  return null;
}

// proof: src/data/site-proof.json; demo: the trade's config/demo-proof*.json; pages: the site's pages (their copy);
// facts: the approved facts (Map of { text, approved }), when known.
export function proofProblems({ proof, demo = null, pages = [], facts = new Map() }) {
  if (proof?.standIn !== true) return [];
  const found = [];
  // A testimonial's client is of the country the client wall gives it.
  const clients = new Map((proof.clients ?? []).map((client) => [client.name, countryOf(client)]));
  for (const item of proof.testimonials ?? []) {
    const wall = clients.get(item.company);
    if (item.company && wall && item.country && item.country !== wall) found.push(error(PROOF_FILE, `the testimonial of ${item.company} says ${item.country}, the client wall ${wall}`));
  }
  // A named client where the copy keeps the clients' names private.
  const texts = pages.map((page) => copyStrings({ seo: page.seo, hero: page.hero, blocks: page.blocks }).join(' '));
  const named = [...(proof.clients ?? []).map((client) => client.name), ...(proof.testimonials ?? []).map((item) => item.company)].filter(Boolean);
  if (named.length && clientsKeptPrivate(texts)) found.push(error(PROOF_FILE, `the copy keeps the clients' names private and the stand-in names ${[...new Set(named)].slice(0, 3).join(', ')}`));
  // A stand-in figure the copy or the facts state otherwise (a figure taken from a fact is that fact's).
  const sources = [...pages.map((page) => ({ route: page.route, text: copyStrings({ seo: page.seo, hero: page.hero, blocks: page.blocks }).join('\n') })), ...[...facts].filter(([, fact]) => fact.approved).map(([id, fact]) => ({ route: `fact ${id}`, text: fact.text }))];
  for (const item of proof.factory ?? []) {
    if (item.factId) continue;
    const measure = figureMeasure(item, demo);
    const own = number(item.value);
    if (!measure || !own) continue;
    for (const { route, text } of sources) {
      // Copy that states the figure's own number too states a part of it beside the whole (a 62-person studio of 290).
      const counts = countMatches(text, measure).map((match) => number(match[1])).filter(Boolean);
      const stated = counts.includes(own) ? null : counts.find((value) => value !== own);
      if (stated) { found.push(error(PROOF_FILE, `the stand-in figure "${item.value} ${item.label}" against ${Number(stated).toLocaleString('en-US')} on ${route}`)); break; }
    }
  }
  return found;
}

// The site's stand-in proof and its trade's config, for the checks that read them (null without a stand-in); the client
// wall's names only where site.json switches it on (lib/site-proof.mjs clientWallOn): off, no page shows them.
export async function readProof(root) {
  const proof = withClientWall(await readJson(resolve(root, PROOF_FILE), null), await readJson(resolve(root, 'site.json'), null));
  if (proof?.standIn !== true) return { proof, demo: null };
  return { proof, demo: await readJson(tradeConfigPath('demo-proof', proof.trade ?? (await siteTrade(root)).trade), null) };
}
