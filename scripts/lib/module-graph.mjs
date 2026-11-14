// The code a script runs: its file and every file it imports by a relative path, followed through (static imports,
// re-exports and dynamic imports with a literal path; packages and node: built-ins are not followed). A step's code
// input ("code:<script>" in site-run.mjs) is this closure, so a change elsewhere in scripts/lib does not run it again.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const SPECIFIERS = /(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|import\s*\(\s*['"](\.[^'"]+)['"]\s*\)|import\s*['"](\.[^'"]+)['"]/g;

// The relative specifiers a module's source names.
export function relativeImports(source) {
  return [...source.matchAll(SPECIFIERS)].map((match) => match[1] ?? match[2] ?? match[3]);
}

// Every file the entries reach, as paths relative to root, sorted.
export async function codeClosure(root, entries) {
  const seen = new Set();
  const visit = async (path) => {
    if (seen.has(path) || !existsSync(path)) return;
    seen.add(path);
    if (!/\.(m?js|ts)$/.test(path)) return;
    for (const specifier of relativeImports(await readFile(path, 'utf8'))) await visit(resolve(dirname(path), specifier));
  };
  for (const entry of entries) await visit(resolve(root, entry));
  return [...seen].map((path) => relative(root, path).replaceAll('\\', '/')).sort();
}
