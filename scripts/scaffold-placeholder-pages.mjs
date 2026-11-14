#!/usr/bin/env node

// Reads the section patterns (module designs) of the reference's core pages and applies them:
//  - every page type gets the split-row sequence and card/gallery modules of its reference page;
//  - pages Site Factory has not authored (home, about, contact, hubs) are built from our page blueprints (Site
//    Factory 06's slot manifest via --blueprints, else scripts/lib/page-blueprints.mjs), not from the reference's
//    section order; held pages get no placeholder;
//  - docs/research/slot-manifest.json records the blueprint and the module this template renders each slot with;
//  - docs/research/pattern-inventory.json and one crop per reference section record what was found and used.
// Usage: node scripts/scaffold-placeholder-pages.mjs --pages-plan <pages.json> [--blueprints <slot-manifest.json>]
//        home=<url> about=<url> contact=<url> [product_manufacturer=<url> product_wholesale=<url> solution=<url>]

import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAuthoringPages } from './lib/authoring-contract.mjs';
import { AUTHORED_PATTERN_KEYS, PATTERN_DECISIONS, authoredPatterns, coverage, inventory } from './lib/pattern-map.mjs';
import { blueprintChoices, blueprintPage, blueprintsFrom, competitorBlueprints, slotManifest, withPurposeWording } from './lib/page-blueprints.mjs';
import { DEFAULT_TRADE, imageBriefs, siteTrade, tradeConfigPath } from './lib/trade.mjs';
import { tradePhotos } from './lib/slot-visuals.mjs';
import { siteNavFromPlan } from './lib/site-plan.mjs';
import { extractSectionShapes, measurePhoneSections } from './lib/reference-anatomy.mjs';
import { PAGE_SHELL } from './lib/page-shell.mjs';
import { captureFolder } from './lib/rules.mjs';
import { revealDeferredContent, scrollThroughPage } from './lib/reveal.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

// The widths a reference page is measured at: its sections at desktop width, the same sections again at a phone's
// (each shape's `phone`: height, words, main photo and its ratio), on one page load.
export const DESKTOP = Object.freeze({ width: 1440, height: 1000 });
export const PHONE = Object.freeze({ width: 390, height: 844 });

// The reference page's sections, measured at desktop and at phone width; the page is left at desktop width, scrolled
// to the top, for the section crops.
export async function measureReference(browser, url) {
  const page = await browser.newPage({ viewport: { ...DESKTOP } });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!response?.ok()) throw new Error(`reference page failed: ${response?.status() ?? 'no response'} ${url}`);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await revealDeferredContent(page);
  await scrollThroughPage(page);
  const shapes = await page.evaluate(extractSectionShapes, PAGE_SHELL);
  const headings = await page.evaluate(measureHeadingAlign, PAGE_SHELL);
  const heroText = await page.evaluate(measureHeroText, PAGE_SHELL);
  // A site may reload its page when the viewport changes (a script re-running on resize): the measurement waits for
  // that, reveals the lazy content again and finds the sections by their anchors; a reload during a step is retried.
  const atWidth = async (viewport, work) => {
    await page.setViewportSize({ ...viewport });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await revealDeferredContent(page);
        await scrollThroughPage(page);
        return await work();
      } catch (error) {
        if (attempt || !/Execution context was destroyed|navigation/.test(error.message)) throw error;
      }
    }
    return null;
  };
  const phones = await atWidth(PHONE, () => page.evaluate(measurePhoneSections, shapes.map((shape) => shape.anchor)));
  shapes.forEach((shape, index) => { shape.phone = phones[index]; });
  await atWidth(DESKTOP, async () => {});
  return { page, shapes, headings, heroText };
}

// The page's title as the competitor sets it (its first visible h1 outside the shell, at desktop width): its font
// family, case, characters, and the width of its text in ems (its line boxes over its font size). Our titles are
// sized to their own words with the average (scripts/lib/heading-fit.mjs); null without a title.
// A page's own header (Concord's <header class="masthead"> holds its title; its site header, with the menu, is
// another) is not the shell: an h1 in a header without navigation counts when none is outside the shell (the hotel
// site's capture found no title at all, and its titles were fitted on the widest default, without their capitals).
export function measureHeroText(shell) {
  const shown = (element) => element.textContent.trim() && element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden';
  const titles = [...document.querySelectorAll('h1')].filter(shown);
  const inPageHeader = (element) => { const box = element.closest(shell.header); return Boolean(box) && !box.querySelector('nav, [role=navigation]') && !element.closest(shell.footer); };
  const heading = titles.find((element) => !element.closest(shell.shell)) ?? titles.find(inPageHeader);
  if (!heading) return null;
  const style = getComputedStyle(heading);
  const range = document.createRange();
  range.selectNodeContents(heading);
  const width = [...range.getClientRects()].reduce((sum, rect) => sum + rect.width, 0);
  const size = Number.parseFloat(style.fontSize);
  if (!size || !width) return null;
  // The words the competitor sets under its title on the photo (its hero's paragraphs, not its buttons): Concord's
  // mastheads carry their title alone (lib/heading-fit.mjs heroLeadShown).
  const hero = heading.closest('section, header, [class*="hero"], [class*="masthead"], [class*="banner"]') ?? heading.parentElement;
  const leadWords = [...(hero?.querySelectorAll('p') ?? [])].filter((p) => !p.closest('a, button') && p.getBoundingClientRect().width > 0).reduce((sum, p) => sum + p.textContent.trim().split(/\s+/).filter(Boolean).length, 0);
  return { family: style.fontFamily, textTransform: style.textTransform, chars: heading.textContent.trim().replace(/\s+/g, ' ').length, ems: width / size, leadWords };
}

// The competitor's titles over its reference pages: the first title's family and case, the average character width
// (em) over all of them and how many characters it rests on (lib/heading-fit.mjs charEmFor trusts a long enough one).
export function heroTextAverage(samples) {
  const found = samples.filter(Boolean);
  const chars = found.reduce((sum, sample) => sum + sample.chars, 0);
  if (!chars) return null;
  const ems = found.reduce((sum, sample) => sum + sample.ems, 0);
  const leads = found.filter((sample) => typeof sample.leadWords === 'number');
  return { family: found[0].family, textTransform: found[0].textTransform, chars, charEm: Math.round((ems / chars) * 1000) / 1000, ...(leads.length ? { leadWords: Math.round(leads.reduce((sum, sample) => sum + sample.leadWords, 0) / leads.length) } : {}) };
}

// How a page sets its section headings: of its visible h2s outside the shell, how many start their text on the left of
// their section's content and how many are centred (the text's middle within a few pixels of its box's middle, the box
// wider than the text).
export function measureHeadingAlign(shell) {
  const counts = { start: 0, center: 0 };
  for (const heading of document.querySelectorAll('h2')) {
    if (heading.closest(shell.shell)) continue;
    const box = heading.getBoundingClientRect();
    if (box.width < 60 || box.height < 10 || getComputedStyle(heading).visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
    if (!lines.length) continue;
    const left = Math.min(...lines.map((rect) => rect.left));
    const right = Math.max(...lines.map((rect) => rect.right));
    const centred = getComputedStyle(heading).textAlign === 'center' || (box.width - (right - left) > 40 && Math.abs((left + right) / 2 - (box.left + box.right) / 2) < 6);
    counts[centred ? 'center' : 'start'] += 1;
  }
  return counts;
}

// Page types a representative stands for (site-template.json representatives, named by their capture folder).
const REPRESENTATIVE_TYPES = Object.fromEntries(['product_manufacturer', 'product_wholesale', 'solution', 'about', 'contact'].map((pageType) => [captureFolder(pageType), pageType]));

// site-template.json follows the pages that are built: authoring mode, all routes, and a representative per page type
// (one that still exists is kept; a missing or gone one is the first built page of its type, or dropped).
export async function recordRoutes(root, builtPages) {
  const path = resolve(root, 'site-template.json');
  const manifest = await readJson(path, null);
  if (!manifest) return;
  manifest.mode = 'authoring';
  manifest.routes = builtPages.map((page) => page.route).sort();
  const routes = new Set(manifest.routes);
  manifest.representatives ||= {};
  for (const [key, pageType] of Object.entries(REPRESENTATIVE_TYPES)) {
    if (routes.has(manifest.representatives[key])) continue;
    const replacement = builtPages.find((page) => page.pageType === pageType)?.route;
    if (replacement) manifest.representatives[key] = replacement; else delete manifest.representatives[key];
  }
  await writeJson(path, manifest);
}

// A page type's hero (template-variants.json heroByPageType) follows the competitor's evidence, the capture's coarse
// guess (pattern-inventory.json heroVariant) and then the hero the analysis named (section-modules.json), only while
// it is missing or still that guess. Nothing records who set a value, so any other value is taken for the site's own
// choice (the treatment, a repair) and stays; a named hero once applied therefore stays too, also when a later
// analysis names another.
const heroGuess = (inventory, pageType) => inventory?.pages?.find((page) => page.pageType === pageType)?.heroVariant;
const followsEvidence = (current, guess) => current === undefined || current === guess;

// The site's pages Site Factory has not authored, built from the blueprints (marked placeholders), the site's menus,
// and the slot manifest that goes to Site Factory 06 (docs/research/slot-manifest.json). Without Site Factory's
// blueprints, each page type follows the competitor's page (docs/research/pattern-inventory.json); a person can leave
// competitor sections out in docs/research/blueprint-choices.json (written with enabled: false, the default).
export async function writeBlueprintPages({ root = process.cwd(), pagesPlan, blueprints = null }) {
  const contact = pagesPlan.pages.find((page) => page.page_type === 'contact');
  if (!contact) throw new Error('the site plan has no contact page');
  const inventory = await readJson(resolve(root, 'docs/research/pattern-inventory.json'), null);
  const choicesPath = resolve(root, 'docs/research/blueprint-choices.json');
  let choices = await readJson(choicesPath, null);
  if (!choices && inventory) {
    choices = blueprintChoices(inventory);
    await mkdir(resolve(root, 'docs/research'), { recursive: true });
    await writeJson(choicesPath, choices);
  }
  const sections = await readJson(resolve(root, 'docs/research/analysis/section-modules.json'), []);
  // The owner's proof fills the owner slots (scripts/lib/site-proof.mjs); none while the site has no proof file.
  const proof = await readJson(resolve(root, 'src/data/site-proof.json'), null);
  const trust = await readJson(resolve(root, 'src/data/site-trust.json'), null);
  // A trade other than the default words the competitor-derived blueprint's purposes its own way
  // (config/blueprint-wording.<trade>.json); Site Factory's own manifest keeps its words.
  const { trade } = await siteTrade(root);
  const wording = trade === DEFAULT_TRADE ? null : (await readJson(tradeConfigPath('blueprint-wording', trade))).purposes;
  const used = blueprints ?? withPurposeWording(competitorBlueprints(inventory, { choices, sections }), wording);
  // Every page of the plan Site Factory has not written is a marked placeholder (noindex, not in the sitemap) until it
  // does; a menu heading without a page (nav_only), a page the handoff withholds, the blog (the template builds it) and
  // held pages never are.
  const authored = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  const authoredRoutes = new Set(authored.map((page) => page.route));
  const imported = await readJson(resolve(root, 'docs/research/site-factory-import.json'), {});
  const held = new Set((imported.skipped || []).map((item) => item.pageId));
  const pages = pagesPlan.pages
    .filter((planned) => planned.page_type !== 'blog_hub' && !planned.nav_only && !planned.withheld && !authoredRoutes.has(planned.url) && !held.has(planned.page_id) && used[planned.page_type])
    .map((planned) => blueprintPage({ page: planned, pagesPlan, contactRoute: contact.url, blueprints: used, proof, trust }));
  assertAuthoringPages(pages);
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeJson(resolve(root, 'src/data/placeholder-pages.json'), pages);
  // The site's menus come from the same plan, also when no Site Factory page is imported yet.
  await writeJson(resolve(root, 'src/data/site-nav.json'), siteNavFromPlan(pagesPlan));
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  // What the trade's photos show (config/image-briefs*.json photos, lib/slot-visuals.mjs): a trade whose photos are
  // scenes of its work gives its cards icons, not photos. Run scripts write only the keys they derive; every other key
  // of template-variants.json is the treatment's or a repair's.
  const photos = tradePhotos(await imageBriefs(root));
  const tradeChanged = (variants.components.tradePhotos ?? undefined) !== photos;
  if (tradeChanged) {
    if (photos) variants.components.tradePhotos = photos;
    else delete variants.components.tradePhotos;
  }
  // A hero the analysis named for a page type (section-modules "hero:<variant>") replaces the capture's guess.
  const heroes = sections.filter((item) => item.module?.startsWith('hero:') && followsEvidence(variants.components.heroByPageType?.[item.pageType], heroGuess(inventory, item.pageType)));
  if (heroes.length) variants.components.heroByPageType = { ...(variants.components.heroByPageType || {}), ...Object.fromEntries(heroes.map((item) => [item.pageType, item.module.slice(5)])) };
  if (heroes.length || tradeChanged) await writeJson(variantsPath, variants);
  await writeJson(resolve(root, 'docs/research/slot-manifest.json'), slotManifest({ components: variants.components, source: variants.sourceUrl ?? null, blueprints: used }));
  await recordRoutes(root, [...authored, ...pages]);
  return { pages, blueprints: used };
}

// The capture's findings in template-variants.json components (report: the new pattern inventory, previous: the one
// it replaces). Run scripts write only the keys they derive; every other key is the treatment's or a repair's and
// stays: of a page type's patterns only the classifier's keys are replaced, and its hero follows the rule above.
export function withCapture(components, report, previous) {
  const heroByPageType = { ...components.heroByPageType };
  const pageTypes = { ...components.pageTypes };
  for (const page of report.pages) {
    if (page.heroVariant && followsEvidence(heroByPageType[page.pageType], heroGuess(previous, page.pageType))) heroByPageType[page.pageType] = page.heroVariant;
    pageTypes[page.pageType] = { ...Object.fromEntries(Object.entries(pageTypes[page.pageType] ?? {}).filter(([key]) => !AUTHORED_PATTERN_KEYS.includes(key))), ...page.modules };
  }
  // The reference's section headings: start where most of them start on the content's left edge, else centre.
  const headings = report.headings;
  const headingAlign = headings && headings.start + headings.center ? (headings.start >= headings.center ? 'start' : 'center') : components.headingAlign;
  // The competitor's titles as measured (lib/heading-fit.mjs); a capture that found none keeps the earlier measure.
  const heroText = report.heroText ?? components.heroText;
  return { ...components, heroByPageType, pageTypes, ...(headingAlign ? { headingAlign } : {}), ...(heroText ? { heroText } : {}) };
}

// blueprints: Site Factory 06's slot manifest when given; else each page type follows the competitor's page.
export async function scaffoldReferencePatterns({ pagesPlan, references, blueprints = null, root = process.cwd() }) {
  const contact = pagesPlan.pages.find((page) => page.page_type === 'contact');
  if (!contact) throw new Error('the site plan has no contact page');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  const report = { schemaVersion: 'seo-site-pattern-inventory-v1', viewport: DESKTOP.width, phoneViewport: PHONE.width, pages: [], headings: { start: 0, center: 0 } };
  const pageTypes = {};
  const heroTexts = [];
  try {
    for (const [pageType, url] of Object.entries(references)) {
      const { page, shapes, headings, heroText } = await measureReference(browser, url);
      for (const [align, count] of Object.entries(headings)) report.headings[align] += count;
      heroTexts.push(heroText);
      if (shapes.length < 2) throw new Error(`could not find the section list on ${url}`);
      const sections = inventory(shapes, { pageType });
      // One crop per reference section for pattern-by-pattern review; the crops of an earlier capture go (another
      // section count or pattern would leave crops of sections the page no longer has).
      const cropDir = resolve(root, 'docs/research/pattern-sections', pageType);
      await rm(cropDir, { recursive: true, force: true });
      await mkdir(cropDir, { recursive: true });
      for (const section of sections) {
        const { top, left, width, height } = section.shape;
        const file = `${String(section.index).padStart(2, '0')}-${section.pattern}.png`;
        await page.screenshot({ path: resolve(cropDir, file), fullPage: true, clip: { x: Math.max(0, left), y: Math.max(0, top), width: Math.max(1, width), height: Math.max(1, Math.min(height, 3000)) } }).catch(() => {});
        section.crop = `docs/research/pattern-sections/${pageType}/${file}`;
      }
      await page.close();
      pageTypes[pageType] = authoredPatterns(sections);
      const hero = sections.find((section) => section.pattern.startsWith('hero-'));
      const heroVariant = hero ? PATTERN_DECISIONS[hero.pattern].slice('hero:'.length) : undefined;
      report.pages.push({ pageType, reference: url, modules: pageTypes[pageType], heroVariant, coverage: coverage(sections), sections: sections.map(({ shape, ...rest }) => rest) });
    }
  } finally {
    await browser.close();
  }
  report.heroText = heroTextAverage(heroTexts);
  const inventoryPath = resolve(root, 'docs/research/pattern-inventory.json');
  const previous = await readJson(inventoryPath, null);
  await writeJson(inventoryPath, report);
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath);
  variants.components = withCapture(variants.components, report, previous);
  await writeJson(variantsPath, variants);
  pages.push(...(await writeBlueprintPages({ root, pagesPlan, blueprints })).pages);
  return { pages, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const planIndex = args.indexOf('--pages-plan');
  const planPath = planIndex >= 0 ? args[planIndex + 1] : null;
  const blueprintIndex = args.indexOf('--blueprints');
  const blueprintPath = blueprintIndex >= 0 ? args[blueprintIndex + 1] : null;
  const skip = new Set([planIndex, planIndex + 1, ...(blueprintIndex >= 0 ? [blueprintIndex, blueprintIndex + 1] : [])]);
  const references = Object.fromEntries(args.filter((arg, index) => !skip.has(index)).map((arg) => arg.split(/=(.*)/s).slice(0, 2)));
  if (!planPath || !Object.keys(references).length) {
    console.error('Usage: node scripts/scaffold-placeholder-pages.mjs --pages-plan <pages.json> home=<url> about=<url> contact=<url> [<page_type>=<url> ...]');
    process.exitCode = 1;
  } else {
    readJson(resolve(planPath))
      .then(async (pagesPlan) => scaffoldReferencePatterns({ pagesPlan, references, blueprints: blueprintPath ? blueprintsFrom(await readJson(resolve(blueprintPath))) : null }))
      .then(({ report }) => console.log(JSON.stringify(report.pages.map((page) => ({ pageType: page.pageType, coverage: `${page.coverage}%`, hero: page.heroVariant, modules: page.modules, patterns: page.sections.map((section) => section.pattern).join(' > ') })), null, 2)))
      .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
  }
}
