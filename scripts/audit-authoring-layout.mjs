import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { cliArgs, runMain, usage } from "./lib/cli.mjs";
import { measureContrast } from "./lib/contrast.mjs";
import { DENSITY_EXEMPT_PAGE_TYPES, DENSITY_FLOOR_EXEMPT_PAGE_TYPES, DENSITY_SCHEMA, bandFor, densityFailures, measureBlocks, measureDensity } from "./lib/density.mjs";
import { loadSitePages, normalizeText, pageCopy } from "./lib/site-pages.mjs";
import { readJson } from "./lib/json-io.mjs";
import { contactChannels } from "./lib/site-contact.mjs";
import { resolveVariant, signatureFloor, withMediaModules } from "./lib/media-slots.mjs";
import { signatureMissing, subjectRepeat } from "./lib/photo-audit.mjs";
import { isIndexable, pageSchemas } from "./lib/seo-head.mjs";
import { writeJson } from './lib/json-io.mjs';
import { BAR_CONTROLS_MAX, barCovers, measureBarCover, FOLD_SCREENS, foldProblems, measureFold, actionsDetached, unevenSetType, carouselsWithoutControls, smallTargets, splitEdges, heavyCrops, heavyOverlays, lockPalette, longMeasures, unmarkedScrollers, measurePage, misalignedColumns, centredRunningText, gutterOutliers, headingAxes, offPalette, parseRgb, photoOverlaps, referenceRuns, repeatedModules, unevenPhotos } from "./lib/visual-checks.mjs";
import { builtPageKey, sharedPageKey } from "./lib/page-keys.mjs";
import { fontProblems, measureFonts } from "./lib/font-checks.mjs";
import { INSTALLED_FONTS } from "./lib/font-install.mjs";
import { headingLineIssues, measureHeadingLines } from "./lib/heading-fit.mjs";
import { protectedOverrides } from "./lib/protected-rules.mjs";
import { assertServesDist, retryCrash } from "./lib/audit-runtime.mjs";
import { TRIAL_TOLERANCE } from "./lib/trial-build.mjs";
import { chromeCta, primaryCta } from "./lib/primary-cta.mjs";
import { axeProblems, measureToolForms, scanAccessibility, toolFormProblems } from "./lib/axe-scan.mjs";
import { firstScreenPhoto, judgedLcp, lcpPages, lcpProblems, measureLcp as labLcp } from "./lib/lab-lcp.mjs";
import { heroShareProblems, measureUsability, referenceShapeProblems, usabilityProblems } from "./lib/usability-checks.mjs";

// Pages measured at the same time, each in its own browser page.
export const AUDIT_CONCURRENCY = 4;

// The built pages against the layout plan (Fable's plan 3.1: the audit checks the page keeps the plan): a page whose
// measured picture area is more than the trial build's tolerance off the plan's estimate (the photos made for it cover
// less or more than its grey frames did: a crop, a position left empty). The template's to see; a warning, as the
// density is. plan: docs/research/layout-plan.json, or null (the template's own pages have none).
export function densityOffPlan(results, plan) {
  const planned = new Map((plan?.pages ?? []).map((page) => [page.route, page.estimate?.visualAreaPct]));
  return results.filter((result) => result.density && planned.get(result.route) != null && Math.abs(result.density.visualAreaPct - planned.get(result.route)) > TRIAL_TOLERANCE.visualPts)
    .map((result) => ({ route: result.route, viewport: result.viewport, issue: 'density_off_plan', value: result.density.visualAreaPct, planned: planned.get(result.route), tolerance: TRIAL_TOLERANCE.visualPts }));
}

// How many of a page's JSON-LD blocks (their @type) are its own structured data (lib/seo-head.mjs pageSchemas): the
// build's ImageObject per content photo (lib/image-seo.mjs, while site.json imageSeo is on) is not one of them. A block
// that is not JSON counts.
export const ownSchemaCount = (types) => types.filter((type) => type !== "ImageObject").length;

export const VIEWPORTS = Object.freeze([{ id: "desktop", width: 1440, height: 1000 }, { id: "tablet", width: 768, height: 1024 }, { id: "mobile", width: 390, height: 844 }]);

// measure(definition, viewport) -> one result (a test passes its own; the default opens the page in Chromium).
// routes: only these pages are measured (site-check.mjs): the report is partial, written to .pipeline/check/, and the
// cache is left alone, so it never stands for the full audit the gate reads (lib/verified-build.mjs).
// measureLcp(definition) -> { ms, element, url } | { ms: null, error }: the throttled phone load of every page with a
// photo in its first screen and of one page of each page type (lib/lab-lcp.mjs); a test passes its own, and a test's
// own measure without one measures none.
export async function auditAuthoringLayout({ baseUrl, rootDir = process.cwd(), measure = null, measureLcp = null, fresh = process.env.SITE_RUN_FRESH === "audits", routes = null }) {
  const root = resolve(rootDir);
  // The pages measured are this site's build, or nothing is cached as ours (lib/audit-runtime.mjs).
  if (!measure) await assertServesDist(baseUrl, root);
  const pages = await loadSitePages(root);
  // The template adds the reference's photo walls to the authored blocks (media-slots.mjs), so they count as blocks too.
  const components = (await readJson(resolve(root, "src/data/template-variants.json"), {})).components ?? {};
  // Structured data a page carries: its own (stage 07) plus the site-level schemas stage 10 adds.
  const identity = await readJson(resolve(root, "src/data/site-identity.json"), null);
  const nav = await readJson(resolve(root, "src/data/site-nav.json"), { header: [], footer: [] });
  // A contact block with no channel to show (the company's details all still blank) renders nothing (ContactChannelsBlock).
  const channels = contactChannels({ contact: await readJson(resolve(root, "src/data/site-contact.json"), null), chat: (await readJson(resolve(root, "src/data/site-runtime.json"), null))?.chat ?? null });
  const shown = (block) => block.type !== "contactChannels" || channels.length > 0;
  const routeSet = new Set(pages.map((page) => page.route));
  const linkableSet = new Set(pages.filter((page) => isIndexable(page)).map((page) => page.route));
  const expectedSchemas = (page) => ownSchemaCount(pageSchemas({ page, identity, nav, builtRoutes: routeSet }).map((item) => item['@type']));
  const builtRoutes = pages.map((definition) => definition.route);
  const template = await readJson(resolve(root, "site-template.json"), {});
  // A reference measured by an earlier rule (a v1 file: photos only) is no band for this one: measured anew.
  const densityFile = await readJson(resolve(root, "docs/research/raw/reference-density.json"), null);
  const referenceDensity = densityFile?.schemaVersion === DENSITY_SCHEMA ? densityFile : null;
  // A page whose built output, definition and the audit's shared inputs are unchanged since it last passed keeps its
  // measurements (.pipeline/audits/authoring-layout.json, lib/page-keys.mjs); a page that failed is always measured
  // again. SITE_RUN_FRESH=audits measures every page.
  const cachePath = resolve(root, ".pipeline/audits/authoring-layout.json");
  const shared = await sharedPageKey(root, { code: ["scripts/audit-authoring-layout.mjs", "scripts/lib/usability-checks.mjs", "scripts/lib/hero-heights.mjs", "scripts/lib/density.mjs", "scripts/lib/heading-fit.mjs", "scripts/lib/visual-checks.mjs", "scripts/lib/contrast.mjs", "scripts/lib/axe-scan.mjs", "scripts/lib/lab-lcp.mjs"], files: ["src/data/template-variants.json", "src/data/site-identity.json", "src/data/site-contact.json", "src/data/site-nav.json", "site-template.json", "docs/research/raw/reference-density.json", INSTALLED_FONTS, "node_modules/axe-core/package.json"], routes: builtRoutes });
  const cache = fresh ? null : await readJson(cachePath, null);
  const cached = cache?.shared === shared ? cache.pages ?? {} : {};
  const keys = {};
  let browser = null;
  const results = [];
  const wanted = routes ? new Set(routes) : null;
  if (wanted) { const unknown = [...wanted].filter((route) => !pages.some((page) => page.route === route)); if (unknown.length) throw new Error(`not pages of this site: ${unknown.join(", ")}`); }
  const measured = wanted ? pages.filter((page) => wanted.has(page.route)) : pages;
  const byPage = new Array(measured.length);
  let reused = 0;
  // Milliseconds spent in the agent-tree scan and the enquiry bar check (summed over the pages, measured
  // AUDIT_CONCURRENCY at a time) and in the LCP loads (their wall time), for the report.
  const spent = { agentTree: 0, barCover: 0, lcp: 0 };
  const timed = async (key, work) => { const start = Date.now(); try { return await work(); } finally { spent[key] += Date.now() - start; } };
  const measureRoute = measure ?? (async (definition, viewport) => {
        browser ??= chromium.launch({ headless: true });
        const page = await (await browser).newPage({ viewport: { width: viewport.width, height: viewport.height } });
        const response = await page.goto(new URL(definition.route, baseUrl).href, { waitUntil: "networkidle", timeout: 30000 });
        const pageFacts = await page.evaluate(({ copy, builtRoutes }) => {
          // Whitespace is ignored: the renderer may regroup verbatim sentences into several paragraphs.
          const normalize = (value) => value.replace(/\s+/g, "");
          const mainText = normalize(document.querySelector("main[data-authoring-page]")?.textContent || "");
          const internal = [...document.querySelectorAll("a[href]")]
            .map((anchor) => new URL(anchor.href))
            .filter((url) => url.origin === location.origin)
            .map((url) => url.pathname);
          return {
            canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || null,
            // The @type of each JSON-LD block (null: not JSON), counted by ownSchemaCount.
            jsonLdCount: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => { try { return JSON.parse(script.textContent)["@type"] ?? null; } catch { return null; } }),
            unplacedCopy: copy.filter((value) => !mainText.includes(value)),
            unresolvedLinks: [...new Set(internal.filter((path) => !builtRoutes.includes(path)))],
            // The site's brand link home must be visible at every width (mobile-first: same content as desktop).
            brandVisible: [...document.querySelectorAll('header a[href="/"]')].some((anchor) => { const box = anchor.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(anchor).visibility !== "hidden"; }),
          };
        }, { copy: pageCopy(definition, routeSet, (block) => resolveVariant(block, definition.pageType, 0, components) ?? (block.type === "cta" ? components.cta : undefined), linkableSet).map((value) => normalizeText(value).replace(/\s+/g, "")), builtRoutes });
        // The accessibility tree an agent reads and the page against WCAG 2.2 A/AA and axe's best practices, once a page
        // at the phone width Lighthouse tests (lib/axe-scan.mjs); the photo of its first screen (lib/lab-lcp.mjs), the
        // pages whose LCP is measured.
        const agentTree = viewport.id === "mobile" ? await timed("agentTree", () => scanAccessibility(page)) : null;
        const heroPhoto = viewport.id === "mobile" ? await page.evaluate(firstScreenPhoto) : undefined;
        // Its forms as WebMCP tools, each annotated whole or not at all (lib/axe-scan.mjs measureToolForms).
        const toolForms = viewport.id === "mobile" ? await page.evaluate(measureToolForms) : null;
        const evidence = await page.evaluate(() => {
          const main = document.querySelector("main[data-authoring-page]");
          // Content of a closed <details> keeps a layout box in Chromium but is not visible; only its summary is.
          const collapsed = (element) => {
            const details = element.parentElement?.closest("details:not([open])");
            return Boolean(details) && !element.closest("summary");
          };
          const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !collapsed(element);
          };
          // Top-level blocks wherever the layout puts them (an article column beside a sidebar), not blocks inside blocks.
          const topLevel = main ? [...main.querySelectorAll("[data-authoring-block]")].filter((block) => !block.parentElement.closest("[data-authoring-block]")) : [];
          const blocks = topLevel.filter(visible);
          // The FAQ page's sections folded under their question (PageView.astro details.faq-fold) are on the page, closed.
          const folded = topLevel.filter((block) => !visible(block) && block.closest("details.faq-fold"));
          const maxGap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--authoring-max-boundary-gap"));
          const contentBounds = (block) => {
            if (block.getAttribute("data-boundary-anchor") === "box") return block.getBoundingClientRect();
            const nodes = [...block.querySelectorAll("h1,h2,h3,p,img,article,li,details,a,button,table,[data-layout]")].filter(visible);
            const rects = nodes.map((node) => node.getBoundingClientRect());
            return rects.length ? { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)) } : block.getBoundingClientRect();
          };
          // Content outside blocks (an article's photo, lead and contents box) sits in the space between two blocks: the gap
          // is the largest blank stretch left between them, not the distance between the blocks.
          // A folded section's question row (its summary) is content between the blocks around it.
          const loose = main ? [...main.querySelectorAll("h1,h2,h3,p,img,li,figure,nav,table,details.faq-fold > summary")].filter((node) => !node.closest("[data-authoring-block]") && visible(node)).map((node) => node.getBoundingClientRect()) : [];
          const boundaryGaps = blocks.slice(1).map((block, index) => {
            const previousBounds = contentBounds(blocks[index]);
            const nextBounds = contentBounds(block);
            const between = loose.filter((rect) => rect.bottom > previousBounds.bottom && rect.top < nextBounds.top).sort((left, right) => left.top - right.top);
            let edge = previousBounds.bottom;
            let gap = 0;
            for (const rect of [...between, { top: nextBounds.top, bottom: nextBounds.top }]) { gap = Math.max(gap, rect.top - edge); edge = Math.max(edge, rect.bottom); }
            return { from: blocks[index].getAttribute("data-authoring-block"), to: block.getAttribute("data-authoring-block"), gap: Math.round(gap) };
          });
          const grids = [...document.querySelectorAll('[data-layout="equal-grid"], [data-layout="mosaic"], .media-row, .icon-list__items')].filter(visible).map((grid) => {
            const children = [...grid.children].filter(visible);
            const widths = children.map((child) => Math.round(child.getBoundingClientRect().width * 100) / 100);
            // Rows by top edge: a short last row must be centred or span the row; items in one row must start their
            // titles and text at the same height.
            const rows = [];
            for (const child of children) {
              const top = Math.round(child.getBoundingClientRect().top);
              const row = rows.find((candidate) => Math.abs(candidate.top - top) < 4);
              if (row) row.items.push(child); else rows.push({ top, items: [child] });
            }
            const box = grid.getBoundingClientRect();
            const columns = Math.max(0, ...rows.map((row) => row.items.length));
            const last = rows.at(-1);
            let lastRow = null;
            if (last && rows.length > 1 && last.items.length < columns) {
              const left = Math.min(...last.items.map((item) => item.getBoundingClientRect().left)) - box.left;
              const right = box.right - Math.max(...last.items.map((item) => item.getBoundingClientRect().right));
              lastRow = { items: last.items.length, columns, balanced: Math.abs(left - right) <= 2 || left + right <= box.width * 0.02 };
            }
            const offset = (item, selector) => { const element = item.querySelector(selector); return element ? element.getBoundingClientRect().top - item.getBoundingClientRect().top : null; };
            const misaligned = [];
            for (const row of rows) {
              if (row.items.length < 2) continue;
              for (const [part, selector] of [["title", "h2, h3, .stats__value, .process-step__title"], ["text", "p, .stats__label"], ["image", "img, .media-box"]]) {
                const values = row.items.map((item) => offset(item, selector));
                if (values.some((value) => value === null)) continue;
                const spread = Math.round(Math.max(...values) - Math.min(...values));
                if (spread > 2) misaligned.push({ part, spread });
              }
            }
            // A lone last item may span the whole row (odd count on two columns): it is not an unequal column.
            const style = getComputedStyle(grid);
            const contentWidth = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
            const lastSpansRow = children.length > 1 && children.at(-1).getBoundingClientRect().width >= contentWidth * 0.98 && rows.at(-1).items.length === 1;
            return { block: grid.closest("[data-authoring-block]")?.getAttribute("data-authoring-block"), widths: lastSpansRow ? widths.slice(0, -1) : widths, explicitSpan: children.some((child) => child.getAttribute("data-explicit-span") === "true"), equalGrid: grid.getAttribute("data-layout") === "equal-grid", empty: children.length === 0, lastRow, misaligned };
          });
          return {
            pageId: main?.getAttribute("data-authoring-page") || null,
            h1Count: document.querySelectorAll("h1").length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            // The site-wide trust bar is not one of the page's blocks, nor a section's charts drawn after it, the hero's lead under it or the table of contents (PageView.astro);
            // their gaps still count.
            blockCount: [...blocks, ...folded].filter((block) => !["trustBar", "charts", "page-toc"].includes(block.getAttribute("data-authoring-block"))).length,
            blockTypes: blocks.map((block) => block.getAttribute("data-authoring-block")),
            maxGap,
            boundaryGaps,
            grids,
            mediaSlots: [...document.querySelectorAll("[data-media-slot]")].map((element) => element.getAttribute("data-media-slot")),
            // Full-width photo rows (a photo band, a figure): the competitor's signature the page must keep (signature_missing).
            fullWidthPhotos: blocks.filter((block) => (block.getAttribute("data-authoring-block") === "gallery" && block.getAttribute("data-variant") === "band") || block.getAttribute("data-authoring-block") === "figure").length,
            // The photos the page shows, for the site-wide subject count (image_subject_repeat).
            photos: main ? [...main.querySelectorAll("img")].map((image) => ({ src: image.getAttribute("src"), alt: image.getAttribute("alt") ?? "" })) : [],
          };
        });
        // The lines the page title and the section headings take (lib/heading-fit.mjs), once the fonts have loaded.
        await page.evaluate(() => document.fonts.ready);
        const headingLines = await page.evaluate(measureHeadingLines);
        // Visual density is compared with the reference only for authored content pages; placeholders carry no real
        // copy and utility pages (contact, privacy) are not content pages.
        const density = viewport.id === "desktop" && definition.status === "authored" && !DENSITY_EXEMPT_PAGE_TYPES.includes(definition.pageType) && referenceDensity ? await measureDensity(page) : null;
        // Each block's own measure where the page's density is measured: the samples the visual budget's model is fitted on.
        const blockMetrics = density ? (await measureBlocks(page)).map((block) => ({ ...block, pageType: definition.pageType })) : null;
        // What a person proofreading the design sees (lib/visual-checks.mjs): every photo loaded first.
        await page.evaluate(async () => {
          for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = "eager";
          for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise((done) => setTimeout(done, 40)); }
          scrollTo(0, 0);
          await Promise.all([...document.images].map((image) => image.decode().catch(() => null)));
        });
        const visual = await page.evaluate(measurePage);
        // The fonts each text is drawn in, once the page was scrolled through (lib/font-checks.mjs).
        const fonts = await page.evaluate(measureFonts);
        // The first screen (lib/visual-checks.mjs foldProblems): the phone as measured, and a 1366×768 desktop, the
        // page then set back to its own width for the checks after.
        const fold = [];
        if (viewport.id === "mobile") fold.push(await page.evaluate(measureFold));
        if (viewport.id === "desktop") {
          await page.setViewportSize(FOLD_SCREENS.desktop);
          fold.push(await page.evaluate(measureFold));
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        }
        // The controls the phone's enquiry bar might hide (lib/visual-checks.mjs measureBarCover), before the contrast
        // measurement hides the bar.
        const barCover = viewport.id === "mobile" ? await timed("barCover", () => page.evaluate(measureBarCover, BAR_CONTROLS_MAX)) : null;
        // Contrast last: measuring it leaves the page's text transparent.
        const lowContrast = viewport.id === "tablet" ? [] : await measureContrast(page);
        // Text boxes drawn over one another (a note on a label, a button on a heading): neither holds the other and they
        // share more than a quarter of the smaller box.
        const textOverlaps = await page.evaluate(() => {
          const collapsed = (element) => Boolean(element.parentElement?.closest("details:not([open])")) && !element.closest("summary");
          // Text a visually hidden ancestor clips away (a 1px box that hides its overflow, kept for screen readers): a
          // stacked two-column table's header row keeps its cells' boxes over the first row (hotel-rm 2026-11-15: "Option"
          // over "Managed pricing" on /request-a-quote/, three overlaps no reader sees).
          const clippedAway = (element) => { for (let at = element.parentElement; at && at !== document.body; at = at.parentElement) { const style = getComputedStyle(at); const rect = at.getBoundingClientRect(); if ((style.overflow !== "visible" || style.clip !== "auto") && (rect.width <= 1 || rect.height <= 1)) return true; } return false; };
          const shown = (element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && !collapsed(element) && !clippedAway(element); };
          const boxes = [...document.querySelectorAll("main :is(h1, h2, h3, p, dt, dd, li, figcaption, summary, th, td, .button)")]
            .filter((element) => element.textContent.trim() && shown(element) && getComputedStyle(element).display !== "inline")
            .map((element) => ({ element, rect: element.getBoundingClientRect() }));
          const found = [];
          for (let i = 0; i < boxes.length && found.length < 10; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) {
              const a = boxes[i]; const b = boxes[j];
              if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
              const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
              const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
              if (width <= 0 || height <= 0) continue;
              const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
              if (width * height > Math.max(40, smaller * 0.25)) found.push({ first: a.element.textContent.trim().slice(0, 50), second: b.element.textContent.trim().slice(0, 50) });
            }
          }
          return found;
        });
        // What a buyer meets whatever the competitor does (lib/usability-checks.mjs): the first screen's form fields, the
        // FAQs' open answers, the bands down the page's first two screens, the opening photo. At the scroll's top.
        await page.evaluate(() => window.scrollTo(0, 0));
        const usability = await page.evaluate(measureUsability);
        await page.close();
        return { route: definition.route, viewport: viewport.id, usability, status: response?.status() || 0, expectedBlocks: withMediaModules(definition, components, { isBuilt: (href) => !href.startsWith("/") || routeSet.has(href) }).filter(shown).length + 1, expectedJsonLd: expectedSchemas(definition), expectedCanonical: definition.seo?.canonical || null, ...pageFacts, jsonLdCount: ownSchemaCount(pageFacts.jsonLdCount), ...evidence, headingLines, density, blockMetrics, lowContrast, textOverlaps, visual, fonts, fold, ...(agentTree ? { agentTree } : {}), ...(heroPhoto !== undefined ? { heroPhoto } : {}), ...(toolForms?.length ? { toolForms } : {}), ...(barCover ? { barCover } : {}) };
  });
  // AUDIT_CONCURRENCY pages at a time; the results keep the pages' order.
  let next = 0;
  const worker = async () => {
    while (next < measured.length) {
      const index = next;
      next += 1;
      const definition = measured[index];
      keys[definition.route] = await builtPageKey(root, definition.route, shared, definition);
      const before = cached[definition.route];
      if (keys[definition.route] && before?.key === keys[definition.route]) { byPage[index] = before.results; reused += 1; continue; }
      byPage[index] = [];
      // A browser that crashed is opened anew and the page measured once more (lib/audit-runtime.mjs).
      for (const viewport of VIEWPORTS) byPage[index].push(await retryCrash(() => measureRoute(definition, viewport), async () => {
        // Pages measured at the same time share the browser: one another page already opened anew is kept.
        const current = await browser?.catch(() => null);
        if (current?.isConnected()) return;
        browser = null;
        await current?.close().catch(() => null);
      }));
    }
  };
  // The phone's LCP under Lighthouse's throttling, every page with a photo in its first screen and one page of each
  // page type (lib/lab-lcp.mjs), after the other
  // measurements, AUDIT_CONCURRENCY loads at a time: each runs in its own renderer with its own network and CPU
  // throttling (site13's eight page types 2026-11-17: 49 s one at a time, 13 s four at a time, every value within the
  // 0.3 s two serial runs differ by; a load over the fail limit is loaded once more, lib/lab-lcp.mjs judgedLcp). A page
  // kept from the last run keeps its measurement with its other results; only a page measured again (or one kept
  // without it) is loaded.
  const lcpRoute = measureLcp ?? (measure ? null : async (definition) => {
    browser ??= chromium.launch({ headless: true });
    return labLcp(await browser, new URL(definition.route, baseUrl).href);
  });
  let lcpMeasured = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(AUDIT_CONCURRENCY, measured.length) }, worker));
    const mobileOf = (definition) => byPage[measured.indexOf(definition)]?.find((result) => result.viewport === "mobile");
    const lcpDue = lcpRoute ? lcpPages(measured, { photo: (definition) => Boolean(mobileOf(definition)?.heroPhoto) }).map((definition) => ({ definition, mobile: mobileOf(definition) })).filter(({ mobile }) => mobile && mobile.lcp === undefined) : [];
    const lcpWorker = async () => {
      while (lcpDue.length) {
        const { definition, mobile } = lcpDue.shift();
        mobile.lcp = await retryCrash(() => judgedLcp(() => lcpRoute(definition)), async () => { const current = await browser?.catch(() => null); if (current?.isConnected()) return; browser = null; await current?.close().catch(() => null); });
        lcpMeasured += 1;
      }
    };
    await timed("lcp", () => Promise.all(Array.from({ length: Math.min(AUDIT_CONCURRENCY, lcpDue.length) }, lcpWorker)));
    results.push(...byPage.flat());
  } finally {
    await browser?.then((opened) => opened.close(), () => null);
  }

  const failures = [];
  // What the audit only reports (it does not fail the run): headings over three lines, pages off their density band.
  const warnings = [];
  // The visual checks: runs of one module longer than the competitor's (desktop; the order is the same at every width),
  // colours outside the design lock's palette, overlapping photos and photos cropped to under half of themselves.
  const sectionModules = await readJson(resolve(root, "docs/research/analysis/section-modules.json"), []);
  const palette = lockPalette(await readJson(resolve(root, "docs/research/analysis/design-lock.json"), null));
  // The families the site uses as system fonts on purpose have no file (docs/research/installed-fonts.json).
  const installedFonts = await readJson(resolve(root, INSTALLED_FONTS), null);
  const systemFonts = Object.values(installedFonts?.roles ?? {}).filter((role) => role.source === "system").map((role) => role.family);
  // Weights a family does not have, synthesized as on the reference (lib/font-install.mjs).
  const synthesizedFonts = installedFonts?.families ?? [];
  for (const result of results.filter((item) => item.visual)) {
    const at = { route: result.route, viewport: result.viewport };
    const definition = pages.find((page) => page.route === result.route);
    // An article is prose section after section by nature: blog posts are not checked for repeated modules.
    if (result.viewport === "desktop") for (const run of repeatedModules(result.visual.blocks, referenceRuns(sectionModules, definition?.pageType), definition?.pageType)) failures.push({ ...at, issue: "repeated_module", ...run });
    // Colours at desktop and mobile width (a breakpoint may set its own, an overlay for instance).
    if (palette.length && result.viewport !== "tablet") for (const colour of offPalette(result.visual.colours.map((item) => ({ color: parseRgb(item.color)?.rgb, where: item.where })).filter((item) => item.color), palette)) failures.push({ ...at, issue: "off_palette_color", ...colour });
    for (const pair of photoOverlaps(result.visual.photos)) failures.push({ ...at, issue: "photo_overlap", ...pair });
    for (const crop of heavyCrops(result.visual.photos)) failures.push({ ...at, issue: "heavy_crop", ...crop });
    for (const photo of unevenPhotos(result.visual.photos)) failures.push({ ...at, issue: "uneven_photo_weight", ...photo });
    if (result.viewport === "desktop") for (const overlay of heavyOverlays(result.visual.overlays)) failures.push({ ...at, issue: "heavy_overlay", ...overlay });
    if (result.viewport === "desktop") for (const measure of longMeasures(result.visual.measures)) failures.push({ ...at, issue: "long_measure", ...measure });
    for (const scroller of unmarkedScrollers(result.visual.scrollers)) failures.push({ ...at, issue: "sideways_scroll", ...scroller });
    for (const carousel of carouselsWithoutControls(result.visual.carousels)) failures.push({ ...at, issue: "carousel_controls", ...carousel });
    // Controls under 24px a finger cannot hit, on phones: a failure since the four-site audit 2026-11-17 (WCAG 2.5.8).
    if (result.viewport === "mobile") for (const target of smallTargets(result.visual.targets)) failures.push({ ...at, issue: "tap_target", ...target });
    for (const column of misalignedColumns(result.visual.columns)) failures.push({ ...at, ...column });
    // A split row's photo and copy share their edges; a button stays with its copy (desktop, where they sit side by side).
    if (result.viewport === "desktop") for (const split of splitEdges(result.visual.splits)) failures.push({ ...at, ...split });
    if (result.viewport !== "tablet") for (const action of actionsDetached(result.visual.actions)) failures.push({ ...at, issue: "action_detached", ...action });
    // The item titles of one section set keep one size and one level, however many blocks the set runs over.
    for (const uneven of unevenSetType(result.visual.titles)) failures.push({ ...at, issue: "uneven_set_type", ...uneven });
    for (const text of centredRunningText(result.visual.centred)) failures.push({ ...at, issue: "centred_running_text", ...text });
    // Section headings on the reference's axis (owner 2026-11-12), at desktop where the axis shows.
    if (result.viewport === "desktop") for (const heading of headingAxes(result.visual.headings, components.headingAlign)) failures.push({ ...at, issue: "heading_off_axis", ...heading });
    // Text in a family with no loaded file, or in a weight or style the browser synthesizes (the fonts step installs them).
    for (const problem of fontProblems(result.fonts, { system: systemFonts, synthesized: synthesizedFonts })) failures.push({ ...at, ...problem });
  }
  // One gutter for the site on phones: a page whose running text starts elsewhere than most pages' (wider screens give
  // page types their own column widths).
  // The template's layout decisions the site's stylesheet undoes (lib/protected-rules.mjs): the site-CSS repair takes them out.
  for (const override of protectedOverrides(await readFile(resolve(root, "src/styles/reference.css"), "utf8").catch(() => ""))) failures.push({ route: "src/styles/reference.css", viewport: "", issue: "template_rule_overridden", ...override });
  for (const outlier of gutterOutliers(results.filter((item) => item.visual && item.viewport === "mobile").map((item) => ({ route: item.route, axis: item.visual.textAxis })))) failures.push({ ...outlier, viewport: "mobile", issue: "gutter_mismatch" });
  if (template.mode === "authoring" && !referenceDensity) failures.push({ issue: "missing_reference_density", value: densityFile ? `docs/research/raw/reference-density.json is ${densityFile.schemaVersion}, not ${DENSITY_SCHEMA}: run pnpm measure:reference-density <reference urls> again` : "run pnpm measure:reference-density <reference urls>" });
  warnings.push(...densityOffPlan(results, await readJson(resolve(root, "docs/research/layout-plan.json"), null)));
  for (const result of results) {
    const pageType = pages.find((page) => page.route === result.route)?.pageType;
    const floorless = DENSITY_FLOOR_EXEMPT_PAGE_TYPES.includes(pageType);
    // The density band is planned to (lib/visual-budget.mjs) and reported, not held to: close is enough (owner
    // 2026-11-12, "大差不差就行"), so a page a little off the band does not stop the run before its design review.
    // Each page type is held to its own band where it has one (the home page to the competitor's home).
    if (result.density) for (const failure of densityFailures(result.density, bandFor(referenceDensity.bands, pageType))) if (!(floorless && failure.issue === 'density_too_few_images')) warnings.push({ route: result.route, viewport: result.viewport, ...failure });
    if (result.status !== 200) failures.push({ route: result.route, viewport: result.viewport, issue: "http_status", value: result.status });
    if (!result.pageId) failures.push({ route: result.route, viewport: result.viewport, issue: "missing_page_evidence" });
    if (!result.brandVisible) failures.push({ route: result.route, viewport: result.viewport, issue: "brand_link_hidden" });
    if (result.h1Count !== 1) failures.push({ route: result.route, viewport: result.viewport, issue: "h1_count", value: result.h1Count });
    // A page title over two lines on a desktop or four on a phone fails; a section heading over three is a warning.
    const lines = headingLineIssues(result, { article: pages.find((page) => page.route === result.route)?.pageType === 'blog_post' });
    failures.push(...lines.failures);
    warnings.push(...lines.warnings);
    if (result.horizontalOverflow) failures.push({ route: result.route, viewport: result.viewport, issue: "horizontal_overflow" });
    // The page title and its call to action in the first screen of a phone and a desktop (four-site audit 2026-11-17;
    // owner 2026-11-17, after claude-seo). A page whose copy has no call to action is reported, not held to one.
    const definition = pages.find((page) => page.route === result.route);
    // A page held out of the index (status hold: a blog hub with no post, site12 2026-11-17) is linked from nowhere
    // (nav_links_noindex): its first screen calls nobody to act. A placeholder page is laid out as it will be written.
    // The call held to the first screen is the hero's own button (site13 claude-seo audit 2026-11-17, M-14: the header's
    // stood in for it); a page whose hero has none is not held to one.
    const callsToAct = definition.status !== "hold" && Boolean(primaryCta(definition) || chromeCta(definition, pages));
    const expectsCta = callsToAct && Boolean(definition.hero?.cta?.label?.trim());
    // A lead too long for the first screen is Site Factory's to shorten: reported, never moved (coordinator 2026-11-17).
    for (const problem of foldProblems(result.fold, { expectsCta })) (problem.issue === "hero_lead_long" ? warnings : failures).push({ route: result.route, viewport: result.viewport, ...problem, ...(problem.issue === "hero_lead_long" ? { owner: "SF" } : {}) });
    if (!callsToAct && result.viewport === "mobile") warnings.push({ route: result.route, viewport: result.viewport, issue: "no_primary_cta" });
    if (result.blockCount !== result.expectedBlocks) failures.push({ route: result.route, viewport: result.viewport, issue: "block_count", expected: result.expectedBlocks, actual: result.blockCount });
    if (result.jsonLdCount !== result.expectedJsonLd) failures.push({ route: result.route, viewport: result.viewport, issue: "json_ld_count", expected: result.expectedJsonLd, actual: result.jsonLdCount });
    if (result.expectedCanonical && !(result.canonical && new URL(result.canonical, baseUrl).pathname === result.expectedCanonical)) failures.push({ route: result.route, viewport: result.viewport, issue: "canonical", expected: result.expectedCanonical, actual: result.canonical });
    for (const run of result.lowContrast) failures.push({ route: result.route, viewport: result.viewport, issue: "low_contrast", ...run });
    for (const pair of result.textOverlaps ?? []) failures.push({ route: result.route, viewport: result.viewport, issue: "text_overlap", ...pair });
    // The agent's accessibility tree (Lighthouse's 33 axe rules) and axe's WCAG 2.2 A/AA and best-practice scan, the
    // controls under the phone's enquiry bar, and the throttled phone LCP (four-site audit 2026-11-17, Fable's plan A4,
    // A8, P3; site audit 2026-11-19).
    const at = { route: result.route, viewport: result.viewport };
    for (const problems of [axeProblems(result.agentTree), lcpProblems(result.lcp)]) {
      failures.push(...problems.failures.map((problem) => ({ ...at, ...problem })));
      warnings.push(...problems.warnings.map((problem) => ({ ...at, ...problem })));
    }
    for (const cover of barCovers(result.barCover)) failures.push({ ...at, issue: "enquiry_bar_covers", ...cover });
    for (const form of toolFormProblems(result.toolForms)) failures.push({ ...at, ...form });
    if (definition) for (const problem of usabilityProblems(result.usability, { page: definition, components })) failures.push({ ...at, ...problem });
    // The first screen and the photo walls against the reference's measure at this width: failures, no waiver.
    if (definition) for (const problem of referenceShapeProblems(result.usability, { page: definition, components, viewport: result.viewport })) failures.push({ ...at, ...problem });
    for (const value of result.unplacedCopy) failures.push({ route: result.route, viewport: result.viewport, issue: "unplaced_copy", value: value.slice(0, 120) });
    for (const path of result.unresolvedLinks) failures.push({ route: result.route, viewport: result.viewport, issue: "unresolved_internal_link", value: path });
    if (!Number.isFinite(result.maxGap) || result.maxGap <= 0) failures.push({ route: result.route, viewport: result.viewport, issue: "missing_boundary_gap_token" });
    for (const boundary of result.boundaryGaps) if (Number.isFinite(result.maxGap) && boundary.gap > result.maxGap) failures.push({ route: result.route, viewport: result.viewport, issue: "boundary_gap", ...boundary, maximum: result.maxGap });
    for (const grid of result.grids) {
      if (grid.empty) failures.push({ route: result.route, viewport: result.viewport, issue: "empty_grid", block: grid.block });
      if (grid.lastRow && !grid.lastRow.balanced) failures.push({ route: result.route, viewport: result.viewport, issue: "unfilled_row", block: grid.block, ...grid.lastRow });
      for (const item of grid.misaligned) failures.push({ route: result.route, viewport: result.viewport, issue: "misaligned_row", block: grid.block, ...item });
      if (!grid.equalGrid || grid.explicitSpan || grid.widths.length < 2) continue;
      const ratio = Math.max(...grid.widths) / Math.min(...grid.widths);
      if (ratio > 1.05) failures.push({ route: result.route, viewport: result.viewport, issue: "unequal_unspanned_grid", block: grid.block, widths: grid.widths });
    }
  }

  // The competitor's full-width photo bands on every page of its page type (a failure: the planning guarantees them, so
  // a page without is a rule that did not hold), and one subject in too many of the site's photos (a warning: what the
  // photos show is the image steps' to change, config/photo-subjects.json).
  const floorOf = (route) => { const definition = pages.find((page) => page.route === route); return definition ? signatureFloor(definition, components) : 0; };
  failures.push(...signatureMissing(results, floorOf));
  // One opening photo on the home page and another page, or on two pages of one type (lib/usability-checks.mjs).
  for (const { level, ...problem } of heroShareProblems(results.filter((result) => result.viewport === "desktop").map((result) => ({ route: result.route, pageType: pages.find((page) => page.route === result.route)?.pageType, heroSrc: result.usability?.heroSrc })))) (level === "failure" ? failures : warnings).push({ viewport: "desktop", ...problem });
  warnings.push(...subjectRepeat(results.filter((result) => result.viewport === "desktop").flatMap((result) => result.photos ?? [])));
  // Image positions the pools could not fill: not a layout failure, but the image supply stage must fill every one.
  const mediaSlots = results.filter((result) => result.viewport === "desktop" && result.mediaSlots.length).map((result) => ({ route: result.route, slots: result.mediaSlots }));
  const report = { schemaVersion: "seo-site-authoring-layout-audit-v1", baseUrl, ...(wanted ? { partial: true, routes: [...wanted] } : {}), routeCount: measured.length, caseCount: results.length, cached: reused, lcpMeasured, checkMs: spent, densityBands: referenceDensity?.bands ?? null, mediaSlots, failures, warnings, results };
  // A partial audit (routes) goes to .pipeline/check/ and leaves the cache as it was.
  if (wanted) {
    await mkdir(resolve(root, ".pipeline/check"), { recursive: true });
    await writeJson(resolve(root, ".pipeline/check/authoring-layout.json"), report);
    if (failures.length) throw new Error(`authoring layout audit of ${measured.length} page(s) failed with ${failures.length} issue(s)`);
    return report;
  }
  await mkdir(resolve(root, "docs/research"), { recursive: true });
  await writeJson(resolve(root, "docs/research/authoring-layout-audit.json"), report);
  // Only pages with no failure are kept for the next run.
  const failing = new Set(failures.map((failure) => failure.route).filter(Boolean));
  const passed = Object.fromEntries(pages.filter((definition) => keys[definition.route] && !failing.has(definition.route)).map((definition) => [definition.route, { key: keys[definition.route], results: results.filter((result) => result.route === definition.route) }]));
  await mkdir(resolve(root, ".pipeline/audits"), { recursive: true });
  await writeJson(cachePath, { schemaVersion: "seo-site-audit-cache-v1", shared, pages: passed });
  if (failures.length) throw new Error(`authoring layout audit failed with ${failures.length} issue(s)`);
  return report;
}

runMain(import.meta.url, async () => {
  const [baseUrl] = cliArgs().positionals;
  if (!baseUrl) return usage("Usage: node scripts/audit-authoring-layout.mjs <candidate-base-url>");
  const report = await auditAuthoringLayout({ baseUrl });
  console.log(JSON.stringify({ routeCount: report.routeCount, caseCount: report.caseCount, mediaSlots: report.mediaSlots.reduce((sum, page) => sum + page.slots.length, 0), failures: report.failures.length }, null, 2));
}, { stack: true });
