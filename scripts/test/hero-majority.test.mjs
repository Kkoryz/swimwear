import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { heroByMajority, modulesByMajority, navSiblings, sampleHero } from '../scaffold-placeholder-pages.mjs';

test('a page type\'s hero is the one most of the competitor\'s pages of that kind show', () => {
  assert.equal(heroByMajority('media-banner', ['media-overlay', 'media-overlay', 'media-overlay', 'media-banner']), 'media-overlay');
  assert.equal(heroByMajority('media-overlay', ['plain', 'media-banner']), 'media-overlay');
  assert.equal(heroByMajority('plain', ['media-split', 'media-split']), 'media-split');
});

test('a tie, or no sample, keeps the reference page\'s own hero', () => {
  assert.equal(heroByMajority('media-banner', ['media-overlay']), 'media-banner');
  assert.equal(heroByMajority('media-banner', ['media-overlay', 'media-overlay', 'media-banner', 'plain', 'plain']), 'media-banner');
  assert.equal(heroByMajority('media-banner', []), 'media-banner');
  assert.equal(heroByMajority('media-banner'), 'media-banner');
});

test('a reference without a measured hero is decided by its samples alone', () => {
  assert.equal(heroByMajority(undefined, ['media-overlay', 'media-overlay', 'plain']), 'media-overlay');
  assert.equal(heroByMajority(undefined, []), undefined);
});

// A page laid out as swimwearbali.com's: a "#…" popup button in the header, the page in a top-level list of three and
// in a "Start Here" submenu of six, a footer list of five and a link on another site.
const PAGE = `<!doctype html><body>
  <header><a class="elementor-icon" href="#elementor-action%3Aaction%3Dpopup">menu</a></header>
  <div class="elementor-header"><nav><ul class="elementor-nav-menu">
    <li><a href="/start-your-swimwear-brand/">Start Here</a><ul class="sub-menu">
      <li><a href="/start-your-swimwear-brand/">Getting Started</a></li>
      <li><a href="/swimwear-sampling/">Sampling</a></li>
      <li><a href="/swimwear-manufacturer/">Manufacturing</a></li>
      <li><a href="/size-guide">Size Guide</a></li>
      <li><a href="https://reference.test/swimwear-accessories/#top">Accessorizing</a></li>
      <li><a href="https://shop.reference.test/shipping/">Shipping</a></li>
      <li><a href="#">Back</a></li>
    </ul></li>
    <li><a href="/swimwear-manufacturer/">Catalogues</a></li>
    <li><a href="/contact-us/">Contact Us</a></li>
  </ul></nav></div>
  <footer><ul>
    <li><a href="/budgeting/">Budgeting</a></li><li><a href="/swimwear-sampling/">Sampling</a></li>
    <li><a href="/moq/">MOQ</a></li><li><a href="/extra/">Extra</a></li><li><a href="/more/">More</a></li>
    <li><a href="/swimwear-manufacturer/">Swimwear Manufacturer</a></li>
  </ul></footer>
</body>`;
const FOOTER_ONLY = `<!doctype html><body>
  <nav><ul><li><a href="/">Home</a></li><li><a href="/about/">About</a></li><li><a href="/contact/">Contact</a></li></ul></nav>
  <footer><ul><li><a href="/a/">A</a></li><li><a href="/swimwear-manufacturer/">This</a></li><li><a href="/b/">B</a></li></ul>
  <ul><li><a href="/swimwear-manufacturer/">This</a></li><li><a href="/c/">C</a></li></ul></footer>
</body>`;

test('the pages beside a reference are its largest menu list, a "#…" button and other sites left out', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pages = { '/swimwear-manufacturer/': PAGE, '/footer-only/swimwear-manufacturer/': FOOTER_ONLY };
    await page.route('https://reference.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pages[new URL(route.request().url()).pathname] ?? '' }));

    await page.goto('https://reference.test/swimwear-manufacturer/');
    assert.deepEqual(await page.evaluate(navSiblings, 'https://reference.test/swimwear-manufacturer/'), [
      'https://reference.test/start-your-swimwear-brand/',
      'https://reference.test/swimwear-sampling/',
      'https://reference.test/size-guide/',
      'https://reference.test/swimwear-accessories/',
    ]);

    // Without the page in a menu, the list elsewhere on the page that holds it (three links or more).
    await page.goto('https://reference.test/footer-only/swimwear-manufacturer/');
    assert.deepEqual(await page.evaluate(navSiblings, 'https://reference.test/swimwear-manufacturer/'), ['https://reference.test/a/', 'https://reference.test/b/']);
  } finally {
    await browser.close();
  }
});

test("a page type's variants follow the majority of the reference page and the other competitors' pages; a tie keeps the reference's (owner 2026-11-18)", async () => {
  // Card, process and gallery variants vote key by key; a sample without the module casts no vote; sequences stay.
  const reference = { splitSequence: ['single'], featureGrid: 'numbered', gallery: 'mosaic' };
  assert.deepEqual(modulesByMajority(reference, [{ featureGrid: 'columns' }, { featureGrid: 'columns', process: 'list' }, {}]), { splitSequence: ['single'], featureGrid: 'columns', gallery: 'mosaic' }, 'a module the reference page lacks is not added');
  assert.deepEqual(modulesByMajority(reference, [{ featureGrid: 'columns' }]), reference, 'one against one keeps the reference');
  // A form in the first section is a form hero (an embedded one counts); a one-field estimate box is not.
  const heroOf = () => 'media-split';
  assert.equal(sampleHero([{ shape: { hasForm: true, formFields: 7 } }], heroOf), 'media-form');
  assert.equal(sampleHero([{ shape: { hasForm: true, formFields: 0, formEmbed: true } }], heroOf), 'media-form', 'an embedded form');
  assert.equal(sampleHero([{ shape: { hasForm: true, formFields: 0 } }], heroOf), 'media-split', 'a search form');
  assert.equal(sampleHero([{ shape: { hasForm: true, formFields: 1 } }], heroOf), 'media-split');
  // The patterns step reads site.json designPeers; one reference page's form hero is not every page's of its type.
  const source = await readFile(new URL('../scaffold-placeholder-pages.mjs', import.meta.url), 'utf8');
  assert.match(source, /const peers = \(await readJson\(resolve\(root, 'site\.json'\), null\)\)\?\.designPeers \?\? \{\};/);
  assert.match(source, /voted === 'media-form' && !heroSamples\.some\(\(sample\) => sample\.heroVariant === 'media-form'\) \? \(heroOf\(sections\) \?\? typeHero\(voted\)\) : voted/);
  assert.match(source, /if \(peer\) sampleModules\.push\(authoredPatterns\(sampleSections\)\);/, 'only the other competitors vote on the modules');
  assert.match(await readFile(new URL('../site-run.mjs', import.meta.url), 'utf8'), /id: 'patterns', kind: 'auto', inputs: \['site\.json#reference,designPeers'/);
});
