import assert from 'node:assert/strict';
import test from 'node:test';

import { blogPages, chartErrors, postWords, validatePost } from '../lib/blog.mjs';
import { blogGates, TITLE_OVERLAP, termOverlap } from '../lib/blog-gates.mjs';
import { articlePost, parseArticle, pictureDensity, pictureTarget, placedVisuals } from '../lib/geo-article.mjs';
import { articleVisualPrompt } from '../lib/image-prompt.mjs';
import { CONTENT_CHECKS } from '../lib/preflight/content-checks.mjs';
import { isIndexable } from '../lib/seo-head.mjs';
import { rhythmVars } from '../measure-reference-article.mjs';

const ARTICLE = `---
seo_title: "Choosing a swimwear manufacturer"
seo_description: How to choose a swimwear manufacturer and plan a first collection, from samples to the shipment you accept.
---
# How to Choose a Swimwear Manufacturer

## Plan your first collection

A plan connects the customer, the inventory and the shipment. See [custom printing](/custom-swimwear-printing/).

We make swimwear in our own factory.

![Collection journey from brief to shipment](visuals/V1.png)

## What steps should I follow?

Define the customer first, as [Arcus explains](https://www.arcusag.com/guide/).

### Build the calendar

| Milestone | Existing | Custom |
| --- | --- | --- |
| Start | March 2 | [Supplier B](https://supplier-b.example/) |
| Receipt | May 18 | June 17 |

- Choose a block
- Approve the sample

![Sample before and after the lining revision](visuals/V2.png)

Photograph the approved garment.
`;
const VISUALS = [
  { id: 'V1', section: 'Plan your first collection', type: 'hero', title: 'From brief to shipment', purpose: 'Show the journey', content: 'Swimwear silhouettes and swatches connected through brief, sample and shipment', produce: 'generate' },
  { id: 'V2', section: 'What steps should I follow?', type: 'photo', title: 'Sample S-01 before and after lining revision', purpose: 'Make the correction visible', content: 'Matched dry/wet photographs of one sample, labels for original lining and L2', produce: 'real photo from the company' },
];
const image = (id) => ({ src: `/media/blog/x/${id}-960.webp`, srcset: `/media/blog/x/${id}-480.webp 480w, /media/blog/x/${id}-960.webp 960w`, width: 960, height: 640, wide: { src: `/media/blog/x/${id}-1536.webp`, width: 1536, height: 1024 } });

test('a GEO article parses into its sections in the writer\'s order: subheadings, tables, lists and visuals', () => {
  const article = parseArticle(ARTICLE);
  assert.equal(article.title, 'How to Choose a Swimwear Manufacturer');
  assert.equal(article.fields.seo_title, 'Choosing a swimwear manufacturer');
  assert.deepEqual(article.sections.map((section) => section.heading), ['Plan your first collection', 'What steps should I follow?']);
  assert.deepEqual(article.sections[1].body.map((part) => Object.keys(part)[0]), ['text', 'subheading', 'table', 'list', 'visual', 'text']);
  assert.deepEqual(article.sections[1].body[2].table, { columns: ['Milestone', 'Existing', 'Custom'], rows: [['Start', 'March 2', '[Supplier B](https://supplier-b.example/)'], ['Receipt', 'May 18', 'June 17']] });
  assert.deepEqual(placedVisuals(article), [{ id: 'V1', alt: 'Collection journey from brief to shipment' }, { id: 'V2', alt: 'Sample before and after the lining revision' }]);
  assert.throws(() => parseArticle('# A\n# B\n## C\n\nText.'), /second H1/);
  // A writer that left out the separator line meant its first row as the header; a header alone is no table.
  assert.deepEqual(parseArticle('# A\n## C\n\n| a | b |\n| c | d |').sections[0].body[0].table, { columns: ['a', 'b'], rows: [['c', 'd']] });
  assert.throws(() => parseArticle('# A\n## C\n\n| a | b |\n| --- | --- |'), /a table without rows/);
});

test('the post: the hero visual is the featured image, the first paragraph the opening, the other visuals stay in place with their caption', () => {
  const { post, missing, seoMissing } = articlePost(parseArticle(ARTICLE), { visuals: VISUALS, images: { V1: image('V1'), V2: image('V2') }, now: new Date('2026-10-30T10:00:00Z') });
  assert.deepEqual([missing, seoMissing], [[], []]);
  assert.equal(post.slug, 'how-to-choose-a-swimwear-manufacturer');
  assert.equal(post.status, 'review');
  assert.deepEqual(post.image, { src: '/media/blog/x/V1-1536.webp', alt: 'Collection journey from brief to shipment', width: 1536, height: 1024 });
  assert.deepEqual(post.lead, ['A plan connects the customer, the inventory and the shipment. See [custom printing](/custom-swimwear-printing/).']);
  assert.deepEqual(post.sections[0].body, [{ text: 'We make swimwear in our own factory.' }]);
  assert.deepEqual(post.sections[1].body[4].figure, { src: '/media/blog/x/V2-960.webp', srcset: image('V2').srcset, alt: 'Sample before and after the lining revision', width: 960, height: 640, caption: 'Sample S-01 before and after lining revision' });
  assert.deepEqual(post.sources, [{ title: 'Arcus explains', url: 'https://www.arcusag.com/guide/' }, { title: 'Supplier B', url: 'https://supplier-b.example/' }]);
  assert.deepEqual(validatePost(post), []);
  // A visual not made yet is left out and named; a previous import keeps its slug and publication date.
  const again = articlePost(parseArticle(ARTICLE), { visuals: VISUALS, images: { V1: image('V1') }, previous: { slug: 'kept', datePublished: '2026-10-01T00:00:00Z' } });
  assert.deepEqual(again.missing, ['V2']);
  assert.equal(again.post.datePublished, '2026-10-01T00:00:00Z');
  assert.equal(again.post.slug, 'kept');
});

test('picture density: words per picture in the text (the hero not counted), and the sections long enough for one that have too few', () => {
  const words = (count) => Array.from({ length: count }, () => 'word').join(' ');
  const article = parseArticle(`# T\n\n## Short\n\n${words(60)}\n\n![h](visuals/V1.png)\n\n## Long\n\n${words(520)}\n\n![p](visuals/V2.png)\n\n## Plain\n\n${words(200)}\n`);
  const density = pictureDensity(article, VISUALS);
  assert.equal(density.pictures, 1);
  assert.equal(density.words, 780);
  assert.equal(density.wordsPerPicture, 780);
  assert.equal(density.enough, false);
  assert.deepEqual(density.sectionsShort, [{ heading: 'Plain', words: 200, pictures: 0, wants: 1 }]);
  // A denser target (the reference's) wants more of each section.
  assert.deepEqual(pictureDensity(article, VISUALS, 150).sectionsShort, [{ heading: 'Long', words: 520, pictures: 1, wants: 3 }, { heading: 'Plain', words: 200, pictures: 0, wants: 1 }]);
});

test('a chart visual is drawn from the writer\'s data in place; bad data is named', () => {
  const chart = { kind: 'bar', unit: 'USD', items: [{ label: 'Inventory', value: 5600 }, { label: 'Development', value: 750 }] };
  const visuals = [...VISUALS.slice(0, 1), { id: 'V2', section: 'What steps should I follow?', type: 'chart', title: 'Where the launch budget goes', produce: 'draw', chart }];
  const { post, missing } = articlePost(parseArticle(ARTICLE), { visuals, images: { V1: image('V1') } });
  assert.deepEqual(missing, []);
  assert.deepEqual(post.sections[1].body[4], { chart: { ...chart, alt: 'Sample before and after the lining revision', caption: 'Where the launch budget goes' } });
  assert.deepEqual(validatePost(post), []);
  const broken = [...VISUALS.slice(0, 1), { ...visuals[1], chart: { kind: 'timeline', items: [{ label: 'Samples', start: '2026-01-19', end: '2026-01-04' }, { label: 'Bulk', start: '2026-03-02', end: '2026-04-11' }] } }];
  assert.throws(() => articlePost(parseArticle(ARTICLE), { visuals: broken, images: { V1: image('V1') } }), /end not before start/);
  assert.deepEqual(chartErrors({ kind: 'steps', items: [{ label: 'Brief' }, { label: 'Sample' }] }), ['chart needs 3 to 7 items']);
});

test('the article text follows the reference only where it reads more easily; its picture density sets the target', () => {
  // swimwearbali.com's articles, measured 2026-10-30: tighter text than a readable article's, only more room around pictures.
  assert.deepEqual(rhythmVars({ lineHeight: 1.5, paragraphGap: 17, headingGap: 20, sectionGap: 34, figureGap: 127, charsPerLine: 102 }), { '--article-figure-gap': '4rem' });
  assert.deepEqual(rhythmVars({ lineHeight: 1.85, paragraphGap: 36, headingGap: 24, sectionGap: 100, figureGap: 40, charsPerLine: 70 }), {
    '--article-line-height': '1.85', '--article-paragraph-gap': '2.25rem', '--article-heading-gap': '1.5rem', '--article-section-gap': '4rem', '--article-measure': '70ch',
  });
  assert.equal(pictureTarget(130), 150);
  assert.equal(pictureTarget(250), 250);
  assert.equal(pictureTarget(900), 400);
  assert.equal(pictureTarget(null), 400);
});

test('an article aiming at another article\'s search, or answering its questions again, is warned', () => {
  const { post } = articlePost(parseArticle(ARTICLE.replace('# How to Choose a Swimwear Manufacturer', '# How to Choose a Swimwear Manufacturer and Launch Your First US Collection').replace('## What steps should I follow?', '## What steps should I follow to start and launch my own swimwear brand?')), { visuals: VISUALS, images: { V1: image('V1'), V2: image('V2') } });
  const other = { route: '/blog/swimwear-manufacturer-buying-guide/', pageType: 'blog_post', status: 'hold', seo: { title: 'Swimwear Manufacturer: A US Brand’s Buying Guide', description: 'd' }, hero: { heading: 'How to Choose a Swimwear Manufacturer for Your US Brand' }, blocks: [{ type: 'prose', heading: 'How do I start and launch my own swimwear brand?', paragraphs: ['x'] }, { type: 'prose', heading: 'How much will my swimwear cost per unit?', paragraphs: ['x'] }] };
  const { warnings } = blogGates({ ...post, status: 'published', review: { by: 'x', at: post.dateModified } }, { pages: [other] });
  assert.deepEqual(warnings.filter((warning) => warning.includes('/blog/swimwear-manufacturer-buying-guide/')), [
    'the title aims at the same search as /blog/swimwear-manufacturer-buying-guide/ ("How to Choose a Swimwear Manufacturer for Your US Brand"): give each article its own main question',
    '"What steps should I follow to start and launch my own swimwear brand?" is already answered by /blog/swimwear-manufacturer-buying-guide/ ("How do I start and launch my own swimwear brand?"): link there instead of answering it again',
  ]);
  // Another topic around the same keyword is not warned.
  assert.ok(termOverlap('Swimwear Fabrics and Quality Checks for a First Collection', 'How to Choose a Swimwear Manufacturer for Your US Brand') < TITLE_OVERLAP);
});

test('a post in review is built held (noindex, out of a release build\'s hub) and holds the release; its body counts for the checks', () => {
  const { post } = articlePost(parseArticle(ARTICLE), { visuals: VISUALS, images: { V1: image('V1'), V2: image('V2') } });
  const pages = blogPages([post], { heading: 'Blog', blocks: [{ id: 'intro', type: 'intro', heading: 'H', paragraphs: ['p'] }] }, { release: true });
  const article = pages.find((page) => page.pageType === 'blog_post');
  assert.equal(article.status, 'hold');
  assert.equal(isIndexable(article), false);
  assert.ok(!pages.find((page) => page.pageType === 'blog_hub').blocks.some((block) => block.type === 'postList'));
  assert.deepEqual(article.blocks[1].body.map((part) => Object.keys(part)[0]), ['text', 'subheading', 'table', 'list', 'figure', 'text']);
  const check = CONTENT_CHECKS.find((item) => item.code === 'blog_post_in_review');
  assert.ok(check.run({ pages: [article] }));
  assert.ok(!check.run({ pages: [{ ...article, status: 'authored' }] }));
  assert.ok(postWords(post) > 40);
  // The body's links are the article's links: one internal link, so the check counts it (and asks for three).
  const { failures } = blogGates({ ...post, status: 'published', review: { by: 'x', at: post.dateModified } }, { pages: [{ route: '/custom-swimwear-printing/', pageType: 'solution', status: 'authored', seo: { title: 'P', description: 'P' }, hero: { heading: 'P' }, blocks: [] }] });
  assert.ok(failures.includes('1 internal link(s) in the text (at least 3)'));
});

test('an article visual: a photo in the site\'s light, an illustration with no words; labels left to the caption', () => {
  const briefs = { prompts: { realism: 'REAL', realismFabric: 'FABRIC', realismPerson: 'PERSON', constraints: 'no text', worker: 'WORKER' } };
  const profile = { lighting: 'soft daylight', colour: 'muted pastels', rendering: 'clean' };
  const photo = articleVisualPrompt(VISUALS[1], { master: 'm/V2.png', profile, briefs, article: 'The article' });
  assert.match(photo, /photograph \(1536x1024\)/);
  assert.match(photo, /Leave out any labels/);
  assert.match(photo, /never a collage, grid of panels, split screen/);
  assert.match(photo, /soft daylight/);
  assert.match(photo, /No person in the image/);
  assert.match(photo, /photorealistic/);
  const placed = articleVisualPrompt({ ...VISUALS[1], setting: 'QC bench in our factory' }, { master: 'm/V2.png', profile, briefs, article: 'The article', others: [{ title: 'A', setting: 'sampling room table' }, { title: 'B' }] });
  assert.match(placed, /Setting: QC bench in our factory\./);
  assert.match(placed, /The light and colours are the setting's own\. Rendering as on the company's website: clean/);
  assert.doesNotMatch(placed, /soft daylight/);
  assert.match(placed, /other pictures show: sampling room table; B\. This one looks different/);
  const hero = articleVisualPrompt(VISUALS[0], { master: 'm/V1.png', profile, briefs, article: 'The article' });
  assert.match(hero, /illustration/);
  assert.match(hero, /no words, numbers or quantity marks/);
  assert.doesNotMatch(hero, /REAL/);
});
