import assert from 'node:assert/strict';
import test from 'node:test';

import { measurePage, smallTargets } from '../lib/visual-checks.mjs';

test('a control inside a closed menu is not a tap target, a fold nested in it included; a closed fold\'s own summary is', async () => {
  // site14 2026-11-18: the phone menu's "Locations" toggle (a summary of a fold inside the closed menu), laid out 4px wide
  // in the hidden panel, failed tap_target on the blog hub; open, the menu's rows are 358x48.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><body style="margin:0">
      <header><details class="site-menu"><summary style="display:block;width:36px;height:36px">Menu</summary>
        <div style="position:absolute;width:4px"><ul style="margin:0;padding:0">
          <li><a href="/a/" style="display:block;height:48px">About</a></li>
          <li><details><summary style="display:block;height:48px">Locations</summary><a href="/l/">San Diego</a></details></li>
        </ul></div>
      </details></header>
      <main><section data-block-id="faq"><details><summary style="display:block;width:300px;height:48px">A question</summary><p>An answer</p></details></section></main>
    </body>`);
    const { targets } = await page.evaluate(measurePage);
    const texts = targets.map((target) => target.text);
    assert.ok(texts.includes('Menu'), 'the closed menu\'s own toggle can be hit');
    assert.ok(texts.includes('A question'), 'a closed fold\'s own summary can be hit');
    assert.ok(!texts.includes('Locations'), 'a fold\'s summary inside the closed menu cannot');
    assert.ok(!texts.includes('About'), 'nor a link inside it');
    assert.deepEqual(smallTargets(targets).map((target) => target.text), []);
  } finally {
    await browser.close();
  }
});
