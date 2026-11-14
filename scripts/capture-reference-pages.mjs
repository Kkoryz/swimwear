#!/usr/bin/env node

// Captures several representative reference pages (one per page type) into docs/research/reference-pages/<type>/.
// Usage: node scripts/capture-reference-pages.mjs <origin> home=/ manufacturer=/some-path/ about=/about/ ...

import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureReference, normalizeReferenceUrl } from './capture-reference.mjs';

export function parsePageArgs(origin, args) {
  const base = normalizeReferenceUrl(origin);
  return args.map((arg) => {
    const match = arg.match(/^([a-z][a-z0-9-]*)=(\/.*)$/);
    if (!match) throw new Error(`expected <type>=/path/, got: ${arg}`);
    const url = new URL(match[2], base);
    if (url.origin !== new URL(base).origin) throw new Error(`page must stay on ${new URL(base).origin}: ${arg}`);
    return { type: match[1], url: url.href };
  });
}

export async function captureReferencePages({ origin, pages, root = process.cwd() }) {
  const results = [];
  for (const { type, url } of pages) {
    const dir = resolve(root, 'docs/research/reference-pages', type);
    const summary = await captureReference({ sourceUrl: url, root: dir });
    // Flatten to <type>/design-references, <type>/raw and <type>/reference-assets.
    await rm(resolve(dir, 'design-references'), { recursive: true, force: true });
    await rm(resolve(dir, 'raw'), { recursive: true, force: true });
    await rename(resolve(dir, 'docs/design-references'), resolve(dir, 'design-references'));
    await rename(resolve(dir, 'docs/research/raw'), resolve(dir, 'raw'));
    await rm(resolve(dir, 'reference-assets'), { recursive: true, force: true });
    await rename(resolve(dir, 'docs/research/reference-assets'), resolve(dir, 'reference-assets'));
    await rm(resolve(dir, 'docs'), { recursive: true, force: true });
    results.push({ type, url, assets: summary.assets.length, assetFailures: summary.assetFailures });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [origin, ...rest] = process.argv.slice(2).filter((arg) => arg !== '--');
  try {
    const pages = parsePageArgs(origin, rest);
    if (!pages.length) throw new Error('Usage: node scripts/capture-reference-pages.mjs <origin> <type>=/path/ ...');
    const results = await captureReferencePages({ origin, pages });
    console.log(JSON.stringify(results.map((item) => ({ ...item, assetFailures: item.assetFailures.length })), null, 2));
    if (results.some((item) => item.assetFailures.length)) { console.error('Some assets failed; see each capture-summary.json.'); process.exitCode = 1; }
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
