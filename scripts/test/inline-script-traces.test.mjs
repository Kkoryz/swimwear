import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

// An inline script ships as written, its comments too (aloha 2026-11-18, audit L-3: "(site10's third testimonial was
// cut in half at the edge)" in every page's HTML): no site, owner date or audit in one.
const TRACE = /\bsite\d{2}\b|\bowner 20\d\d|\baudit 20\d\d|\b(aloha|swimwear|hotel-rm|motel|staylumen) 20\d\d/i;
async function astroFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await astroFiles(path)));
    else if (entry.name.endsWith('.astro')) found.push(path);
  }
  return found;
}

test('no inline script of the template carries a site, an owner date or an audit into the pages', async () => {
  const traces = [];
  for (const file of await astroFiles(new URL('../../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/<script\b[^>]*\bis:inline\b[^>]*>([\s\S]*?)<\/script>/g)) if (TRACE.test(match[1])) traces.push(`${file}: ${match[1].match(TRACE)[0]}`);
  }
  assert.deepEqual(traces, []);
});
