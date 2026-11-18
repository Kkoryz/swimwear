import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { audience, BUDGET_USD, geoDir, geoSiteProfile, POSTS } from '../geo-blogs.mjs';
import { siteRun, steps } from '../site-run.mjs';

async function siteFixture(geoBlog) {
  const root = await mkdtemp(join(tmpdir(), 'geo-blogs-'));
  const snap = join(root, 'snap').replace(/\\/g, '/');
  await mkdir(join(root, 'src/data'), { recursive: true });
  const identity = join(root, 'brand').replace(/\\/g, '/');
  await mkdir(snap, { recursive: true });
  await mkdir(identity, { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Strandmill', origin: 'https://strandmill.com' }));
  await writeFile(join(snap, 'keywords.json'), JSON.stringify({ pages: [{ type: 'product', primary: { query: 'bikini manufacturer' } }, { type: 'home', primary: { query: 'swimwear manufacturer' } }] }));
  await writeFile(join(identity, 'project.yaml'), JSON.stringify({ category: 'swimwear', domain: 'b2b-manufacturer' }));
  const site = { reference: { origin: 'https://www.swimwearbali.com', pages: { home: '/' } }, siteFactory: snap, identity, line: 'swimwear', port: 4999, ...(geoBlog ? { geoBlog } : {}) };
  return { root, site };
}

test('the GEO profile names the site, its main query, its competitor and its importer', async () => {
  const { root, site } = await siteFixture();
  const profile = await geoSiteProfile(root, site);
  assert.equal(profile.schema, 'geo-site/v1');
  assert.equal(profile.domain, 'strandmill.com');
  assert.deepEqual(profile.brand_terms, ['strandmill']);
  assert.equal(profile.keyword, 'swimwear manufacturer');
  assert.deepEqual(profile.competitors, ['swimwearbali.com']);
  assert.equal(profile.facts_file, `${site.siteFactory}/facts.yaml`);
  assert.deepEqual(profile.site_import.command, ['node', 'scripts/import-geo-article.mjs', '{runDir}']);
  assert.equal(profile.site_import.cwd, profile.site_dir);
  assert.deepEqual([profile.count, profile.budget_usd_per_article, profile.market], [POSTS, BUDGET_USD, 'US (en)']);
  assert.match(profile.niche, /^swimwear manufacturer .*B2B$/);
  assert.match(profile.persona, /NOT consumers buying swimwear/);
  assert.deepEqual(profile.also_watch, []);
  assert.equal('stages' in profile || 'trade_examples' in profile, false);
});

test('the GEO profile carries the site\'s words per picture, as 08 holds the articles to it, only when the site measured its reference', async () => {
  const { root, site } = await siteFixture();
  assert.equal('words_per_picture' in await geoSiteProfile(root, site), false, 'not measured: the writer uses its own');
  await writeFile(join(root, 'src/data/article-rhythm.json'), JSON.stringify({ wordsPerPicture: 233 }));
  assert.equal((await geoSiteProfile(root, site)).words_per_picture, 233);
  await writeFile(join(root, 'src/data/article-rhythm.json'), JSON.stringify({ wordsPerPicture: 90 }));
  assert.equal((await geoSiteProfile(root, site)).words_per_picture, 150, 'never denser than the readable limit (pictureTarget)');
});

test('a trade other than a manufacturer\'s passes its question stages and examples to the GEO module', async () => {
  const stages = { start: 'awareness', find: 'search', fees: 'evaluation', contract: 'decision' };
  const { root, site } = await siteFixture({ niche: 'n', persona: 'p', stages, tradeExamples: { hero: 'an owner at the front desk' } });
  const profile = await geoSiteProfile(root, site);
  assert.deepEqual(profile.stages, stages);
  assert.deepEqual(profile.trade_examples, { hero: 'an owner at the front desk' });
});

test('a project that is not a B2B manufacturer names its own niche and persona', () => {
  const project = JSON.stringify({ category: 'furniture', domain: 'retail' });
  assert.throws(() => audience(project, {}), /geoBlog needs niche and persona/);
  assert.deepEqual(audience(project, { geoBlog: { niche: 'n', persona: 'p' } }), { niche: 'n', persona: 'p' });
  assert.equal(audience('category: swimwear\ndomain: b2b-manufacturer\n', {}).niche, 'swimwear manufacturer (OEM/ODM/private label), B2B');
});

test('the site can ask for another number of posts or market, and names its GEO module before the environment does', async () => {
  const { root, site } = await siteFixture({ dir: 'D:/geo', count: 5, market: 'UK (en)' });
  const profile = await geoSiteProfile(root, site);
  assert.deepEqual([profile.count, profile.market], [5, 'UK (en)']);
  assert.equal(geoDir(site, { GEO_BLOG_DIR: 'D:/other' }), 'D:/geo');
  assert.equal(geoDir({}, { GEO_BLOG_DIR: 'D:/other' }), 'D:/other');
  assert.equal(geoDir({}, {}), null);
});

test('the GEO posts are the last step before the release, and a run waits there for the owner', async () => {
  const { root, site } = await siteFixture();
  const ids = steps(site).map((step) => step.id);
  // Then only the release; the claude-seo audit of the release build (on by default, owner 2026-11-17) comes just
  // before the posts, so a site waiting for them is audited all the same.
  assert.deepEqual(ids.slice(ids.indexOf('geo-blogs') + 1), ['release']);
  assert.equal(ids[ids.indexOf('geo-blogs') - 1], 'claude-seo-audit');
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  const waiting = await siteRun({ root, from: 'geo-blogs', to: 'geo-blogs', runner: async () => 2 });
  assert.equal(waiting.code, 2);
  assert.match(waiting.waits, /GEO blog posts/);
});
