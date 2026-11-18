import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { usesReact } from '../lib/react-islands.mjs';
import { pruneUnreferenced } from '../lib/release-guard.mjs';

test('a release ships only the images and scripts something names (four-site audit 2026-11-17, A-9)', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'prune-'));
  const files = {
    'index.html': '<link rel="icon" href="/favicon-48.png"><meta property="og:image" content="https://x.com/og-image.png"><script type="module" src="/_astro/page.abc.js"></script><img src="/media/site/used.webp" srcset="/media/site/used-480.webp 480w">',
    '_astro/page.abc.js': 'import "./chunk.def.js";',
    '_astro/chunk.def.js': 'console.log(1)',
    '_astro/client.ChYG-O0T.js': 'react runtime',
    '_astro/style.css': '.a{background:url(/media/site/bg.png)}',
    'media/site/used.webp': 'x', 'media/site/used-480.webp': 'x', 'media/site/bg.png': 'x', 'media/site/unused.webp': 'x',
    'favicon-48.png': 'x', 'og-image.png': 'x', 'icon-192.png': 'x', 'favicon.ico': 'x', 'apple-touch-icon.png': 'x',
    'logo.svg': '<svg/>',
  };
  for (const [path, text] of Object.entries(files)) { await mkdir(join(dist, path, '..'), { recursive: true }); await writeFile(join(dist, path), text); }
  const removed = (await pruneUnreferenced(dist)).sort();
  assert.deepEqual(removed, ['_astro/client.ChYG-O0T.js', 'icon-192.png', 'logo.svg', 'media/site/unused.webp']);
  for (const kept of ['_astro/page.abc.js', '_astro/chunk.def.js', 'media/site/used-480.webp', 'media/site/bg.png', 'og-image.png', 'favicon.ico', 'apple-touch-icon.png']) assert.ok(existsSync(join(dist, kept)), kept);
});

test('the React integration is used only where src/ has a React component; the release build prunes', async () => {
  const src = await mkdtemp(join(tmpdir(), 'src-'));
  await mkdir(join(src, 'components'), { recursive: true });
  await writeFile(join(src, 'components', 'Hero.astro'), '---\n---');
  assert.equal(usesReact(src), false);
  await writeFile(join(src, 'components', 'Picker.tsx'), 'export default () => null;');
  assert.equal(usesReact(src), true);
  // The template has no React component.
  assert.equal(usesReact(new URL('../../src/', import.meta.url)), false);
  assert.match(await readFile(new URL('../../astro.config.mjs', import.meta.url), 'utf8'), /\.\.\.\(usesReact\(new URL\('\.\/src\/', import\.meta\.url\)\) \? \[react\(\)\] : \[\]\)/);
  assert.match(await readFile(new URL('../lib/release-guard.mjs', import.meta.url), 'utf8'), /await pruneUnusedGenerated\(dist\);\s+await pruneUnreferenced\(dist\);/);
});

test('the release takes the stand-in marks out of the pages; the development build keeps them for the design review (site13 audit L-8)', async () => {
  const { stripPlaceholderMarks } = await import('../lib/release-guard.mjs');
  const { mkdtemp, mkdir, writeFile: write, readFile: read } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const dist = await mkdtemp(joinPath(tmpdir(), 'marks-'));
  await mkdir(joinPath(dist, 'about'), { recursive: true });
  await write(joinPath(dist, 'index.html'), '<footer><address class="site-footer__contact" data-placeholder="true"><a href="tel:+1">Call</a></address><p data-placeholder="false">x</p></footer>');
  await write(joinPath(dist, 'about/index.html'), '<main><p>No marks here</p></main>');
  assert.equal(await stripPlaceholderMarks(dist), 1);
  assert.equal(await read(joinPath(dist, 'index.html'), 'utf8'), '<footer><address class="site-footer__contact"><a href="tel:+1">Call</a></address><p>x</p></footer>');
  assert.equal(await read(joinPath(dist, 'about/index.html'), 'utf8'), '<main><p>No marks here</p></main>');
});
