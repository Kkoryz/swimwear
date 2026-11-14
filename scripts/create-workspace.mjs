#!/usr/bin/env node

import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { ensureSiteRepo } from './lib/site-repo.mjs';
import { writeCoreManifest } from './lib/template-core.mjs';

const EXCLUDED_SEGMENTS = new Set(['.git', '.astro', 'dist', 'node_modules']);

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.href;
  } catch {
    throw new Error('sourceUrl must be an absolute HTTP(S) URL');
  }
}

// repo: the new site's own local git repository (lib/site-repo.mjs), created with its first commit.
export async function createWorkspace({ source, destination, sourceUrl, repo = true }) {
  const normalizedUrl = parseHttpUrl(sourceUrl);
  const sourceRoot = resolve(source);
  const destinationRoot = resolve(destination);
  const existing = await readdir(destinationRoot).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.length) throw new Error('destination must be empty or not exist');

  await mkdir(dirname(destinationRoot), { recursive: true });
  await cp(sourceRoot, destinationRoot, {
    recursive: true,
    filter(path) {
      const rel = relative(sourceRoot, path);
      if (!rel) return true;
      // docs/superpowers holds this repository's own planning notes, not template material.
      if (rel.replaceAll('\\', '/').startsWith('docs/superpowers')) return false;
      return !rel.split(/[\\/]/).some((segment) => EXCLUDED_SEGMENTS.has(segment));
    },
  });

  const manifestPath = resolve(destinationRoot, 'site-template.json');
  const manifest = await readJson(manifestPath);
  manifest.sourceUrl = normalizedUrl;
  // A workspace is a real reference run: it must carry capture evidence, unlike the repository starter.
  delete manifest.starter;
  await writeJson(manifestPath, manifest);
  await writeCoreManifest({ repoRoot: sourceRoot, workspaceRoot: destinationRoot });
  if (repo) await ensureSiteRepo(destinationRoot);
  return destinationRoot;
}

runMain(import.meta.url, async () => {
  const [sourceUrl, destination] = process.argv.slice(2);
  if (!sourceUrl || !destination) return usage('Usage: node scripts/create-workspace.mjs <source-url> <destination>');
  const output = await createWorkspace({ source: resolve(dirname(fileURLToPath(import.meta.url)), '..'), destination, sourceUrl });
  console.log(`Created Astro clone workspace: ${output}`);
});
