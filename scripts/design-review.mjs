#!/usr/bin/env node

// The design review of site:run: each page type with a competitor reference page is looked at section by section
// against it, the way a person proofreading the design would (what the layout audits cannot see: the hero's treatment,
// alignment, rhythm, tables, word breaks, a section with no purpose).
//   prepare <preview url>: the longest and the shortest page of every page type of ours (Site Factory's pages first;
//     a page type the competitor lacks goes beside its nearest page, representatives), full-page shots at 1440 and 390
//     with every section labelled by its block id, set beside the competitor's page in segments
//     (docs/research/design-review/<key>-<viewport>-<n>.png, manifest.json; its id is the shots' content hash), and
//     what was measured on them for the review (facts: H1 lines, fonts, each section's photo share, stand-ins).
//   gate: every page's review (config/agent-steps/design-review.md writes <key>.review.json) is of the current shots,
//     and no P0/P1 finding is open; writes docs/research/design-review.json. Exit 2 while it waits.
//   board <preview url>: the style board (build-style-board.mjs) shot, each module beside the competitor sections it
//     renders (manifest.json board); board-gate: the same gate over the modules' reviews, docs/research/style-board-
//     review.json. The board is reviewed before the pages are, and before any photo is made.
//   settle: records the design as settled once both gates passed (docs/research/design-settled.json): a site that
//     makes its own photos makes them from then on.
// Usage: node scripts/design-review.mjs prepare <preview url> | gate | minor | board <preview url> | board-gate | settle [--check]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { builtPageKey, sharedPageKey } from './lib/page-keys.mjs';
import { lineAlignment } from './lib/visual-checks.mjs';
import { copyWords } from './lib/media-slots.mjs';
import { moduleSlug } from './lib/style-board.mjs';
import { captureFolder } from './lib/rules.mjs';
import { fullPageShot } from './lib/audit-runtime.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

export const SHOTS_SCHEMA = 'seo-site-design-review-shots-v1';
export const REVIEW_SCHEMA = 'seo-site-design-review-v1';
const DIR = 'docs/research/design-review';
export const VIEWPORTS = Object.freeze([
  { id: 'desktop', width: 1440, height: 1000, reference: 'desktop-1440.png', column: 720, segment: 2000 },
  { id: 'mobile', width: 390, height: 844, reference: 'mobile-390.png', column: 390, segment: 2400 },
]);
// Open findings of these severities hold the run, when the site can fix them (scope "site": its treatment). A template
// or content finding is listed for whoever fixes it (the template, Site Factory) and does not hold one site's run.
// Only a broken page holds (owner 2026-11-14, Fable's review audit: the gate stood on taste and on template work since
// 11-05, while a cut-off table passed as "template"); P1 and P2 go to the polish repair and stay in the report.
export const BLOCKING = Object.freeze(['P0']);
export const SITE_SCOPE = 'site';
// The severities and scopes a finding may have (config/agent-steps/design-review.md); a finding without a scope is the site's.
export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2']);
export const SCOPES = Object.freeze([SITE_SCOPE, 'template', 'content']);

// The competitor page a page type of ours is set beside: its own page type's, else the nearest the competitor has. A
// hub lists the pages of its kind, so it goes beside that kind's page; a general, legal, ordering or blog page is
// mostly text sections, as an about page is (the hotel site's seven general pages, its services overview, its two legal
// pages and its blog had no competitor page and were never reviewed). A page type with none of these goes beside the
// first page the competitor has.
export const NEAREST_PAGE_TYPES = Object.freeze({
  products_hub: ['product_manufacturer', 'product_wholesale', 'solution'],
  solutions_hub: ['solution', 'product_manufacturer', 'product_wholesale'],
  general: ['about', 'solution', 'product_manufacturer', 'product_wholesale'],
  ordering: ['contact', 'about'],
  privacy: ['about', 'contact'],
  blog_hub: ['about', 'solution'],
  blog_post: ['about', 'solution'],
});
export function referenceType(pageType, referenceTypes) {
  if (referenceTypes.includes(pageType)) return pageType;
  return [...(NEAREST_PAGE_TYPES[pageType] ?? []), 'about', 'solution', 'product_manufacturer', 'home'].find((type) => referenceTypes.includes(type)) ?? referenceTypes[0] ?? null;
}

// The words a page shows (its hero and its sections; lib/media-slots.mjs copyWords).
const pageWords = (page) => copyWords({ hero: page.hero ?? null, blocks: page.blocks ?? [] });

// The pages reviewed: of every page type of ours, its longest and its shortest page by words (one page when the type
// has one), Site Factory's pages first (a type with none: its first placeholder), each beside its competitor page
// (referenceType). The 13 service pages of the hotel site differ from 300 to 1,400 words: one page could not stand for
// them. key names the review (<key>.review.json): the page type for its longest or only page, <type>--shortest for
// the other. In the order of the competitor's page types, a type of ours after the one it is set beside.
export function representatives(pages, referenceTypes) {
  const ours = [...new Set(pages.map((page) => page.pageType))];
  const order = referenceTypes.flatMap((reference) => [reference, ...ours.filter((type) => type !== reference && !referenceTypes.includes(type) && referenceType(type, referenceTypes) === reference)]);
  return order.flatMap((pageType) => {
    const ofType = pages.filter((page) => page.pageType === pageType);
    const authored = ofType.filter((page) => page.status === 'authored');
    const pool = (authored.length ? authored : ofType.slice(0, 1)).map((page) => ({ page, words: pageWords(page) }));
    if (!pool.length) return [];
    const reference = referenceType(pageType, referenceTypes);
    const longest = pool.reduce((best, item) => (item.words > best.words ? item : best));
    const shortest = pool.reduce((best, item) => (item.words < best.words ? item : best));
    const picked = [{ ...longest, key: pageType, role: pool.length > 1 ? 'longest' : 'only' }];
    if (shortest.page !== longest.page) picked.push({ ...shortest, key: `${pageType}--shortest`, role: 'shortest' });
    return picked.map(({ page, words, key, role }) => ({ ...page, key, role, words, reference }));
  });
}

// What a page shows that is to be replaced before launch, from its data: a placeholder page, "[Placeholder]" copy,
// Site Factory items marked placeholder (borrowed testimonials and cases) and the stand-in proof the template adds while
// the owner has none (src/data/site-proof.json standIn; its blocks are owner-*).
export function standIns(page, { proofStandIn = false } = {}) {
  const blocks = page.blocks ?? [];
  const found = [];
  if (page.status === 'placeholder') found.push('a placeholder page');
  if (/\[Placeholder\]/i.test(JSON.stringify(page))) found.push('"[Placeholder]" copy');
  const marked = blocks.filter((block) => JSON.stringify(block).includes('"placeholder":true')).map((block) => block.id);
  if (marked.length) found.push(`Site Factory items marked placeholder: ${marked.join(', ')}`);
  const proof = proofStandIn ? blocks.filter((block) => String(block.id).startsWith('owner-')).map((block) => block.id) : [];
  if (proof.length) found.push(`stand-in proof (src/data/site-proof.json): ${proof.join(', ')}`);
  return found;
}

// A page type's review judged its current shots (each page type has its own fingerprint, so a repair that changes
// one page type sends only that one back for review).
// ... and under the rules it is judged by now (its instructions, the shared practice, the template's hooks and variants):
// a review made under other rules is not current either.
// A review that holds nothing stays current when only the rules changed (owner 2026-11-14: every edit of the review's
// instructions sent every page back for review); new shots are always reviewed again.
export const reviewCurrent = (page, review) => Boolean(review) && review.shots === page.shots && (review.rules === page.rules || !openFindings(review.findings ?? []).length);
export const REVIEW_RULES = Object.freeze(['config/agent-steps/design-review.md', 'config/agent-steps/treatment-practice.md']);
export async function reviewRules(root) {
  const hash = createHash('sha256');
  for (const path of REVIEW_RULES) hash.update(await readFile(resolve(root, path)).catch(() => 'missing'));
  return hash.digest('hex').slice(0, 16);
}

// The site's own layout rules a review and its repair keep to, as facts beside the shots: where section headings sit
// (template-variants.json components.headingAlign; the hotel site's style-board repair centred one module's heading
// after its competitor's module, and the page audit then failed it off the axis every other heading kept).
export async function siteLayoutFacts(root) {
  const align = (await readJson(resolve(root, 'src/data/template-variants.json'), null))?.components?.headingAlign ?? null;
  return align === 'start' ? { sectionHeadings: 'start: every section heading starts on the content\'s left edge on every page (the site\'s rule; a module\'s heading is not centred even where the competitor\'s module centres it)' } : {};
}

// Findings that hold the run: the site's own P0/P1 without a resolution.
export const openFindings = (findings = []) => findings.filter((finding) => BLOCKING.includes(finding.severity) && (finding.scope ?? SITE_SCOPE) === SITE_SCOPE && !finding.resolution);
// The findings of the site's own treatment that do not hold the gate (P1, P2): the run repairs them after it passes, and
// what the repair cannot mend stays in the report (owner 2026-10-30: the small ones are fixed in the run too).
export const minorFindings = (findings = []) => findings.filter((finding) => !BLOCKING.includes(finding.severity) && (finding.scope ?? SITE_SCOPE) === SITE_SCOPE && !finding.resolution);
// What the design repair said it cannot do (docs/research/analysis/notes.md, its "Asked against the site rules" and
// "Template gaps" lists): a finding whose route and block a listed line names carries that answer and holds nothing
// the next round (Fable's review audit: such findings came back every round and the rounds ran out).
export const NOTES = 'docs/research/analysis/notes.md';
const LISTED = /^##\s+(Asked against the site rules|Template gaps)\s*$/;
export function listedByRepair(notes = '') {
  const lines = [];
  let section = null;
  for (const line of String(notes).split(/\r?\n/)) {
    if (/^##\s/.test(line)) { section = LISTED.exec(line)?.[1] ?? null; continue; }
    if (section && /^\s*[-*]\s/.test(line)) lines.push({ section, line });
  }
  return lines;
}
export function applyListed(findings, listed = []) {
  const names = (line, block) => new RegExp(`\`${block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`|\\bblock ${block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line);
  return findings.map((finding) => {
    if (finding.resolution || !finding.route || !finding.block) return finding;
    const hit = listed.find(({ line }) => line.includes(finding.route) && names(line, finding.block));
    return hit ? { ...finding, resolution: `listed by the design repair under "${hit.section}" (${NOTES})` } : finding;
  });
}
// The treatment's rules written for one block by its id: blocks of a kind no longer look alike once the page changes
// (site10: the first three proof sections styled by id, a fourth left as the template had it). Small findings too.
export const blockIdRules = (css = '') => [...new Set([...css.matchAll(/\[data-block-id[~^$*|]?="([^"]+)"\]/g)].map((match) => match[1]))];

// The gate over the reviews: { status: 'missing' | 'stale' | 'open' | 'passed', pages, findings }.
// A review's name: its page's key (a manifest from before keys: the page type).
export const reviewKey = (page) => page.key ?? page.pageType;
// The owner's decisions that a finding is meant as it is (docs/research/design-waivers.json { waivers: [{ block,
// review?, issue? (words of the finding), why, by, at }] }): a review run again writes its findings anew, and these keep
// their answer (Fable's 08-onward review: no finding was ever marked resolved, and a review asked to put back what a
// repair had rightly taken out). A finding a waiver matches carries its resolution and holds nothing.
export const WAIVERS = 'docs/research/design-waivers.json';
export function applyWaivers(findings, waivers = []) {
  return findings.map((finding) => {
    const waiver = waivers.find((entry) => entry.block === finding.block && (!entry.review || entry.review === finding.review) && (!entry.issue || String(finding.issue ?? '').toLowerCase().includes(String(entry.issue).toLowerCase())));
    return waiver && !finding.resolution ? { ...finding, resolution: `waived: ${waiver.why} (${waiver.by}, ${waiver.at})` } : finding;
  });
}
const readWaivers = async (root) => (await readJson(resolve(root, WAIVERS), null))?.waivers ?? [];
const readListed = async (root) => listedByRepair(await readFile(resolve(root, NOTES), 'utf8').catch(() => ''));
export function judgeReviews(manifest, reviews, waivers = [], listed = []) {
  const missing = manifest.pages.filter((page) => !reviews[reviewKey(page)]).map(reviewKey);
  const stale = manifest.pages.filter((page) => reviews[reviewKey(page)] && !reviewCurrent(page, reviews[reviewKey(page)])).map(reviewKey);
  const findings = applyWaivers(manifest.pages.flatMap((page) => (reviews[reviewKey(page)]?.findings ?? []).map((finding) => ({ pageType: page.pageType, review: reviewKey(page), route: page.route, ...finding }))), waivers);
  const answered = applyListed(findings, listed);
  const status = missing.length ? 'missing' : stale.length ? 'stale' : openFindings(answered).length ? 'open' : 'passed';
  return { status, missing, stale, findings: answered };
}

// A labelled full-page shot of our page: every section (data-authoring-block) gets its block id written on it.
async function shootPage(browser, url, viewport, sharp) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // Every photo is loaded and decoded before the shot (an empty frame the browser has not painted yet is not a design
  // fault): lazy ones are made eager and the page is scrolled through once.
  await page.evaluate(async () => {
    for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = 'eager';
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await new Promise((done) => setTimeout(done, 60)); }
    scrollTo(0, 0);
    await Promise.all([...document.images].map((image) => image.decode().catch(() => null)));
  });
  await page.waitForLoadState('networkidle');
  // With each block, where its heading, first paragraph and first button sit in the column that holds them (align:
  // start, centre or end), measured on the rendered lines: two centred lines of the same length look left-aligned in a
  // shot, and the review took them for that.
  // Each by its own column: a paragraph in a card sits in the card, not in the section heading's column.
  const blocks = await page.evaluate((alignmentSource) => [...document.querySelectorAll('[data-authoring-block]')].map((element) => {
    const box = element.getBoundingClientRect();
    const side = new Function(`return ${alignmentSource}`)();
    const lines = (node) => { if (!node) return []; const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()]; };
    // The column inside its padding (a card's text fills the card's padded box, not its border).
    const inside = (node) => {
      if (!node) return undefined;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { left: rect.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth), right: rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth) };
    };
    const heading = element.querySelector('h1, h2, h3');
    const column = inside(heading?.parentElement);
    const button = heading?.parentElement?.querySelector('.button');
    const text = heading?.parentElement?.querySelector('p');
    const align = { heading: side(lines(heading), column), text: side(lines(text), inside(text?.parentElement)), action: button ? side([button.getBoundingClientRect()], column) : undefined };
    // The share of the section's area its photos cover (a page of small card photos and one of full-width photos
    // can show the same number of images).
    const covered = [...element.querySelectorAll('img')].reduce((sum, image) => {
      const rect = image.getBoundingClientRect();
      return sum + Math.max(0, Math.min(rect.right, box.right) - Math.max(rect.left, box.left)) * Math.max(0, Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top));
    }, 0);
    const imageShare = box.width * box.height > 0 ? Math.round(Math.min(1, covered / (box.width * box.height)) * 100) / 100 : 0;
    return { id: element.getAttribute('data-block-id') ?? element.getAttribute('data-authoring-block'), type: element.getAttribute('data-authoring-block'), top: Math.round(box.top + scrollY), height: Math.round(box.height), imageShare, ...(align.heading ? { align } : {}) };
  }).filter((block) => block.height > 0), lineAlignment.toString());
  const facts = await page.evaluate(measureFacts);
  const shot = await fullPageShot(page);
  await page.close();
  const { width, height } = await sharp(shot).metadata();
  const label = (block) => `<g><rect x="0" y="${block.top}" width="${Math.min(width, 16 + 9 * (block.id.length + block.type.length + 3))}" height="26" fill="#d6006e"/><text x="8" y="${block.top + 18}" font-family="monospace" font-size="15" fill="#fff">${escapeXml(`${block.id} (${block.type})`)}</text><rect x="0" y="${block.top}" width="${width}" height="2" fill="#d6006e"/></g>`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${blocks.map(label).join('')}</svg>`);
  return { image: await sharp(shot).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer(), blocks, facts };
}

// What the review is told besides the pixels (run in the page): the H1's rendered lines (the hotel site's 59-character
// H1 at the competitor's 64px ran to five), the font faces the browser loaded and the family and weight each text role
// is set in, with noFace where no loaded face of that family has that weight (the browser then synthesises it: a 400
// file drawn as 700), and how many elements are marked as stand-ins ([data-placeholder]).
export async function measureFacts() {
  await document.fonts.ready;
  const rows = (node) => {
    if (!node) return 0;
    const range = document.createRange();
    range.selectNodeContents(node);
    return new Set([...range.getClientRects()].filter((rect) => rect.width > 1).map((rect) => Math.round(rect.top))).size;
  };
  const h1 = document.querySelector('main h1') ?? document.querySelector('h1');
  const family = (value) => value.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const faces = [...document.fonts].filter((face) => face.status === 'loaded').map((face) => ({ family: family(face.family), weight: String(face.weight), style: face.style }));
  const covers = (face, weight) => { const [low, high = low] = face.weight.split(/\s+/).map(Number); return weight >= low && weight <= high; };
  const roles = { h1: 'main h1', h2: 'main h2', body: 'main p', button: 'main .button' };
  const used = Object.fromEntries(Object.entries(roles).map(([role, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [role, null];
    const style = getComputedStyle(node);
    const name = family(style.fontFamily);
    const weight = Number(style.fontWeight);
    const ofFamily = faces.filter((face) => face.family.toLowerCase() === name.toLowerCase());
    return [role, { family: name, weight, ...(ofFamily.length && !ofFamily.some((face) => covers(face, weight)) ? { noFace: true } : {}) }];
  }).filter(([, value]) => value));
  return {
    h1: h1 ? { text: h1.textContent.trim().replace(/\s+/g, ' '), lines: rows(h1), fontSize: getComputedStyle(h1).fontSize } : null,
    fonts: { loaded: [...new Set(faces.map((face) => `${face.family} ${face.weight}${face.style === 'normal' ? '' : ` ${face.style}`}`))].sort(), used },
    marked: [...document.querySelectorAll('[data-placeholder]')].filter((node) => node.getAttribute('data-placeholder') !== 'false').length,
  };
}

const escapeXml = (text) => text.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]);

// The competitor's page and ours side by side, cut into segments of the same height.
async function pairSegments(sharp, reference, ours, viewport) {
  const scale = async (input) => sharp(input).resize({ width: viewport.column }).png().toBuffer();
  const left = await scale(reference);
  const right = await scale(ours);
  const heights = [(await sharp(left).metadata()).height, (await sharp(right).metadata()).height];
  const header = 36;
  const gap = 24;
  const segments = [];
  for (let top = 0; top < Math.max(...heights); top += viewport.segment) {
    const part = async (image, height) => (top < height ? sharp(image).extract({ left: 0, top, width: viewport.column, height: Math.min(viewport.segment, height - top) }).png().toBuffer() : null);
    const pieces = [await part(left, heights[0]), await part(right, heights[1])];
    const tallest = Math.max(...(await Promise.all(pieces.filter(Boolean).map(async (piece) => (await sharp(piece).metadata()).height))));
    const titles = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.column * 2 + gap}" height="${header}"><text x="8" y="24" font-family="sans-serif" font-size="18" font-weight="700">COMPETITOR (reference)</text><text x="${viewport.column + gap + 8}" y="24" font-family="sans-serif" font-size="18" font-weight="700">OURS</text></svg>`);
    const layers = [{ input: titles, top: 0, left: 0 }, ...pieces.map((piece, index) => (piece ? { input: piece, top: header, left: index * (viewport.column + gap) } : null)).filter(Boolean)];
    segments.push(await sharp({ create: { width: viewport.column * 2 + gap, height: header + tallest, channels: 3, background: '#ffffff' } }).composite(layers).png().toBuffer());
  }
  return segments;
}

// shoot(browser, url, viewport, sharp) -> { image, blocks }: a test passes its own (no browser is opened then).
export async function prepareDesignReview({ baseUrl, root = process.cwd(), shoot = null }) {
  const { default: sharp } = await import('sharp');
  const { chromium } = await import('playwright');
  const site = await readJson(resolve(root, 'site.json'));
  const referenceOf = (pageType) => resolve(root, 'docs/research/reference-pages', captureFolder(pageType), 'design-references');
  const pageTypes = Object.keys(site.reference?.pages ?? {}).filter((pageType) => existsSync(referenceOf(pageType)));
  const chosen = representatives(await loadSitePages(root), pageTypes);
  const proofStandIn = Boolean((await readJson(resolve(root, 'src/data/site-proof.json'), null))?.standIn);
  const dir = resolve(root, DIR);
  await mkdir(dir, { recursive: true });
  // A page type whose built output is unchanged (lib/page-keys.mjs: the page's built output, the competitor's pages,
  // this script and Playwright: `source`) keeps its shots without taking them again. Shots taken again are keyed by
  // their pixels (`shots`): a repair that changed the site's stylesheet but not how this page type looks leaves them,
  // and so its review, current; only the page types that really look different go back to the review.
  const previous = await readJson(resolve(dir, 'manifest.json'), null);
  const shared = await sharedPageKey(root, { code: ['scripts/design-review.mjs'], files: [...new Set(chosen.flatMap((page) => VIEWPORTS.map((viewport) => relative(root, resolve(referenceOf(page.reference), viewport.reference)).replaceAll('\\', '/'))))] });
  const hash = createHash('sha256');
  const rules = await reviewRules(root);
  const layoutFacts = await siteLayoutFacts(root);
  const pages = [];
  let browser = null;
  try {
    for (const page of chosen) {
      const facts = { standIns: standIns(page, { proofStandIn }), ...layoutFacts };
      const source = await builtPageKey(root, page.route, shared, { pageType: page.pageType, reference: page.reference, viewports: VIEWPORTS, standIns: facts.standIns });
      const before = previous?.pages?.find((entry) => reviewKey(entry) === page.key && entry.route === page.route && entry.images.every((path) => existsSync(resolve(root, path))));
      // (A manifest from before pixel keys has only `shots`, the built key.)
      if (before && (before.source ?? before.shots) === source) { const kept = { ...before, key: page.key, source, rules }; pages.push(kept); hash.update(kept.shots); continue; }
      const own = new RegExp(`^${page.key.replace(/[^\w-]/g, '')}-(?:${VIEWPORTS.map((viewport) => viewport.id).join('|')})-\\d+\\.png$`);
      for (const name of await readdir(dir)) if (own.test(name)) await rm(resolve(dir, name));
      if (!shoot) browser ??= await chromium.launch({ headless: true });
      const entry = { key: page.key, pageType: page.pageType, reference: page.reference, role: page.role, words: page.words, route: page.route, status: page.status, source, rules, shots: null, images: [], blocks: {}, facts };
      const pixels = createHash('sha256');
      for (const viewport of VIEWPORTS) {
        const shot = await (shoot ?? shootPage)(browser, new URL(page.route, baseUrl).href, viewport, sharp);
        entry.blocks[viewport.id] = shot.blocks;
        if (shot.facts) facts[viewport.id] = shot.facts;
        const segments = await pairSegments(sharp, resolve(referenceOf(page.reference), viewport.reference), shot.image, viewport);
        for (const [index, segment] of segments.entries()) {
          const name = `${page.key}-${viewport.id}-${index + 1}.png`;
          await sharp(segment).toFile(resolve(dir, name));
          entry.images.push(`${DIR}/${name}`);
          pixels.update(name).update(segment);
        }
      }
      // The review reads the measured blocks beside the pixels (where text sits): a page whose measures changed is
      // reviewed again even when it looks the same (a review of a wrong measure held the gate on a fixed section).
      pixels.update(JSON.stringify(entry.blocks)).update(JSON.stringify(entry.facts));
      entry.shots = pixels.digest('hex').slice(0, 24);
      hash.update(entry.shots);
      pages.push(entry);
    }
  } finally {
    await browser?.close();
  }
  // The style board's shots (prepareStyleBoard) stay as they are.
  const manifest = { schemaVersion: SHOTS_SCHEMA, id: hash.digest('hex').slice(0, 16), pages, ...(previous?.board ? { board: previous.board } : {}) };
  await writeJson(resolve(dir, 'manifest.json'), manifest);
  return manifest;
}

// The style board shot at both widths (in the page): each module's samples (main[data-board-key]) with where they
// sit, the blocks inside them, and the page's facts.
async function shootBoard(browser, url, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(async () => { for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = 'eager'; await Promise.all([...document.images].map((image) => image.decode().catch(() => null))); });
  const modules = await page.evaluate(() => {
    const found = {};
    for (const main of document.querySelectorAll('main[data-board-key]')) {
      const key = main.getAttribute('data-board-key');
      const box = main.getBoundingClientRect();
      const top = Math.round(box.top + scrollY);
      const entry = found[key] ?? { top, bottom: top, blocks: [] };
      entry.top = Math.min(entry.top, top);
      entry.bottom = Math.max(entry.bottom, Math.round(box.bottom + scrollY));
      for (const block of main.querySelectorAll('[data-authoring-block]')) {
        const rect = block.getBoundingClientRect();
        if (rect.height > 0) entry.blocks.push({ id: block.getAttribute('data-block-id'), type: block.getAttribute('data-authoring-block'), sample: main.getAttribute('data-board-sample'), top: Math.round(rect.top + scrollY), height: Math.round(rect.height) });
      }
      found[key] = entry;
    }
    return found;
  });
  const facts = await page.evaluate(measureFacts);
  const image = await fullPageShot(page);
  await page.close();
  return { image, modules, facts };
}

// What stands in the competitor's place beside a module: its sections' crops (docs/research/pattern-sections, at most
// two, one under the other), or a panel saying none of its sections is this module.
async function competitorPanel(sharp, root, evidence) {
  const crops = [];
  for (const section of evidence) {
    const dir = resolve(root, 'docs/research/pattern-sections', section.pageType);
    const name = existsSync(dir) ? (await readdir(dir)).find((file) => file.endsWith('.png') && Number.parseInt(file, 10) === section.index) : null;
    if (name && !crops.some((crop) => crop.endsWith(`${section.pageType}/${name}`))) crops.push(`${dir}/${name}`.replaceAll('\\', '/'));
    if (crops.length === 2) break;
  }
  if (!crops.length) return sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="360"><rect width="1440" height="360" fill="#f4f4f4"/><text x="40" y="170" font-family="sans-serif" font-size="34" fill="#333">No competitor section is this module.</text><text x="40" y="220" font-family="sans-serif" font-size="26" fill="#555">Judge it against the competitor\'s treatment as a whole (type, colour, spacing, buttons).</text></svg>')).png().toBuffer();
  const scaled = await Promise.all(crops.map((path) => sharp(path).resize({ width: 1440 }).png().toBuffer()));
  const heights = await Promise.all(scaled.map(async (buffer) => (await sharp(buffer).metadata()).height));
  const gap = 24;
  let top = 0;
  const layers = scaled.map((input, index) => { const layer = { input, top, left: 0 }; top += heights[index] + gap; return layer; });
  return sharp({ create: { width: 1440, height: top - gap, channels: 3, background: '#ffffff' } }).composite(layers).png().toBuffer();
}

// The style board's shots (lib/style-board.mjs, src/data/style-board.json): the whole board at 1440 and 390
// (docs/research/style-board/board-<viewport>.png), and each module cut out of it and set beside the competitor's
// sections it renders (docs/research/design-review/board--<module>-<viewport>-<n>.png). The manifest's board lists
// one review per module (key board--<module>); its shots are the module's pixels and measures, so a module that looks
// the same after a repair keeps its review. shoot(browser, url, viewport, sharp) -> { image, modules, facts }.
export async function prepareStyleBoard({ baseUrl, root = process.cwd(), shoot = null }) {
  const { default: sharp } = await import('sharp');
  const board = await readJson(resolve(root, 'src/data/style-board.json'), null);
  const dir = resolve(root, DIR);
  await mkdir(dir, { recursive: true });
  await mkdir(resolve(root, 'docs/research/style-board'), { recursive: true });
  const previous = await readJson(resolve(dir, 'manifest.json'), null);
  const rules = await reviewRules(root);
  const layoutFacts = await siteLayoutFacts(root);
  for (const name of await readdir(dir)) if (name.startsWith('board--') && name.endsWith('.png')) await rm(resolve(dir, name));
  const entries = new Map();
  let browser = null;
  try {
    if (board?.modules?.length) {
      if (!shoot) browser = await (await import('playwright')).chromium.launch({ headless: true });
      for (const viewport of VIEWPORTS) {
        const shot = await (shoot ?? shootBoard)(browser, new URL(board.route ?? '/style-board/', baseUrl).href, viewport, sharp);
        await sharp(shot.image).toFile(resolve(root, 'docs/research/style-board', `board-${viewport.id}.png`));
        const { width, height } = await sharp(shot.image).metadata();
        for (const module of board.modules) {
          const place = shot.modules[module.key];
          if (!place) continue;
          const key = `board--${moduleSlug(module.key)}`;
          const entry = entries.get(key) ?? { key, pageType: 'style-board', module: module.key, route: board.route ?? '/style-board/', unbacked: !module.evidence.length, evidence: module.evidence, samples: module.samples.map(({ role, route, blockId, words }) => ({ role, route, blockId, words })), rules, shots: null, images: [], blocks: {}, facts: { ...layoutFacts }, pixels: createHash('sha256') };
          const top = Math.max(0, Math.min(place.top, height - 1));
          const crop = await sharp(shot.image).extract({ left: 0, top, width, height: Math.max(1, Math.min(place.bottom, height) - top) }).png().toBuffer();
          const segments = await pairSegments(sharp, await competitorPanel(sharp, root, module.evidence), crop, viewport);
          for (const [index, segment] of segments.entries()) {
            const name = `${key}-${viewport.id}-${index + 1}.png`;
            await sharp(segment).toFile(resolve(dir, name));
            entry.images.push(`${DIR}/${name}`);
            entry.pixels.update(name).update(segment);
          }
          entry.blocks[viewport.id] = place.blocks.map((block) => ({ ...block, top: block.top - place.top }));
          if (shot.facts) entry.facts[viewport.id] = { fonts: shot.facts.fonts };
          entries.set(key, entry);
        }
      }
    }
  } finally {
    await browser?.close();
  }
  const list = [...entries.values()].map(({ pixels, ...entry }) => ({ ...entry, shots: pixels.update(JSON.stringify(entry.blocks)).update(JSON.stringify(entry.evidence)).digest('hex').slice(0, 24) }));
  const manifest = { schemaVersion: SHOTS_SCHEMA, id: previous?.id ?? null, pages: previous?.pages ?? [], board: list };
  await writeJson(resolve(dir, 'manifest.json'), manifest);
  return manifest;
}

// The design is settled (docs/research/design-settled.json): the style board's and the pages' reviews passed on the
// competitor's photos, so a site that makes its own photos may make them (site-run.mjs placeholders, images).
export const SETTLED = 'docs/research/design-settled.json';
export const designSettled = (root) => existsSync(resolve(root, SETTLED));
// Records the settled design when both gates passed; { settled, why } (why: what has not passed).
export async function settleDesign({ root = process.cwd() } = {}) {
  const board = await readJson(resolve(root, 'docs/research/style-board-review.json'), null);
  const pages = await readJson(resolve(root, 'docs/research/design-review.json'), null);
  const why = [board?.status !== 'passed' && `the style board's review is ${board?.status ?? 'not done'}`, pages?.status !== 'passed' && `the pages' review is ${pages?.status ?? 'not done'}`].filter(Boolean);
  if (why.length) return { settled: false, why };
  const media = (await readJson(resolve(root, 'src/data/template-variants.json'), null))?.components?.media?.origin ?? null;
  await writeJson(resolve(root, SETTLED), { schemaVersion: 'seo-site-design-settled-v1', settledAt: new Date().toISOString(), styleBoard: { modules: board.modules ?? 0 }, review: { shots: pages.shots ?? null }, photosReviewed: media });
  return { settled: true, why: [] };
}

// The style board's gate: every module's review is of its current shots and no P0/P1 finding of the site is open;
// writes docs/research/style-board-review.json (the board's repair reads it). No board: passed.
export async function styleBoardGate({ root = process.cwd() } = {}) {
  const manifest = await readJson(resolve(root, DIR, 'manifest.json'), null);
  const board = manifest?.board ?? [];
  const result = judgeReviews({ pages: board }, await readReviews(root, manifest ?? {}, board), await readWaivers(root), await readListed(root));
  await writeJson(resolve(root, 'docs/research/style-board-review.json'), { schemaVersion: REVIEW_SCHEMA, status: result.status, modules: board.length, unbacked: board.filter((entry) => entry.unbacked).map((entry) => entry.module), findings: result.findings });
  return result;
}

// The reviews written for the current shots, by review key.
export async function readReviews(root, manifest, list = manifest.pages) {
  const reviews = {};
  for (const page of list) {
    const review = await readJson(resolve(root, DIR, `${reviewKey(page)}.review.json`), null);
    if (review) reviews[reviewKey(page)] = review;
  }
  return reviews;
}

export async function designReviewGate({ root = process.cwd() } = {}) {
  const manifest = await readJson(resolve(root, DIR, 'manifest.json'), null);
  if (!manifest) throw new Error(`no ${DIR}/manifest.json: run design-review prepare first`);
  const result = judgeReviews(manifest, await readReviews(root, manifest), await readWaivers(root), await readListed(root));
  await writeJson(resolve(root, 'docs/research/design-review.json'), { schemaVersion: REVIEW_SCHEMA, shots: manifest.id, status: result.status, findings: result.findings });
  return result;
}

runMain(import.meta.url, async () => {
  const [command, baseUrl] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (command === 'prepare' && baseUrl) {
    const manifest = await prepareDesignReview({ baseUrl });
    console.log(`${manifest.pages.length} pages of ${new Set(manifest.pages.map((page) => page.pageType)).size} page types, ${manifest.pages.reduce((sum, page) => sum + page.images.length, 0)} side-by-side images (shots ${manifest.id})`);
    return;
  }
  if (command === 'board' && baseUrl) {
    const manifest = await prepareStyleBoard({ baseUrl });
    console.log(`style board: ${manifest.board.length} modules, ${manifest.board.reduce((sum, entry) => sum + entry.images.length, 0)} side-by-side images; no competitor module: ${manifest.board.filter((entry) => entry.unbacked).map((entry) => entry.module).join(', ') || 'none'}`);
    return;
  }
  // The style board's gate: exit 2 while a module's review is missing, stale or has an open P0/P1 of the site.
  if (command === 'board-gate') {
    const result = await styleBoardGate();
    console.log(`style board review: ${result.status}${result.missing.length ? ` (no review: ${result.missing.join(', ')})` : ''}${result.stale.length ? ` (reviewed older shots: ${result.stale.join(', ')})` : ''}`);
    for (const finding of openFindings(result.findings)) console.log(`${finding.severity} ${finding.review} ${finding.viewport ?? ''} ${finding.block}: ${finding.issue}`);
    if (result.status !== 'passed') process.exitCode = 2;
    return;
  }
  // settle --check: exit 2 while the design is not recorded as settled (site:run then records it and goes again from
  // the images); settle: records it, exit 1 when a review has not passed (the run never gets here then).
  if (command === 'settle') {
    if (process.argv.includes('--check')) {
      console.log(designSettled(process.cwd()) ? `the design is settled (${SETTLED})` : 'the design has passed its reviews on the competitor\'s photos: the site\'s own photos are next');
      if (!designSettled(process.cwd())) process.exitCode = 2;
      return;
    }
    const result = await settleDesign();
    console.log(result.settled ? `the design is settled: ${SETTLED}` : `not settled: ${result.why.join('; ')}`);
    if (!result.settled) process.exitCode = 1;
    return;
  }
  // The small findings the gate let through: exit 2 while one is open, for site:run's repair after the gate.
  if (command === 'minor') {
    const minor = minorFindings((await readJson(resolve(process.cwd(), 'docs/research/design-review.json'), null))?.findings ?? []);
    for (const finding of minor) console.log(`P2 ${finding.pageType} ${finding.viewport ?? ''} ${finding.block}: ${finding.issue}`);
    const byId = blockIdRules(await readFile(resolve(process.cwd(), 'src/styles/reference.css'), 'utf8').catch(() => ''));
    if (byId.length) console.log(`css: src/styles/reference.css styles single blocks by id: ${byId.join(', ')}`);
    if (minor.length || byId.length) process.exitCode = 2;
    return;
  }
  if (command !== 'gate') return usage('Usage: node scripts/design-review.mjs prepare <preview url> | gate | minor | board <preview url> | board-gate | settle [--check]');
  const result = await designReviewGate();
  const open = openFindings(result.findings);
  console.log(`design review: ${result.status}${result.missing.length ? ` (no review: ${result.missing.join(', ')})` : ''}${result.stale.length ? ` (reviewed older shots: ${result.stale.join(', ')})` : ''}`);
  for (const finding of open) console.log(`${finding.severity} ${finding.review ?? finding.pageType} ${finding.viewport ?? ''} ${finding.block}: ${finding.issue}`);
  const elsewhere = result.findings.filter((finding) => BLOCKING.includes(finding.severity) && (finding.scope ?? SITE_SCOPE) !== SITE_SCOPE);
  if (elsewhere.length) console.log(`for the template or Site Factory (not holding this site): ${elsewhere.length} P0/P1 finding(s) in docs/research/design-review.json`);
  if (result.status !== 'passed') process.exitCode = 2;
});
