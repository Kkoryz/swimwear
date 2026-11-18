// Every file the built site asks for exists (site13 blind audit M3: the reference's footer rule
// content:url(/logo.png) answered 404 on every page once the full-size logo left public/). Each url() of the built
// CSS (stylesheets and inline style) and each src, srcset, poster and <link href> of the built HTML that names a file
// of this site must resolve to a file in dist/. Data URIs, other hosts and fragments are not files of the site; page
// links are the preflight's broken_internal_link.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

// The local files a stylesheet's text names: url(...) values, quoted or not.
export const cssUrls = (css) => [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g)].map((match) => (match[1] ?? match[2] ?? match[3]).trim()).filter((url) => url && !EXTERNAL.test(url));

// The local files an HTML page names: src, poster, every srcset candidate, <link href> (stylesheets, icons,
// preloads, the manifest) and the url()s of its inline styles.
export function htmlUrls(html) {
  const urls = [];
  for (const [tag] of html.matchAll(/<(?:img|source|script|video|audio|iframe|link|input)\b[^>]*>/gi)) {
    const value = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1] ?? null;
    for (const name of ['src', 'poster']) if (value(name)) urls.push(value(name));
    if (value('srcset')) urls.push(...value('srcset').split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean));
    if (/^<link\b/i.test(tag) && value('href') && !/\brel="(?:canonical|alternate|prev|next)"/i.test(tag)) urls.push(value('href'));
  }
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) urls.push(...cssUrls(css));
  for (const [, style] of html.matchAll(/\sstyle="([^"]*)"/gi)) urls.push(...cssUrls(style.replace(/&quot;/g, '"').replace(/&#39;/g, "'")));
  return urls.map((url) => url.replace(/&amp;/g, '&')).filter((url) => url && !EXTERNAL.test(url));
}

async function filesUnder(dir, keep) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(path, keep));
    else if (keep(entry.name)) found.push(path);
  }
  return found;
}

// [{ route: the file that names it, issue: 'asset_url_unresolved', detail }] for every local URL of the built CSS and
// HTML that names no file in dist/ (a path ending in / is a page: its index.html).
export async function assetRefProblems(root) {
  const dist = resolve(root, 'dist');
  if (!existsSync(dist)) return [];
  const missing = new Map();
  for (const file of await filesUnder(dist, (name) => /\.(css|html)$/i.test(name))) {
    const text = await readFile(file, 'utf8');
    const urls = file.endsWith('.css') ? cssUrls(text) : htmlUrls(text);
    // A root-relative URL is the site's; a relative one is the file's own folder's (a stylesheet under _astro/, or a
    // page's: dist/<route>/index.html).
    for (const url of urls) {
      const path = decodeURIComponent(url.split(/[?#]/)[0]);
      if (!path) continue;
      const target = path.startsWith('/') ? join(dist, path) : join(dirname(file), path);
      const exists = path.endsWith('/') ? existsSync(join(target, 'index.html')) : existsSync(target);
      if (exists) continue;
      const from = `/${relative(dist, file).split('\\').join('/')}`;
      (missing.get(url) ?? missing.set(url, new Set()).get(url)).add(from);
    }
  }
  return [...missing].sort(([a], [b]) => a.localeCompare(b)).map(([url, from]) => ({ route: url, issue: 'asset_url_unresolved', detail: `named by ${[...from].slice(0, 3).join(' ')}${from.size > 3 ? ` and ${from.size - 3} more` : ''}, no such file in dist/` }));
}
