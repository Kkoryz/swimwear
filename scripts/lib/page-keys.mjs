// Content keys of built pages, so an audit measures again only the pages whose output changed. A page's key covers
// its HTML, every file its HTML points at in dist (stylesheets, scripts, images, fonts), what the page was built from
// (its definition), and a key shared by all pages: the audit's own code, the data it compares against, the list of
// built routes, the site's stylesheets and fonts, and the Playwright version.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBuiltPage } from './built-site.mjs';
import { codeClosure } from './module-graph.mjs';

// Root-relative files a page's HTML points at (src, href, srcset), without query or fragment.
export function referencedAssets(html) {
  const found = new Set();
  for (const match of html.matchAll(/\s(?:src|href)="(\/[^"#?]*)/g)) found.add(match[1]);
  for (const match of html.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of match[1].split(',')) { const url = part.trim().split(/\s+/)[0]; if (url.startsWith('/')) found.add(url.split(/[?#]/)[0]); }
  return [...found].filter((path) => !path.endsWith('/')).sort();
}

const fileContent = async (path) => (existsSync(path) ? readFile(path) : Buffer.from('missing'));

// The key every page of one audit run shares.
export async function sharedPageKey(root, { code = [], files = [], routes = [] } = {}) {
  const hash = createHash('sha256');
  for (const file of await codeClosure(root, code)) hash.update(`code:${file}`).update(await fileContent(resolve(root, file)));
  for (const file of files) hash.update(`file:${file}`).update(await fileContent(resolve(root, file)));
  hash.update(JSON.stringify(routes));
  for (const folder of ['dist/_astro', 'dist/fonts']) {
    const dir = resolve(root, folder);
    const names = existsSync(dir) ? (await readdir(dir)).filter((name) => folder.endsWith('fonts') || name.endsWith('.css')).sort() : [];
    for (const name of names) hash.update(`${folder}/${name}`).update(await readFile(resolve(dir, name)));
  }
  const playwright = await readFile(resolve(root, 'node_modules/playwright/package.json'), 'utf8').then((text) => JSON.parse(text).version, () => 'none');
  return hash.update(`playwright:${playwright}`).digest('hex').slice(0, 24);
}

// One built page's key, or null when the page is not built.
export async function builtPageKey(root, route, shared, definition = null) {
  const html = await readBuiltPage(root, route);
  if (html == null) return null;
  const hash = createHash('sha256').update(shared).update(html).update(JSON.stringify(definition));
  for (const asset of referencedAssets(html)) hash.update(asset).update(await fileContent(resolve(root, 'dist', decodeURIComponent(asset).slice(1))));
  return hash.digest('hex').slice(0, 24);
}
