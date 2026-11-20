import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PHONE_DEVICE, REFERENCE_VIEWPORTS, contextFor } from '../capture-reference.mjs';
import { heroHeightsFrom, heroHeightsOf, photoWallOf, withCapture } from '../scaffold-placeholder-pages.mjs';
import { SIZED_HERO_VARIANTS, heroHeightStyle, heroHeightsFor } from '../lib/hero-heights.mjs';
import { capturedHeroHeights } from '../lib/capture-hero.mjs';
import { referenceShapeProblems } from '../lib/usability-checks.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test("a reference page's first screen is measured at three widths and carried to its page type's hero (owner 2026-11-18)", async () => {
  // Staylumen's reference: the contact page opens on a spacer, then its photo.
  const contact = [{ decision: 'skip: spacer', height: 159 }, { decision: 'figure', height: 412, tablet: { height: 380 }, phone: { height: 300 } }];
  assert.deepEqual(heroHeightsOf(contact), { desktop: { height: 412, share: 0.412 }, tablet: { height: 380, share: 0.371 }, phone: { height: 300, share: 0.355 } });
  assert.deepEqual(heroHeightsOf([{ decision: 'hero:plain', height: 1000, phone: { height: 844 } }]), { desktop: { height: 1000, share: 1 }, phone: { height: 844, share: 1 } });
  // The capture writes them for every page type it measured.
  const report = { pages: [{ pageType: 'home', heroVariant: 'plain', modules: {}, heroHeights: { desktop: { height: 1000, share: 1 } } }, { pageType: 'about', heroVariant: 'media-overlay', modules: {}, heroHeights: { desktop: { height: 572, share: 0.572 } } }], photoWall: { fit: 'container', ratio: '2.11 / 1', height: 568 } };
  const components = withCapture({ heroByPageType: {}, pageTypes: {} }, report, null);
  assert.equal(components.heroHeights.about.desktop.height, 572);
  assert.equal(components.photoWall.ratio, '2.11 / 1');
  // A page type the reference lacks takes the nearest one's (the FAQ page: about).
  assert.equal(heroHeightsFor('general', components).desktop.height, 572);
  assert.equal(heroHeightStyle({ desktop: { height: 572 }, phone: { height: 636 } }), '--hero-h-desktop: 572px; --hero-h-phone: 636px');
  const hero = await source('src/components/blocks/PageHero.astro');
  assert.match(hero, /const heightStyle = SIZED_HERO_VARIANTS\.includes\(variant\) \? heroHeightStyle\(heroHeightsFor\(page\.pageType, variants\)\) : null;/);
  const css = await source('src/styles/template.css');
  // The measure in a variable of its own, one width each, without a fallback; read before the treatment's height.
  assert.match(css, /main\[data-page-type\] \.page-hero\[data-hero-height\] \{ --hero-measured: var\(--hero-h-desktop\); \}/);
  assert.match(css, /@media \(max-width: 1023px\) \{ main\[data-page-type\] \.page-hero\[data-hero-height\] \{ --hero-measured: var\(--hero-h-tablet\); \} \}/);
  assert.match(css, /@media \(max-width: 767px\) \{ main\[data-page-type\] \.page-hero\[data-hero-height\] \{ --hero-measured: var\(--hero-h-phone\); \} \}/);
  assert.match(css, /min-height: min\(var\(--hero-measured, var\(--hero-min-height, clamp\(360px, 42vw, 560px\)\)\), var\(--fold-screen\)\);/);
  assert.doesNotMatch(css, /--hero-min-height: var\(--hero-h-/);
});

test("the reference's measure outweighs a treatment's hero height at any specificity; a width without one takes the treatment's (Strandmill 2026-11-20)", async () => {
  // Only a phone banded: its measure alone, and the hero is marked.
  assert.equal(heroHeightStyle({ phone: { height: 178, share: 0.211 } }), '--hero-h-phone: 178px');
  assert.equal(heroHeightStyle({ tablet: { height: 646 }, phone: { height: 860 } }), '--hero-h-tablet: 646px; --hero-h-phone: 860px');
  assert.equal(heroHeightStyle({}), null);
  assert.equal(heroHeightStyle(null), null);
  // A site sets neither the measure nor its widths (lib/protected-rules.mjs).
  const { protectedOverrides, stripProtected } = await import('../lib/protected-rules.mjs');
  assert.deepEqual(protectedOverrides('main .page-hero { --hero-measured: 300px; --hero-h-tablet: 400px; --hero-min-height: 500px; }').map((found) => found.property), ['--hero-measured', '--hero-h-tablet']);
  assert.match(stripProtected('.page-hero { --hero-h-phone: 1px; --hero-min-height: 70vw; }').css, /^\.page-hero \{\s*--hero-min-height: 70vw; \}$/);
  // In a browser: the template's own rules (template.css) under Strandmill's treatment rule, the same specificity and
  // later, and one of more specificity still.
  const css = await source('src/styles/template.css');
  const rules = css.split('\n').filter((line) => line.includes('.page-hero__inner { z-index: 2; min-height:') || line.includes('{ --hero-measured:')).join('\n');
  assert.equal(rules.split('\n').length, 4);
  const treatment = 'main[data-page-type="home"] .page-hero[data-variant="media-overlay"] { --hero-min-height: 560px; } html body main[data-page-type="home"] .page-hero[data-variant="media-overlay"] { --hero-min-height: 520px; }';
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const height = async (width, style) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.setContent(`<!doctype html><style>body{margin:0} .page-hero__inner{display:block} ${rules} ${treatment}</style><main data-page-type="home"><section class="page-hero" data-variant="media-overlay" data-hero-height style="--fold-screen: 884px; ${style}"><div class="page-hero__inner"></div></section></main>`);
      return page.evaluate(() => Math.round(document.querySelector('.page-hero__inner').getBoundingClientRect().height));
    };
    const measured = '--hero-h-desktop: 894px; --hero-h-tablet: 1110px; --hero-h-phone: 717px';
    assert.equal(await height(1440, measured), 884, 'the desktop measure, capped by the screen');
    assert.equal(await height(768, measured), 884, 'the tablet measure (1110), capped by the screen');
    assert.equal(await height(390, measured), 717, 'the phone measure');
    // Only the phone measured: the desktop and the tablet take the treatment's height.
    assert.equal(await height(1440, '--hero-h-phone: 717px'), 520);
    assert.equal(await height(768, '--hero-h-phone: 717px'), 520);
    assert.equal(await height(390, '--hero-h-phone: 717px'), 717);
  } finally {
    await browser.close();
  }
});

test("the phone's capture and measure are a phone's visit; the photo walls take the reference's photo shape", () => {
  // (a phone's content width is the phone's: no across-the-page check there)
  // Duda laid its 768px tablet page out in a 390px window without a phone's browser.
  const phone = REFERENCE_VIEWPORTS.find((viewport) => viewport.id === 'mobile-390');
  assert.deepEqual(contextFor(phone), { viewport: { width: 390, height: 844 }, ...PHONE_DEVICE });
  assert.equal(PHONE_DEVICE.isMobile, true);
  assert.equal(PHONE_DEVICE.deviceScaleFactor, 1, 'one CSS pixel a pixel, as our shots');
  assert.deepEqual(contextFor(REFERENCE_VIEWPORTS[0]), { viewport: { width: 1440, height: 1000 } });
  // A captured page (capture-reference.mjs extractPage): its root and body, then each image in its own box.
  const box = (selector, tag, y, width, height, styles = {}, attributes = {}) => ({ selector, tag, attributes, rect: { x: 0, y, width, height }, styles: { display: 'block', position: 'static', visibility: 'visible', opacity: '1', 'background-image': 'none', ...styles } });
  const raw = (images, more = []) => ({ viewport: { width: 1440, height: 1000 }, document: { scrollHeight: 12000 }, elements: [box('', 'html', 0, 1440, 12000), box('body', 'body', 0, 1440, 12000), ...images.map(([y, width, height, tag = 'img'], index) => box(`body > div:nth-of-type(${index + 1}) > ${tag}`, tag, y, width, height, tag === 'img' ? {} : { 'background-image': 'url("a.jpg")' })), ...more] });
  // Staylumen's reference: split rows and panels of about 590px, cards of 317px left out.
  assert.deepEqual(photoWallOf([raw([[1274, 317, 346], [4166, 590, 393], [3000, 600, 646, 'div'], [6291, 584, 368]])]), { fit: 'container', ratio: '3 / 1', height: 393 }, 'the median of 393, 646 and 368px in 1200px: 3:1 at most');
  assert.deepEqual(photoWallOf([raw([[2000, 1440, 700]])]), { fit: 'full' }, 'a photo across the page keeps the walls across it');
  assert.equal(photoWallOf([raw([[500, 600, 400]])]), null, 'the first screen is the hero');
  // Only what a visitor sees in the page's body (coordinator 2026-11-18): a photo across the page in the footer, a
  // hidden one, one of no size and a pop-up fixed to the screen leave the walls in the content's width.
  const body = [[4166, 590, 393]];
  const footer = [box('body > div:nth-of-type(9)', 'div', 11000, 1440, 1000, {}, { class: 'dmFooterContainer' }), box('body > div:nth-of-type(9) > div', 'div', 11000, 1440, 900, { 'background-image': 'url("f.jpg")' })];
  assert.deepEqual(photoWallOf([raw(body, footer)]), { fit: 'container', ratio: '3 / 1', height: 393 });
  // A builder's footer photo the capture cannot hang under the footer (an id-anchored box) is below the footer's top.
  assert.deepEqual(photoWallOf([raw(body, [footer[0], box('div#f1', 'div', 11100, 1440, 800, { 'background-image': 'url("f.jpg")' })])]), { fit: 'container', ratio: '3 / 1', height: 393 });
  for (const hidden of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }, { position: 'fixed' }]) {
    assert.deepEqual(photoWallOf([raw(body, [box('body > section', 'section', 3000, 1440, 700, { 'background-image': 'url("p.jpg")', ...hidden })])]), { fit: 'container', ratio: '3 / 1', height: 393 }, JSON.stringify(hidden));
  }
  // Inside a hidden or fixed box: its own styles say nothing.
  assert.deepEqual(photoWallOf([raw(body, [box('body > aside', 'aside', 2000, 1440, 800, { display: 'none' }), box('body > aside > img', 'img', 2000, 1440, 800)])]), { fit: 'container', ratio: '3 / 1', height: 393 });
  assert.deepEqual(photoWallOf([raw(body, [box('body > aside', 'aside', 2000, 1440, 800, { position: 'fixed' }), box('body > aside > img', 'img', 2000, 1440, 800)])]), { fit: 'container', ratio: '3 / 1', height: 393 });
  // A zero-size box is no photo; a shown one across the body is.
  assert.deepEqual(photoWallOf([raw([[2000, 0, 0], ...body])]), { fit: 'container', ratio: '3 / 1', height: 393 });
  assert.deepEqual(photoWallOf([raw(body, [box('body > section', 'section', 3000, 1440, 700, { 'background-image': 'url("p.jpg")' })])]), { fit: 'full' });
});

test("the hero's height and the photo walls are held to the reference's measure at the same width", () => {
  const components = { heroHeights: { home: { desktop: { height: 1000, share: 1 }, phone: { height: 844, share: 1 } }, about: { desktop: { height: 572, share: 0.572 } } }, photoWall: { fit: 'container', ratio: '2.11 / 1' } };
  // A hero the template sizes by the reference (PageHero.astro data-hero-height).
  const evidence = (heroShape, wallShapes = [], viewportHeight = 900, viewportWidth = 1440) => ({ viewportHeight, viewportWidth, heroShape: heroShape && { sized: true, ...heroShape }, wallShapes });
  const issues = (list) => list.map((problem) => problem.issue);
  const home = { route: '/', pageType: 'home' };
  // The home's 600px under a 900px screen whose header lies over it: the reference's full screen is 900 here.
  assert.deepEqual(issues(referenceShapeProblems(evidence({ top: 0, height: 600, form: false, bar: 0 }), { page: home, components, viewport: 'desktop' })), ['hero_height']);
  assert.deepEqual(referenceShapeProblems(evidence({ top: 0, height: 900, form: false, bar: 0 }), { page: home, components, viewport: 'desktop' }), []);
  // A phone keeps the screen under its header and over the enquiry bar.
  assert.deepEqual(referenceShapeProblems(evidence({ top: 82, height: 700, form: false, bar: 62 }, [], 844, 390), { page: home, components, viewport: 'mobile' }), []);
  // The FAQ page goes by the about page; a hero that holds a form may run taller.
  assert.deepEqual(issues(referenceShapeProblems(evidence({ top: 0, height: 360, form: false, bar: 0 }), { page: { route: '/faq/', pageType: 'general' }, components, viewport: 'desktop' })), ['hero_height']);
  assert.deepEqual(referenceShapeProblems(evidence({ top: 0, height: 1347, form: true, bar: 0 }), { page: { route: '/faq/', pageType: 'general' }, components, viewport: 'desktop' }), []);
  // Walls: 1425x713 across the page fails; 1200x568 in the content's width passes; a phone's 4:3 too.
  assert.deepEqual(issues(referenceShapeProblems(evidence(null, [{ id: 'media-module-budget-1', width: 1425, height: 713 }]), { page: home, components, viewport: 'desktop' })), ['wall_shape']);
  assert.deepEqual(referenceShapeProblems(evidence(null, [{ id: 'media-module-budget-1', width: 1200, height: 568 }]), { page: home, components, viewport: 'desktop' }), []);
  assert.deepEqual(referenceShapeProblems(evidence(null, [{ id: 'media-module-budget-1', width: 358, height: 268 }], 844, 390), { page: home, components, viewport: 'mobile' }), []);
});

test("a page type with a capture takes the capture's first screen alone; one that opens on no band has no height, nor another type's (2026-11-20)", async () => {
  // Tapa Works' reference about page: copy beside a photo on the page's own surface, no band at any width; the live
  // measure's first section ran 1715px (copy, photo and figures down to the next heading).
  const sections = [{ decision: 'figure', height: 1715, tablet: { height: 1149 }, phone: { height: 996 } }];
  assert.deepEqual(heroHeightsFrom({ band: false }, sections), { band: false });
  assert.deepEqual(heroHeightsFrom({ desktop: { height: 895, share: 0.895 } }, sections), { desktop: { height: 895, share: 0.895 } }, 'no width filled from the live measure');
  assert.deepEqual(heroHeightsFrom(null, sections).desktop, { height: 1715, share: 1.715 }, 'the live measure only without a capture');
  const components = withCapture({ heroByPageType: {}, pageTypes: {} }, { pages: [{ pageType: 'about', modules: {}, heroHeights: { band: false } }, { pageType: 'solution', modules: {}, heroHeights: { desktop: { height: 895, share: 0.895 } } }] }, null);
  assert.deepEqual(components.heroHeights.about, { band: false });
  assert.equal(heroHeightsFor('about', components), null);
  assert.equal(heroHeightsFor('general', components), null, 'the general page goes by the about page, not by the solution page');
  assert.equal(heroHeightsFor('solution', components).desktop.height, 895);
  assert.equal(heroHeightStyle(heroHeightsFor('general', components)), null);
  // Read from the capture folder: views without a band are { band: false }; no view at all is null.
  const root = await mkdtemp(join(tmpdir(), 'hero-capture-'));
  const view = (elements) => ({ viewport: { width: 1440, height: 1000 }, document: { scrollHeight: 6000 }, elements: [{ selector: '', tag: 'html', attributes: {}, rect: { x: 0, y: 0, width: 1440, height: 6000 }, styles: { display: 'block' } }, ...elements] });
  const dir = join(root, 'docs/research/reference-pages/about/raw');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'desktop-1440.json'), JSON.stringify(view([])));
  assert.deepEqual(await capturedHeroHeights(root, 'about'), { band: false });
  assert.equal(await capturedHeroHeights(root, 'contact'), null);
  // A hero the template does not size by the reference (a split hero: no data-hero-height) is not held to it.
  const split = { viewportHeight: 1024, viewportWidth: 768, pageWidth: 768, heroShape: { top: 80, height: 999, form: false, bar: 61, photo: true, sized: false }, wallShapes: [] };
  const solution = { heroHeights: { solution: { desktop: { height: 735, share: 0.735 }, tablet: { height: 735, share: 0.718 } } } };
  assert.deepEqual(referenceShapeProblems(split, { page: { route: '/product-development/', pageType: 'solution' }, components: solution, viewport: 'tablet' }), []);
  assert.deepEqual(referenceShapeProblems({ ...split, heroShape: { ...split.heroShape, sized: true } }, { page: { route: '/product-development/', pageType: 'solution' }, components: solution, viewport: 'tablet' }).map((problem) => problem.issue), ['hero_height']);
  // PageHero.astro marks the overlay hero only; the measure reads the mark.
  assert.deepEqual([...SIZED_HERO_VARIANTS], ['media-overlay']);
  const measure = await source('scripts/lib/usability-checks.mjs');
  assert.match(measure, /sized: main\.querySelector\('\.page-hero'\)\.hasAttribute\('data-hero-height'\)/);
});
