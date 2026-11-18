// Content keys of built pages, so an audit measures again only the pages whose output changed. A page's key covers
// its HTML, every file its HTML points at in dist (scripts, images, fonts; of a stylesheet, only the rules the page can
// use, lib/css-subset.mjs), what the page was built from (its definition), and a key shared by all pages: the audit's
// own code (without its comments, lib/source-norm.mjs), the data it compares against, the list of built routes, the
// rules of the site's stylesheets that any page may use (tokens, tag rules) and its fonts, and the Playwright version.
// The build names its bundles by their content (/_astro/BaseLayout.<hash>.css): the names are read without the hash,
// so one module's rule changed changes the keys of the pages that show the module only (V-1 of Fable's 11-17 plan;
// owner 2026-11-17, site13's 40-minute run re-audited and re-shot every page for any change of the stylesheet).

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBuiltPage } from './built-site.mjs';
import { codeClosure } from './module-graph.mjs';
import { cssRules, pageCss, pageWords, sharedCss } from './css-subset.mjs';
import { sourceDigest } from './source-norm.mjs';

// A bundle's path without the build's content hash (/_astro/BaseLayout.CX3A9lJt.css: /_astro/BaseLayout.css).
export const unhashed = (path) => path.replace(/\.[A-Za-z0-9_-]{8}\.(css|m?js)$/, '.$1');
// A page's HTML with its bundles named without their hashes.
export const unhashedHtml = (html) => html.replace(/(\/_astro\/[^"'\s)?#]*?)\.[A-Za-z0-9_-]{8}\.(css|m?js)(?=["'\s)?#])/g, '$1.$2');
// The rules of a stylesheet, read once a process by its content.
const parsed = new Map();
const rulesOf = (text) => { if (!parsed.has(text)) parsed.set(text, cssRules(text)); return parsed.get(text); };

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
  for (const file of await codeClosure(root, code)) hash.update(`code:${file}`).update(sourceDigest(file, await fileContent(resolve(root, file))));
  for (const file of files) hash.update(`file:${file}`).update(await fileContent(resolve(root, file)));
  hash.update(JSON.stringify(routes));
  for (const folder of ['dist/_astro', 'dist/fonts']) {
    const dir = resolve(root, folder);
    const names = existsSync(dir) ? (await readdir(dir)).filter((name) => folder.endsWith('fonts') || name.endsWith('.css')).sort() : [];
    for (const name of names.map((file) => ({ file, key: unhashed(file) })).sort((left, right) => left.key.localeCompare(right.key))) {
      const content = await readFile(resolve(dir, name.file));
      hash.update(`${folder}/${name.key}`).update(name.file.endsWith('.css') ? sharedCss(rulesOf(content.toString('utf8'))) : content);
    }
  }
  const playwright = await readFile(resolve(root, 'node_modules/playwright/package.json'), 'utf8').then((text) => JSON.parse(text).version, () => 'none');
  return hash.update(`playwright:${playwright}`).digest('hex').slice(0, 24);
}

// One built page's key, or null when the page is not built.
export async function builtPageKey(root, route, shared, definition = null) {
  const html = await readBuiltPage(root, route);
  if (html == null) return null;
  const hash = createHash('sha256').update(shared).update(unhashedHtml(html)).update(JSON.stringify(definition));
  const assets = [];
  for (const asset of referencedAssets(html)) assets.push({ asset, key: unhashed(asset), content: await fileContent(resolve(root, 'dist', decodeURIComponent(asset).slice(1))) });
  assets.sort((left, right) => left.key.localeCompare(right.key) || left.content.compare(right.content));
  // What the page's selectors can find: its HTML and the scripts it loads.
  const offered = pageWords([html, ...assets.filter(({ asset }) => /\.m?js$/.test(asset)).map(({ content }) => content.toString('utf8'))]);
  for (const { asset, key, content } of assets) hash.update(key).update(asset.endsWith('.css') ? pageCss(rulesOf(content.toString('utf8')), offered) : content);
  return hash.digest('hex').slice(0, 24);
}
