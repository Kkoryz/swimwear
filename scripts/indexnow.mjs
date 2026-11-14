#!/usr/bin/env node

// After a release goes live: tell IndexNow (Bing, Yandex, Seznam, Naver; shared between them) which URLs were added,
// changed or removed since the accepted SEO baseline (every indexable URL on a first release). The site's key comes
// from the registry through site:config (public/<key>.txt is served at the site root).
// Usage: node scripts/indexnow.mjs [--dry-run]

import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { changedRoutes, snapshotDrift } from './lib/seo-snapshot.mjs';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function submitIndexNow({ root = process.cwd(), dryRun = false, fetchImpl = fetch } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const runtime = await readJson(resolve(root, 'src/data/site-runtime.json'), {});
  const key = runtime.site?.indexnowKey;
  if (!identity?.origin || !key) throw new Error('IndexNow needs the site identity and the registry key (run pnpm site:config)');
  const snapshot = await readJson(resolve(root, 'docs/research/seo-snapshot.json'), null);
  if (!snapshot) throw new Error('no docs/research/seo-snapshot.json (run pnpm build:release)');
  const baseline = await readJson(resolve(root, 'docs/research/seo-baseline.json'), null);
  const routes = baseline
    ? changedRoutes(snapshotDrift(baseline, snapshot))
    : Object.entries(snapshot.pages).filter(([, page]) => !page.robots?.includes('noindex')).map(([route]) => route);
  const origin = identity.origin.replace(/\/$/, '');
  const urlList = routes.map((route) => `${origin}${route}`).slice(0, 10000);
  if (!urlList.length || dryRun) return { submitted: 0, urlList };
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList }),
  });
  // 200 and 202 are accepted; 403 means the key file is not served, 422 that a URL is not on the host.
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow answered HTTP ${response.status}`);
  return { submitted: urlList.length, urlList };
}

runMain(import.meta.url, async () => {
  const { submitted, urlList } = await submitIndexNow({ dryRun: process.argv.includes('--dry-run') });
  console.log(submitted ? `IndexNow: ${submitted} URL(s) submitted` : `IndexNow: ${urlList.length} URL(s)${urlList.length ? ' (dry run)' : ', nothing changed'}`);
  for (const url of urlList.slice(0, 20)) console.log(`- ${url}`);
});
