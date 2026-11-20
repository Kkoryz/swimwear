#!/usr/bin/env node

// Brings the site's own photos (Site Factory projects/<line>/media/, schema sf/media/v1) into the template: responsive
// WebP in public/media/site/ and src/data/site-media.json. Factory and team photos fill the classes the library never
// generates (placeholderKinds, e.g. process); product, hero, fabric and in-use photos come before the library's photos
// of their class, and a photo naming pages (pages: [routes]) is used on those pages only. Nothing here says how a photo
// was made (owner, 2026-10-24): which photos still need replacing with real ones is the pre-launch handoff's
// (scripts/handoff.mjs), which the launch preflight reads.
// Usage: node scripts/import-site-media.mjs --project <site-factory projects/<line> folder>

import { mkdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { writeResponsiveWebp } from './lib/web-image.mjs';
import { siteXmp } from './lib/image-seo.mjs';

export const SITE_MEDIA_SCHEMA = 'seo-site-media-v1';
// Site Factory photo kinds -> the template's photography class they fill.
export const KIND_TO_CLASS = { factory: 'process', team: 'process', product: 'product', hero: 'hero', material: 'material', lifestyle: 'lifestyle' };

export async function importSiteMedia({ project, root = process.cwd() }) {
  const { default: sharp } = await import('sharp');
  // A project with no photos of its own yet (no media/media.json) has none: the library and the image slots fill in.
  const source = await readJson(resolve(project, 'media/media.json'), { schema_version: 'sf/media/v1', photos: [] });
  if (source.schema_version !== 'sf/media/v1') throw new Error(`unsupported media schema: ${source.schema_version}`);
  await mkdir(resolve(root, 'public/media/site'), { recursive: true });
  // The XMP each file carries while site.json imageSeo is on: the site as creator, its copyright, the digital source
  // type only where the photo's record states one (lib/image-seo.mjs siteXmp).
  const xmpOf = await siteXmp(root);
  const photos = [];
  for (const photo of source.photos || []) {
    const mediaClass = KIND_TO_CLASS[photo.kind];
    if (!mediaClass) throw new Error(`${photo.file}: unknown photo kind ${photo.kind}`);
    if (!photo.alt?.trim()) throw new Error(`${photo.file}: alt text is required`);
    if (photo.pages != null && !(Array.isArray(photo.pages) && photo.pages.every((route) => /^\/.*\/$|^\/$/.test(route)))) throw new Error(`${photo.file}: pages must list routes like /bikini/`);
    const file = resolve(project, 'media', photo.file);
    const web = await writeResponsiveWebp(sharp, file, { root, dir: 'media/site', name: basename(photo.file, extname(photo.file)), xmp: xmpOf(photo.digitalSourceType ?? null) });
    photos.push({ class: mediaClass, kind: photo.kind, ...web, alt: photo.alt.trim(), sourceFile: photo.file, ...(photo.pages?.length ? { pages: photo.pages } : {}), ...(photo.digitalSourceType ? { digitalSourceType: photo.digitalSourceType } : {}) });
  }
  const data = { schemaVersion: SITE_MEDIA_SCHEMA, source: resolve(project, 'media/media.json'), photos };
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeJson(resolve(root, 'src/data/site-media.json'), data);
  return data;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ project: { type: 'string' } });
  if (!values.project) return usage('Usage: node scripts/import-site-media.mjs --project <site-factory projects/<line> folder>');
  const data = await importSiteMedia({ project: resolve(values.project) });
  console.log(`${data.photos.length} site photos`);
});
