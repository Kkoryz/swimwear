import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CAPS_SPREAD, DEFAULT_CHAR_EM, HERO_FIT, POST_TITLE_FIT, UNKNOWN_CHAR_EM, WRAP_MARGIN, charEmFor, familyKind, fitHeading, headingFitStyle, headingFitVars, headingLineIssues, lineCapacity, predictLines, wrapEmFor, wrapLines } from '../lib/heading-fit.mjs';
import { heroTextAverage, withCapture } from '../scaffold-placeholder-pages.mjs';

const HOME = 'A hotel management company for independent hotels and motels';

test('a title wraps greedily, and its line capacity is the fewest characters a line that keep it to its lines', () => {
  assert.deepEqual(wrapLines(HOME, 30), ['A hotel management company for', 'independent hotels and motels']);
  assert.equal(lineCapacity(HOME, 2), 30);
  assert.equal(wrapLines(HOME, 29).length, 3, 'one character less takes a third line');
  assert.equal(lineCapacity(HOME, 4), 18);
  assert.equal(lineCapacity('ABOUT', 2), 5, 'a single word is its own length');
  assert.equal(lineCapacity('', 2), 0);
  assert.equal(lineCapacity('Supercalifragilistic word', 1), 25);
});

test('the average character width: the competitor\'s measure when long enough, else its family and case, else the widest', () => {
  assert.equal(charEmFor({ charEm: 0.62, chars: 40, family: '"Josefin Sans", sans-serif', textTransform: 'uppercase' }), 0.62);
  assert.equal(charEmFor({ charEm: 0.5, chars: 5, family: '"Josefin Sans", sans-serif', textTransform: 'uppercase' }), DEFAULT_CHAR_EM.sans.upper, '"ABOUT" is too short a sample');
  assert.equal(charEmFor({ family: 'Georgia, serif', textTransform: 'none' }), DEFAULT_CHAR_EM.serif.mixed);
  assert.equal(charEmFor({ charEm: 3, chars: 50, family: 'Inter' }), DEFAULT_CHAR_EM.sans.mixed, 'a measure out of range is ignored');
  assert.equal(charEmFor(null), UNKNOWN_CHAR_EM);
  assert.equal(charEmFor(undefined), UNKNOWN_CHAR_EM);
  assert.equal(wrapEmFor({ charEm: 0.62, chars: 40, family: '"Josefin Sans", sans-serif', textTransform: 'uppercase' }), 0.62 * CAPS_SPREAD, 'capitals wrap wider than their average');
  assert.equal(wrapEmFor({ charEm: 0.52, chars: 40, family: 'Inter' }), 0.52, 'lower case wraps on its average');
  assert.equal(familyKind('"Source Sans 3", Arial'), 'sans');
  assert.equal(familyKind('"Source Serif 4", Georgia'), 'serif');
  assert.equal(familyKind('freight-text-pro, Helvetica'), 'serif');
  assert.equal(familyKind('"JetBrains Mono"'), 'mono');
  assert.equal(familyKind(''), null);
});

test('a long title gets the largest size within two desktop lines under the competitor\'s size, its column widening to the floor', () => {
  const charEm = 0.68;
  // 64px in a 736px column: the built site shows 5 lines (the model, at the conservative 0.68em, says 6); the fit
  // keeps it to two.
  assert.equal(predictLines(HOME, { columnPx: 736, sizePx: 64, charEm }), 6);
  const desktop = fitHeading(HOME, { columnPx: 736, containerPx: 1110, capPx: 64, minPx: HERO_FIT.desktop.minPx, maxLines: 2, charEm });
  assert.equal(desktop.sizePx, 36, 'the floor: 736px would need 34px');
  assert.ok(desktop.columnPx > 736 && desktop.columnPx < 1110, `the column widens only as far as the floor needs (${desktop.columnPx})`);
  assert.equal(desktop.lines, 2);
  assert.ok(desktop.fits);
  // A short title keeps the competitor's size and column; a middle one keeps the column at a size between.
  const short = fitHeading('Hotel Revenue Management', { columnPx: 736, capPx: 64, minPx: 36, maxLines: 2, charEm });
  assert.deepEqual([short.sizePx, short.columnPx, short.lines], [64, 736, 2]);
  const middle = fitHeading('Hotel Operations Management Services', { columnPx: 736, containerPx: 1110, capPx: 64, minPx: 36, maxLines: 2, charEm });
  assert.equal(middle.columnPx, 736);
  assert.ok(middle.sizePx > 36 && middle.sizePx < 64 && middle.lines <= 2, JSON.stringify(middle));
  // A competitor size under the floor stays the ceiling.
  assert.equal(fitHeading(HOME, { columnPx: 360, capPx: 32, minPx: 36, maxLines: 4, charEm }).sizePx, 32);
  // A title too long for the container at the floor does not fit (the audit fails it): no smaller size is invented.
  const long = fitHeading(`${HOME} ${HOME} ${HOME}`, { columnPx: 736, containerPx: 1110, capPx: 64, minPx: 36, maxLines: 2, charEm });
  assert.deepEqual([long.sizePx, long.columnPx, long.fits], [36, 1110, false]);
});

test('on a phone the same title keeps to four lines', () => {
  const phone = fitHeading(HOME, { columnPx: 360, capPx: 32, minPx: HERO_FIT.phone.minPx, maxLines: HERO_FIT.phone.lines, charEm: 0.68 });
  assert.ok(phone.sizePx >= 24 && phone.sizePx < 32, JSON.stringify(phone));
  assert.ok(phone.lines <= 4);
});

test('the renderer writes the line widths in ems and the floors; the stylesheet divides the box width by them', () => {
  const vars = headingFitVars(HOME, { charEm: 0.68 });
  assert.equal(Number(vars['--fit-ems-desktop']), Math.round(30 * 0.68 * WRAP_MARGIN * 1000) / 1000);
  assert.equal(Number(vars['--fit-ems-phone']), Math.round(18 * 0.68 * WRAP_MARGIN * 1000) / 1000);
  assert.deepEqual([vars['--fit-min-desktop'], vars['--fit-min-phone']], ['36px', '24px']);
  assert.equal(headingFitVars('  ', { charEm: 0.68 }), null);
  assert.equal(headingFitStyle('', { charEm: 0.68 }), undefined);
  assert.match(headingFitStyle(HOME, { charEm: 0.68, fit: POST_TITLE_FIT }), /^--fit-ems-desktop: [\d.]+; --fit-ems-phone: [\d.]+; --fit-min-desktop: 28px; --fit-min-phone: 24px$/);
});

test('the stylesheet takes the fit: the competitor size the ceiling, no !important', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../src/styles/template.css', import.meta.url), 'utf8');
  assert.match(css, /\.page-hero h1 \{[^}]*font-size: min\(var\(--size-hero\), var\(--heading-fit, var\(--size-hero\)\)\)/);
  assert.match(css, /\[data-heading-fit\] \{ container-type: inline-size;[^}]*--heading-fit: max\(var\(--fit-floor, var\(--fit-min\)\), 100cqi \/ var\(--fit-ems\)\)/);
  // A hero title's floor comes down to a pixel over the section headings when its two lines need it (site14 2026-11-17).
  assert.match(css, /\.page-hero__copy\[data-heading-fit\] \{[^}]*--fit-floor: max\(var\(--fit-min-desktop\), min\(var\(--fit-above\), max\(calc\(var\(--size-display\) \+ 1px\), 100cqi \/ var\(--fit-ems\)\)\)\)/);
  assert.match(css, /@media \(max-width: 767px\) \{ \[data-heading-fit\] \{ --fit-ems: var\(--fit-ems-phone\); --fit-min: max\(var\(--fit-min-phone\), var\(--fit-above, 0px\)\); --fit-above-step: 0; \} \}/, 'on a phone a title keeps its four lines');
  assert.match(css, /\.block h2 \{[^}]*font-size: min\(var\(--size-display\), var\(--section-cap, var\(--size-display\)\)\)/, 'section headings come down to the title on a phone');
  assert.match(css, /main\[style\*="--title-ems-phone"\] \{ --section-cap: calc\(max\(var\(--title-min-phone, 24px\), \(100vw - 2 \* var\(--gutter\)\) \/ var\(--title-ems-phone\)\) \* 0\.95\); \}/);
  assert.match(css, /\.page-hero__copy\[data-heading-fit\] \{ --fit-above: calc\(var\(--size-display\) \* var\(--fit-above-step, 1\.125\)\);/, 'a page title keeps a step over the section headings');
  assert.doesNotMatch(css.match(/\[data-heading-fit\][^\n]*/g).join('\n'), /!important/);
});

test('the audit fails a title over two desktop or four phone lines, and warns on a section heading over three', () => {
  const result = (viewport, h1, sections = []) => ({ route: '/', viewport, headingLines: { h1: [{ text: 'T', lines: h1 }], sections: sections.map((lines, index) => ({ text: `S${index}`, lines })) } });
  assert.deepEqual(headingLineIssues(result('desktop', 2, [3])), { failures: [], warnings: [] });
  assert.deepEqual(headingLineIssues(result('desktop', 3)).failures, [{ route: '/', viewport: 'desktop', issue: 'h1_lines', value: 'T', lines: 3, maximum: 2 }]);
  assert.deepEqual(headingLineIssues(result('mobile', 4)).failures, []);
  assert.equal(headingLineIssues(result('mobile', 5)).failures[0].maximum, 4);
  assert.deepEqual(headingLineIssues(result('tablet', 6, [5])), { failures: [], warnings: [] }, 'tablet is held to neither');
  assert.deepEqual(headingLineIssues(result('desktop', 1, [4, 2])).warnings, [{ route: '/', viewport: 'desktop', issue: 'section_heading_lines', value: 'S0', lines: 4, maximum: 3 }]);
  assert.deepEqual(headingLineIssues({ route: '/', viewport: 'desktop' }), { failures: [], warnings: [] }, 'no measure (an older cached result): nothing to judge');
});

test('the audit fails a page title smaller than a section heading', () => {
  const result = (viewport, h1, sections) => ({ route: '/', viewport, headingLines: { h1: [{ text: 'T', lines: 2, fontPx: h1 }], sections: sections.map((fontPx, index) => ({ text: `S${index}`, lines: 1, fontPx })) } });
  assert.deepEqual(headingLineIssues(result('desktop', 36, [32, 40])).failures, [{ route: '/', viewport: 'desktop', issue: 'heading_scale_inverted', value: 'T', fontPx: 36, sectionFontPx: 40, section: 'S1' }]);
  assert.deepEqual(headingLineIssues(result('mobile', 28, [28])).failures, [], 'equal is not upside down');
  assert.deepEqual(headingLineIssues(result('desktop', 45, [40])).failures, []);
});

test('the capture averages the competitor\'s titles into heroText and keeps an earlier measure when it finds none', () => {
  const average = heroTextAverage([{ family: '"Josefin Sans", Helvetica', textTransform: 'uppercase', chars: 5, ems: 3.2 }, null, { family: '"Josefin Sans", Helvetica', textTransform: 'uppercase', chars: 10, ems: 6.4 }]);
  assert.deepEqual(average, { family: '"Josefin Sans", Helvetica', textTransform: 'uppercase', chars: 15, charEm: 0.64 });
  assert.equal(heroTextAverage([null, null]), null);
  assert.deepEqual(withCapture({ pageTypes: {} }, { pages: [], heroText: average }, null).heroText, average);
  assert.deepEqual(withCapture({ pageTypes: {}, heroText: average }, { pages: [], heroText: null }, null).heroText, average);
  assert.equal('heroText' in withCapture({ pageTypes: {} }, { pages: [] }, null), false);
  // The words on each page type's hero photo, by page type; a page whose title is not on a photo (null) gives none.
  // swimwearbali.com 2026-11-17: home 8 words on its photo, about none, solution 53, the manufacturer's title under its
  // banner (not on it); averaged over all pages the hero took 27, so a 17-word home lead stayed on the photo.
  const byType = heroTextAverage([{ pageType: 'home', family: 'A', textTransform: 'none', chars: 20, ems: 12, leadWords: 8 }, { pageType: 'about', family: 'A', textTransform: 'none', chars: 20, ems: 12, leadWords: 0 }, { pageType: 'solution', family: 'A', textTransform: 'none', chars: 20, ems: 12, leadWords: 53 }, { pageType: 'product_manufacturer', family: 'A', textTransform: 'none', chars: 20, ems: 12, leadWords: null }]);
  assert.deepEqual([byType.leadWords, byType.leadWordsByPageType], [20, { home: 8, about: 0, solution: 53 }]);
});

test("an article's title may run one line longer than a page's", async () => {
  const { headingLineIssues } = await import('../lib/heading-fit.mjs');
  const result = { route: '/blog/a/', viewport: 'desktop', headingLines: { h1: [{ text: 'A long question', lines: 3 }], sections: [] } };
  assert.equal(headingLineIssues(result).failures.length, 1);
  assert.equal(headingLineIssues(result, { article: true }).failures.length, 0);
});

test('a hero lead stays under its title whatever the competitor\'s hero carries (site13 claude-seo audit 2026-11-17, M-10)', async () => {
  const fit = await import('../lib/heading-fit.mjs');
  assert.equal('heroLeadShown' in fit || 'leadBelowHero' in fit || 'HERO_LEAD_SLACK' in fit, false);
  const hero = await readFile(new URL('../../src/components/blocks/PageHero.astro', import.meta.url), 'utf8');
  assert.match(hero, /<h1>\{page\.hero\.heading\}<\/h1>[\s\S]*?\{page\.hero\.lead\?\.map\(\(paragraph\) => <p class="page-hero__lead">/);
  for (const view of ['src/components/blocks/PageView.astro', 'src/components/blog/BlogHubView.astro']) assert.doesNotMatch(await readFile(new URL(`../../${view}`, import.meta.url), 'utf8'), /page-lead|leadBelow/);
});

test("a split hero's title may take three lines on a desktop, half the row being its column; a full-width title two (aloha 2026-11-17)", async () => {
  const { headingLineIssues: issues, SPLIT_HERO_FIT: split } = await import('../lib/heading-fit.mjs');
  const result = (h1, viewport = 'desktop') => ({ route: '/x/', viewport, headingLines: { h1: [h1], sections: [] } });
  assert.equal(split.desktop.lines, 3);
  assert.deepEqual(issues(result({ text: 'T', lines: 3, fontPx: 54, split: true })).failures, []);
  assert.equal(issues(result({ text: 'T', lines: 4, fontPx: 54, split: true })).failures[0].maximum, 3);
  assert.equal(issues(result({ text: 'T', lines: 3, fontPx: 54 })).failures[0].issue, 'h1_lines');
  assert.deepEqual(issues(result({ text: 'T', lines: 4, fontPx: 30, split: true }, 'mobile')).failures, []);
});

test('a title the form beside it leaves too little room for (two lines at the floor) takes the hero\'s whole row, the form under the copy', async () => {
  const { FORM_HERO_TITLE_PX, titleNeedsRow } = await import('../lib/heading-fit.mjs');
  // Staylumen's Scottsdale page, 2026-11-16: its 68-character title ran three lines in the 7/12 column beside the form.
  const charEm = wrapEmFor({ family: 'Montserrat, Arial, sans-serif', textTransform: 'none' });
  assert.ok(FORM_HERO_TITLE_PX > 600 && FORM_HERO_TITLE_PX < 700);
  assert.equal(titleNeedsRow('Full-Service Vacation Rental Management Scottsdale Owners Can Rely On', { charEm }), true);
  assert.equal(titleNeedsRow('Vacation Rental Management in San Diego', { charEm }), false);
  assert.equal(titleNeedsRow('', { charEm }), false);
});

test("a sans title with no measure of its own is fitted wide enough for Montserrat bold (Staylumen 2026-11-17)", async () => {
  const { charEmFor, lineEms, HERO_FIT } = await import('../lib/heading-fit.mjs');
  const charEm = charEmFor({ charEm: 1.228, chars: 192, family: 'Montserrat, Arial, sans-serif', textTransform: 'none' });
  // "Airbnb Booking Management" measured 15.58em in Montserrat 700: the two-line width must hold it.
  assert.ok(lineEms('Airbnb Booking Management With 24/7 Guest Messaging', HERO_FIT.desktop.lines, charEm) >= 15.58);
});

test('a title in a face the template knows wraps by its real widths, in the face the treatment sets for its page type', async () => {
  const { heroFontFromCss, lineEms, lineWidthEms, predictLines, textEms, titleGlyphs, titleMetrics, wrapEmFor, wrapLinesEm } = await import('../lib/heading-fit.mjs');
  const css = [
    ':root:root { --font-body: Montserrat, Arial, sans-serif; --font-hero: Marcellus, Georgia, serif; }',
    "main:is([data-page-type='solution'], [data-page-type='place']) .page-hero { --font-hero: Montserrat, Arial, sans-serif; --weight-heading: 700; }",
    "main[data-page-type='home'] .page-hero { --weight-heading: 400; }",
    "main[data-page-type='general'][data-hero-photo] .page-hero { --font-hero: var(--font-body); --weight-heading: 600; }",
    "main[data-page-type='about'] .page-hero h1 { --font-hero: Montserrat; }",
    "@media (max-width: 767px) { main[data-page-type='home'] .page-hero { --font-hero: Montserrat; } }",
  ].join('\n');
  assert.deepEqual(heroFontFromCss(css, 'place'), { family: 'Montserrat', weight: 700 });
  assert.deepEqual(heroFontFromCss(css, 'home'), { family: 'Marcellus', weight: 400 }, 'the root token; a media query is left out');
  assert.deepEqual(heroFontFromCss(css, 'general'), { family: 'Montserrat', weight: 600 }, 'a var() of a root token is read through');
  assert.deepEqual(heroFontFromCss(css, 'about'), { family: 'Marcellus', weight: null }, 'a rule for a part inside the hero is not the hero');
  // Staylumen's Nashville title (2026-11-18): four phone lines planned at the 0.6em average, five rendered in Montserrat 700.
  const nashville = 'Airbnb Management Nashville: Full-Service Care for Your Rental';
  const bold = titleGlyphs('"Montserrat", sans-serif', 700);
  assert.equal(bold.weight, 700);
  assert.equal(titleGlyphs('Montserrat', 650).weight, 600, 'the nearest weight measured (a tie goes to the lighter)');
  assert.ok(textEms('Airbnb Management', bold) > 10.8, 'its first line runs 0.64em a letter');
  const phone = lineWidthEms(nashville, 4, bold);
  assert.ok(phone >= textEms('Airbnb Management', bold));
  assert.equal(wrapLinesEm(nashville, phone, bold).length, 4);
  assert.ok(wrapLinesEm(nashville, phone - 0.01, bold).length > 4, 'the narrowest width that keeps four lines');
  const sizePx = 358 / lineEms(nashville, 4, bold);
  assert.ok(sizePx < 358 / lineEms(nashville, 4, 0.6), 'smaller than the average fitted it');
  assert.equal(predictLines(nashville, { columnPx: 358, sizePx, charEm: bold }), 4);
  assert.ok(lineEms(nashville, 4, bold) >= textEms('Airbnb Management', bold) * 1.05 - 0.001, 'the margin over the widest line');
  // The page types the treatment sets in a face the template does not know keep the competitor's average.
  assert.equal(titleMetrics({ css, pageType: 'home', heroText: { family: 'Marcellus' } }), wrapEmFor({ family: 'Marcellus' }));
  assert.equal(titleMetrics({ css: '', pageType: 'place', heroText: null }), wrapEmFor(null));
  assert.equal(titleMetrics({ css, pageType: 'place', heroText: null }).family, 'Montserrat');
  assert.equal(titleGlyphs('Marcellus'), null);
  assert.ok(textEms('ABC', titleGlyphs('Montserrat', 700, { upper: true })) === textEms('abc', titleGlyphs('Montserrat', 700, { upper: true })), 'a title set in capitals is measured in capitals');
});
