import assert from 'node:assert/strict';
import test from 'node:test';

import { captureHero, colourAlpha } from '../lib/capture-hero.mjs';
import { referenceShapeProblems } from '../lib/usability-checks.mjs';
import { VIEWPORTS as REVIEW_VIEWPORTS, judgeReviews, measuredFindings, openFindings, minorFindings, pairSegments } from '../design-review.mjs';
import { REFERENCE_VIEWPORTS } from '../capture-reference.mjs';
import { VIEWPORTS as AUDIT_VIEWPORTS } from '../audit-authoring-layout.mjs';

// A captured element as capture-reference.mjs extractPage writes it.
const STYLE = { display: 'block', position: 'static', visibility: 'visible', opacity: '1', 'background-image': 'none', 'background-color': 'rgba(0, 0, 0, 0)' };
const node = (selector, tag, [x, y, width, height], styles = {}, attributes = {}) => ({ selector, tag, attributes, directText: '', rect: { x, y, width, height }, styles: { ...STYLE, ...styles } });
const page = (viewport, elements, scrollHeight = 8000) => ({ viewport, document: { scrollHeight }, elements: [node('', 'html', [0, 0, viewport.width, scrollHeight]), node('body', 'body', [0, 0, viewport.width, scrollHeight]), ...elements] });

test("the reference's first screen is read from the capture's rects: a video under the header, a spacer before a photo band, a phone's stacked band (owner 2026-11-18)", () => {
  const desktop = { width: 1440, height: 1000 };
  // hometeamluxuryrentals.com's home: an announcement bar and a header over a 1440x1000 video from y=40; a fixed
  // pop-up and a page wrapper of the whole content are no band.
  const home = page(desktop, [
    node('body > div:nth-of-type(1)', 'div', [0, 0, 1440, 170], {}, { class: 'dmHeaderContainer' }),
    node('body > div:nth-of-type(1) > div', 'div', [0, 0, 1440, 40], { 'background-color': 'rgb(0, 0, 0)' }),
    node('body > div:nth-of-type(2)', 'div', [0, 10, 1440, 1000], { position: 'fixed', 'background-color': 'rgb(245, 245, 245)' }),
    node('body > div:nth-of-type(3)', 'div', [0, 40, 1440, 7700], { 'background-color': 'rgb(255, 255, 255)' }),
    node('body > div:nth-of-type(3) > div', 'div', [0, 40, 1440, 1000]),
    node('body > div:nth-of-type(3) > div > video', 'video', [0, 40, 1440, 1000]),
    node('body > div:nth-of-type(3) > section', 'section', [0, 1274, 1440, 1100], { 'background-color': 'rgb(0, 0, 0)' }),
  ]);
  assert.deepEqual(captureHero(home), { top: 40, height: 1000, share: 1 });
  // The contact page: its photo band of 412px under a 159px header.
  const contact = page(desktop, [
    node('body > div:nth-of-type(1)', 'div', [0, 0, 1440, 159], {}, { class: 'dmHeaderContainer' }),
    node('body > div:nth-of-type(2)', 'div', [0, 159, 1440, 412], { 'background-image': 'url("contact.jpg")' }),
  ], 3281);
  assert.deepEqual(captureHero(contact), { top: 159, height: 412, share: 0.412 });
  // The service page on a phone: the photo and its copy stacked in one black band, taller than the screen.
  const phone = page({ width: 390, height: 844 }, [
    node('body > div:nth-of-type(1)', 'div', [0, 0, 390, 62], {}, { class: 'hamburger-header-container' }),
    node('body > div:nth-of-type(2)', 'div', [0, 62, 390, 1742], { 'background-color': 'rgb(0, 0, 0)' }),
    node('body > div:nth-of-type(2) > img', 'img', [15, 67, 360, 357]),
  ], 18456);
  assert.deepEqual(captureHero(phone), { top: 62, height: 1742, share: 2.064 });
  // A page that opens on text on its own surface has no band to size.
  assert.equal(captureHero(page(desktop, [node('body > div', 'div', [0, 0, 1440, 100], {}, { class: 'dmHeaderContainer' }), node('body > main', 'main', [0, 100, 1440, 600])])), null);
});

test("the home's 600px first screen against the reference's 1000 is a P1 the design gate holds on, which no waiver, repair note or scope lets go", () => {
  const components = { heroHeights: { home: { desktop: { height: 1000, share: 1 } } }, photoWall: { fit: 'container', ratio: '2.11 / 1' } };
  const home = { route: '/', pageType: 'home' };
  // Staylumen's home before the fix: its header over the photo, the hero 600px at 1440x1000, six walls 1440px across.
  const evidence = { viewportHeight: 1000, viewportWidth: 1440, pageWidth: 1440, heroShape: { top: 0, height: 600, form: false, bar: 0, photo: true, sized: true }, wallShapes: [{ id: 'media-module-budget-1', left: 0, width: 1440, height: 720 }] };
  const problems = referenceShapeProblems(evidence, { page: home, components, viewport: 'desktop' });
  assert.deepEqual(problems.map((problem) => [problem.issue, problem.block]), [['hero_height', 'hero'], ['wall_shape', 'media-module-budget-1']]);
  assert.match(problems[0].detail, /600px at desktop \(60% of the screen's height\) where the reference's for home is 1000px \(100%/);
  // The layout audit's failures become the gate's measured P1.
  const audit = { failures: [...problems.map((problem) => ({ route: '/', viewport: 'desktop', ...problem })), { route: '/', viewport: 'desktop', issue: 'tap_target' }] };
  const measured = measuredFindings(audit);
  assert.deepEqual(measured.map((finding) => [finding.severity, finding.scope, finding.block]), [['P1', 'site', 'hero'], ['P1', 'site', 'media-module-budget-1']]);
  // Every review passed with nothing open; a waiver and a repair's "Template gaps" line name the hero.
  const manifest = { pages: [{ key: 'home', pageType: 'home', route: '/', shots: 's1' }] };
  const reviews = { home: { shots: 's1', findings: [{ block: 'hero', severity: 'P1', scope: 'template', issue: 'the hero is shorter than the competitor\'s' }] }, 'home.buyer': { shots: 's1', findings: [] } };
  const waivers = [{ block: 'hero', why: 'template gap', by: 'repair', at: '2026-11-18' }, { block: 'media-module-budget-1', why: 'accepted', by: 'repair', at: '2026-11-18' }];
  const listed = [{ section: 'Template gaps', line: '- / `hero`: hero height is a template gap' }];
  const before = judgeReviews(manifest, reviews, waivers, listed, { buyer: false });
  assert.equal(before.status, 'passed', 'without the measure the review let it pass');
  const after = judgeReviews(manifest, reviews, waivers, listed, { buyer: false, measured });
  assert.equal(after.status, 'open');
  assert.deepEqual(openFindings(after.findings).map((finding) => finding.block), ['hero', 'media-module-budget-1']);
  assert.ok(openFindings(after.findings).every((finding) => !finding.resolution));
  assert.ok(minorFindings(after.findings).every((finding) => !finding.measured), 'a measured finding is not a small one');
  // At the reference's height (the screen the cap), in the content's width: nothing.
  const mended = { ...evidence, heroShape: { ...evidence.heroShape, height: 1000 }, wallShapes: [{ id: 'media-module-budget-1', left: 120, width: 1200, height: 568 }] };
  assert.deepEqual(referenceShapeProblems(mended, { page: home, components, viewport: 'desktop' }), []);
});

test("a wall is across the page edge to edge, not by a share of the screen; a text hero takes no height", () => {
  const components = { heroHeights: { about: { desktop: { height: 572, share: 0.572 }, tablet: { height: 644, share: 0.629 } } }, photoWall: { fit: 'container', ratio: '2.11 / 1' } };
  const home = { route: '/', pageType: 'home' };
  const tablet = (wallShapes) => ({ viewportHeight: 1024, viewportWidth: 768, pageWidth: 768, heroShape: null, wallShapes });
  // A tablet's content width is 714 of 768px: inside the gutters at the reference's shape.
  assert.deepEqual(referenceShapeProblems(tablet([{ id: 'media-module-budget-1', left: 27, width: 714, height: 338 }]), { page: home, components, viewport: 'tablet' }), []);
  assert.deepEqual(referenceShapeProblems(tablet([{ id: 'media-module-budget-1', left: 0, width: 768, height: 384 }]), { page: home, components, viewport: 'tablet' }).map((problem) => problem.issue), ['wall_shape']);
  // A phone's wall edge to edge where the reference's phone photos keep the gutters.
  const phone = { viewportHeight: 844, viewportWidth: 390, pageWidth: 390, heroShape: null, wallShapes: [{ id: 'media-module-budget-1', left: 0, width: 390, height: 293 }] };
  assert.deepEqual(referenceShapeProblems(phone, { page: home, components, viewport: 'mobile' }).map((problem) => problem.issue), ['wall_shape']);
  // The legal page's text hero (no photo) is not held to the about page's photo band.
  const legal = { viewportHeight: 1000, viewportWidth: 1440, pageWidth: 1440, heroShape: { top: 80, height: 207, form: false, bar: 0, photo: false, sized: true }, wallShapes: [] };
  assert.deepEqual(referenceShapeProblems(legal, { page: { route: '/privacy-policy/', pageType: 'privacy' }, components, viewport: 'desktop' }), []);
  assert.deepEqual(referenceShapeProblems({ ...legal, heroShape: { ...legal.heroShape, photo: true } }, { page: { route: '/privacy-policy/', pageType: 'privacy' }, components, viewport: 'desktop' }).map((problem) => problem.issue), ['hero_height']);
});

test("the review's side-by-side images set both pages at one viewport's width and one scale", async () => {
  // The review shoots ours at the reference capture's own desktop and phone screens, and the audit at all three.
  for (const viewport of REVIEW_VIEWPORTS) assert.ok(REFERENCE_VIEWPORTS.some((reference) => reference.width === viewport.width && reference.height === viewport.height), viewport.id);
  assert.deepEqual(AUDIT_VIEWPORTS.map(({ width, height }) => [width, height]), REFERENCE_VIEWPORTS.map(({ width, height }) => [width, height]));
  const { default: sharp } = await import('sharp');
  const image = (width, height, colour) => sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();
  const phone = REVIEW_VIEWPORTS.find((viewport) => viewport.id === 'mobile');
  // Staylumen's reference "phone" shot laid out at 768px beside our 390px page: each at one CSS pixel a pixel, the
  // wider shot wider, not shrunk to the column (its type at half the size of ours).
  const warn = console.warn;
  console.warn = () => {};
  try {
    const [segment] = await pairSegments(sharp, await image(768, 1000, '#000000'), await image(390, 1000, '#ff0000'), phone);
    const { width } = await sharp(segment).metadata();
    assert.equal(width, Math.round((768 * phone.column) / phone.width) + 24 + Math.round((390 * phone.column) / phone.width));
  } finally {
    console.warn = warn;
  }
  // The desktop's: both 1440px shots at the 720px column, as before.
  const desktop = REVIEW_VIEWPORTS.find((viewport) => viewport.id === 'desktop');
  const [wide] = await pairSegments(sharp, await image(1440, 400, '#000000'), await image(1440, 400, '#ff0000'), desktop);
  assert.equal((await sharp(wide).metadata()).width, desktop.column * 2 + 24);
});

test("a band painted in any CSS colour is the reference's first screen: oklch, lab, color(), hex; a transparent one is not (2026-11-20)", () => {
  assert.equal(colourAlpha('oklch(0.185 0 0)'), 1);
  assert.equal(colourAlpha('oklch(0 0 0 / 0)'), 0);
  assert.equal(colourAlpha('lab(20% 0 0 / 50%)'), 0.5);
  assert.equal(colourAlpha('color(srgb 0.1 0.1 0.1 / 0.8)'), 0.8);
  assert.equal(colourAlpha('rgba(0, 0, 0, 0)'), 0);
  assert.equal(colourAlpha('rgb(0 0 0 / 0.45)'), 0.45);
  assert.equal(colourAlpha('hsla(0, 0%, 0%, 0.7)'), 0.7);
  assert.equal(colourAlpha('#111'), 1);
  assert.equal(colourAlpha('#11111100'), 0);
  assert.equal(colourAlpha('black'), 1);
  assert.equal(colourAlpha('transparent'), 0);
  assert.equal(colourAlpha(undefined), 0);
  // A Tailwind v4 reference's service page: a dark oklch section under the header, taller than the screen on a tablet.
  const tablet = { width: 768, height: 1024 };
  const band = (colour) => page(tablet, [
    node('body > header', 'header', [0, 0, 768, 80], { 'background-color': 'oklch(1 0 0)' }),
    node('body > main > section', 'section', [0, 80, 768, 1378], { 'background-color': colour }),
  ], 9000);
  assert.deepEqual(captureHero(band('oklch(0.185 0 0)')), { top: 80, height: 1378, share: 1.346 });
  assert.equal(captureHero(band('oklch(0 0 0 / 0)')), null);
});
