#!/usr/bin/env node

// Brings stage 00's brand kit (projects/<line>/brand/) into a workspace: copies the files to the site root and
// writes src/data/site-identity.json. The brand is template-independent; the site name and domain come from the
// project's project.yaml (site_name, web_domain).
// Usage: node scripts/import-brand-kit.mjs --project <site-factory projects/<line> folder>

import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalOrigin, identityErrors, identityFromFiles } from './lib/brand-kit.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { writeJson } from './lib/json-io.mjs';

// Files stage 00 may provide, served from the site root under the same names.
export const BRAND_FILES = ['logo.svg', 'logo-wordmark.svg', 'logo-mark.svg', 'logo-mark.png', 'favicon.svg', 'og-image.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'logo.png', 'og-image.png', 'favicon.ico', 'site.webmanifest', 'logo.json'];

// Intrinsic size of an SVG (width/height attributes, else the viewBox) or a PNG (IHDR chunk).
export function imageSize(name, bytes) {
  if (name.endsWith('.png')) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (name.endsWith('.svg')) {
    const text = bytes.toString('utf8');
    const attribute = (key) => Number(text.match(new RegExp(`<svg[^>]*\\s${key}="([\\d.]+)(px)?"`))?.[1]);
    const box = text.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
    const width = attribute('width') || Number(box?.[1]);
    const height = attribute('height') || Number(box?.[2]);
    return width && height ? { width: Math.round(width), height: Math.round(height) } : null;
  }
  return null;
}

export function projectIdentity(yaml) {
  // YAML in its JSON form is JSON.
  const json = yaml.trim().startsWith('{') ? JSON.parse(yaml) : null;
  const field = (key) => json ? json[key] : yaml.match(new RegExp(`^${key}:\\s*(.+?)\\s*(#.*)?$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '');
  const siteName = field('site_name');
  const domain = field('web_domain');
  if (!siteName || !domain) throw new Error('project.yaml needs site_name and web_domain');
  return { siteName, origin: canonicalOrigin(domain) };
}

export async function importBrandKit({ project, root = process.cwd() }) {
  const { siteName, origin } = projectIdentity(await readFile(resolve(project, 'project.yaml'), 'utf8'));
  const brandDir = resolve(project, 'brand');
  const present = new Set(await readdir(brandDir));
  const files = {};
  await mkdir(resolve(root, 'public'), { recursive: true });
  // A brand file the current kit no longer has (e.g. an SVG replaced by a PNG) is removed, not left to be served.
  for (const name of BRAND_FILES.filter((file) => !present.has(file))) await rm(resolve(root, 'public', name), { force: true });
  for (const name of BRAND_FILES.filter((file) => present.has(file))) {
    const bytes = await readFile(resolve(brandDir, name));
    if (name !== 'logo.json') await copyFile(resolve(brandDir, name), resolve(root, 'public', name));
    files[name] = imageSize(name, bytes) ?? {};
  }
  const identity = identityFromFiles({ siteName, origin, source: 'stage-00', files });
  const errors = identityErrors(identity);
  if (errors.length) throw new Error(`stage 00 brand kit is incomplete: ${errors.join('; ')}`);
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeJson(resolve(root, 'src/data/site-identity.json'), identity);
  return identity;
}

runMain(import.meta.url, async () => {
  const { project } = cliArgs({ project: { type: 'string' } }).values;
  if (!project) return usage('Usage: node scripts/import-brand-kit.mjs --project <site-factory projects/<line> folder>');
  console.log(JSON.stringify(await importBrandKit({ project: resolve(project) }), null, 2));
});
