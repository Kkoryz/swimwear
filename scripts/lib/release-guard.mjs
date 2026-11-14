// Competitor (reference) files never ship. While a template is developed its reference placeholder photos render from
// public/media/reference/ so the design can be reviewed; a release build (SITE_RELEASE=1, `pnpm build:release`) removes
// them from dist and fails when any built page still points at one. Capture evidence lives under docs/research/.

import { readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? htmlFiles(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])));
  return nested.flat();
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
        const leaks = await referenceLeaks(dist);
        if (leaks.length) throw new Error(`${LEAK_MESSAGE}: ${leaks.slice(0, 5).map((leak) => `${leak.file} -> /${leak.path}/`).join('; ')}${leaks.length > 5 ? ` (+${leaks.length - 5} more)` : ''}`);
      },
    },
  };
}
