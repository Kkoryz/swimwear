#!/usr/bin/env node

// The site's brand (site:run step "brand", after the competitor analysis has set the site's colours and type): the
// logo kit the owner or Site Factory supplies (<project>/brand/ with a logo) is brought in as it is; without one the
// site gets its own wordmark, drawn for its design (make-wordmark.mjs, owner 2026-10-25), and when no drawing passes
// or the image tool is unavailable, the typeset kit (build-brand-kit.mjs). The name and domain always come from the
// project's project.yaml. A generated logo is listed in the handoff as replaceable.
// Usage: node scripts/site-brand.mjs --project <site-factory projects/<line> folder>

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildBrandKit } from './build-brand-kit.mjs';
import { importBrandKit, projectIdentity } from './import-brand-kit.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { makeWordmark } from './make-wordmark.mjs';

// Whether the project brings its own logo kit.
export async function suppliedKit(project) {
  const dir = resolve(project, 'brand');
  return existsSync(dir) && (await readdir(dir)).some((name) => /^logo\.(svg|png)$/.test(name));
}

export async function siteBrand({ project, root = process.cwd(), importer = importBrandKit, wordmark = makeWordmark, typeset = buildBrandKit }) {
  if (await suppliedKit(project)) return importer({ project, root });
  const { siteName, origin } = projectIdentity(await readFile(resolve(project, 'project.yaml'), 'utf8'));
  const domain = new URL(origin).host;
  const drawn = await wordmark({ name: siteName, domain, root }).catch((error) => ({ chosen: null, error: error.message }));
  if (drawn.chosen) return readJson(resolve(root, 'src/data/site-identity.json'));
  return typeset({ name: siteName, domain, root });
}

runMain(import.meta.url, async () => {
  const { project } = cliArgs({ project: { type: 'string' } }).values;
  if (!project) return usage('Usage: node scripts/site-brand.mjs --project <site-factory projects/<line> folder>');
  const identity = await siteBrand({ project: resolve(project) });
  console.log(`brand: ${identity.source} (${identity.logo?.src})`);
});
