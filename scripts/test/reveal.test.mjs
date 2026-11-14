import assert from 'node:assert/strict';
import test from 'node:test';

import { revealDeferredContent, scrollThroughPage } from '../lib/reveal.mjs';

// 1x1 transparent PNG served for the lazy image.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('deferred sections render, lazy images load their real source and delayed scripts run', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('https://reference.test/**', (route) => route.request().url().endsWith('.png')
      ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
      : route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><body style="margin:0">
          <div style="height:3000px"></div>
          <section id="deferred" style="content-visibility:auto;contain-intrinsic-size:1px 100px"><div style="height:900px"></div></section>
          <img id="lazy" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E" data-lazy-src="https://reference.test/photo.png" width="10" height="10">
          <img id="plain" data-src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="10" height="10">
          <script>addEventListener('mousemove', () => { document.body.dataset.delayedScripts = 'ran'; }, { once: true });</script>
        </body>` }));
    await page.goto('https://reference.test/');
    assert.equal(await page.$eval('#deferred', (element) => element.getBoundingClientRect().height), 100);

    const promoted = await revealDeferredContent(page);

    assert.equal(promoted, 1, 'data: placeholders are not promoted');
    assert.equal(await page.$eval('body', (body) => body.dataset.delayedScripts), 'ran');
    assert.equal(await page.$eval('#deferred', (element) => element.getBoundingClientRect().height), 900);
    assert.equal(await page.$eval('#lazy', (image) => image.currentSrc), 'https://reference.test/photo.png');
    assert.equal(await page.$eval('#lazy', (image) => image.complete && image.naturalWidth), 1);
  } finally {
    await browser.close();
  }
});

test('a section faded by its place in the window is shown as it is in view once the page is back at the top', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    // hhmhotels.com's fade-on-scroll: opacity and a slide set from the section's place in the window on every scroll.
    await page.setContent(`<!doctype html><body style="margin:0">
      <div style="height:1500px"></div>
      <section id="faded" style="height:400px"><p>Below the fold</p></section>
      <div style="position:relative;height:300px">
        <div id="slide" style="position:absolute;inset:0;opacity:0">An inactive carousel slide</div>
      </div>
      <div style="height:1500px"></div>
      <footer id="last" style="height:200px">The page's end never reaches the window's middle</footer>
      <script>
        const last = document.getElementById('last');
        addEventListener('scroll', () => { last.style.opacity = String(Math.max(0, Math.min(0.4, (innerHeight - last.getBoundingClientRect().top) / innerHeight))); });
        last.style.opacity = '0';
        const faded = document.getElementById('faded');
        const place = () => {
          const top = faded.getBoundingClientRect().top;
          const shown = Math.max(0, Math.min(1, (innerHeight - top) / (innerHeight / 2)));
          faded.style.opacity = String(shown);
          faded.style.transform = 'translateY(' + (1 - shown) * 50 + 'px)';
        };
        addEventListener('scroll', place); place();
      </script>
    </body>`);
    assert.equal(await page.$eval('#faded', (element) => getComputedStyle(element).opacity), '0');

    await scrollThroughPage(page, { delay: 30, settle: 100 });

    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.$eval('#faded', (element) => getComputedStyle(element).opacity), '1');
    assert.equal(await page.$eval('#faded', (element) => getComputedStyle(element).transform), 'matrix(1, 0, 0, 1, 0, 0)');
    assert.equal(await page.$eval('#last', (element) => getComputedStyle(element).opacity), '1', 'the end of the page is shown fully, not as far as it faded in');
    assert.equal(await page.$eval('#slide', (element) => getComputedStyle(element).opacity), '0', 'an absolutely placed slide is the carousel\'s to show');
  } finally {
    await browser.close();
  }
});

test('a cookie notice fixed in the window is put away, as a visitor dismisses it; a fixed header stays', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<!doctype html><body style="margin:0">
      <header id="header" style="position:fixed;top:0;left:0;right:0;height:60px">Home About Contact</header>
      <div id="notice" style="position:fixed;bottom:0;left:0;right:0;height:50px">We use cookies to analyze our traffic. <button>Accept</button></div>
      <p id="policy">Our cookie policy, in the page's own text</p>
      <div style="height:2000px"></div>
    </body>`);

    await revealDeferredContent(page);

    assert.equal(await page.$eval('#notice', (element) => getComputedStyle(element).display), 'none');
    assert.equal(await page.$eval('#header', (element) => getComputedStyle(element).display), 'block');
    assert.equal(await page.$eval('#policy', (element) => getComputedStyle(element).display), 'block', 'text in the page flow is the page\'s');
  } finally {
    await browser.close();
  }
});

test('a section that starts a slow fade as it enters the window and fades back out above it is shown fully, unshifted (concordhotels.com AOS)', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    // AOS: a class added in the window starts a 1.5s transition from opacity 0 and a 100px slide, removed again out of
    // it (mirror): the page scrolled past in steps far shorter than the transition shows a few percent of it.
    await page.setContent(`<!doctype html><head><style>
      .aos { opacity: 0; transform: translate3d(0, 100px, 0); transition: opacity 1.5s, transform 1.5s; }
      .aos.on { opacity: 1; transform: none; }
    </style></head><body style="margin:0">
      <div style="height:1500px"></div>
      <section id="aos" class="aos" style="height:300px"><p>Differentiators</p></section>
      <section id="late" class="aos" style="height:300px;transition-delay:0.6s"><p>A callout that waits before it fades</p></section>
      <p id="faint" style="opacity:0.3">A faint decoration</p>
      <div style="height:1500px"></div>
      <script>
        const aos = document.getElementById('aos');
        const late = document.getElementById('late');
        const place = () => { for (const item of [aos, late]) { const rect = item.getBoundingClientRect(); item.classList.toggle('on', rect.top < innerHeight - 120 && rect.bottom > 0); } };
        addEventListener('scroll', place); place();
      </script>
    </body>`);
    await scrollThroughPage(page, { delay: 30, settle: 100 });
    assert.equal(await page.$eval('#aos', (element) => getComputedStyle(element).opacity), '1');
    assert.equal(await page.$eval('#aos', (element) => getComputedStyle(element).transform), 'none');
    assert.equal(await page.$eval('#late', (element) => getComputedStyle(element).opacity), '1', 'a fade with a delay longer than the scroll dwell is shown too');
    assert.equal(await page.$eval('#faint', (element) => getComputedStyle(element).opacity), '0.3', 'a faint element that never faded in keeps its opacity');
  } finally {
    await browser.close();
  }
});
