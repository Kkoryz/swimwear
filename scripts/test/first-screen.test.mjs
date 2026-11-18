import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { chromeCta, primaryCta, siteCta } from '../lib/primary-cta.mjs';
import { protectedOverrides, stripProtected } from '../lib/protected-rules.mjs';
import { FOLD_SCREENS, HERO_FOLD, STICKY_SHARE, foldProblems } from '../lib/visual-checks.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const screen = (size, parts) => ({ ...FOLD_SCREENS[size], ctas: [], bar: null, ...parts });

test('the first screens are the owner\'s: a 390×844 phone and a 1366×768 desktop (owner 2026-11-17, after claude-seo)', () => {
  assert.deepEqual(FOLD_SCREENS, { mobile: { width: 390, height: 844 }, desktop: { width: 1366, height: 768 } });
  assert.equal(STICKY_SHARE, 0.12);
});

test('a title under a full-screen photo, below the first screen, fails, as the hotel site\'s did at y=904', () => {
  const hotel = screen('desktop', { h1: { top: 904, bottom: 1072, text: 'Hotel revenue management' }, ctas: [{ top: 1180, bottom: 1244, label: 'Get a free audit', where: 'hero', fixed: false }] });
  assert.deepEqual(foldProblems([hotel]).map((problem) => problem.issue), ['h1_below_fold', 'cta_below_fold']);
  assert.deepEqual(foldProblems([hotel])[0], { screen: '1366x768', issue: 'h1_below_fold', text: 'Hotel revenue management', bottom: 1072, fold: 768 });
  // The photo giving way lets the title up; the header's button does not hold the page's call (site12 claude-seo audit
  // 2026-11-17, V-1: the contact page's own button at y=745-809 of 768 passed on the header's at 30-90).
  const header = { top: 30, bottom: 90, label: 'Request a quote', where: 'header', fixed: false };
  const contact = { ...hotel, h1: { top: 503, bottom: 671, text: 'Contact Us' }, ctas: [header, { top: 745, bottom: 809, label: 'Request a quote', where: 'hero', fixed: false }] };
  assert.deepEqual(foldProblems([contact]).map((problem) => problem.issue), ['cta_below_fold']);
  assert.deepEqual(foldProblems([contact])[0], { screen: '1366x768', issue: 'cta_below_fold', label: 'Request a quote', top: 745, bottom: 809, where: 'hero', fold: 768 });
  const mended = { ...contact, ctas: [header, { top: 687, bottom: 751, label: 'Request a quote', where: 'hero', fixed: false }] };
  assert.deepEqual(foldProblems([mended]), []);
  // The swimwear product page (site13 M-14): the header's button at 15-64, the page's own at 763-807.
  const product = screen('desktop', { h1: { top: 624, bottom: 699, text: 'Private Label Women\'s Swimwear Manufacturer' }, ctas: [{ ...header, top: 15, bottom: 64 }, { top: 763, bottom: 807, label: 'Request a quote for women\'s swimwear', where: 'hero', fixed: false }] });
  assert.deepEqual(foldProblems([product]).map((problem) => problem.issue), ['cta_below_fold']);
});

test('a phone whose own button sits under the screen or the enquiry bar fails, the bar\'s button not standing in for it; the title clears the bar', () => {
  // The swimwear product page: a full phone photo, the title under it, the button below the screen.
  const swimwear = screen('mobile', { h1: { top: 698, bottom: 764, text: 'Bikini manufacturer' }, ctas: [{ top: 876, bottom: 920, label: 'Get a quote', where: 'hero', fixed: false }] });
  assert.deepEqual(foldProblems([swimwear]).map((problem) => problem.issue), ['cta_below_fold']);
  const bar = { top: 783, bottom: 844, height: 61, width: 390, target: 44 };
  const withBar = { ...swimwear, bar, ctas: [...swimwear.ctas, { top: 791, bottom: 835, label: 'Get a quote', where: 'bar', fixed: true }] };
  assert.deepEqual(foldProblems([withBar]).map((problem) => problem.issue), ['cta_below_fold']);
  // site13 M-14, bikini on a phone: the button at 792-836 is under the bar's top (783).
  const covered = { ...withBar, h1: { top: 614, bottom: 680, text: 'Bikini manufacturer' }, ctas: [{ top: 792, bottom: 836, label: 'Get a quote', where: 'hero', fixed: false }, withBar.ctas[1]] };
  assert.deepEqual(foldProblems([covered]).map((problem) => problem.issue), ['cta_below_fold']);
  const mended = { ...covered, ctas: [{ top: 723, bottom: 767, label: 'Get a quote', where: 'hero', fixed: false }, withBar.ctas[1]] };
  assert.deepEqual(foldProblems([mended]), []);
  // A title the bar covers is not in the first screen.
  assert.deepEqual(foldProblems([{ ...mended, h1: { top: 760, bottom: 800, text: 'T' } }]).map((problem) => problem.issue), ['h1_below_fold']);
  // The bar itself: under 12% of the screen, a 44px target (Modern Web Guidance).
  const tall = { ...withBar, bar: { ...bar, top: 724, height: 120, target: 40 } };
  assert.deepEqual(foldProblems([tall]).filter((problem) => problem.issue.startsWith('sticky')).map((problem) => problem.issue), ['sticky_bar_height', 'sticky_bar_target']);
});

test('a lead too long for the first screen is reported as Site Factory\'s (hero_lead_long), the call under it not failed on top of it', () => {
  const long = screen('desktop', { h1: { top: 480, bottom: 607, text: 'T' }, lead: { top: 619, bottom: 820 }, ctas: [{ top: 840, bottom: 904, label: 'Talk to us', where: 'hero', fixed: false }] });
  assert.deepEqual(foldProblems([long]), [{ screen: '1366x768', issue: 'hero_lead_long', bottom: 820, fold: 768 }]);
  // A lead that fits leaves the call to the layout.
  assert.deepEqual(foldProblems([{ ...long, lead: { top: 619, bottom: 687 } }]).map((problem) => problem.issue), ['cta_below_fold']);
});

test('a page with no call to action in its copy is held to its title only', () => {
  assert.deepEqual(foldProblems([screen('mobile', { h1: { top: 120, bottom: 160, text: 'Privacy' } })], { expectsCta: false }), []);
  assert.deepEqual(foldProblems([screen('mobile', { h1: null })], { expectsCta: false }).map((problem) => problem.issue), ['h1_below_fold']);
});

test('the primary call is the copy\'s own: the hero\'s, else the closing call\'s, never a link back to the page itself', () => {
  assert.deepEqual(primaryCta({ route: '/bikini/', hero: { heading: 'H', cta: { label: 'Get a quote', href: '/request-a-quote/' } }, blocks: [] }), { label: 'Get a quote', href: '/request-a-quote/' });
  assert.deepEqual(primaryCta({ route: '/blog/post/', hero: { heading: 'H' }, blocks: [{ type: 'cta', cta: { label: 'Talk to us', href: '/contact/' } }] }), { label: 'Talk to us', href: '/contact/' });
  assert.equal(primaryCta({ route: '/contact-us/', hero: { heading: 'H', cta: { label: 'Contact us', href: '/contact-us/' } }, blocks: [] }), null);
  assert.equal(primaryCta({ route: '/privacy/', hero: { heading: 'H', cta: { label: ' ', href: '/x/' } }, blocks: [] }), null);
});

test('the header and the bar show the site\'s one call, the home page\'s (a page\'s own runs too long for a header), the page\'s own where that leads to itself', () => {
  const page = (route, cta) => ({ route, hero: { heading: 'H', ...(cta ? { cta } : {}) }, blocks: [] });
  const pages = [page('/', { label: 'Request a quote', href: '/request-a-quote/' }), page('/bikini/', { label: 'Request a quote for bikinis', href: '/request-a-quote/' }), page('/request-a-quote/', { label: 'Contact us', href: '/contact-us/' })];
  assert.deepEqual(siteCta(pages), { label: 'Request a quote', href: '/request-a-quote/' });
  assert.deepEqual(chromeCta(pages[1], pages), { label: 'Request a quote', href: '/request-a-quote/' });
  assert.deepEqual(chromeCta(pages[2], pages), { label: 'Contact us', href: '/contact-us/' });
  // The page the call leads to, holding the form: the call keeps its words and goes to the form (Strandmill audit M-12).
  const quote = { ...pages[2], blocks: [{ id: 'faq', type: 'faq' }, { id: 'form', type: 'form' }] };
  assert.deepEqual(chromeCta(quote, [pages[0], pages[1], quote]), { label: 'Request a quote', href: '#form' });
  // No home call: the one most pages make.
  const rest = [page('/a/', { label: 'Talk to our team', href: '/contact/' }), page('/b/', { label: 'Talk to our team', href: '/contact/' }), page('/c/', { label: 'Talk to us about IT', href: '/quote/' })];
  assert.deepEqual(siteCta(rest), { label: 'Talk to our team', href: '/contact/' });
  assert.equal(siteCta([page('/x/')]), null);
});

test('a site rule setting a hero\'s height itself is taken out; its height variables stay (the template caps them)', () => {
  const css = `main[data-page-type="home"] .page-hero[data-variant="media-overlay"] { --hero-min-height: clamp(560px, 62.5vw, 900px); }
.page-hero__banner { height: 100vh; }
main .page-hero[data-variant="media-overlay"] .page-hero__inner { min-height: 100svh; }
.page-hero .button { min-height: 74px; }
.page-hero__banner img { height: 100%; }`;
  assert.deepEqual(protectedOverrides(css).map((found) => `${found.selector} ${found.property}`), ['.page-hero__banner height', 'main .page-hero[data-variant="media-overlay"] .page-hero__inner min-height']);
  const { css: kept } = stripProtected(css);
  assert.match(kept, /--hero-min-height: clamp\(560px, 62\.5vw, 900px\)/);
  assert.match(kept, /\.page-hero \.button \{ min-height: 74px; \}/);
  assert.doesNotMatch(kept, /height: 100vh|min-height: 100svh/);
});

test('the template keeps the title, its lead and the call in the first screen: the photo heroes give way in height to their copy, the header and the bar carry the site\'s call', async () => {
  const css = await source('src/styles/template.css');
  // The screen under the hero's own top (PageHero's script: --fold-top) and over the bar.
  assert.match(css, /\.page-hero \{ --fold-screen: calc\(100svh - var\(--fold-top, var\(--header-height\)\) - var\(--fold-bar, 0px\)\); \}/);
  // An overlay hero is at most that screen; a banner photo is what the screen leaves over the copy (--hero-copy), between
  // half its photo shown (heavy_crop) and its cap.
  assert.match(css, /\.page-hero\[data-variant="media-overlay"\] \.page-hero__inner \{ min-height: min\(var\(--hero-min-height, clamp\(360px, 42vw, 560px\)\), var\(--fold-screen\)\); \}/);
  assert.match(css, /--banner-floor: min\(var\(--banner-cap\), calc\(var\(--banner-full\) \* 0\.5\)\)/);
  assert.match(css, /--banner-cap: min\(var\(--hero-banner-height, clamp\(220px, 26vw, 372px\)\), calc\(var\(--banner-full\) \/ 0\.6\)\)/);
  assert.match(css, /height: clamp\(var\(--banner-floor\), calc\(var\(--fold-screen\) - var\(--hero-copy, var\(--fold-room\)\) - var\(--fold-gap\)\), var\(--banner-cap\)\)/);
  // The copy's room under a banner follows the screen's height (HERO_FOLD), the title down to its fit floor.
  assert.match(css, new RegExp(`--fold-gap: ${HERO_FOLD.edgeGapRem}rem`));
  assert.match(css, new RegExp(`media-banner"\\] \\.page-hero__inner \\{ padding-block: clamp\\(1rem, ${HERO_FOLD.copyPadSvh}svh, 3rem\\) 0;`));
  assert.match(css, new RegExp(`media-banner"\\] \\.page-hero__copy \\{ gap: clamp\\(0\\.75rem, ${HERO_FOLD.copyGapSvh}svh, 1\\.25rem\\);`));
  assert.match(css, new RegExp(`media-banner"\\] h1 \\{ font-size: min\\(var\\(--size-hero\\), var\\(--heading-fit, var\\(--size-hero\\)\\), max\\(var\\(--fit-min, 0px\\), ${HERO_FOLD.titleMaxSvh}svh\\)\\); \\}`));
  // The hero measures its top and its copy before the first paint, again as the copy reflows.
  const hero = await source('src/components/blocks/PageHero.astro');
  assert.match(hero, /<script is:inline>[\s\S]*--fold-top[\s\S]*--hero-copy[\s\S]*ResizeObserver[\s\S]*document\.currentScript\.parentElement/);
  // The bar: only where the header shows no button, a 44px target, its room kept at the page's foot and for focus.
  assert.match(css, /\.enquiry-bar \{ display: none; \}\r?\n@media \(max-width: 1023px\) \{/);
  assert.match(css, /@media \(max-width: 1023px\) \{ \.site-header__cta \{ display: none; \} \}/);
  assert.match(css, /\.enquiry-bar \.enquiry-bar__link \{[^}]*min-height: 44px/);
  assert.match(css, /scroll-padding-bottom/);
  const bar = await source('src/components/site/EnquiryBar.astro');
  assert.match(bar, /chromeCta\(Astro\.props\.page, pages\)/);
  assert.match(bar, /data-primary-cta/);
  const header = await source('src/components/site/SiteHeader.astro');
  assert.match(header, /const pageCta = !ctaItem && Astro\.props\.page \? chromeCta\(Astro\.props\.page, pages\) : null;/);
  const layout = await source('src/layouts/BaseLayout.astro');
  assert.match(layout, /<SiteHeader page=\{page\} \/>/);
  assert.match(layout, /<EnquiryBar page=\{page\} \/>/);
  // The chat bubble rises over the bar.
  assert.match(await source('src/components/site/ChatLauncher.astro'), /bottom: calc\(0\.75rem \+ var\(--fold-bar, 0px\)\)/);
});

test('an FAQ question is the summary\'s own text, no heading inside it (Modern Web Guidance), its answer in the page\'s HTML', async () => {
  const faq = await source('src/components/blocks/FaqBlock.astro');
  assert.doesNotMatch(faq, /<summary>[^\n]*<h[1-6]/);
  assert.match(faq, /<summary><span class="faq__question">\{item\.question\}<\/span><\/summary>/);
  assert.match(faq, /\{item\.answer\.split\('\\n'\)\.map\(\(line\) => <p>/);
  // The question keeps the look the h3 had.
  const css = await source('src/styles/template.css');
  assert.match(css, /\.faq__question \{ display: block; font-family: var\(--font-subheading\); font-size: var\(--size-subheading\); font-weight: 600; line-height: 1\.4;/);
  assert.doesNotMatch(css + await source('src/styles/patterns.css'), /\.faq__item h3|faq__item :is\(h3/);
});
