import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FAQ_OPEN_LIST_ITEMS, faqOpenList, isFaqPage } from '../lib/faq-layout.mjs';
import { blockWords, modelVariant } from '../lib/media-slots.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const items = (count) => Array.from({ length: count }, (_, index) => ({ question: `Question ${index + 1}?`, answer: 'An answer of five words.' }));

test('the FAQ page and a long FAQ block are open lists; a short one keeps the reference\'s disclosure (four-site audit 2026-11-17, G3)', () => {
  const product = { id: 'site:bikini', route: '/bikini-manufacturer/', pageType: 'product_manufacturer' };
  assert.equal(faqOpenList({ items: items(3) }, 'accordion', product), false);
  assert.equal(faqOpenList({ items: items(FAQ_OPEN_LIST_ITEMS) }, 'accordion', product), true);
  assert.equal(faqOpenList({ items: items(FAQ_OPEN_LIST_ITEMS - 1) }, 'bars', product), false);
  // site13's FAQ page is a general page with the id site:faq.
  for (const page of [{ id: 'site:faq', route: '/faq/', pageType: 'general' }, { id: 'x', route: '/faqs/', pageType: 'general' }, { id: 'y', route: '/questions/', pageType: 'faq' }]) {
    assert.ok(isFaqPage(page), page.route);
    assert.equal(faqOpenList({ items: items(2) }, 'two-column', page), true);
  }
  assert.equal(isFaqPage(product), false);
  // The open variants are open lists anywhere; a blog post's FAQ (no page) by its length.
  assert.equal(faqOpenList({ items: items(1) }, 'open-list'), true);
  assert.equal(faqOpenList({ items: items(1) }, 'cards'), true);
  assert.equal(faqOpenList({ items: items(2) }, 'accordion'), false);
});

test('an open list renders each question as an h3 with its answer shown; the accordion keeps no heading in its summary', async () => {
  const faq = await source('src/components/blocks/FaqBlock.astro');
  assert.match(faq, /faqOpenList\(block, variant, page\)/);
  assert.match(faq, /<div class="faq__item">\s*<h3 class="faq__question">\{item\.question\}<\/h3>/);
  // The open list is no disclosure: its items are no <details> and carry no summary.
  const open = faq.slice(faq.indexOf('? block.items.map'), faq.indexOf(': block.items.map'));
  assert.doesNotMatch(open, /<details|<summary/);
  assert.doesNotMatch(faq, /<summary>[^\n]*<h[1-6]/);
  // The reference's look stays: the block keeps its variant; the h3 takes the summary's place, with no mark.
  assert.match(faq, /data-variant=\{variant\} data-faq-list=\{list \? 'open' : undefined\}/);
  const css = await source('src/styles/template.css');
  assert.match(css, /\.faq__item > \.faq__question \{ margin: 0; padding: 1\.125rem 1\.25rem 0\.75rem; \}/);
  // The registry hands the page to the block, for the FAQ page.
  assert.match(await source('src/components/blocks/registry.ts'), /faq: \{ component: FaqBlock, props: \(\{ block, variant, page \}: BlockContext\) => \(\{ block, variant, page \}\) \}/);
});

test('the layout plan measures an open list with every answer shown', () => {
  const block = { id: 'faq', type: 'faq', heading: 'Questions', items: items(FAQ_OPEN_LIST_ITEMS) };
  const page = { id: 'site:bikini', route: '/bikini-manufacturer/', pageType: 'product_manufacturer', blocks: [block] };
  const shape = modelVariant(block, page, page.blocks, { faq: 'accordion', faqFirst: 'closed' }, {});
  assert.equal(shape, 'open-list');
  const closed = blockWords(block, 'accordion', { faqFirst: 'closed' });
  assert.equal(blockWords(block, shape, { faqFirst: 'closed' }), closed + FAQ_OPEN_LIST_ITEMS * 5);
  const short = { ...block, items: items(3) };
  assert.equal(modelVariant(short, { ...page, blocks: [short] }, [short], { faq: 'accordion' }, {}), 'accordion');
  // Cards stay cards.
  assert.equal(modelVariant(block, page, page.blocks, { faq: 'cards' }, {}), 'cards');
});
