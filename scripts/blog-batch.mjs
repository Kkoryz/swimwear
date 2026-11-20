#!/usr/bin/env node

// The site's blog batch (owner 2026-11-16: production local, in batches; the server only publishes): writes N new
// articles through the blog flow of 11-16 (lib/blog-v2.mjs; site.json geoBlog.flow "v2"), each past its final check
// and the AI review into content/blog-queue/approved, a held one in drafts with its reasons. Publishing stays with
// blog:publish on the days site.json blogPublish names (deploy/github/blog-publish.yml), unless --publish.
// How often and how many: site.json geoBlog.write { every: "day" | "week", count, weekday? }. A scheduled run
// (--scheduled; Windows Task Scheduler, README "Blog batch") writes only when that is due, so one daily task serves
// both: every "day" writes once a day, every "week" once in seven days (on `weekday` when named). By hand it writes
// now. Every run is logged in content/blog-queue/batch-log.json.
// Usage: node scripts/blog-batch.mjs [--site <dir>] [--count N] [--scheduled] [--publish]
// Exit 0: written (or not due); 2: waiting for the owner (no approved topic list, no topic left); 1: failed.

import { resolve } from 'node:path';
import { BATCH_LOG, appendBatchLog, batchDue, isV2, writePosts, writeSchedule } from './lib/blog-v2.mjs';
import { cliArgs, runMain, wholeNumber } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';

const WAITS = 2;

export async function blogBatch({ root = process.cwd(), count = null, scheduled = false, publish = false, now = new Date(), write = writePosts, log = console.log } = {}) {
  const site = await readJson(resolve(root, 'site.json'));
  if (!isV2(site)) throw new Error('site.json geoBlog.flow is not "v2": the batch writes with the 11-16 blog flow only (the earlier flow runs `geo site` from geo-blogs.mjs)');
  const schedule = writeSchedule(site);
  if (scheduled && !batchDue(schedule, await readJson(resolve(root, BATCH_LOG), []), now)) {
    log(`not due: geoBlog.write.every ${schedule.every}${schedule.weekday ? ` on ${schedule.weekday}` : ''}`);
    return { due: false, code: 0 };
  }
  const entry = await write({ root, site, count: count ?? schedule.count, publish, now: () => now, log });
  await appendBatchLog(root, { ...entry, by: 'blog-batch', scheduled });
  if (entry.waiting) log(`waiting: ${entry.waiting}`);
  const held = entry.written.filter((item) => item.queue === 'drafts').length;
  log(`${entry.written.length} written: ${entry.written.length - held} passed, ${held} held in drafts`);
  return { due: true, entry, code: entry.waiting ? WAITS : 0 };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ site: { type: 'string' }, count: { type: 'string' }, scheduled: { type: 'boolean' }, publish: { type: 'boolean' } });
  const root = resolve(values.site ?? '.');
  process.chdir(root);
  const { code } = await blogBatch({ root, count: values.count ? wholeNumber('--count', values.count) : null, scheduled: Boolean(values.scheduled), publish: Boolean(values.publish) });
  process.exitCode = code;
}, { stack: true });
