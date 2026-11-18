import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assetRefProblems, cssUrls, htmlUrls } from '../lib/asset-refs.mjs';

test('the URLs a stylesheet and a page name: url(), src, srcset, poster, <link href>; not other hosts, data or pages', () => {
  assert.deepEqual(cssUrls('.a{content:url("/logo.png") / "Brand"}.b{background:url(./bg.webp)}.c{background:url(data:image/png;base64,xx)}.d{background:url(https://x.com/a.png)}'), ['/logo.png', './bg.webp']);
  const html = '<link rel="icon" href="/favicon-48.png"><link rel="canonical" href="https://strandmill.com/"><link rel="stylesheet" href="/_astro/a.css"><img src="/m/a-960.webp" srcset="/m/a-480.webp 480w, /m/a-960.webp 960w"><video poster="/m/p.webp"></video><a href="/missing/">x</a><div style="background:url(&quot;/m/bg.webp&quot;)"></div>';
  assert.deepEqual(htmlUrls(html), ['/favicon-48.png', '/_astro/a.css', '/m/a-960.webp', '/m/a-480.webp', '/m/a-960.webp', '/m/p.webp', '/m/bg.webp']);
});

// site13 blind audit M3: the reference's footer rule content:url(/logo.png) answered 404 on every page.
test('the SEO audit fails a built stylesheet or page that names a file the build does not have', async () => {
  const root = await mkdtemp(join(tmpdir(), 'asset-refs-'));
  await mkdir(join(root, 'dist/_astro'), { recursive: true });
  await mkdir(join(root, 'dist/about'), { recursive: true });
  await writeFile(join(root, 'dist/_astro/site.css'), '.site-footer__brand{content:url(/logo.png)}.f{src:url(../fonts/a.woff2)}');
  await writeFile(join(root, 'dist/about/index.html'), '<html><head><link rel="icon" href="/favicon.png"></head><body><img src="/logo-header.webp" alt="x"></body></html>');
  await writeFile(join(root, 'dist/logo-header.webp'), 'x');
  await mkdir(join(root, 'dist/fonts'), { recursive: true });
  await writeFile(join(root, 'dist/fonts/a.woff2'), 'x');
  assert.deepEqual((await assetRefProblems(root)).map((problem) => [problem.route, problem.issue, problem.detail]), [
    ['/favicon.png', 'asset_url_unresolved', 'named by /about/index.html, no such file in dist/'],
    ['/logo.png', 'asset_url_unresolved', 'named by /_astro/site.css, no such file in dist/'],
  ]);
  await writeFile(join(root, 'dist/logo.png'), 'x');
  await writeFile(join(root, 'dist/favicon.png'), 'x');
  assert.deepEqual(await assetRefProblems(root), []);
});
