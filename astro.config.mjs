import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import { releaseGuard } from './scripts/lib/release-guard.mjs';

// The canonical origin comes from the site identity (stage 00 domain); without it canonicals stay root-relative.
const identityPath = new URL('./src/data/site-identity.json', import.meta.url);
const site = existsSync(identityPath) ? JSON.parse(readFileSync(identityPath, 'utf8')).origin : undefined;

export default defineConfig({
  integrations: [react(), releaseGuard()],
  output: 'static',
  ...(site ? { site } : {}),
  vite: {
    plugins: [tailwindcss()],
  },
});
