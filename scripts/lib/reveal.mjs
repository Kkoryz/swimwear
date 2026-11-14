// Makes a reference page render what a visitor sees after scrolling, before it is measured or screenshotted:
//  - `content-visibility: auto` (e.g. WP Rocket lazy render) skips painting off-screen sections, which collapses
//    them in full-page screenshots and in getBoundingClientRect;
//  - lazy-load plugins keep the real image in data-* attributes until their scroll handler fires;
//  - delayed page scripts wait for a first user interaction.
// Only the local capture browser is changed; nothing is sent to the site.

const LAZY_ATTRIBUTES = [
  ['data-lazy-src', 'src'], ['data-src', 'src'],
  ['data-lazy-srcset', 'srcset'], ['data-srcset', 'srcset'],
  ['data-lazy-sizes', 'sizes'], ['data-sizes', 'sizes'],
];

// Scrolls through the whole page once so scroll-triggered content loads, then returns to the top and lets scroll
// handlers settle (a header that turns fixed after scrolling must be measured in its top-of-page state).
// Every capture and measurement uses this one routine so they see the same page.
// A section whose opacity and slide follow its place in the window (hhmhotels.com's fade-on-scroll, 2026-11-14) is
// near 0 below the fold once the page is back at the top, and a full-page shot showed everything under the hero blank.
// An element that showed more while it was in the window than back at the top fades in as it is scrolled to: it is
// pinned fully shown (a stylesheet rule outranks the page script's inline style), at its slide when it showed most.
// Fully, not as far as it got: the last sections and the footer never reach the window's middle, and stayed faint at
// whatever the bottom of the page allowed. In-flow elements only: an absolutely placed slide of a fading carousel is
// hidden by the carousel, not by the scroll.
// A fade started in the window and run slower than the scroll (concordhotels.com's AOS: a 1.5s transition from opacity
// 0 and a 100px slide, undone out of the window) showed a few percent of itself at most, which the page back at the top
// still had: an element whose opacity rose in the window is pinned too, shown and unshifted where it never got near
// fully shown (its slide then was the start of the animation, not where it ends). So is one the page restyled in the
// window (its class or style changed: AOS's callouts wait out a delay before they fade, and rose by nothing while the
// scroll went by). A faint element the page never touched stays.
export async function scrollThroughPage(page, { delay = 60, settle = 600 } = {}) {
  await page.evaluate(async ({ delay, settle }) => {
    const wait = (ms) => new Promise((done) => setTimeout(done, ms));
    document.documentElement.style.scrollBehavior = 'auto';
    const shown = new Map();
    // Each element's class and style before the scroll: what the page restyles while scrolling differs from it.
    const marksOf = (element) => `${element.getAttribute('class')}|${element.getAttribute('style')}`;
    const before = new Map([...document.body.querySelectorAll('*')].map((element) => [element, marksOf(element)]));
    const look = () => {
      for (const element of document.body.querySelectorAll('*')) {
        const rect = element.getBoundingClientRect();
        if (!rect.height || rect.bottom <= 0 || rect.top >= innerHeight) continue;
        const style = getComputedStyle(element);
        if (style.position === 'absolute' || style.position === 'fixed') continue;
        const opacity = Number(style.opacity);
        const seen = shown.get(element);
        const restyled = before.has(element) && marksOf(element) !== before.get(element);
        if (!seen) shown.set(element, { first: opacity, opacity, transform: style.transform, restyled });
        else {
          if (opacity > seen.opacity) Object.assign(seen, { opacity, transform: style.transform });
          if (restyled) seen.restyled = true;
        }
      }
    };
    // Half a window a step: each element is seen near the window's middle, where a fade shows it most.
    const step = Math.max(300, Math.floor(innerHeight * 0.5));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await wait(delay); look(); }
    scrollTo(0, 0);
    await document.fonts?.ready;
    await wait(settle);
    const rules = [];
    for (const [element, best] of shown) {
      const now = Number(getComputedStyle(element).opacity);
      const rose = best.opacity > best.first + 0.01 || best.restyled;
      if (now >= 0.95 || (now >= best.opacity - 0.05 && !rose)) continue;
      element.dataset.captureShown = String(rules.length);
      rules.push(`[data-capture-shown="${rules.length}"]{opacity:1!important;transform:${best.opacity >= 0.95 ? best.transform : 'none'}!important;transition:none!important}`);
    }
    if (rules.length) document.head.append(Object.assign(document.createElement('style'), { textContent: rules.join('\n') }));
  }, { delay, settle });
}

export async function revealDeferredContent(page) {
  // "Delay JavaScript" optimisers (WP Rocket, Perfmatters, Flying Scripts) run page scripts such as carousels only
  // after the first user interaction; a visitor triggers that at once, so the capture does too.
  await page.mouse.move(2, 2);
  await page.mouse.move(6, 6);
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(1500);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => scrollTo(0, 0));
  await page.addStyleTag({ content: '*, *::before, *::after { content-visibility: visible !important; }' }).catch(() => {});
  // A cookie notice fixed in the window is put away, as a visitor dismisses it: hhmhotels.com's sits over the first
  // lines under the hero in every full-page shot and section crop (2026-11-14). Fixed or sticky boxes that speak of
  // cookies only, smaller than most of the window and with no navigation in them; a fixed header, a page wrapped in one
  // fixed box and the page's own text about cookies stay.
  await page.evaluate(() => {
    const notice = (element) => ['fixed', 'sticky'].includes(getComputedStyle(element).position) && element.getBoundingClientRect().height < innerHeight * 0.6 && !element.querySelector('nav') && /\bcookies?\b/i.test(element.textContent ?? '');
    const notices = [...document.body.querySelectorAll('*')].filter(notice);
    for (const element of notices) element.style.setProperty('display', 'none', 'important');
  }).catch(() => {});
  const promoted = await page.evaluate((pairs) => {
    let count = 0;
    for (const element of document.querySelectorAll('img, source, iframe')) {
      for (const [from, to] of pairs) {
        const value = element.getAttribute(from);
        if (!value || value.startsWith('data:') || element.getAttribute(to) === value) continue;
        if (to === 'sizes' && value === 'auto') continue;
        element.setAttribute(to, value);
        if (element.localName === 'img') element.loading = 'eager';
        count += 1;
      }
    }
    return count;
  }, LAZY_ATTRIBUTES);
  // waitForLoadState resolves at once when the page already reached networkidle, so wait on the images themselves.
  if (promoted) {
    await page.evaluate(() => Promise.race([
      Promise.all([...document.images].filter((image) => !image.complete).map((image) => new Promise((done) => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); }))),
      new Promise((done) => setTimeout(done, 15000)),
    ])).catch(() => {});
  }
  return promoted;
}
