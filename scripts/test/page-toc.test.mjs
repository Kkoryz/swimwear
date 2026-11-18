import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { planPage } from '../lib/layout-plan.mjs';
import { PAGE_TOC, TOC_MIN_SECTIONS, TOC_MIN_WORDS, pageToc } from '../lib/page-toc.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const words = (count) => Array.from({ length: count }, () => 'word').join(' ');
const section = (id, heading, count, type = 'intro') => ({ id, type, heading, paragraphs: [words(count)] });
const longPage = (pageType = 'product_manufacturer', extra = {}) => ({
  id: 'site:bikini', route: '/bikini-manufacturer/', pageType, status: 'ready', hero: { heading: 'Bikini manufacturer' },
  blocks: [section('overview', 'What we make', 500), section('fabrics', 'Fabrics we sew', 500), { ...section('fabrics-2', undefined, 200), continues: 'fabrics' }, section('moq', 'Minimum order', 400), { id: 'faq', type: 'faq', heading: 'Questions', items: [{ question: 'How long?', answer: words(100) }] }, { id: 'related', type: 'relatedPages', heading: 'Related pages', links: [] }, { id: 'cta', type: 'cta', heading: 'Send an enquiry', cta: { label: 'Contact', href: '/contact/' }, links: [] }],
  ...extra,
});

test('a long content page lists its headed sections, each linking to its block id (four-site audit 2026-11-17, G5)', () => {
  const toc = pageToc(longPage());
  // The section going on (no heading), the related links and the closing call are not listed.
  assert.deepEqual(toc, [
    { anchor: 'overview', heading: 'What we make' },
    { anchor: 'fabrics', heading: 'Fabrics we sew' },
    { anchor: 'moq', heading: 'Minimum order' },
    { anchor: 'faq', heading: 'Questions' },
  ]);
  assert.equal(toc.length, TOC_MIN_SECTIONS);
});

test('a short page, one of few sections, the home, contact and blog pages and a placeholder get no table', () => {
  const page = longPage();
  assert.deepEqual(pageToc({ ...page, blocks: page.blocks.map((block) => (block.paragraphs ? { ...block, paragraphs: [words(Math.floor(TOC_MIN_WORDS / 6))] } : block)) }), []);
  assert.deepEqual(pageToc({ ...page, blocks: page.blocks.filter((block) => block.id !== 'moq') }).length, 0);
  for (const pageType of ['home', 'contact', 'blog_hub', 'blog_post']) assert.deepEqual(pageToc(longPage(pageType)), [], pageType);
  assert.deepEqual(pageToc(longPage('product_manufacturer', { status: 'placeholder' })), []);
});

test('the page renders the table under the hero, its sections carry the anchors, and it alternates with them', async () => {
  const view = await source('src/components/blocks/PageView.astro');
  assert.match(view, /const toc = pageToc\(page, blocks\);/);
  assert.match(view, /anchored\.has\(block\.id\) \? \{ \.\.\.own, anchor: block\.id \} : own/);
  assert.match(view, /<nav class="block block--page-toc" aria-labelledby="page-toc-title" data-authoring-block="page-toc"/);
  assert.match(view, /<a href=\{`#\$\{entry\.anchor\}`\}>\{entry\.heading\}<\/a>/);
  assert.match(view, /\.\.\.\(toc\.length \? \[PAGE_TOC\] : \[\]\)/);
  // Every section component takes its anchor as its id (the form already has its block id).
  for (const name of ['BlockSection', 'TextBlock', 'FeatureGridBlock', 'IconListBlock', 'SplitMediaBlock', 'ProcessBlock', 'FaqBlock', 'TableBlock', 'StatsBlock', 'GalleryBlock', 'FigureBlock', 'BandBlock', 'SourcesBlock']) {
    assert.match(await source(`src/components/blocks/${name}.astro`), /<section [^>]*id=\{block\.anchor\}/, name);
  }
  assert.match(await source('src/components/blocks/FormBlock.astro'), /<section [^>]*id=\{block\.id\}/);
  // Phone-friendly: one link a line, each tall enough to tap; a section stops clear of the sticky header.
  const css = await source('src/styles/template.css');
  assert.match(css, /\.page-toc ol \{ margin: 0; padding-left: 1\.2rem; columns: 16rem 3;/);
  assert.match(css, /\.page-toc a \{ display: inline-block; min-height: 24px;/);
  assert.match(css, /main \[data-block-id\]\[id\] \{ scroll-margin-top: 6rem; \}/);
});

test('the layout plan counts the table as a part of its own under the hero', () => {
  const page = longPage();
  const components = { hero: 'plain', faq: 'accordion' };
  const plan = planPage(page, components);
  const without = planPage({ ...page, blocks: page.blocks.map((block) => (block.paragraphs ? { ...block, paragraphs: [words(10)] } : block)) }, components);
  assert.ok(plan.estimate.heightPx > 0 && without.estimate.heightPx > 0);
  // The table is in the alternation: the first section after it is tinted or not by its place.
  assert.equal(PAGE_TOC.id, 'page-toc');
  const first = plan.blocks.find((row) => row.id === 'overview');
  assert.equal(first.surface, 'tinted');
});
