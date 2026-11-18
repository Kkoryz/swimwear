// Whether a site renders React at all (four-site audit 2026-11-17, A-9; site13 blind audit L7: the React integration
// built a 191 KB client runtime, _astro/client.*.js, that no page loaded, the template having no React component).
// React is the islands' renderer (AGENTS.md: an island needs observed client-side state); a site whose src/ has a
// .tsx or .jsx file takes the integration, and only then.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REACT_FILE = /\.(?:tsx|jsx)$/i;

/** @param {string | URL} dir the site's src/ */
export function usesReact(dir) {
  const root = dir instanceof URL ? fileURLToPath(dir) : dir;
  const walk = (path) => {
    let entries;
    try { entries = readdirSync(path, { withFileTypes: true }); } catch { return false; }
    return entries.some((entry) => (entry.isDirectory() ? !['node_modules', 'data'].includes(entry.name) && walk(join(path, entry.name)) : REACT_FILE.test(entry.name)));
  };
  return walk(root);
}
