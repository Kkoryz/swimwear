import assert from 'node:assert/strict';
import test from 'node:test';

import { PAGE_SHELL } from '../lib/page-shell.mjs';
import { extractSectionShapes } from '../lib/reference-anatomy.mjs';

test('a section holding an embedded form provider\'s frame is a form, though its own markup has no form (HubSpot on hometeamluxuryrentals.com)', async () => {
  // Staylumen's reference, 2026-11-16: the contact page's 570px form was an iframe from js.hsforms.net with no words,
  // classed a spacer and skipped, and the page's pattern coverage fell to 66%.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // Nothing leaves the test.
    await page.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    const text = 'We answer every owner within one business day, by phone or by email, about their rental and what we do for it.';
    await page.setContent(`<!doctype html><body style="margin:0">
      <header style="height:100px">Site</header>
      <main>
        <section style="height:400px"><h2>Get in touch</h2><p>${text}</p></section>
        <section style="height:600px"><iframe src="https://js.hsforms.net/ui-forms-embed-components-app/frame.html?_hsPortalId=1" style="display:block;width:1200px;height:560px;border:0"></iframe></section>
        <section style="height:400px"><h2>Call us</h2><p>${text}</p></section>
      </main>
      <footer style="height:100px">Footer</footer>
    </body>`);
    const shapes = await page.evaluate(extractSectionShapes, PAGE_SHELL);
    const form = shapes.find((shape) => shape.height >= 500);
    assert.ok(form, `no 600px section among ${JSON.stringify(shapes.map((shape) => shape.height))}`);
    assert.equal(form.hasForm, true);
    assert.equal(shapes.filter((shape) => shape.hasForm).length, 1);
  } finally {
    await browser.close();
  }
});
