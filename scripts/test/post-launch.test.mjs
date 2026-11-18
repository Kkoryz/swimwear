import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { liveDrift, refreshList } from '../lib/post-launch.mjs';
import { pageHash } from '../lib/page-dates.mjs';
import { pageSnapshot } from '../lib/seo-snapshot.mjs';
import { postLaunch } from '../post-launch.mjs';

const pageHtml = (title, robots = 'index, follow') => `<html><head><title>${title}</title><meta name="robots" content="${robots}"><link rel="canonical" href="https://x.test/"></head><body><main><h1>${title}</h1></main></body></html>`;

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'post-launch-'));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'docs/research/seo-snapshot.json'), JSON.stringify({ pages: { '/': pageSnapshot(pageHtml('Home')), '/a/': pageSnapshot(pageHtml('A')) } }));
  return root;
}

test('after a deploy: the live site is checked first, and search engines are told of the changed pages only when it passes', async () => {
  // Fable's 11-14 plan, item 10: verify-live, IndexNow and the SEO baseline were each run by hand, in no set order.
  const root = await workspace();
  const told = [];
  const submit = async ({ dryRun }) => { told.push(dryRun); return { submitted: dryRun ? 0 : 2, urlList: ['https://x.test/a/', 'https://x.test/b/'] }; };
  const fetchPageImpl = async (url) => ({ status: 200, body: pageHtml(url.endsWith('/a/') ? 'A' : 'Home') });
  const broken = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [{ check: 'robots', detail: 'missing' }] }), submit, fetchPageImpl });
  assert.equal(broken.passed, false);
  assert.equal(broken.launchedAt, null);
  assert.deepEqual(told, [], 'a broken live site is not announced');
  const live = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [] }), submit, dryRun: true, fetchPageImpl, today: new Date('2026-11-20T00:00:00Z') });
  assert.equal(live.passed, true);
  assert.deepEqual(told, [true]);
  assert.equal(live.indexNow.urls, 2);
  assert.equal(live.liveDrift.compared, 2);
  const written = JSON.parse(await readFile(join(root, 'docs/research/post-launch.json'), 'utf8'));
  assert.equal(written.live.problems.length, 0);
  assert.equal(written.launchedAt, '2026-11-20T00:00:00.000Z', 'the first check that passed dates the launch');
  // The accepted SEO baseline stays the owner's (seo-snapshot.mjs --accept --by): the summary says so, it is not done here.
  assert.match(written.baseline.accept, /--accept/);
  assert.match(await readFile(join(root, 'docs/research/post-launch.md'), 'utf8'), /线上正常[\s\S]*一致（比对 2 页）/);
  const later = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [] }), submit, dryRun: true, fetchPageImpl, today: new Date('2026-12-20T00:00:00Z') });
  assert.equal(later.launchedAt, '2026-11-20T00:00:00.000Z', 'kept');
});

test('a live page that differs from the release in what search engines read holds the IndexNow step', async () => {
  const root = await workspace();
  const told = [];
  const fetchPageImpl = async (url) => (url.endsWith('/a/') ? { status: 200, body: pageHtml('A', 'noindex') } : { status: 200, body: pageHtml('Home') });
  const summary = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [] }), submit: async () => { told.push(1); return { submitted: 0, urlList: [] }; }, fetchPageImpl });
  assert.equal(summary.passed, false);
  assert.deepEqual(summary.liveDrift.critical.map((change) => `${change.route} ${change.rule}`), ['/a/ noindex_added']);
  assert.deepEqual(told, []);
  const missing = liveDrift({ pages: { '/': pageSnapshot(pageHtml('Home')) } }, { pages: {}, failed: ['/ 502'] });
  assert.deepEqual([missing.critical, missing.failed], [[], ['/ 502']], 'a page that does not answer is reported once');
});

test('--lighthouse runs one Lighthouse of the home page and the summary keeps Agentic Browsing as X/N', async () => {
  const root = await workspace();
  const runs = [];
  const summary = await postLaunch({ root, lighthouse: true, verify: async () => ({ origin: 'https://x.test', problems: [] }), submit: async () => ({ submitted: 0, urlList: [] }), fetchPageImpl: async (url) => ({ status: 200, body: pageHtml(url.endsWith('/a/') ? 'A' : 'Home') }), lighthouseRun: async ({ url }) => { runs.push(url); return { skipped: 'no Lighthouse in the site\'s node_modules' }; } });
  assert.deepEqual(runs, ['https://x.test/']);
  assert.match(summary.lighthouse.skipped, /node_modules/);
});

test('pages unchanged for six months are due for a refresh; blog posts follow the blog schedule', () => {
  const page = (route, extra = {}) => ({ route, pageType: 'service', status: 'authored', seo: { title: route }, hero: null, blocks: [], ...extra });
  const pages = [page('/old/'), page('/new/'), page('/blog/x/', { pageType: 'blog_post' }), page('/draft/', { status: 'placeholder' }), page('/undated/')];
  const dates = { '/old/': { hash: pageHash(pages[0]), modified: '2026-03-01' }, '/new/': { hash: pageHash(pages[1]), modified: '2026-11-01' }, '/undated/': { hash: 'stale', modified: '2025-01-01' } };
  const list = refreshList(pages, dates, { today: new Date('2026-11-17T00:00:00Z'), indexable: (item) => item.status !== 'placeholder' });
  assert.deepEqual(list.due.map((item) => [item.route, item.days]), [['/old/', 261]]);
  assert.deepEqual(list.undated, ['/undated/'], 'a stale record claims no date');
});
