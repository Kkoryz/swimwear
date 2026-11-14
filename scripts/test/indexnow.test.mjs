import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { submitIndexNow } from '../indexnow.mjs';
import { lastModified, updatePageDates } from '../lib/page-dates.mjs';
import { sitemapXml } from '../lib/seo-head.mjs';

const page = (route, heading = 'H') => ({ route, status: 'authored', seo: { title: 'T', description: 'D', canonical: route }, hero: { heading }, blocks: [] });

test('lastmod moves only when a page\'s content changes, and a stale record is never output', () => {
  const first = updatePageDates([page('/a/'), page('/b/')], {}, '2026-09-01');
  const second = updatePageDates([page('/a/'), page('/b/', 'New heading')], first, '2026-09-25');
  assert.equal(second['/a/'].modified, '2026-09-01');
  assert.equal(second['/b/'].modified, '2026-09-25');
  assert.equal(lastModified(page('/b/', 'Edited again'), second), null, 'content changed since the record: no date is claimed');
  const xml = sitemapXml([page('/a/'), page('/b/', 'Edited again')], { origin: 'https://strandmill.com' }, second);
  assert.match(xml, /<loc>https:\/\/strandmill\.com\/a\/<\/loc><lastmod>2026-09-01<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/strandmill\.com\/b\/<\/loc><\/url>/);
});

test('IndexNow gets the URLs added, changed or removed since the baseline, with the site key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'indexnow-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'src/data/site-runtime.json'), JSON.stringify({ site: { id: 's', status: 'live', indexnowKey: 'abcdef0123456789' } }));
  const shot = (pages) => ({ pages: Object.fromEntries(pages.map(([route, content]) => [route, { canonical: route, schemaTypes: [], h2: [], contentHash: content, title: 'T', h1: 'H', description: 'D' }])) });
  await writeFile(join(root, 'docs/research/seo-baseline.json'), JSON.stringify(shot([['/', 'a'], ['/old/', 'x'], ['/same/', 's']])));
  await writeFile(join(root, 'docs/research/seo-snapshot.json'), JSON.stringify(shot([['/', 'b'], ['/new/', 'n'], ['/same/', 's']])));
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { status: 202 }; };
  const result = await submitIndexNow({ root, fetchImpl });
  assert.equal(calls[0].url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(calls[0].body.urlList.sort(), ['https://strandmill.com/', 'https://strandmill.com/new/', 'https://strandmill.com/old/']);
  assert.equal(calls[0].body.keyLocation, 'https://strandmill.com/abcdef0123456789.txt');
  assert.equal(result.submitted, 3);
});
