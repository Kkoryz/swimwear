import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { pruneUnreferenced, pruneUnusedGenerated } from '../lib/release-guard.mjs';
import { SHARE_SIZE, shareImages, shareImageSrc, writeShareImages } from '../lib/share-image.mjs';

test("a page's share image is the JPG cut from its photo, never a competitor's file", () => {
  assert.equal(shareImageSrc('/media/photos/general-hero-1-1536.webp'), '/media/photos/general-hero-1-og.jpg');
  assert.equal(shareImageSrc('/og-image.png'), '/og-image-og.jpg');
  assert.equal(shareImageSrc('/media/site/factory floor.jpg'), '/media/site/factory floor-og.jpg');
  assert.equal(shareImageSrc('/media/reference/hero-1536.webp'), null, 'a reference photo never ships');
  assert.equal(shareImageSrc('https://cdn.example.com/a.webp'), null);
  assert.equal(shareImageSrc('/logo.svg'), null);
  assert.equal(shareImageSrc(null), null);
});

test('the build cuts each share JPG the pages name at 1200x630 from the widest file of its photo, and a release keeps it', async () => {
  const { default: sharp } = await import('sharp');
  const root = await mkdtemp(join(tmpdir(), 'share-'));
  try {
    const publicDir = join(root, 'public');
    const dist = join(root, 'dist');
    await mkdir(join(publicDir, 'media/photos'), { recursive: true });
    await mkdir(join(dist, 'media/photos'), { recursive: true });
    await mkdir(join(dist, 'about'), { recursive: true });
    const photo = (width, height, path, background = '#3366aa') => sharp({ create: { width, height, channels: 3, background } }).webp().toFile(path);
    await photo(1536, 1024, join(publicDir, 'media/photos/general-hero-1-1536.webp'));
    await photo(960, 640, join(publicDir, 'media/photos/general-hero-1-960.webp'), '#cc2200');
    await photo(1536, 1024, join(publicDir, 'media/photos/general-hero-10-1536.webp'));
    await sharp({ create: { ...SHARE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(join(publicDir, 'og-image.png'));
    for (const name of ['general-hero-1-1536.webp', 'general-hero-1-960.webp', 'unused-960.webp']) await writeFile(join(dist, 'media/photos', name), 'x');
    const meta = (src) => `<html><head><meta property="og:image" content="https://x.com${src}"><meta property="og:image:width" content="1200"></head><body><img src="/media/photos/general-hero-1-960.webp" srcset="/media/photos/general-hero-1-1536.webp 1536w"></body></html>`;
    await writeFile(join(dist, 'index.html'), meta('/media/photos/general-hero-1-og.jpg'));
    await writeFile(join(dist, 'about/index.html'), meta('/og-image-og.jpg'));
    assert.deepEqual(await writeShareImages(dist, publicDir), ['/media/photos/general-hero-1-og.jpg', '/og-image-og.jpg']);
    for (const path of ['media/photos/general-hero-1-og.jpg', 'og-image-og.jpg']) {
      const info = await sharp(join(dist, path)).metadata();
      assert.deepEqual([info.format, info.width, info.height], ['jpeg', 1200, 630], path);
    }
    const { channels } = await sharp(join(dist, 'media/photos/general-hero-1-og.jpg')).stats();
    assert.ok(channels[2].mean > channels[0].mean, 'cut from the 1536 file (blue), not the 960 (red)');
    // The release prune keeps it (a page names it); the library photo nobody names goes.
    assert.deepEqual(await pruneUnusedGenerated(dist), ['unused-960.webp']);
    await pruneUnreferenced(dist);
    assert.ok(existsSync(join(dist, 'media/photos/general-hero-1-og.jpg')) && existsSync(join(dist, 'og-image-og.jpg')));
    // The Astro integration runs it after the build, from the config's public folder into the build's output.
    await rm(join(dist, 'og-image-og.jpg'));
    const integration = shareImages();
    integration.hooks['astro:config:done']({ config: { publicDir: pathToFileURL(`${publicDir}/`) } });
    await integration.hooks['astro:build:done']({ dir: pathToFileURL(`${dist}/`) });
    assert.ok(existsSync(join(dist, 'og-image-og.jpg')));
    // A page naming a share image with no photo to cut it from fails the build.
    await writeFile(join(dist, 'index.html'), meta('/media/photos/gone-og.jpg'));
    await assert.rejects(writeShareImages(dist, publicDir), /og:image \/media\/photos\/gone-og.jpg has no photo/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
