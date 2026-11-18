// Competitor (reference) files never ship. While a template is developed its reference placeholder photos render from
// public/media/reference/ so the design can be reviewed; a release build (SITE_RELEASE=1, `pnpm build:release`) removes
// them from dist and fails when any built page still points at one. Capture evidence lives under docs/research/.

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// The release guard's refusal, recognised by build-release.mjs (a refusal waits for the owner's photos).
export const LEAK_MESSAGE = 'release build still uses competitor files';

export const REFERENCE_PATHS = ['media/reference', 'reference-assets', 'navigation-assets'];
// The site's photo library (the image plan's photos). Library photos the plan no longer uses stay in public/ while
// the site is developed; a release ships only the ones a built page references. The folder name says nothing of how
// a photo was made (owner, 2026-10-24: that is recorded in the pre-launch handoff only); LEGACY_LIBRARY_PATH is
// where earlier libraries were written (apply-image-library moves them).
export const LIBRARY_PATH = 'media/photos';
export const LEGACY_LIBRARY_PATH = 'media/generated';

// Library files in dist that no built page (HTML, including its share image) references: removed from a release.
export async function pruneUnusedGenerated(dist) {
  const html = (await Promise.all((await htmlFiles(dist)).map((file) => readFile(file, 'utf8')))).join(' ');
  const folder = join(dist, LIBRARY_PATH);
  const files = await readdir(folder).catch(() => []);
  const unused = files.filter((name) => !html.includes(`/${LIBRARY_PATH}/${name}`));
  for (const name of unused) await rm(join(folder, name), { force: true });
  return unused;
}

// Every image and script of the build that nothing names: removed from a release (four-site audit 2026-11-17, A-9;
// site13 blind audit L7: _astro/client.*.js, 191 KB of React, shipped with no page loading it). An image anywhere in
// dist (public/'s brand files and photos alike) that no page, stylesheet, script, manifest or other text file names
// by its path or its file name, and a bundled script under _astro/ that no page and no other script imports. The files
// a browser or a crawler asks for by convention stay (favicon.ico, apple-touch-icon*.png).
const IMAGE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i;
const TEXT = /\.(?:html|css|js|mjs|json|xml|txt|webmanifest|svg)$/i;
const CONVENTIONAL_IMAGES = /^(?:favicon\.ico|apple-touch-icon(?:-[\w-]+)?\.png)$/i;
export async function pruneUnreferenced(dist) {
  const files = await allFiles(dist);
  const texts = new Map(await Promise.all(files.filter((file) => TEXT.test(file)).map(async (file) => [file, await readFile(file, 'utf8')])));
  const named = (file, name) => [...texts].some(([other, text]) => other !== file && (text.includes(name) || text.includes(encodeURI(name))));
  const removed = [];
  for (const file of files) {
    const path = relative(dist, file).split('\\').join('/');
    const name = path.split('/').at(-1);
    const script = path.startsWith('_astro/') && /\.m?js$/i.test(name);
    if (!(IMAGE.test(name) || script) || CONVENTIONAL_IMAGES.test(path)) continue;
    if (named(file, name)) continue;
    await rm(file, { force: true });
    removed.push(path);
  }
  return removed;
}

async function allFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => (entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)])))).flat();
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? htmlFiles(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])));
  return nested.flat();
}

// The stand-in marks (data-placeholder, read by the design review of the development build) leave the release: a
// shipped page's markup would call its own contact details placeholders (site13 claude-seo audit 2026-11-17, L-8: the
// footer's address block). What still stands in is held by the preflight from the site's data, not from these marks.
export const PLACEHOLDER_MARK = / data-placeholder="[^"]*"/g;
export async function stripPlaceholderMarks(dist) {
  let stripped = 0;
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(file, 'utf8');
    const clean = html.replace(PLACEHOLDER_MARK, '');
    if (clean !== html) { stripped += 1; await writeFile(file, clean); }
  }
  return stripped;
}

// Built pages that still reference a competitor file: [{ file, path }].
export async function referenceLeaks(dist) {
  const leaks = [];
  for (const file of await htmlFiles(dist)) {
    const html = await readFile(file, 'utf8');
    for (const path of REFERENCE_PATHS) if (html.includes(`/${path}/`)) leaks.push({ file, path });
  }
  return leaks;
}

export function releaseGuard() {
  return {
    name: 'seo-site-release-guard',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (process.env.SITE_RELEASE !== '1') return;
        const dist = fileURLToPath(dir);
        for (const path of REFERENCE_PATHS) await rm(join(dist, path), { recursive: true, force: true });
        await pruneUnusedGenerated(dist);
        await pruneUnreferenced(dist);
        await stripPlaceholderMarks(dist);
        const leaks = await referenceLeaks(dist);
        if (leaks.length) throw new Error(`${LEAK_MESSAGE}: ${leaks.slice(0, 5).map((leak) => `${leak.file} -> /${leak.path}/`).join('; ')}${leaks.length > 5 ? ` (+${leaks.length - 5} more)` : ''}`);
      },
    },
  };
}
