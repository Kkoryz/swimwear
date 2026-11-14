import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { blogPages, inlineParts, validatePost } from '../lib/blog.mjs';
import { blogGates } from '../lib/blog-gates.mjs';
import { pageSchemas } from '../lib/seo-head.mjs';
import { publishQueued } from '../blog-publish.mjs';
import { draftArticle, nextQuestion } from '../blog-draft.mjs';

const post = (extra = {}) => ({
  slug: 'moq-for-custom-sportswear',
  status: 'published',
  seo: { title: 'MOQ for custom sportswear: what small brands can order', description: 'How minimum order quantities work for custom sportswear, per style and colour, and how a small brand can start with samples.' },
  title: 'What MOQ can a small sportswear brand start with?',
  lead: ['Most factories set the minimum per style and colour; ours is 50 pieces, and [samples](/solutions/samples/) come first.'],
  datePublished: '2026-09-01T09:00:00Z',
  dateModified: '2026-09-01T09:00:00Z',
  author: { type: 'Organization' },
  sections: [
    { heading: 'How is MOQ counted?', paragraphs: ['Per style and colour: see our [leggings manufacturing](/leggings-manufacturer/) page.'] },
    { heading: 'Can I mix sizes?', paragraphs: ['Yes, sizes can be mixed within a colour, as on the [wholesale leggings](/wholesale-leggings/) page.'] },
  ],
  review: { by: 'Owner', at: '2026-09-01' },
  ...extra,
});
const page = (route, title = route) => ({ route, pageType: 'solution', status: 'authored', seo: { title, description: `${title} description`, canonical: route }, hero: { heading: title }, blocks: [] });
const sitePages = ['/', '/solutions/samples/', '/leggings-manufacturer/', '/wholesale-leggings/'].map((route) => page(route));
const facts = new Map([['moq', { text: 'Our minimum order quantity is 50 pieces per style per colour.', approved: true }]]);

test('inline links are split from the text', () => {
  assert.deepEqual(inlineParts('See [our page](/a/) now'), [{ text: 'See ' }, { text: 'our page', href: '/a/' }, { text: ' now' }]);
});

test('posts become a hub and article pages; the article carries BlogPosting and sits under the blog', () => {
  const pages = blogPages([post()], { heading: 'Insights', title: 'Insights', description: 'd' });
  assert.deepEqual(pages.map((item) => [item.route, item.pageType, item.status]), [['/blog/', 'blog_hub', 'authored'], ['/blog/moq-for-custom-sportswear/', 'blog_post', 'authored']]);
  const schemas = pageSchemas({ page: pages[1], identity: { origin: 'https://example.com', siteName: 'Ex', schemaLogo: { src: '/l.png' } }, nav: {}, builtRoutes: new Set(['/blog/']) });
  const posting = schemas.find((item) => item['@type'] === 'BlogPosting');
  assert.equal(posting.author['@id'], 'https://example.com/#organization');
  assert.deepEqual(schemas.find((item) => item['@type'] === 'BreadcrumbList').itemListElement.map((item) => item.name), ['Home', 'Insights', 'What MOQ can a small sportswear brand start with?']);
  assert.throws(() => blogPages([{ ...post(), slug: 'Bad Slug' }]), /slug/);
});

test('the hub pages after 12 posts, each page its own URL', () => {
  const posts = Array.from({ length: 13 }, (_, index) => post({ slug: `post-${index + 1}`, datePublished: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00Z`, dateModified: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00Z` }));
  const hubs = blogPages(posts, { heading: 'Blog' }).filter((item) => item.pageType === 'blog_hub');
  assert.deepEqual(hubs.map((item) => [item.route, item.seo.canonical, item.blocks[0].items.length]), [['/blog/', '/blog/', 12], ['/blog/page/2/', '/blog/page/2/', 1]]);
  assert.equal(hubs[0].blocks[0].items[0].href, '/blog/post-13/', 'newest first');
});

test("a hub with Site Factory's copy is a page before any post: its blocks whole; with posts, the posts come first and a featured one leads", () => {
  const own = [{ id: 'overview', type: 'text', heading: 'Guides', paragraphs: ['p'] }, { id: 'overview-2', type: 'text', paragraphs: ['q'], continues: 'overview' }, { id: 'cta', type: 'cta', heading: 'Ask us', paragraphs: [], cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  const [empty] = blogPages([], { heading: 'Blog', blocks: own });
  assert.deepEqual([empty.route, empty.status, empty.blocks.map((block) => block.id)], ['/blog/', 'authored', ['overview', 'overview-2', 'cta']], 'no posts: no empty list');
  const [hub] = blogPages([post()], { heading: 'Blog', blocks: own });
  assert.deepEqual(hub.blocks.map((block) => block.id), ['posts', 'overview', 'overview-2', 'cta'], 'the posts right under the heading');
  const featured = blogPages([post({ slug: 'newer', datePublished: '2026-10-02T09:00:00Z', dateModified: '2026-10-02T09:00:00Z' }), post({ slug: 'key', featured: true })], { heading: 'Blog' });
  assert.deepEqual(featured.find((item) => item.route === '/blog/').blocks.find((block) => block.type === 'postList').items.map((item) => item.href), ['/blog/key/', '/blog/newer/'], 'a featured post leads, newer or not');
  assert.deepEqual(blogPages([], { heading: 'Blog' }), [], 'a hub without copy waits for posts');
});

test('the hub lists posts in review on every build but a release build, which lists only reviewed ones', async () => {
  const { isReleaseBuild } = await import('../lib/blog.mjs');
  const posts = [post({ slug: 'reviewed' }), post({ slug: 'in-review', status: 'review', datePublished: '2026-09-02T09:00:00Z', dateModified: '2026-09-02T09:00:00Z' })];
  const listed = (pages) => pages.find((item) => item.route === '/blog/').blocks.find((block) => block.type === 'postList').items.map((item) => item.href);
  assert.deepEqual(listed(blogPages(posts, { heading: 'Blog' }, { release: false })), ['/blog/in-review/', '/blog/reviewed/']);
  assert.deepEqual(listed(blogPages(posts, { heading: 'Blog' }, { release: true })), ['/blog/reviewed/']);
  // Either way the post in review is built, held (noindex, out of the sitemap): the launch preflight holds on it.
  for (const release of [false, true]) assert.equal(blogPages(posts, { heading: 'Blog' }, { release }).find((item) => item.route === '/blog/in-review/').status, 'hold');
  // Only review posts and no hub copy: a release build has no hub; any other build lists them.
  assert.deepEqual(blogPages([posts[1]], { heading: 'Blog' }, { release: true }).map((item) => item.pageType), ['blog_post']);
  assert.deepEqual(listed(blogPages([posts[1]], { heading: 'Blog' }, { release: false })), ['/blog/in-review/']);
  // The mode is SITE_RELEASE, as pnpm build:release sets it.
  assert.equal(isReleaseBuild({ SITE_RELEASE: '1' }), true);
  assert.equal(isReleaseBuild({}), false);
});

test('the site pages and the launch preflight read the blog the way their build has it', async () => {
  const { loadSitePages } = await import('../lib/site-pages.mjs');
  const root = await mkdtemp(join(tmpdir(), 'blog-release-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify([post({ slug: 'reviewed' }), post({ slug: 'in-review', status: 'review' })]));
  await writeFile(join(root, 'src/data/blog.json'), JSON.stringify({ heading: 'Blog' }));
  const hubLinks = async (options) => (await loadSitePages(root, { photoBriefs: false, ...options })).find((item) => item.route === '/blog/').blocks[0].items.map((item) => item.href).sort();
  assert.deepEqual(await hubLinks({ release: false }), ['/blog/in-review/', '/blog/reviewed/']);
  assert.deepEqual(await hubLinks({ release: true }), ['/blog/reviewed/']);
  const context = await readFile(new URL('../lib/preflight/context.mjs', import.meta.url), 'utf8');
  assert.match(context, /loadSitePages\(root, \{ release: true \}\)/, 'the preflight checks the release build');
});

test('publish gates: reviewed, linked to the site, figures from facts or a source', () => {
  assert.deepEqual(blogGates(post(), { facts, pages: sitePages }).failures, []);
  const failures = (extra) => blogGates(post(extra), { facts, pages: sitePages }).failures.join('\n');
  assert.match(failures({ review: undefined }), /human review/);
  assert.match(failures({ lead: ['We ship 3000 pieces a day.'] }), /"3000".*neither a company fact nor linked/);
  assert.doesNotMatch(failures({ lead: ['Freight rose 12% ([source](https://example.org/)).', '[a](/solutions/samples/) [b](/leggings-manufacturer/)'] }), /"12"/);
  assert.match(failures({ sections: [{ heading: 'H', paragraphs: ['[x](/nowhere/)'] }] }), /does not exist: \/nowhere\//);
  assert.match(failures({ slug: 'moq-guide-2026' }), /year/);
  assert.equal(validatePost({ ...post(), dateModified: '2026-08-01' }).length, 1);
});

test('the queue publishes a reviewed article that passes and holds one that fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/blog-queue/approved'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify([{ ...post({ slug: 'placeholder-article-1', status: 'placeholder' }) }]));
  // The company facts the importer recorded.
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'facts.yaml'), 'facts:\n  - fact_id: moq\n    text: "Our minimum order quantity is 50 pieces per style per colour."\n    approved_public: true\n');
  await writeFile(join(root, 'docs/research/site-factory-import.json'), JSON.stringify({ inputs: { facts: [join(root, 'facts.yaml')] } }));
  await writeFile(join(root, 'content/blog-queue/approved/a.json'), JSON.stringify(post({ datePublished: undefined, dateModified: undefined, lead: ['Our MOQ is 50 pieces; start with [samples](/solutions/samples/).'] })));
  await writeFile(join(root, 'content/blog-queue/approved/b.json'), JSON.stringify(post({ slug: 'unreviewed', review: undefined })));
  const { published, report } = await publishQueued({ root, limit: 5, now: new Date('2026-09-25T10:00:00Z') });
  assert.equal(published, 1);
  assert.match(report.find((item) => item.slug === 'unreviewed').failures.join(), /human review/);
  const posts = JSON.parse(await readFile(join(root, 'src/data/blog-posts.json'), 'utf8'));
  assert.deepEqual(posts.map((item) => [item.slug, item.datePublished]), [['moq-for-custom-sportswear', '2026-09-25T10:00:00Z']], 'placeholders leave with the first real article');
  assert.deepEqual(await readdir(join(root, 'content/blog-queue/approved')), ['b.json']);
});

test('a draft answers the highest-priority question no page answers, and waits for review', async () => {
  const map = { questions: [
    { cluster_id: 'q1', page_id: '/x/', priority: 'high', canonical_question: 'Answered?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
    { cluster_id: 'q2', page_id: null, priority: 'low', canonical_question: 'Low?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
    { cluster_id: 'q3', page_id: null, priority: 'high', canonical_question: 'How much funding do I need for a first run?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
  ] };
  assert.equal(nextQuestion(map, new Set()).cluster_id, 'q3');
  assert.equal(nextQuestion(map, new Set(['q3'])).cluster_id, 'q2');
  const root = await mkdtemp(join(tmpdir(), 'draft-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await writeFile(join(root, 'questions.json'), JSON.stringify(map));
  let prompt = '';
  let file = '';
  const run = async (input) => {
    prompt = input.prompt;
    file = prompt.match(/Save the article as JSON to (\S+) /)[1];
    await writeFile(join(root, file), JSON.stringify(post({ slug: 'first-run-funding', review: undefined })));
    return { code: 0, stderr: '' };
  };
  const result = await draftArticle({ root, questionsPath: join(root, 'questions.json'), run });
  assert.equal(result.question, 'q3');
  assert.match(prompt, /^OUTPUT LANGUAGE: English/);
  assert.match(prompt, /- \/leggings-manufacturer\/ — /);
  assert.ok(JSON.parse(await readFile(join(root, file.replace(/\.json$/, '.checks.json')), 'utf8')).failures);
  const drafted = JSON.parse(await readFile(join(root, 'content/blog-queue/drafted.json'), 'utf8'));
  assert.equal(nextQuestion(map, new Set(Object.keys(drafted))).cluster_id, 'q2', 'a drafted question is not drafted twice');
});
