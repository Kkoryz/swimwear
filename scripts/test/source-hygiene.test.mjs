import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// Source folders to check (the same in the template repo and in a site workspace, which is not a git repository).
const ROOTS = ['scripts', 'src', 'config', 'deploy'];
const SOURCE = /\.(mjs|js|ts|astro|css|json|md|yml|yaml|sql|sh)$/;
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(path);
  return SOURCE.test(entry.name) ? [path] : [];
});

// A control character in source (a backspace left by an escaped "\b") silently changes what code does.
test('source files carry no control characters', () => {
  const all = ROOTS.flatMap((root) => { try { return files(root); } catch { return []; } });
  assert.ok(all.length > 0);
  const bad = all.filter((file) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(bad, []);
});
