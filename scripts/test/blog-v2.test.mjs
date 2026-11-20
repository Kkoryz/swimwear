import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { blogBatch } from '../blog-batch.mjs';
import { runV2 } from '../geo-blogs.mjs';
import { flowFinal, flowHeld } from '../import-geo-article.mjs';
import { BATCH_LOG, PROFILE_V2, batchDue, blogSiteProfile, isV2, siteRunEnv, writePosts, writeSchedule } from '../lib/blog-v2.mjs';

const v2 = (work) => ({ siteFactory: 'D:/sf', project: 'D:/w/project', cache: 'D:/w/cache.sqlite3', work, geoDir: 'D:/geo-v2', claudeBin: 'C:/claude.exe' });

async function fixture(geoBlog = {}) {
  const root = await mkdtemp(join(tmpdir(), 'blog-v2-'));
  const work = join(root, 'work').replace(/\\/g, '/');
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(work, { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Staylumen', origin: 'https://staylumen.com' }));
  await writeFile(join(root, 'src/data/article-rhythm.json'), JSON.stringify({ wordsPerPicture: 250 }));
  const site = { siteFactory: 'D:/snap', geoBlog: { flow: 'v2', dir: 'D:/geo-old', audience: 'a property owner in the United States', exclude: ['airbnb host cancellation policy'], v2: v2(work), ...geoBlog } };
  await writeFile(join(root, 'site.json'), JSON.stringify(site));
  return { root, work, site };
}

test('geoBlog.flow "v2" picks the new flow; anything else keeps the earlier one', () => {
  assert.equal(isV2({ geoBlog: { flow: 'v2' } }), true);
  assert.equal(isV2({ geoBlog: { dir: 'D:/geo' } }), false);
  assert.equal(isV2({}), false);
});

test("site_run runs under the model profile geoBlog.v2.modelProfile names, else the environment's", () => {
  const site = (extra = {}) => ({ geoBlog: { flow: 'v2', v2: { ...v2('D:/w'), ...extra } } });
  const env = siteRunEnv(site({ modelProfile: 'domain/model_profiles/default_1116.yaml' }), { SF_MODEL_PROFILE: 'other.yaml', KEEP: '1' });
  assert.equal(env.SF_MODEL_PROFILE, 'domain/model_profiles/default_1116.yaml');
  assert.equal(env.KEEP, '1');
  assert.match(env.PYTHONPATH, /sf[\\/]src$/);
  assert.equal(siteRunEnv(site(), { SF_MODEL_PROFILE: 'other.yaml' }).SF_MODEL_PROFILE, 'other.yaml');
  assert.equal('SF_MODEL_PROFILE' in siteRunEnv(site(), {}), false);
});

test('the v2 profile names the site, its Site Factory copy, its work folder, its writer and its limits', async () => {
  const { root, work, site } = await fixture();
  const profile = await blogSiteProfile(root, site, {});
  assert.equal(profile.schema, 'blog-site/v2');
  assert.deepEqual([profile.domain, profile.brand_terms, profile.audience], ['staylumen.com', ['staylumen'], 'a property owner in the United States']);
  assert.deepEqual([profile.sf_project, profile.cache_db, profile.work_dir, profile.geo_dir], ['D:/w/project', 'D:/w/cache.sqlite3', work, 'D:/geo-v2']);
  assert.equal(profile.facts_file, 'D:/snap/facts.yaml');
  assert.deepEqual(profile.exclude, ['airbnb host cancellation policy']);
  assert.deepEqual([profile.approve_usd_per_article, profile.cloud_usd_per_article, profile.words_per_picture], [0.1, 0.1, 250]);
  assert.deepEqual(profile.accounts, { claude_bin: 'C:/claude.exe' });
  assert.equal((await blogSiteProfile(root, site, { SF_CLAUDE_BIN: 'C:/env.exe' })).accounts.claude_bin, 'C:/env.exe');
  await assert.rejects(blogSiteProfile(root, { geoBlog: { flow: 'v2', audience: 'x', v2: {} } }, {}), /needs siteFactory, project, cache, work/);
  await assert.rejects(blogSiteProfile(root, { geoBlog: { flow: 'v2', v2: v2(work) } }, {}), /audience/);
});

// site_run stubbed: topics, pick and article answered as the Python module prints them.
function stubRun(calls, { picked = [{ query: 'what is the 80 20 rule for airbnb', name: 'staylumen-80-20' }], passed = true } = {}) {
  return async (site, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'topics') return { topics: 12 };
    if (args[0] === 'pick') return { picked, skipped: {} };
    return { run: `D:/geo-v2/runs/${args[4]}`, passed, held: passed ? [] : ['q2'], words: 1800, paid_usd: 0.02, seconds: 1700 };
  };
}

test('a run writes the next topics, imports each and publishes only what passed, when asked', async () => {
  const { root, work, site } = await fixture();
  await writeFile(join(work, 'topics.json'), '[]');
  const calls = [];
  const imported = [];
  const published = [];
  const entry = await writePosts({
    root, site, count: 1, publish: true, run: stubRun(calls), log: () => {},
    importer: async ({ runDir }) => { imported.push(runDir); return { slug: 'airbnb-80-20-rule', review: { passed: true, failures: [] } }; },
    publisher: async ({ only }) => { published.push(only); return { published: 1, report: [] }; },
  });
  assert.deepEqual(calls, ['pick --count 1', 'article --topic what is the 80 20 rule for airbnb --name staylumen-80-20 --approve 0.1']);
  assert.deepEqual(imported, ['D:/geo-v2/runs/staylumen-80-20']);
  assert.deepEqual(published, [['airbnb-80-20-rule']]);
  assert.equal(entry.written[0].queue, 'published');
  assert.equal(JSON.parse(await readFile(join(root, PROFILE_V2), 'utf8')).schema, 'blog-site/v2');
});

test('a held article stays in drafts; a site without a topic list builds one only when its cost is approved', async () => {
  const { root, site } = await fixture();
  const calls = [];
  const waiting = await writePosts({ root, site, count: 1, run: stubRun(calls), log: () => {} });
  assert.match(waiting.waiting, /no topic list yet/);
  assert.deepEqual(calls, []);
  const approved = { ...site, geoBlog: { ...site.geoBlog, v2: { ...site.geoBlog.v2, topicsApproveUsd: 0.3 } } };
  const entry = await writePosts({
    root, site: approved, count: 1, publish: true, run: stubRun(calls, { passed: false }), log: () => {},
    importer: async () => ({ slug: 's', review: { passed: false, failures: ['blog flow final check: held; A/B not right: q2'] } }),
    publisher: async () => assert.fail('a held article is not published'),
  });
  assert.equal(calls[0], 'topics --approve 0.3');
  assert.equal(entry.written[0].queue, 'drafts');
  const none = await writePosts({ root, site: approved, count: 2, run: stubRun([], { picked: [] }), log: () => {} });
  assert.match(none.waiting, /no topic left/);
});

test('the importer holds an article the flow\'s final check held, and names why', () => {
  assert.deepEqual(flowHeld(null), []);
  assert.deepEqual(flowHeld({ final: { passed: true } }), []);
  const [why] = flowHeld({ final: { passed: false, held: ['q2-m1'], gates: { figures: ['12'], sources: [], links: {} }, conflicts: { against_site: { R3: ['s1'] }, internal: [] } } });
  assert.equal(why, 'blog flow final check: held; A/B not right: q2-m1; gates: figures; conflicts: R3');
});

test('the batch writes on its own rhythm: once a day, or once a week (on its weekday when named)', () => {
  assert.deepEqual(writeSchedule({}), { every: 'week', count: 1 });
  assert.throws(() => writeSchedule({ geoBlog: { write: { every: 'month' } } }), /day" or "week/);
  assert.throws(() => writeSchedule({ geoBlog: { write: { every: 'week', count: 0 } } }), /count/);
  const day = { every: 'day', count: 2 };
  const at = (iso) => [{ at: iso, scheduled: true }];
  assert.equal(batchDue(day, [], new Date('2026-11-18T08:00:00Z')), true);
  assert.equal(batchDue(day, at('2026-11-18T01:00:00Z'), new Date('2026-11-18T08:00:00Z')), false);
  assert.equal(batchDue(day, at('2026-11-17T08:00:00Z'), new Date('2026-11-18T08:00:00Z')), true);
  const week = { every: 'week', count: 3 };
  assert.equal(batchDue(week, at('2026-11-12T08:00:00Z'), new Date('2026-11-18T08:00:00Z')), false);
  assert.equal(batchDue(week, at('2026-11-11T09:00:00Z'), new Date('2026-11-18T08:00:00Z')), true, 'a task a little early');
  assert.equal(batchDue(week, [{ at: '2026-11-17T08:00:00Z' }], new Date('2026-11-18T08:00:00Z')), true, 'a run by hand is not the schedule');
  const monday = { every: 'week', count: 2, weekday: 'mon' };
  assert.equal(batchDue(monday, [], new Date('2026-11-18T08:00:00Z')), false);
  assert.equal(batchDue(monday, [], new Date('2026-11-23T08:00:00Z')), true);
});

test('blog:batch writes geoBlog.write.count when due, logs the run, and waits for the old flow', async () => {
  const { root, site } = await fixture({ write: { every: 'day', count: 2 } });
  const counts = [];
  const write = async ({ count, publish }) => { counts.push([count, publish]); return { at: '2026-11-18T08:00:00.000Z', count, written: [{ queue: 'approved' }, { queue: 'drafts' }], waiting: null }; };
  const now = new Date('2026-11-18T08:00:00Z');
  assert.equal((await blogBatch({ root, scheduled: true, now, write, log: () => {} })).code, 0);
  const second = await blogBatch({ root, scheduled: true, now: new Date('2026-11-18T20:00:00Z'), write, log: () => {} });
  assert.equal(second.due, false);
  await blogBatch({ root, count: 1, publish: true, now, write, log: () => {} });
  assert.deepEqual(counts, [[2, false], [1, true]]);
  const log = JSON.parse(await readFile(join(root, BATCH_LOG), 'utf8'));
  assert.deepEqual(log.map((item) => [item.by, item.scheduled]), [['blog-batch', true], ['blog-batch', false]]);
  await writeFile(join(root, 'site.json'), JSON.stringify({ ...site, geoBlog: { ...site.geoBlog, flow: undefined } }));
  await assert.rejects(blogBatch({ root, write, log: () => {} }), /not "v2"/);
});

test('the site run\'s geo-blogs step writes what the site lacks of geoBlog.count, and waits for the owner', async () => {
  const sf = await mkdtemp(join(tmpdir(), 'sf-'));
  await mkdir(join(sf, 'src/sitefactory/blog'), { recursive: true });
  await writeFile(join(sf, 'src/sitefactory/blog/site_run.py'), '');
  const { root, site } = await fixture({ count: 3, v2: { ...v2('D:/w'), siteFactory: sf } });
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify([{ slug: 'a', status: 'published', geo: { run: 'r' } }, { slug: 'b', status: 'published' }]));
  const counts = [];
  const write = async ({ count, publish }) => { counts.push([count, publish]); return { count, written: [], waiting: count > 1 ? 'no topic left' : null }; };
  assert.equal(await runV2(root, site, { write }), 2, 'two lacking, none left: waiting');
  assert.equal(await runV2(root, site, { count: 1, write }), 0);
  assert.deepEqual(counts, [[2, true], [1, true]]);
  assert.equal(JSON.parse(await readFile(join(root, BATCH_LOG), 'utf8')).length, 2);
  assert.equal(await runV2(root, { ...site, geoBlog: { ...site.geoBlog, v2: { ...site.geoBlog.v2, siteFactory: join(root, 'none') } } }, { write }), 2);
});

test('a hand fix\'s recheck made of the article as it is now stands for the flow\'s final check; an older one does not', async () => {
  const run = await mkdtemp(join(tmpdir(), 'blog-final-'));
  const article = join(run, '06-article.natural.md');
  await writeFile(article, '# A\n\n## B\n\nText.\n');
  await writeFile(join(run, 'pipeline-report.json'), JSON.stringify({ final: { passed: false, held: [], gates: { figures: [] }, conflicts: { against_site: { R21: ['s1'] }, internal: [] } } }));
  const at = (path, iso) => utimes(path, new Date(iso), new Date(iso));
  await at(article, '2026-11-18T05:00:00Z');
  assert.deepEqual(await flowFinal(run, article).then((found) => found.by), 'pipeline-report.json');
  // a recheck written before the article's last edit is of another text
  const recheck = join(run, 'handfix_1118.json');
  await writeFile(recheck, JSON.stringify({ figures: [], sources: [], competitors: {}, replacements: [], links: {}, conflicts: { against_site: {}, internal: [] }, items: {}, passed: true }));
  await at(recheck, '2026-11-18T04:59:00Z');
  assert.match(flowHeld({ final: (await flowFinal(run, article)).final })[0], /conflicts: R21/);
  await at(recheck, '2026-11-18T05:01:00Z');
  const fixed = await flowFinal(run, article);
  assert.equal(fixed.by, 'handfix_1118.json');
  assert.deepEqual(flowHeld({ final: fixed.final }), []);
  // an article hash decides over the time; a newer failing recheck wins over an older passing one
  await writeFile(join(run, 'handfix_1119.json'), JSON.stringify({ article_sha256: 'other', passed: false, conflicts: {}, items: {} }));
  assert.equal((await flowFinal(run, article)).by, 'handfix_1118.json');
  const sha = createHash('sha256').update(await readFile(article)).digest('hex');
  await writeFile(join(run, 'handfix_1120.json'), JSON.stringify({ article_sha256: sha, passed: false, conflicts: { against_site: {}, internal: [] }, items: { 'q2-m1': { result: 'wrong' } }, links: { s3: ['/x/'] } }));
  await at(join(run, 'handfix_1120.json'), '2026-11-18T05:02:00Z');
  const held = await flowFinal(run, article);
  assert.equal(held.by, 'handfix_1120.json');
  assert.equal(flowHeld({ final: held.final })[0], 'blog flow final check: held; A/B not right: q2-m1; gates: links');
});
