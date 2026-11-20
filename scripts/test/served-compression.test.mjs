import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { GZIP, gzipsType, nginxConfig } from '../lib/nginx-config.mjs';
import { serveStatic } from '../lib/static-server.mjs';
import { photoSrcset, publishedSrcset, webpWidth } from '../lib/web-image.mjs';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
// One raw response (no client-side decompression): its status, headers and bytes.
const get = (port, path, headers = {}) => new Promise((done, fail) => {
  request({ host: '127.0.0.1', port, path, headers }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
  }).on('error', fail).end();
});

test("the audits' server compresses what the generated Nginx config compresses, from the same rule (2026-11-20)", async () => {
  // The config is written from GZIP: one rule for the live server and the lab's.
  const { server } = nginxConfig({ host: 'example.com', root: '/var/www/example.com/current' });
  assert.match(server, new RegExp(`^    gzip_comp_level ${GZIP.level};$`, 'm'));
  assert.match(server, new RegExp(`^    gzip_min_length ${GZIP.minLength};$`, 'm'));
  assert.ok(server.includes(`    gzip_types ${GZIP.types.join(' ')};`));
  assert.ok(GZIP.types.includes('text/css') && GZIP.types.includes('application/javascript') && GZIP.types.includes('text/javascript'));
  assert.equal(gzipsType('text/html; charset=utf-8'), true, 'Nginx compresses text/html besides gzip_types');
  assert.equal(gzipsType('image/webp'), false);

  const dir = await mkdtemp(join(tmpdir(), 'served-gzip-'));
  const css = `body{color:#111}\n${'.a{margin:0}\n'.repeat(400)}`;
  await writeFile(join(dir, 'index.html'), `<!doctype html><title>x</title>${'<p>text</p>'.repeat(200)}`);
  await writeFile(join(dir, 'site.css'), css);
  await writeFile(join(dir, 'small.css'), 'a{b:c}');
  await writeFile(join(dir, 'photo.webp'), Buffer.alloc(4096, 1));
  const { port, close } = await serveStatic(dir, 0);
  try {
    const gz = { 'accept-encoding': 'gzip, deflate, br' };
    const styles = await get(port, '/site.css', gz);
    assert.equal(styles.headers['content-encoding'], 'gzip');
    assert.equal(styles.headers.vary, 'Accept-Encoding');
    assert.equal(gunzipSync(styles.body).toString(), css);
    assert.ok(styles.body.length < css.length / 4);
    assert.equal((await get(port, '/', gz)).headers['content-encoding'], 'gzip', 'a page too');
    // Under the least size, not of a listed type, or asked without gzip: sent as it is.
    const small = await get(port, '/small.css', gz);
    assert.equal(small.headers['content-encoding'], undefined);
    assert.equal(small.body.toString(), 'a{b:c}');
    assert.equal((await get(port, '/photo.webp', gz)).headers['content-encoding'], undefined);
    const plain = await get(port, '/site.css');
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(plain.body.toString(), css);
    // A browser's fetch reads the compressed page as the page (lib/audit-runtime.mjs assertServesDist compares it).
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/site.css`)).text(), css);
  } finally {
    await close();
  }
});

test("a blog card's and the featured post's photos name the sizes built for them; a post's image keeps its widest file (2026-11-20)", async () => {
  // A lossy WebP header of this width (RIFF, WEBP, VP8 chunk, frame tag, start code, width, height).
  const webp = (width) => {
    const head = Buffer.alloc(30);
    head.write('RIFF', 0, 'latin1'); head.write('WEBP', 8, 'latin1'); head.write('VP8 ', 12, 'latin1');
    head.writeUInt8(0x9d, 23); head.writeUInt8(0x01, 24); head.writeUInt8(0x2a, 25);
    head.writeUInt16LE(width, 26); head.writeUInt16LE(Math.round(width / 1.5), 28);
    return head;
  };
  const publicDir = await mkdtemp(join(tmpdir(), 'blog-sizes-'));
  await mkdir(join(publicDir, 'media/blog/post'), { recursive: true });
  // The 1536 file came out narrower (the weight budget): its srcset names the width it has.
  for (const [size, width] of [[480, 480], [960, 960], [1536, 1344]]) await writeFile(join(publicDir, `media/blog/post/V1-${size}.webp`), webp(width));
  await writeFile(join(publicDir, 'media/blog/post/V2-1536.webp'), webp(1536));
  assert.equal(webpWidth(join(publicDir, 'media/blog/post/V1-1536.webp')), 1344);
  assert.equal(publishedSrcset('/media/blog/post/V1-1536.webp', { publicDir }), '/media/blog/post/V1-480.webp 480w, /media/blog/post/V1-960.webp 960w, /media/blog/post/V1-1536.webp 1344w');
  assert.equal(publishedSrcset('/media/blog/post/V2-1536.webp', { publicDir }), null, 'one size only');
  assert.equal(publishedSrcset('/media/blog/post/V3-1536.webp', { publicDir }), null, 'no such file');
  assert.equal(publishedSrcset('/media/blog/post/cover.jpg', { publicDir }), null);
  const cards = await source('src/components/blog/PostListBlock.astro');
  assert.match(cards, /srcset=\{srcset\(item\.image\)\} sizes=\{srcset\(item\.image\) \? cardSizes : undefined\}/);
  assert.match(cards, /const cardSizes = `\(min-width: 1100px\) \$\{Math\.ceil\(100 \/ columns\)\}vw, \(min-width: 768px\) 50vw, 100vw`;/);
  const hub = await source('src/components/blog/BlogHubView.astro');
  assert.match(hub, /class="blog-featured__image" src=\{featured\.image\.src\} srcset=\{featuredSrcset\} sizes=\{featuredSrcset \? '100vw' : undefined\}/);
});

test("a post's own photo and the hub's header photo name their built sizes too; one without them names its file only (2026-11-20)", async () => {
  // MotelPilot's posts: the post's image is its widest file, V1-1536; the phone loaded it as the page's LCP (4.0s).
  const webp = (width) => {
    const head = Buffer.alloc(30);
    head.write('RIFF', 0, 'latin1'); head.write('WEBP', 8, 'latin1'); head.write('VP8 ', 12, 'latin1');
    head.writeUInt16LE(width, 26); head.writeUInt16LE(Math.round(width / 1.5), 28);
    return head;
  };
  const publicDir = await mkdtemp(join(tmpdir(), 'post-photo-'));
  await mkdir(join(publicDir, 'media/blog/post'), { recursive: true });
  for (const size of [480, 960, 1536]) await writeFile(join(publicDir, `media/blog/post/V1-${size}.webp`), webp(size));
  await writeFile(join(publicDir, 'media/blog/post/V2-1536.webp'), webp(1536));
  assert.equal(photoSrcset({ src: '/media/blog/post/V1-1536.webp' }, { publicDir }), '/media/blog/post/V1-480.webp 480w, /media/blog/post/V1-960.webp 960w, /media/blog/post/V1-1536.webp 1536w');
  assert.equal(photoSrcset({ src: '/media/blog/post/V2-1536.webp' }, { publicDir }), undefined, 'sizes not built: the one file');
  assert.equal(photoSrcset({ src: '/media/photos/hero-960.webp', srcset: '/media/photos/hero-480.webp 480w, /media/photos/hero-960.webp 960w' }, { publicDir }), '/media/photos/hero-480.webp 480w, /media/photos/hero-960.webp 960w', 'a record with its own srcset keeps it');
  assert.equal(photoSrcset(null), undefined);
  const post = await source('src/components/blog/BlogPostView.astro');
  assert.match(post, /const imageSrcset = image \? photoSrcset\(image\) : undefined;/);
  assert.match(post, /class="post-header__image"><img src=\{image\.src\} srcset=\{imageSrcset\} sizes=\{imageSrcset \? '100vw' : undefined\}/);
  assert.match(post, /class="post-article__image"><img src=\{image\.src\} srcset=\{imageSrcset\} sizes=\{imageSrcset \? ARTICLE_IMAGE_SIZES : undefined\}/);
  const hub = await source('src/components/blog/BlogHubView.astro');
  assert.match(hub, /header === 'hero' && photo && <figure class="blog-hub-hero__media media-box" style="--media-ratio: 4 \/ 3"><img src=\{photo\.src\} srcset=\{photoSet\} sizes=\{photoSet \? '\(min-width: 900px\) 50vw, 100vw' : undefined\}/);
  assert.match(hub, /class="blog-hub-hero__backdrop" src=\{photo\.src\} srcset=\{photoSet\} sizes=\{photoSet \? '100vw' : undefined\}/);
});
