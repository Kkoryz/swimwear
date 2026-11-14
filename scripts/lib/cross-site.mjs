// Stage 11: this build's content fingerprint (docs/research/content-fingerprint.json) and its comparison with the owner's
// other sites (docs/research/cross-site.json; scripts/lib/content-fingerprint.mjs).

import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parsePage, readBuiltPage } from './built-site.mjs';
import { FINGERPRINT_SCHEMA, NEAR_DUPLICATE, crossSiteDuplicates, minhash, shingles } from './content-fingerprint.mjs';
import { readJson, writeJson } from './json-io.mjs';
import { isIndexable } from './seo-head.mjs';
import { loadSitePages } from './site-pages.mjs';

export async function writeFingerprint({ root = process.cwd() } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const pages = {};
  for (const page of (await loadSitePages(root)).filter(isIndexable)) {
    const html = await readBuiltPage(root, page.route);
    if (html) pages[page.route] = { minhash: minhash(shingles(parsePage(html).mainText)) };
  }
  const fingerprint = { schemaVersion: FINGERPRINT_SCHEMA, host: identity?.origin ? new URL(identity.origin).host : null, builtAt: new Date().toISOString(), pages };
  await writeFile(resolve(root, 'docs/research/content-fingerprint.json'), `${JSON.stringify(fingerprint)}\n`);
  return fingerprint;
}

async function loadOther(path) {
  const file = (await stat(path)).isDirectory() ? join(path, 'docs/research/content-fingerprint.json') : path;
  const fingerprint = await readJson(file);
  if (fingerprint.schemaVersion !== FINGERPRINT_SCHEMA) throw new Error(`${file} is not a content fingerprint`);
  return fingerprint;
}

export async function checkCrossSite({ root = process.cwd(), against = [], sharedDir = process.env.SITE_FINGERPRINTS_DIR } = {}) {
  const own = await writeFingerprint({ root });
  const paths = [...against];
  if (sharedDir) for (const file of await readdir(sharedDir).catch(() => [])) if (file.endsWith('.json')) paths.push(join(sharedDir, file));
  const others = [];
  for (const path of paths) others.push(await loadOther(resolve(path)));
  const duplicates = crossSiteDuplicates(own, others);
  const report = { checkedAt: new Date().toISOString(), host: own.host, threshold: NEAR_DUPLICATE, comparedWith: others.map((other) => other.host).filter((host) => host !== own.host), duplicates };
  await writeJson(resolve(root, 'docs/research/cross-site.json'), report);
  return report;
}
