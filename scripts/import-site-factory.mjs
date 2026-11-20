#!/usr/bin/env node

// Turns a Site Factory stage-07 authoring package into src/data/authoring-pages.json.
// A section that names its blueprint slot (section.slot) becomes that slot's block; other sections are mapped by
// content shape only. Copy is copied verbatim and never rewritten. Site-plan slots (child-page cards) are filled
// from pages.json labels and links, never with new copy.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertAuthoringPages } from './lib/authoring-contract.mjs';
import { plainText } from './lib/blog.mjs';
import { cliArgs, listOption, runMain, usage } from './lib/cli.mjs';
import { factsFromFile } from './lib/facts.mjs';
import { DEFAULT_TRADE, siteTrade, tradeConfigPath } from './lib/trade.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { assertQuickViewPlaced, assertSectionsUsedOnce, orderBySlots, placeCases, placeOwnerSlots, placePlanSlots, placeRelated, placeRequiredBlocks, placeSiteSlots, placeSources, placeStyleGrid } from './lib/page-assembly.mjs';
import { BLUEPRINTS, blueprintsFrom, legalText } from './lib/page-blueprints.mjs';
import { siteNavFromPlan } from './lib/site-plan.mjs';
import { withClientWall } from './lib/site-proof.mjs';
import { competitorStyles, isKindPage, overLength, planKindBlocks, verifyKindFacts, withSiteModules } from './lib/sf-kinds.mjs';
import { LONG_SECTION_WORDS, MIN_PROOF_NUMBERS, pageBlockIds, paragraphsOf, planBlocks, varyLongRuns } from './lib/sf-sections.mjs';
import { referenceRuns } from './lib/visual-checks.mjs';
import { pageHash } from './lib/page-dates.mjs';
import { citedFactIds, pageFactsOf, placeStructured, verifySectionFacts, verifyStructured } from './lib/sf-structured.mjs';
import { recordPageDates } from './lib/site-pages.mjs';
import { aliasRoutes, handoffProblems, routeAliases } from './lib/sf-handoff.mjs';
import { homeCategoryGroups, placeHomeCategories } from './lib/home-categories.mjs';
import { trustBarRefused, trustBarUnconfirmed, trustFromPackage, trustValueTrimmed } from './lib/site-trust.mjs';

export { factsFromFile, parseFacts } from './lib/facts.mjs';

export const SUPPORTED_PACKAGE_SCHEMA = 'sf/authoring/v1';
// The release statuses of the pages the site builds (see importSiteFactory).
export const BUILT_STATUSES = Object.freeze(['ready_for_template', 'hold']);

// JSON-LD is plain text: a Markdown link of the copy in it (an FAQ answer) keeps its words.
const plainJsonLd = (value) => (typeof value === 'string' ? plainText(value) : Array.isArray(value) ? value.map(plainJsonLd) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plainJsonLd(inner)])) : value);

// relatedVariant: how the related pages show (tiles where the reference links its pages with photo tiles).
// The contact details shown until the owner gives the real ones (owner 2026-11-12: "真实联系方式先占位"): an empty
// field takes a stand-in that reads as one (an example.com address, a 555-01xx number), and the details stay marked
// placeholder, so the contact page shows its ways to reach the company and the launch preflight holds them.
// Owner 2026-11-17: the stand-in email is info@ the site's own domain (origin: src/data/site-identity.json), not an
// example.com address, and an address nobody gave is left out (not "to be confirmed" on every page); both stay listed
// in standIns, so the launch preflight still holds them.
// A stand-in phone number in the format of the site's country (owner 2026-11-17: "直接留个假的号码就行", the sites are
// not launched): made from the site's domain, the same on every run; China in Guangzhou's 020, Canada in Toronto's
// 416, anywhere else a US number; never 555. Invented, it may still be someone's: it stays in standIns, and the
// preflight holds it until the owner gives the real one.
export function standInPhone(host, address = '') {
  const digits = createHash('sha256').update(String(host)).digest().toString('hex').replace(/[a-f]/g, '').padEnd(12, '7');
  const place = String(address ?? '');
  if (/china|guangzhou|guangdong|\bcn\b/i.test(place)) return `+86 20 ${3 + (Number(digits[0]) % 6)}${digits.slice(1, 4)} ${digits.slice(4, 8)}`;
  const exchange = `${2 + (Number(digits[0]) % 8)}${digits.slice(1, 3)}`.replace(/^555$/, '556');
  const area = /canada|ontario|toronto|\bca\b/i.test(place) ? '416' : ['312', '617', '214', '404', '602'][Number(digits[3]) % 5];
  return `+1 ${area} ${exchange} ${digits.slice(4, 8)}`;
}
// A stand-in WhatsApp number (owner 2026-11-17: "whatsapp号码随便编"; the site13 blind audit found WhatsApp in the copy
// and no number anywhere): a mobile number of the site's country, made from the site's domain as the phone is (salted,
// so its digits are not the phone's), the same on every run: China a 13x-19x mobile, Canada a Toronto 647, anywhere else
// a US number; never 555. Invented, it may still be someone's: it stays in standIns until the owner gives the real one.
const CHINA_MOBILE = Object.freeze(['135', '136', '137', '139', '150', '151', '152', '157', '158', '159', '182', '183', '187', '188', '198']);
export function standInWhatsapp(host, address = '') {
  const digits = createHash('sha256').update(`${host}\u0000whatsapp`).digest().toString('hex').replace(/[a-f]/g, '').padEnd(12, '6');
  const place = String(address ?? '');
  if (/china|guangzhou|guangdong|\bcn\b/i.test(place)) return `+86 ${CHINA_MOBILE[Number(digits.slice(0, 2)) % CHINA_MOBILE.length]} ${digits.slice(2, 6)} ${digits.slice(6, 10)}`;
  const exchange = `${2 + (Number(digits[0]) % 8)}${digits.slice(1, 3)}`.replace(/^555$/, '556');
  const area = /canada|ontario|toronto|\bca\b/i.test(place) ? '647' : ['312', '617', '214', '404', '602'][Number(digits[3]) % 5];
  return `+1 ${area} ${exchange} ${digits.slice(4, 8)}`;
}
// No stand-in opening hours (Site Factory integ deb67119, 2026-11-17: the hours are a site fact of project.yaml contact,
// and the pages' any-hour claims are checked against them; a made-up "Monday to Friday" contradicted them): hours
// nobody gave are not shown.
export const CONTACT_STAND_INS = Object.freeze({ email: 'hello@example.com', phone: '+1 555 0100', address: '' });
// whatsapp: the copy names WhatsApp as a way to reach the company; without a number of its own, the contact details
// take a stand-in one (standInWhatsapp), in standIns like the rest.
export function withContactStandIns(contact, { origin = null, whatsapp = false } = {}) {
  const given = contact ?? {};
  const host = origin ? new URL(origin).hostname.replace(/^www\./, '') : null;
  const empty = [...Object.keys(CONTACT_STAND_INS), ...(whatsapp && host ? ['whatsapp'] : [])].filter((key) => !String(given[key] ?? '').trim());
  if (!empty.length) return contact;
  const standIn = (key) => (key === 'email' && host ? `info@${host}` : key === 'phone' && host ? standInPhone(host, given.address) : key === 'whatsapp' ? standInWhatsapp(host, given.address) : CONTACT_STAND_INS[key]);
  return { ...given, ...Object.fromEntries(empty.map((key) => [key, standIn(key)])), placeholder: true, standIns: empty };
}

// wording: the words 08 adds to a page in the site's trade (config/wording*.json).
export function importSiteFactory({ authoringPackage: given, pagesPlan, only = null, structuredOverlay = null, facts = null, blueprints = BLUEPRINTS, proof = null, moduleRuns = {}, relatedVariant = null, wording = null, origin = null }) {
  if (given?.schema_version !== SUPPORTED_PACKAGE_SCHEMA) throw new Error(`unsupported authoring package schema: ${given?.schema_version}`);
  // The site-wide flows in the sections that use them (lib/sf-kinds.mjs withSiteModules).
  const authoringPackage = withSiteModules(given);
  const byUrl = new Map(pagesPlan.pages.map((item) => [item.url, item]));
  // One page per id and per route, and a page that replaces another (a curated page: replaces <page_id>) never beside
  // it: two versions of a page are never published together.
  for (const key of ['page_id', 'url']) {
    const seen = new Set();
    for (const item of authoringPackage.pages) {
      if (seen.has(item[key])) throw new Error(`the authoring package has two pages with ${key} ${item[key]}`);
      seen.add(item[key]);
    }
  }
  const packagePages = new Map(authoringPackage.pages.map((item) => [item.page_id, item]));
  for (const item of authoringPackage.pages) {
    if (item.replaces && item.replaces !== item.page_id && packagePages.has(item.replaces)) throw new Error(`${item.page_id} replaces ${item.replaces}, which is still in the authoring package`);
  }
  // A page ready for the template is built; so is one Site Factory holds (release_status hold): it renders for the owner's
  // review, noindex and out of the sitemap, and the launch preflight holds the release on its reasons. Any other status
  // is not built.
  const builds = (item) => BUILT_STATUSES.includes(item.release_status);
  for (const id of only || []) {
    if (!packagePages.has(id)) throw new Error(`requested page is missing from the authoring package: ${id}`);
    if (!builds(packagePages.get(id))) throw new Error(`requested page is not to be built (release_status ${packagePages.get(id).release_status}): ${id}`);
  }

  // Pages the site will build: the imported ones and the placeholder page types.
  const built = new Set([
    ...authoringPackage.pages.filter((item) => builds(item) && (!only || only.includes(item.page_id))).map((item) => item.url),
    // Every other page of the plan is built as a marked placeholder (scaffold-placeholder-pages.mjs); a page of the package
    // with another release status, or one the handoff withholds (lib/sf-handoff.mjs), is never built.
    ...pagesPlan.pages.filter((item) => item.page_type !== 'blog_hub' && !item.nav_only && !item.withheld && !(packagePages.get(item.page_id) && !builds(packagePages.get(item.page_id)))).map((item) => item.url),
  ]);
  const pages = [];
  let blog = null;
  // The site-wide trust bar: the package's size facts (07 trust_bar) and the founding year and location from the facts.
  const trust = trustFromPackage(authoringPackage, facts, { leaveOut: wording?.trustBarLeaveOut?.patterns ?? [] });
  // Trust bar items that are sentences, not figures: kept off the bar, reported back to Site Factory.
  const refusedTrust = trustBarRefused(authoringPackage);
  // Trust bar figures no confirmed fact states (borrowed, or with no fact at all): off the bar, back to the owner.
  const unconfirmedTrust = trustBarUnconfirmed(authoringPackage, facts);
  // Trust bar values whose word after the number is no unit ("65 that"): the number alone shows, reported to Site Factory.
  const trimmedTrust = trustValueTrimmed(authoringPackage);
  const report = { schemaVersion: 'seo-site-factory-import-v1', project: authoringPackage.project, packageSchema: authoringPackage.schema_version, rules: { longSectionWords: LONG_SECTION_WORDS, minProofNumbers: MIN_PROOF_NUMBERS }, pages: [], skipped: [], held: [], jsonLdMarkdown: [], overLength: [], withheld: pagesPlan.pages.filter((item) => item.withheld).map((item) => ({ pageId: item.page_id, route: item.url, reason: item.withheld })), ...(refusedTrust.length ? { trustBarRefused: refusedTrust } : {}), ...(unconfirmedTrust.length ? { trustBarUnconfirmed: unconfirmedTrust } : {}), ...(trimmedTrust.length ? { trustValueTrimmed: trimmedTrust } : {}) };
  for (const source of authoringPackage.pages) {
    if (source.release_status === 'hold') report.held.push({ pageId: source.page_id, route: source.url, reason: 'release_status:hold', holdReasons: source.hold_reasons || [] });
    if (!builds(source)) { report.skipped.push({ pageId: source.page_id, reason: `release_status:${source.release_status}`, holdReasons: source.hold_reasons || [] }); continue; }
    if (only && !only.includes(source.page_id)) { report.skipped.push({ pageId: source.page_id, reason: 'not_selected' }); continue; }
    const planned = byUrl.get(source.url);
    if (!planned) throw new Error(`${source.page_id}: url ${source.url} is not in the site plan`);
    // The blog hub's copy (Site Factory 07 writes it as an ordinary page): its title, description, heading and intro head
    // the template's blog hub (src/data/blog.json, lib/blog.mjs), whose post list the template builds.
    if (planned.page_type === 'blog_hub') {
      const lead = source.hero_lead || null;
      // A hub written by kind shows its sections whole, as any page does; the template puts the post list after its
      // intro, before its closing call (lib/blog.mjs hubPages).
      if (isKindPage(source)) {
        const { blocks, mapping } = planKindBlocks(source, { styles: competitorStyles(blueprints.blog_hub) });
        assertSectionsUsedOnce(source, mapping);
        blog = { title: source.title, description: source.meta_description, heading: source.h1, intro: lead, blocks: pageBlockIds(blocks), source: { package: authoringPackage.schema_version, pageId: source.page_id } };
        report.pages.push({ pageId: source.page_id, route: source.url, pageType: 'blog_hub', mapping, blocks: blog.blocks.map((block) => ({ id: block.id, type: block.type })) });
        continue;
      }
      const intro = source.sections.find((item) => item.slot === 'intro') ?? source.sections[0];
      // An empty hero lead is no lead: the intro's first paragraph heads the hub instead.
      const paragraphs = paragraphsOf(intro?.body ?? '');
      blog = { title: source.title, description: source.meta_description, heading: source.h1, intro: lead ?? paragraphs[0] ?? null, source: { package: authoringPackage.schema_version, pageId: source.page_id } };
      // The hub shows its heading and one line: every section it does not show whole is on the report.
      const unshown = source.sections.filter((item) => lead || item !== intro || paragraphs.length > 1).map((item) => item.section_id);
      report.pages.push({ pageId: source.page_id, route: source.url, pageType: 'blog_hub', mapping: [{ sectionId: 'page', blockType: null, rule: 'the blog hub copy (src/data/blog.json)' }], blocks: [], ...(unshown.length ? { unplaced: [{ field: 'sections', value: unshown }] } : {}) });
      continue;
    }
    // Structured fields come with the package (Site Factory 07) or, until 07 emits them, from an overlay file.
    const structured = source.structured ?? structuredOverlay?.pages?.[source.page_id] ?? null;
    // A page written by kind keeps its sections' order and takes only its style from the site's blueprint; a page of
    // slots is laid out in the blueprint's order.
    const byKind = isKindPage(source);
    let { blocks, mapping } = byKind
      ? planKindBlocks(source, { styles: competitorStyles(blueprints[planned.page_type]) })
      : planBlocks(source, { hasKeyFigures: Boolean(structured?.key_figures?.length), pageType: planned.page_type, blueprints });
    verifySectionFacts(source, facts && pageFactsOf(source, facts));
    if (byKind) verifyKindFacts(source, facts && pageFactsOf(source, facts));
    const structuredOrigin = source.structured ? 'package' : structured ? (structuredOverlay.origin || 'overlay') : null;
    if (structured) {
      if (!facts) throw new Error(`${source.page_id}: structured data needs --facts to verify key figures`);
      verifyStructured(source.page_id, structured, pageFactsOf(source, facts));
      // A process_steps section already shows the order steps: the structured copy of them is verified, not placed twice.
      const stepsShown = byKind && source.sections.some((item) => item.kind === 'process_steps');
      placeStructured(blocks, mapping, stepsShown ? { ...structured, process_steps: [] } : structured);
    }
    placePlanSlots(blocks, mapping, { planned, pagesPlan, blueprints });
    placeSiteSlots(blocks, mapping, { planned, blueprints });
    // The privacy page's table, when the package gives it (Site Factory integ deb67119, 2026-11-17; an older one does not).
    placeRequiredBlocks(blocks, mapping, { planned, hero: { heading: source.h1, lead: source.hero_lead ? [source.hero_lead] : [] }, practices: source.data_practices ?? null });
    placeOwnerSlots(blocks, mapping, { planned, proof, blueprints, trust, testimonials: source.testimonials ?? null, cases: source.cases ?? null, quickView: source.quick_view ?? null });
    // A case card's link in the trade's words (a service has no product to see).
    for (const block of blocks) if (block.type === 'caseStudies' && wording?.caseLink) block.linkLabel = wording.caseLink;
    placeStyleGrid(blocks, mapping, { source, planned });
    placeCases(blocks, mapping, { source, proof, heading: wording?.caseHeading });
    placeSources(blocks, mapping, source);
    const related = placeRelated(blocks, { planned, pagesPlan, built, links: source.links || [], variant: relatedVariant, heading: wording?.relatedHeading, pagesHeading: wording?.relatedPagesHeading });
    if (related.fromPage + related.added) mapping.push({ sectionId: 'links', blockType: 'relatedPages', rule: `related pages: ${related.fromPage} page links (${related.inCopy} already in the copy), ${related.added} from the site plan` });
    assertSectionsUsedOnce(source, mapping);
    // A package whose every section names its slot is laid out in the blueprint's order.
    if (!byKind && source.sections.every((item) => item.slot != null)) blocks = orderBySlots(blocks, mapping, blueprints[planned.page_type] || []);
    // No module repeated in a longer run than the competitor's page of this type shows (moduleRuns).
    blocks = legalText(planned.page_type, pageBlockIds(varyLongRuns(blocks, moduleRuns[planned.page_type]?.splitMedia ?? 2)));
    assertQuickViewPlaced(source, blocks);
    report.overLength.push(...overLength(source));
    const jsonLd = plainJsonLd(source.structured_data || []);
    if (JSON.stringify(jsonLd) !== JSON.stringify(source.structured_data || [])) report.jsonLdMarkdown.push(source.url);
    pages.push({
      id: source.page_id,
      route: source.url,
      pageType: planned.page_type,
      status: source.release_status === 'hold' ? 'hold' : 'authored',
      seo: { title: source.title, description: source.meta_description, canonical: source.url },
      jsonLd,
      // Structured data properties Site Factory filled with placeholders (Product offers, reviews...): shown in a
      // development build, never released (lib/review-markup.mjs).
      ...(source.structured_data_placeholders?.length ? { structuredDataPlaceholders: source.structured_data_placeholders } : {}),
      // hero_lead: the answer-first line under the H1 (Site Factory 07, 15-35 words), the first screen's subtitle. No
      // second identity line: Site Factory adds no hero_tagline, it would say what hero_lead says (coordinator 2026-11-17).
      hero: { heading: source.h1, ...(source.hero_lead ? { lead: [source.hero_lead] } : {}), ...(source.cta ? { cta: { label: source.cta.label, href: source.cta.target_url } } : {}) },
      blocks,
      // The plan's label and primary query: the name and type of the Service stage 10 gives the page (lib/seo-head.mjs).
      ...(planned.label ? { planned: { label: planned.label, ...(planned.primary_query ? { primaryQuery: planned.primary_query } : {}) } } : {}),
      source: { package: authoringPackage.schema_version, project: authoringPackage.project, pageId: source.page_id },
    });
    const unplaced = [];
    if (source.notes?.length) unplaced.push({ field: 'notes', value: source.notes });
    if (source.unsupported_claims?.length) unplaced.push({ field: 'unsupported_claims', value: source.unsupported_claims });
    report.pages.push({ pageId: source.page_id, route: source.url, pageType: planned.page_type, mapping, blocks: blocks.map((block) => ({ id: block.id, type: block.type })), links: (source.links || []).length, relatedFromPage: related.fromPage, relatedFromPlan: related.added, linksInCopy: related.inCopy, jsonLdTypes: (source.structured_data || []).map((item) => item['@type']), structured: structuredOrigin, unplaced,
      // Every fact the page cites: stage 11 names the pages behind a fact still awaiting the owner's sign-off.
      citedFacts: [...citedFactIds(source)].sort() });
  }
  const nav = siteNavFromPlan(pagesPlan);
  // The home page's body links the site's categories (lib/home-categories.mjs; site13 blind audit M8): a module of
  // them when its own links miss one. Only authored pages are linked (a held or placeholder page is noindex).
  const home = pages.find((page) => page.pageType === 'home');
  if (home) {
    const typeAt = new Map(pagesPlan.pages.map((item) => [item.url, item.page_type]));
    const authored = new Set(pages.filter((page) => page.status === 'authored').map((page) => page.route));
    const added = placeHomeCategories(home.blocks, { groups: homeCategoryGroups(nav, (route) => typeAt.get(route), (route) => authored.has(route)), hero: home.hero });
    const entry = added ? report.pages.find((item) => item.route === home.route) : null;
    if (entry) {
      entry.mapping.push({ sectionId: `site.${added.id}`, blockType: 'relatedPages', rule: `the home page links its categories: ${added.links.length} hub and category pages its copy does not all reach` });
      entry.blocks = home.blocks.map((block) => ({ id: block.id, type: block.type }));
    }
  }
  assertAuthoringPages(pages);
  // The company's contact details (project.yaml via the package): email, phone, address, hours, profiles.
  // The copy names WhatsApp (Site Factory's pages): the contact details carry a number for it, a stand-in until given.
  const whatsapp = /\bwhats\s?app\b/i.test(JSON.stringify(authoringPackage.pages ?? []));
  return { pages, nav, report, contact: withContactStandIns(authoringPackage.contact ?? null, { origin, whatsapp }), blog, trust };
}

export async function runImport({ packagePath, pagesPlanPath, only = null, structuredPath = null, factsPaths = [], blueprintsPath = null, root = process.cwd() }) {
  const read = (path) => readJson(resolve(path));
  const structuredOverlay = structuredPath ? await read(structuredPath) : null;
  if (structuredOverlay && structuredOverlay.schema_version !== 'sf/structured/v1') throw new Error(`unsupported structured overlay schema: ${structuredOverlay.schema_version}`);
  let facts = null;
  for (const path of factsPaths) facts = new Map([...(facts || []), ...factsFromFile(path, await readText(resolve(path)))]);
  const blueprints = blueprintsPath ? blueprintsFrom(await read(blueprintsPath)) : BLUEPRINTS;
  // The owner's proof fills the owner slots (none while the site has no src/data/site-proof.json); its client wall only
  // where site.json switches it on (lib/site-proof.mjs clientWallOn).
  const proof = withClientWall(await readJson(resolve(root, 'src/data/site-proof.json'), null), await readJson(resolve(root, 'site.json'), null));
  // The competitor's longest run of each module per page type (the reference analysis' section modules).
  const sectionModules = await readJson(resolve(root, 'docs/research/analysis/section-modules.json'), []);
  const pagesPlan = await read(pagesPlanPath);
  const moduleRuns = Object.fromEntries([...new Set(pagesPlan.pages.map((page) => page.page_type))].map((type) => [type, referenceRuns(sectionModules, type)]));
  // A Site Factory handoff beside the package (lib/sf-handoff.mjs): checked first, its route aliases applied to the copy.
  const handoff = await readJson(resolve(packagePath, '..', 'handoff.json'), null);
  const packageRead = await read(packagePath);
  if (handoff) {
    const problems = await handoffProblems({ handoff, authoringPackage: packageRead, root, dir: resolve(packagePath, '..') });
    if (problems.length) throw new Error(`the Site Factory handoff does not check out:\n- ${problems.join('\n- ')}`);
  }
  const authoringPackage = handoff ? aliasRoutes(packageRead, routeAliases(handoff)) : packageRead;
  // The reference links its own pages with photo tiles (a section the analysis named gallery:label-tiles): the related
  // pages show as such tiles, each with its page's photo (owner 2026-11-12: a row of boxed links read as a back office).
  const relatedVariant = sectionModules.some((section) => section.module === 'gallery:label-tiles') ? 'tiles' : null;
  // The words 08 adds, in the site's trade: a trade without its wording file fails here, never falls back to apparel.
  const { trade } = await siteTrade(root);
  const wording = await readJson(tradeConfigPath('wording', trade));
  for (const key of ['relatedHeading', 'caseHeading', 'caseLink']) if (!wording[key]) throw new Error(`config/wording${trade === DEFAULT_TRADE ? '' : `.${trade}`}.json has no ${key}`);
  // The site's own domain, for the stand-in email (info@ it).
  const origin = (await readJson(resolve(root, 'src/data/site-identity.json'), null))?.origin ?? null;
  const result = importSiteFactory({ authoringPackage, pagesPlan, only, structuredOverlay, facts, blueprints, proof, moduleRuns, relatedVariant, wording, origin });
  // Each page's input key (what it was imported from: its part of the package and of the plan, the facts it cites,
  // its type's blueprint and module runs, the proof) and output hash (what it became), and the pages this import
  // changed: a fact reaches only the pages that cite it, and the report says which those were.
  const previous = await readJson(resolve(root, 'docs/research/site-factory-import.json'), null);
  const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  // A page's input is its part of the package with the site-wide flows it uses (a flow's change reaches those pages).
  const sources = new Map(withSiteModules(authoringPackage).pages.map((source) => [source.page_id, source]));
  const rows = new Map(pagesPlan.pages.map((row) => [row.page_id, row]));
  const built = new Map(result.pages.map((page) => [page.route, page]));
  for (const item of result.report.pages) {
    const cited = (item.citedFacts ?? []).map((id) => { const fact = facts?.get(id.replace(/^owner:/, '')); return [id, fact ? { text: fact.text, approved: fact.approved } : 'missing']; });
    item.inputKey = sha([sources.get(item.pageId), rows.get(item.pageId), cited, blueprints[item.pageType] ?? null, moduleRuns[item.pageType] ?? null, proof]);
    item.outputHash = built.has(item.route) ? pageHash(built.get(item.route)) : null;
  }
  const before = new Map((previous?.pages ?? []).map((item) => [item.route, item.outputHash]));
  result.report.changed = result.report.pages.filter((item) => before.get(item.route) !== item.outputHash).map((item) => item.route);
  // The upstream run that made the package (its 07_writing manifest.json beside it): its code version and time.
  const upstream = await readJson(resolve(packagePath, '..', 'manifest.json'), null);
  if (upstream) {
    // The slot manifest the pages were planned against (listed with its sha256) must be the one they are laid out on.
    const planned = (upstream.inputs ?? []).find((input) => /slot-manifest\.json$/.test(input.path ?? ''));
    const used = blueprintsPath ? createHash('sha256').update(await readFile(resolve(blueprintsPath))).digest('hex') : null;
    result.report.upstream = { codeVersion: upstream.code_version ?? null, createdAt: upstream.created_at ?? null, ...(planned ? { plannedSlotManifest: planned.path, slotManifestMatches: used === planned.sha256 } : {}) };
  }
  // The site's own patches the snapshot was frozen with (freeze-site-factory.mjs, lib/package-patches.mjs).
  const patches = await readJson(resolve(packagePath, '..', 'package-patches.json'), null);
  if (patches) result.report.packagePatches = patches;
  result.report.inputs = { package: resolve(packagePath), pagesPlan: resolve(pagesPlanPath), only, structured: structuredPath && resolve(structuredPath), facts: factsPaths.map((path) => resolve(path)), blueprints: blueprintsPath ? resolve(blueprintsPath) : 'built-in' };
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await mkdir(resolve(root, 'docs/research'), { recursive: true });
  await writeJson(resolve(root, 'src/data/authoring-pages.json'), result.pages);
  await writeJson(resolve(root, 'src/data/site-nav.json'), result.nav);
  await writeJson(resolve(root, 'docs/research/site-factory-import.json'), result.report);
  if (result.contact) await writeJson(resolve(root, 'src/data/site-contact.json'), result.contact);
  if (result.blog) await writeJson(resolve(root, 'src/data/blog.json'), result.blog);
  // The trust bar's data, or none (a package without size facts leaves no stale bar behind).
  const trustPath = resolve(root, 'src/data/site-trust.json');
  if (result.trust) await writeJson(trustPath, result.trust);
  else await rm(trustPath, { force: true });
  // The sitemap's lastmod moves only for pages whose content this import changed. A site with replacement lists has its
  // dates recorded once they are applied (apply-replacements.mjs, right after the import): recorded here on the copy
  // as imported, every replaced page would read as changed today on every import.
  const lists = resolve(root, 'content/replacements');
  if (!(existsSync(lists) && (await readdir(lists)).some((name) => name.endsWith('.json') && name !== 'skipped.json'))) await recordPageDates({ root });
  return result;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ package: { type: 'string' }, 'pages-plan': { type: 'string' }, only: { type: 'string' }, structured: { type: 'string' }, facts: { type: 'string', multiple: true }, blueprints: { type: 'string' } });
  if (!values.package || !values['pages-plan']) return usage('Usage: node scripts/import-site-factory.mjs --package <authoring_package.json> --pages-plan <pages.json> [--only id,id] [--facts facts.yaml [--facts capabilities.json ...]] [--blueprints slot-manifest.json]');
  const { report } = await runImport({ packagePath: values.package, pagesPlanPath: values['pages-plan'], only: listOption(values.only), structuredPath: values.structured || null, factsPaths: values.facts ?? [], blueprintsPath: values.blueprints || null });
  console.log(JSON.stringify({ imported: report.pages.map((item) => `${item.route} ${item.blocks.map((block) => block.type).join(' > ')}`), skipped: report.skipped, changed: `${report.changed.length} of ${report.pages.length} pages changed${report.changed.length ? `: ${report.changed.join(', ')}` : ''}` }, null, 2));
});
