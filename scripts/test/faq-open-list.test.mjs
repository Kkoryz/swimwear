import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FAQ_OPEN_LIST_ITEMS, faqOpenList, faqPageFolds, faqPlannedOpen, isFaqPage } from '../lib/faq-layout.mjs';
import { blockWords, modelVariant } from '../lib/media-slots.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const items = (count) => Array.from({ length: count }, (_, index) => ({ question: `Question ${index + 1}?`, answer: 'An answer of five words.' }));

test('every FAQ folds, on the FAQ page and however long; only the open variants show every answer (owner 2026-11-18)', () => {
  const product = { id: 'site:bikini', route: '/bikini-manufacturer/', pageType: 'product_manufacturer' };
  assert.equal(faqOpenList({ items: items(3) }, 'accordion', product), false);
  assert.equal(faqOpenList({ items: items(12) }, 'accordion', product), false, 'a long FAQ folds');
  assert.equal(faqOpenList({ items: items(5) }, 'bars', product), false);
  // site13's FAQ page is a general page with the id site:faq.
  for (const page of [{ id: 'site:faq', route: '/faq/', pageType: 'general' }, { id: 'x', route: '/faqs/', pageType: 'general' }, { id: 'y', route: '/questions/', pageType: 'faq' }]) {
    assert.ok(isFaqPage(page), page.route);
    assert.equal(faqOpenList({ items: items(2) }, 'two-column', page), false, `${page.route} folds`);
  }
  assert.equal(isFaqPage(product), false);
  // The open variants are open lists anywhere.
  assert.equal(faqOpenList({ items: items(1) }, 'open-list'), true);
  assert.equal(faqOpenList({ items: items(1) }, 'cards'), true);
  assert.equal(faqOpenList({ items: items(2) }, 'accordion'), false);
});

test("the FAQ page's sections that answer one question fold under it, the blocks going on from them with them (Staylumen 2026-11-18)", () => {
  const blocks = [
    { id: 'overview', type: 'intro', heading: 'Who We Are and How We Work Remotely' },
    { id: 'm4', type: 'iconList', heading: 'What Are Your Contract, Insurance and Cancellation Terms?' },
    { id: 'm2', type: 'splitMedia', heading: 'How Soon Can My Home Go Live and Take Bookings? ' },
    { id: 'm2-steps', type: 'process', continues: 'm2' },
    { id: 'faq', type: 'faq', heading: 'More questions?' },
    { id: 'related', type: 'relatedPages', heading: 'Where next?' },
    { id: 'cta', type: 'cta', heading: 'Ready to start?' },
  ];
  const folds = faqPageFolds({ id: 'site:faq', route: '/faq/', pageType: 'general', blocks });
  assert.deepEqual([...folds.keys()], ['m4', 'm2', 'm2-steps']);
  assert.deepEqual(folds.get('m2'), { head: 'm2', question: 'How Soon Can My Home Go Live and Take Bookings?' });
  assert.equal(folds.get('m2-steps'), folds.get('m2'));
  // Any other page keeps its sections as they are.
  assert.equal(faqPageFolds({ id: 'site:about', route: '/about/', pageType: 'about', blocks }).size, 0);
});

test('the FAQ page renders each fold as one <details>, the question its summary, out of the tinted alternation', async () => {
  const view = await source('src/components/blocks/PageView.astro');
  assert.match(view, /const folds = faqPageFolds\(page, blocks\);/);
  assert.match(view, /<details class="faq-fold" data-fold=\{fold\.head\}/);
  assert.match(view, /<summary class="faq-fold__summary"><span class="container faq-fold__question">\{fold\.question\}<\/span><\/summary>/);
  assert.match(view, /fold\?\.head === full\.id \? \(\{ \.\.\.full, heading: undefined \}/, 'the head block shows its answer without the heading');
  assert.match(view, /\.filter\(\(block\) => !folds\.has\(block\.id\)\)/);
  assert.match(await source('src/styles/template.css'), /\.faq-fold\[open\] \.faq-fold__question::after/);
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

test('the photo plan keeps the measure the photos were placed with: a long FAQ as an open list, though it folds (hand fix 2026-11-18)', () => {
  const block = { id: 'faq', type: 'faq', heading: 'Questions', items: items(FAQ_OPEN_LIST_ITEMS) };
  const page = { id: 'site:bikini', route: '/bikini-manufacturer/', pageType: 'product_manufacturer', blocks: [block] };
  assert.equal(faqOpenList(block, 'accordion', page), false, 'it renders folded');
  assert.equal(faqPlannedOpen(block, 'accordion', page), true);
  const shape = modelVariant(block, page, page.blocks, { faq: 'accordion', faqFirst: 'closed' }, {});
  assert.equal(shape, 'open-list');
  const closed = blockWords(block, 'accordion', { faqFirst: 'closed' });
  assert.equal(blockWords(block, shape, { faqFirst: 'closed' }), closed + FAQ_OPEN_LIST_ITEMS * 5);
  const short = { ...block, items: items(3) };
  assert.equal(modelVariant(short, { ...page, blocks: [short] }, [short], { faq: 'accordion' }, {}), 'accordion');
  // Cards stay cards.
  assert.equal(modelVariant(block, page, page.blocks, { faq: 'cards' }, {}), 'cards');
});
