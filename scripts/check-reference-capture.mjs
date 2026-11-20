#!/usr/bin/env node

// Checks the reference capture before any model looks at it: the full-page shots, captured DOM and density measure of
// every reference page (capture-reference.mjs, capture-reference-pages.mjs, measure-reference-density.mjs). Each
// check stands for a capture that went wrong unnoticed until the analysis or a later stage was done:
//  - blank-segment / faded-content: hhmhotels.com faded its sections in on scroll; back at the top for the shot,
//    everything under the hero was near opacity 0 and the shots, crops and analysis saw a blank page (template
//    e659a8c, lib/reveal.mjs scrollThroughPage);
//  - fixed-overlay: hhmhotels.com's cookie bar, fixed to the window, sat over the first lines under the hero in every
//    shot (template 4893c14, lib/reveal.mjs revealDeferredContent);
//  - hero-photo-area: hhmhotels.com's hero photo under its transparent header counted for nothing in the density
//    measure (template bb5cf22, lib/density.mjs);
//  - title-missed: concordhotels.com sets its titles in a masthead <header>; the title rule found none on the
//    hotel site (scaffold-placeholder-pages.mjs measureHeroText, lib/heading-fit.mjs);
//  - section-list: "could not find the section list on https://www.hhmhotels.com/contact-us" stopped the patterns
//    step of hotel-rm's fourth run (scaffold-placeholder-pages.mjs, lib/reference-anatomy.mjs extractSectionShapes);
//  - missing-capture: a capture file that is not there is a problem, never a skipped check;
//  - stale-capture: a shot and a DOM of two captures (Staylumen 2026-11-18: a restore put back the tracked DOM of an
//    earlier capture, a tablet layout in a 390px window, beside the untracked shot of the phone's visit; the shot's
//    unpainted iframe was read against the old DOM's text as a blank band). The shot's size must be the DOM's scroll
//    size, and where the capture summary records the shot (capture-reference.mjs: its sha256 and size, and whether it
//    was the phone's visit) the shot must be that one and the DOM of the same visit; else the shot is not compared
//    band by band with the DOM.
// The table gives each reference page's words, photos, visual share and longest text-only run (the density measure
// where the page was measured, else the capture's own estimate).
//
// Reads the site's capture files only: no browser, no network. A problem a site accepts is waived in site.json
// captureWaivers: { "<pageType>": { "<check>": "reason" } }; it is listed in the report and does not fail the run.
// Usage: node scripts/check-reference-capture.mjs [siteRoot] [--out <dir>]
//        (writes <out>/capture-check.json and capture-check.md, default <siteRoot>/docs/research; exit 1 on a problem)

import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REFERENCE_VIEWPORTS } from './capture-reference.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { NON_TEXT, captureTree, domDensity, heroTitles, rectOf, sectionList } from './lib/capture-dom.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { captureFolder } from './lib/rules.mjs';

export const CAPTURE_CHECK_SCHEMA = 'seo-site-capture-check-v1';
export const CAPTURE_CHECKS = Object.freeze(['missing-capture', 'stale-capture', 'blank-segment', 'faded-content', 'fixed-overlay', 'hero-photo-area', 'title-missed', 'section-list']);
// The page type the site-wide capture (capture-reference.mjs on the origin: docs/research/raw, docs/design-references)
// is listed under, and the one of files of no single page (the density measure).
export const ORIGIN = 'origin';
export const SITE = 'site';

export const CAPTURE_LIMITS = Object.freeze({
  // The shot is read in bands of this height.
  bandPx: 1000,
  // A pixel is ink where a channel differs from the band's background by more than this.
  inkDiff: 24,
  // A band with fewer ink pixels than this share is one colour. One line of 16px body text marks about 0.1% of a
  // 1440x1000 band, a photo most of its box: a faded page (opacity 0.02) marks nothing.
  blankInkShare: 0.0005,
  // ...and is blank while the DOM shows content there that should mark at least this share of it (text: characters x
  // font size squared x 0.1; photos: half their box).
  expectedInkShare: 0.005,
  // An element is faded below this opacity (its own times its ancestors').
  fadedOpacity: 0.1,
  // A band is faded where at least this share of its content elements, and this many, are.
  fadedShare: 0.6,
  fadedMin: 3,
  // A fixed box covering more of the window than this sits over the shot (the header and menus apart).
  fixedAreaShare: 0.05,
  // A first window this much covered by photos has a hero photo ...
  heroFirstScreenPct: 40,
  // ... and the measured photo share may fall short of the capture's own estimate by this much (points, or this share
  // of the estimate when larger): separate page loads differ a little (a carousel's slide, a late image).
  heroPhotoGapPts: 5,
  heroPhotoGapShare: 0.2,
  // The patterns step needs at least this many sections (scaffold-placeholder-pages.mjs shapes.length < 2).
  minSections: 2,
  // A shot and its DOM are one capture within this many pixels of the DOM's scroll width and height (the sites'
  // captures to 2026-11-20: equal, but for one desktop shot 17px short of its page; Staylumen's stale pair was
  // 390x12243 against 768x13318).
  staleShotPx: 40,
});

// Why a viewport's shot and DOM are not one capture, or null (view: { extraction, shot: { width, height, sha256 },
// recorded: its capture-summary.json entry }; without a shot or a DOM there is nothing to tell).
export function staleCapture(view, limits = CAPTURE_LIMITS) {
  const { extraction, shot, recorded } = view ?? {};
  if (!extraction || !shot) return null;
  const reasons = [];
  if (recorded?.shotSha256 && shot.sha256 && recorded.shotSha256 !== shot.sha256) reasons.push('the shot is not the one its capture summary records');
  const phone = Boolean(extraction.viewport?.phone);
  if (typeof recorded?.phone === 'boolean' && recorded.phone !== phone) reasons.push(`the shot was ${recorded.phone ? '' : 'not '}a phone's visit, the DOM ${phone ? '' : 'not '}one`);
  const dom = extraction.document ?? {};
  const off = (shown, page) => Number.isFinite(shown) && Number.isFinite(page) && Math.abs(shown - page) > limits.staleShotPx;
  if (off(shot.width, dom.scrollWidth) || off(shot.height, dom.scrollHeight)) reasons.push(`the shot is ${shot.width}x${shot.height}px, the DOM's page ${dom.scrollWidth}x${dom.scrollHeight}px`);
  return reasons.length ? reasons.join('; ') : null;
}

// The ink share of each band of a decoded screenshot ({ data, width, height, channels }, rows of RGB(A) bytes): the
// share of pixels that differ from the band's most common colour (16 levels a channel) by more than inkDiff.
export function screenshotBands(image, { bandPx = CAPTURE_LIMITS.bandPx, inkDiff = CAPTURE_LIMITS.inkDiff } = {}) {
  const { data, width, height, channels } = image;
  const bands = [];
  for (let top = 0; top < height; top += bandPx) {
    const bottom = Math.min(height, top + bandPx);
    const counts = new Uint32Array(4096);
    const sums = new Float64Array(4096 * 3);
    for (let row = top; row < bottom; row += 1) {
      for (let offset = row * width * channels, end = offset + width * channels; offset < end; offset += channels) {
        const bin = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
        counts[bin] += 1;
        sums[bin * 3] += data[offset]; sums[bin * 3 + 1] += data[offset + 1]; sums[bin * 3 + 2] += data[offset + 2];
      }
    }
    let dominant = 0;
    for (let bin = 1; bin < 4096; bin += 1) if (counts[bin] > counts[dominant]) dominant = bin;
    const background = [0, 1, 2].map((channel) => sums[dominant * 3 + channel] / Math.max(1, counts[dominant]));
    let ink = 0;
    for (let row = top; row < bottom; row += 1) {
      for (let offset = row * width * channels, end = offset + width * channels; offset < end; offset += channels) {
        if (Math.abs(data[offset] - background[0]) > inkDiff || Math.abs(data[offset + 1] - background[1]) > inkDiff || Math.abs(data[offset + 2] - background[2]) > inkDiff) ink += 1;
      }
    }
    bands.push({ top, bottom, inkShare: ink / Math.max(1, (bottom - top) * width), background: background.map(Math.round) });
  }
  return bands;
}

const photoLike = (node) => node.tag === 'img' || node.tag === 'video' || /url\(/.test(node.styles?.['background-image'] ?? '');
// The visible-in-layout content of a page (its own text or a photo), whatever its opacity.
function contentNodes(tree) {
  const width = tree.viewport.width;
  return tree.nodes.filter((node) => {
    if (!node.displayed || node.styles?.visibility === 'hidden' || !(node.rect.width > 0 && node.rect.height > 0)) return false;
    const rect = rectOf(node);
    if (rect.right <= 0 || rect.left >= width) return false;
    if (photoLike(node)) return rect.width > 40 && rect.height > 40;
    return Boolean(node.directText?.trim()) && !NON_TEXT.has(node.tag);
  });
}
const overlap = (rect, top, bottom) => Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
const bandsOfPage = (height, bandPx) => Array.from({ length: Math.max(1, Math.ceil(height / bandPx)) }, (_, index) => ({ top: index * bandPx, bottom: Math.min(height, (index + 1) * bandPx) }));
const range = (band) => `${band.top}–${band.bottom}px`;

// The ink the DOM's shown content should leave in a band (pixels).
function expectedInk(nodes, band, width) {
  let ink = 0;
  for (const node of nodes) {
    const rect = rectOf(node);
    const rows = overlap(rect, band.top, band.bottom);
    if (!rows) continue;
    const columns = Math.max(0, Math.min(rect.right, width) - Math.max(rect.left, 0));
    const boxArea = rows * columns;
    if (photoLike(node)) { ink += boxArea * 0.5; continue; }
    const size = Number.parseFloat(node.styles?.['font-size']) || 16;
    const chars = node.directText.replace(/\s+/g, ' ').trim().length * (rows / Math.max(1, rect.height));
    ink += Math.min(chars * size * size * 0.1, boxArea * 0.5);
  }
  return ink;
}

function viewportProblems(tree, bands, viewportId, limits) {
  const problems = [];
  const { width, height: windowHeight } = tree.viewport;
  const nodes = contentNodes(tree);
  const pageHeight = Math.max(tree.scrollHeight, bands?.at(-1)?.bottom ?? 0);
  // Faded: the DOM itself holds the band's content near opacity 0 (the shot then shows nothing there). The page's own
  // content only: the header and footer, and a menu's shut sub-menus, are hidden by design (Duda's footer menu,
  // hometeamluxuryrentals.com 2026-11-16: its closed sub-menus at opacity 0 filled the last band of every page).
  const inMenu = (node) => { for (let at = node; at; at = at.parent) if (at.tag === 'nav' || at.attributes?.role === 'navigation') return true; return false; };
  const own = nodes.filter((node) => !node.inShell && !inMenu(node));
  const faded = [];
  for (const band of bandsOfPage(pageHeight, limits.bandPx)) {
    const inBand = own.filter((node) => overlap(rectOf(node), band.top, band.bottom) > 0);
    const low = inBand.filter((node) => node.opacity < limits.fadedOpacity);
    if (low.length >= limits.fadedMin && low.length / inBand.length >= limits.fadedShare) faded.push(`${range(band)} ${low.length}/${inBand.length}`);
  }
  if (faded.length) problems.push({ check: 'faded-content', detail: `${viewportId}: content at opacity < ${limits.fadedOpacity} in ${faded.join(', ')} (elements faded/all in the band)` });
  // Blank: the shot is one colour where the DOM shows content at full strength.
  if (bands) {
    const shown = nodes.filter((node) => node.opacity >= limits.fadedOpacity);
    const blank = bands.filter((band) => band.inkShare < limits.blankInkShare && expectedInk(shown, band, width) >= limits.expectedInkShare * (band.bottom - band.top) * width);
    if (blank.length) problems.push({ check: 'blank-segment', detail: `${viewportId}: the shot is one colour (rgb ${blank[0].background.join(',')}) in ${blank.map(range).join(', ')} where the DOM shows text or photos` });
  }
  // Fixed: a box fixed to the window over the shot, the site header and menus apart; the outermost one only.
  const reported = new Set();
  const navigation = (node) => node.tag === 'nav' || node.attributes?.role === 'navigation';
  const holdsNavigation = (node) => navigation(node) || node.children.some(holdsNavigation);
  for (const node of tree.nodes) {
    if (node.styles?.position !== 'fixed' || !node.displayed || node.styles?.visibility === 'hidden' || node.opacity < limits.fadedOpacity || node.headerBox) continue;
    let ancestor = node.parent;
    while (ancestor && !reported.has(ancestor)) ancestor = ancestor.parent;
    if (ancestor) continue;
    const rect = rectOf(node);
    const visibleArea = Math.max(0, Math.min(rect.right, width) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0));
    if (visibleArea <= limits.fixedAreaShare * width * windowHeight || holdsNavigation(node)) continue;
    reported.add(node);
    problems.push({ check: 'fixed-overlay', detail: `${viewportId}: ${node.selector} is fixed over ${Math.round((100 * visibleArea) / (width * windowHeight))}% of the window (${Math.round(rect.width)}x${Math.round(rect.height)} at y ${Math.round(rect.top)}): "${node.directText || ''}".`.replace(/: ""\.$/, '.') });
  }
  return problems;
}

const DESKTOP = REFERENCE_VIEWPORTS[0].id;
const normalUrl = (value) => {
  try { const url = new URL(value); return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}${url.search}`; } catch { return null; }
};
// The density measure of a reference page: the measured page at its URL (as given or as captured), its own page type's
// first when the same URL was measured twice.
export function densityPageFor(density, page, capturedUrl) {
  const urls = new Set([normalUrl(page.url), normalUrl(capturedUrl)].filter(Boolean));
  const found = (density?.pages ?? []).filter((item) => urls.has(normalUrl(item.url)));
  return found.find((item) => item.pageType === page.pageType) ?? found[0] ?? null;
}

// One reference page's problems (without pageType) and table row.
function checkPage(page, density, limits) {
  const problems = page.missing.map((path) => ({ check: 'missing-capture', detail: `${path} is missing` }));
  let desktopTree = null;
  for (const [viewportId, view] of Object.entries(page.viewports)) {
    if (!view?.extraction) continue;
    const tree = captureTree(view.extraction, { html: page.html });
    if (viewportId === DESKTOP) desktopTree = tree;
    // A shot of another capture is not read band by band against this DOM (no blank-segment from it).
    const stale = staleCapture(view, limits);
    if (stale) problems.push({ check: 'stale-capture', detail: `${viewportId}: the shot and the captured DOM are not one capture (${stale}${view.extraction.capturedAt ? `; the DOM captured ${view.extraction.capturedAt}` : ''}): capture the page again` });
    problems.push(...viewportProblems(tree, stale ? null : view.bands, viewportId, limits));
  }
  const row = { pageType: page.pageType, folder: page.folder, url: page.url, source: null, words: null, images: null, visualAreaPct: null, longestTextOnlyPx: null, photoAreaPct: null, sections: null, title: null, capture: null };
  if (desktopTree) {
    const estimate = domDensity(desktopTree);
    const measured = densityPageFor(density, page, desktopTree.url)?.metrics ?? null;
    const shown = measured ?? estimate;
    Object.assign(row, { source: measured ? 'density' : 'capture', words: shown.words, images: shown.images, visualAreaPct: shown.visualAreaPct, longestTextOnlyPx: shown.longestTextOnlyPx, photoAreaPct: shown.photoAreaPct, capture: estimate });
    if (measured && estimate.firstScreenPhotoPct >= limits.heroFirstScreenPct) {
      const floor = estimate.photoAreaPct - Math.max(limits.heroPhotoGapPts, estimate.photoAreaPct * limits.heroPhotoGapShare);
      if (measured.photoAreaPct < floor) problems.push({ check: 'hero-photo-area', detail: `photos cover ${estimate.firstScreenPhotoPct}% of the first window, yet the density measure gives the page ${measured.photoAreaPct}% photos where its captured DOM holds ${estimate.photoAreaPct}%` });
    }
    const sections = sectionList(desktopTree);
    row.sections = sections.length;
    if (sections.length < limits.minSections) problems.push({ check: 'section-list', detail: `the section rule finds ${sections.length} section(s) in the captured DOM at ${DESKTOP}; the patterns step needs ${limits.minSections}` });
    const titles = heroTitles(desktopTree);
    row.title = titles.picked?.text ?? null;
    if (titles.titles && !titles.picked) problems.push({ check: 'title-missed', detail: `the page has ${titles.titles} shown h1 ("${titles.first.text}", ${titles.first.selector}) but the title rule takes none` });
    else if (titles.titles && page.fontLock && !page.fontLock.roles?.hero) problems.push({ check: 'title-missed', detail: `the page has ${titles.titles} shown h1 ("${titles.first.text}") but font-lock.json has no hero role` });
  }
  return { problems, row };
}

// The capture checks, on evidence read by loadCaptureEvidence (or made up by a test):
//   pages: [{ pageType, folder, url, html, fontLock, missing: [path], viewports: { <viewport id>: { extraction, bands } } }]
//   (bands: screenshotBands of the viewport's shot, null without one), density: reference-density.json or null,
//   waivers: site.json captureWaivers, missing: [path] of files of no single page.
// Returns { problems: [{ check, pageType, detail }], waived: [{ check, pageType, detail, reason }], table: [row] }.
export function checkReferenceCapture({ pages, density = null, waivers = {}, missing = [] }, limits = CAPTURE_LIMITS) {
  const found = missing.map((path) => ({ check: 'missing-capture', pageType: SITE, detail: `${path} is missing` }));
  const table = [];
  for (const page of pages) {
    const { problems, row } = checkPage(page, density, limits);
    found.push(...problems.map((problem) => ({ check: problem.check, pageType: page.pageType, detail: problem.detail })));
    table.push(row);
  }
  const reason = (problem) => waivers?.[problem.pageType]?.[problem.check];
  const problems = found.filter((problem) => !reason(problem));
  const waived = found.filter(reason).map((problem) => ({ ...problem, reason: reason(problem) }));
  for (const row of table) row.problems = problems.filter((problem) => problem.pageType === row.pageType).length;
  return { problems, waived, table };
}

const exists = (path) => access(path).then(() => true, () => false);
async function decodePng(path) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(path, { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

// One captured page: its viewports' DOM and shot bands, rendered.html and font-lock.json; what is missing.
async function loadPage({ siteRoot, pageType, folder, url, rawDir, shotDir }) {
  const page = { pageType, folder, url, html: null, fontLock: null, missing: [], viewports: {} };
  const relative = (path) => path.slice(siteRoot.length + 1).replace(/\\/g, '/');
  // What the capture recorded of each shot (capture-reference.mjs; a capture before 2026-11-20 recorded none).
  const recorded = (await readJson(resolve(rawDir, 'capture-summary.json'), null))?.captures ?? [];
  for (const { id } of REFERENCE_VIEWPORTS) {
    const jsonPath = resolve(rawDir, `${id}.json`);
    const pngPath = resolve(shotDir, `${id}.png`);
    const extraction = (await exists(jsonPath)) ? await readJson(jsonPath) : null;
    if (!extraction) page.missing.push(relative(jsonPath));
    const image = (await exists(pngPath)) ? await decodePng(pngPath) : null;
    const bands = image ? screenshotBands(image) : null;
    if (!bands) page.missing.push(relative(pngPath));
    const shot = image ? { width: image.width, height: image.height, sha256: await sha256(pngPath) } : null;
    page.viewports[id] = { extraction, bands, shot, recorded: recorded.find((item) => item.id === id) ?? null };
  }
  const htmlPath = resolve(rawDir, 'rendered.html');
  page.html = await readText(htmlPath, null);
  if (page.html === null) page.missing.push(relative(htmlPath));
  const fontPath = resolve(rawDir, 'font-lock.json');
  page.fontLock = await readJson(fontPath, null);
  if (!page.fontLock) page.missing.push(relative(fontPath));
  return page;
}

// Reads a site's capture: every page of site.json reference.pages (docs/research/reference-pages/<folder>/), the
// origin's capture when there is one (docs/research/raw, docs/design-references), the density measure and the waivers.
export async function loadCaptureEvidence(siteRoot) {
  const root = resolve(siteRoot);
  const site = await readJson(resolve(root, 'site.json'));
  if (!site.reference?.origin || !site.reference?.pages) throw new Error('site.json has no reference.origin and reference.pages');
  const pages = [];
  for (const [pageType, path] of Object.entries(site.reference.pages)) {
    const folder = captureFolder(pageType);
    const dir = resolve(root, 'docs/research/reference-pages', folder);
    pages.push(await loadPage({ siteRoot: root, pageType, folder, url: new URL(path, site.reference.origin).href, rawDir: resolve(dir, 'raw'), shotDir: resolve(dir, 'design-references') }));
  }
  if (await exists(resolve(root, 'docs/research/raw/desktop-1440.json'))) {
    pages.push(await loadPage({ siteRoot: root, pageType: ORIGIN, folder: '(origin)', url: new URL('/', site.reference.origin).href, rawDir: resolve(root, 'docs/research/raw'), shotDir: resolve(root, 'docs/design-references') }));
  }
  const densityPath = resolve(root, 'docs/research/raw/reference-density.json');
  const density = await readJson(densityPath, null);
  return { pages, density, waivers: site.captureWaivers ?? {}, missing: density ? [] : ['docs/research/raw/reference-density.json'] };
}

const cell = (value) => (value === null || value === undefined ? '—' : String(value));
const SOURCE_LABEL = { density: '密度测量', capture: '采集估算' };
const CHECK_LABEL = {
  'missing-capture': '采集文件缺失',
  'stale-capture': '截图与 DOM 不是同一次采集',
  'blank-segment': '截图分段空白',
  'faded-content': 'DOM 内容透明',
  'fixed-overlay': '固定元素遮挡',
  'hero-photo-area': '首屏大图与照片占比矛盾',
  'title-missed': '标题未采到',
  'section-list': '切不出节',
};

export function captureCheckMarkdown(result) {
  const lines = ['# 参照页采集验收', '', `检查时间：${result.checkedAt}`, `结论：${result.problems.length ? `**未通过**，${result.problems.length} 个问题` : '**通过**'}${result.waived.length ? `（另有 ${result.waived.length} 个已豁免）` : ''}`, ''];
  lines.push('## 每页数据', '', '| 页面类型 | 来源 | 词数 | 照片数 | 视觉占比 | 最长纯文字段 | 节数 | 标题 | 问题数 |', '|---|---|---|---|---|---|---|---|---|');
  for (const row of result.table) lines.push(`| ${row.pageType} | ${SOURCE_LABEL[row.source] ?? '—'} | ${cell(row.words)} | ${cell(row.images)} | ${row.visualAreaPct === null ? '—' : `${row.visualAreaPct}%`} | ${row.longestTextOnlyPx === null ? '—' : `${row.longestTextOnlyPx}px`} | ${cell(row.sections)} | ${cell(row.title).replace(/\|/g, '\\|')} | ${row.problems} |`);
  lines.push('', '来源为"密度测量"的行取自 docs/research/raw/reference-density.json；"采集估算"是按密度规则在采集的 DOM 上估算的（该页没有单独测密度）。', '');
  const list = (items, withReason) => items.map((item) => `- **${item.pageType}** \`${item.check}\`（${CHECK_LABEL[item.check] ?? item.check}）：${item.detail}${withReason ? `；豁免原因：${item.reason}` : ''}`);
  lines.push('## 问题', '', ...(result.problems.length ? list(result.problems, false) : ['无。']), '');
  if (result.waived.length) lines.push('## 已豁免（site.json captureWaivers）', '', ...list(result.waived, true), '');
  return `${lines.join('\n')}\n`;
}

// Checks a site's capture and writes the reports (out: their folder, default <siteRoot>/docs/research).
export async function runCaptureCheck({ siteRoot = process.cwd(), out = null } = {}) {
  const evidence = await loadCaptureEvidence(siteRoot);
  const result = { schemaVersion: CAPTURE_CHECK_SCHEMA, checkedAt: new Date().toISOString(), siteRoot: resolve(siteRoot), limits: CAPTURE_LIMITS, ...checkReferenceCapture(evidence) };
  const dir = resolve(out ?? resolve(siteRoot, 'docs/research'));
  await writeJson(resolve(dir, 'capture-check.json'), result);
  await writeFile(resolve(dir, 'capture-check.md'), captureCheckMarkdown(result));
  return { ...result, reportDir: dir };
}

runMain(import.meta.url, async () => {
  const { values, positionals } = cliArgs({ out: { type: 'string' } });
  const result = await runCaptureCheck({ siteRoot: positionals[0] ?? process.cwd(), out: values.out ?? null });
  console.table(result.table.map((row) => ({ 页面类型: row.pageType, 来源: SOURCE_LABEL[row.source] ?? '—', 词数: cell(row.words), 照片数: cell(row.images), 视觉占比: row.visualAreaPct === null ? '—' : `${row.visualAreaPct}%`, 最长纯文字段: row.longestTextOnlyPx === null ? '—' : `${row.longestTextOnlyPx}px`, 节数: cell(row.sections), 问题数: row.problems })));
  for (const problem of result.problems) console.log(`[${problem.check}] ${problem.pageType}: ${problem.detail}`);
  for (const problem of result.waived) console.log(`[waived ${problem.check}] ${problem.pageType}: ${problem.detail} (${problem.reason})`);
  console.log(`${result.problems.length ? `${result.problems.length} problem(s)` : 'capture check passed'}; reports in ${result.reportDir}`);
  if (result.problems.length) process.exitCode = 1;
});
