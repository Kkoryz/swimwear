import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { releaseGuard } from './scripts/lib/release-guard.mjs';
import { shareImages } from './scripts/lib/share-image.mjs';
import { usesReact } from './scripts/lib/react-islands.mjs';

// The canonical origin comes from the site identity (stage 00 domain); without it canonicals stay root-relative.
const identityPath = new URL('./src/data/site-identity.json', import.meta.url);
const site = existsSync(identityPath) ? JSON.parse(readFileSync(identityPath, 'utf8')).origin : undefined;

export default defineConfig({
  // React renders only where the site has a React component (an island needs observed client-side state, AGENTS.md):
  // without one no React client runtime is built (four-site audit 2026-11-17, A-9: a 191 KB client.*.js no page loads).
  // The pages' share JPGs are cut before the release guard prunes what no page names (lib/share-image.mjs).
  integrations: [...(usesReact(new URL('./src/', import.meta.url)) ? [react()] : []), shareImages(), releaseGuard()],
  output: 'static',
  ...(site ? { site } : {}),
  vite: {
    plugins: [tailwindcss()],
  },
});
