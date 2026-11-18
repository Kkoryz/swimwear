// The share image (og:image) of a brand kit the site makes for itself (make-wordmark.mjs, build-brand-kit.mjs): the
// logo centred on the site's page colour, at the size social networks show. Every page names it (the SEO audit fails a
// page without one), as it does a supplied kit's og-image.png.
// Each page's og:image is a SHARE_SIZE JPG cut from its photo (or from the site's share image): the page names
// <photo>-og.jpg (shareImageSrc), and the build cuts it from the photo's widest file in public/ (shareImages, an Astro
// integration), so it exists wherever a page names it and a release keeps it (the release prune keeps what a page
// names). Four-site audit 2026-11-17 (Fable's plan, Images): og:image was the hero's 1536px WebP, a format and a shape
// some networks' previews do not take; 1200x630 JPG is what they all show uncropped.

import { readdir, readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCE_PATHS } from './release-guard.mjs';

export const SHARE_SIZE = Object.freeze({ width: 1200, height: 630 });
const SHARE_SUFFIX = '-og.jpg';
const SHARE_QUALITY = 82;
const SOURCE = /\.(?:webp|png|jpe?g)$/i;

export async function writeShareImage(sharp, { logo, background, path }) {
  const fitted = await sharp(logo).resize({ width: 720, height: 220, fit: 'inside' }).png().toBuffer();
  await sharp({ create: { ...SHARE_SIZE, channels: 4, background } }).composite([{ input: fitted, gravity: 'centre' }]).png().toFile(path);
  return { ...SHARE_SIZE };
}

// The share JPG a photo's file is cut into: beside it, named after the photo without its width
// (/media/photos/general-hero-1-1536.webp -> /media/photos/general-hero-1-og.jpg), or null for a file it is not cut
// from: a competitor's (reference) file, which a release never ships, or one not in this site's own folders.
export function shareImageSrc(src) {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//') || !SOURCE.test(src.split(/[?#]/)[0])) return null;
  const path = src.split(/[?#]/)[0];
  if (REFERENCE_PATHS.some((folder) => path.startsWith(`/${folder}/`))) return null;
  const slash = path.lastIndexOf('/');
  const stem = path.slice(slash + 1).replace(SOURCE, '').replace(/-\d+$/, '');
  return stem ? `${path.slice(0, slash + 1)}${stem}${SHARE_SUFFIX}` : null;
}

// The file in publicDir a share JPG is cut from: the widest of its photo's files (<stem>.<ext> or <stem>-<width>.<ext>).
export async function shareSource(sharp, publicDir, shareSrc) {
  if (!shareSrc.endsWith(SHARE_SUFFIX)) return null;
  const slash = shareSrc.lastIndexOf('/');
  const folder = join(publicDir, decodeURIComponent(shareSrc.slice(1, slash + 1)));
  const stem = decodeURIComponent(shareSrc.slice(slash + 1, -SHARE_SUFFIX.length));
  const own = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?\\.(?:webp|png|jpe?g)$`, 'i');
  const names = (await readdir(folder).catch(() => [])).filter((name) => own.test(name));
  let best = null;
  for (const name of names) {
    const { width = 0 } = await sharp(join(folder, name)).metadata();
    if (!best || width > best.width) best = { path: join(folder, name), width };
  }
  return best?.path ?? null;
}

// One share JPG: the source cut to SHARE_SIZE from its centre, on white where it is transparent.
export const renderShareImage = (sharp, source, target) => sharp(source).resize({ ...SHARE_SIZE, fit: 'cover', position: 'centre' }).flatten({ background: '#ffffff' }).jpeg({ quality: SHARE_QUALITY, mozjpeg: true }).toFile(target);

// The share JPGs the built pages name (their og:image), cut into dist from publicDir: the files made. A page naming one
// whose photo is not in publicDir fails the build (a share link to nothing).
export async function writeShareImages(dist, publicDir) {
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  const named = new Set();
  for (const file of await htmlFiles(dist)) {
    for (const match of (await readFile(file, 'utf8')).matchAll(/<meta\b[^>]*\sproperty="og:image"[^>]*\scontent="([^"]+)"/g)) {
      const path = (() => { try { return new URL(match[1], 'http://share.invalid').pathname; } catch { return null; } })();
      if (path?.endsWith(SHARE_SUFFIX)) named.add(path);
    }
  }
  const made = [];
  for (const path of [...named].sort()) {
    const source = await shareSource(sharp, publicDir, path);
    if (!source) throw new Error(`og:image ${path} has no photo in public/ to be cut from`);
    const target = join(dist, decodeURIComponent(path.slice(1)));
    await mkdir(dirname(target), { recursive: true });
    await renderShareImage(sharp, source, target);
    made.push(path);
  }
  return made;
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => (entry.isDirectory() ? htmlFiles(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])))).flat();
}

// The Astro integration that cuts them after every build (before the release guard prunes what no page names).
export function shareImages() {
  let publicDir = null;
  return {
    name: 'seo-site-share-images',
    hooks: {
      'astro:config:done': ({ config }) => { publicDir = fileURLToPath(config.publicDir); },
      'astro:build:done': async ({ dir }) => { await writeShareImages(fileURLToPath(dir), publicDir); },
    },
  };
}
