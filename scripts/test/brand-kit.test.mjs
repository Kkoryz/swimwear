import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { importBrandKit, imageSize, projectIdentity } from '../import-brand-kit.mjs';
import { canonicalOrigin, fontFaceUrl, identityErrors, monogram, resolveToken } from '../lib/brand-kit.mjs';

test('canonical origin is https on the bare domain; monogram takes initials', () => {
  assert.equal(canonicalOrigin('www.CrestKnit.com'), 'https://crestknit.com');
  assert.equal(canonicalOrigin('https://seamtide.com/about/'), 'https://seamtide.com');
  assert.throws(() => canonicalOrigin('not a domain'), /not a domain/);
  assert.equal(monogram('Crest Knit'), 'CK');
  assert.equal(monogram('Knitpace'), 'KN');
});

test('tokens and font files come from the template stylesheet', () => {
  const css = ':root { --accent: #111; } @font-face { font-family: "DM Sans"; src: url("/fonts/dm.woff2") format("woff2"); } :root { --accent: #f76c17; --font-display: var(--font-body); --font-body: "DM Sans", sans-serif; }';
  assert.equal(resolveToken(css, '--accent'), '#f76c17');
  assert.equal(resolveToken(css, '--font-display'), '"DM Sans", sans-serif');
  assert.equal(fontFaceUrl(css, '"DM Sans"'), '/fonts/dm.woff2');
});

// 1x1 PNG header with a given size (only IHDR width/height are read).
const png = (width, height) => { const bytes = Buffer.alloc(33); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes; };

test('stage 00 brand kit is imported to the site root with its sizes; the identity is checked', async (t) => {
  const project = await mkdtemp(join(tmpdir(), 'brand-project-'));
  const root = await mkdtemp(join(tmpdir(), 'brand-root-'));
  t.after(() => Promise.all([rm(project, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]));
  await writeFile(join(project, 'project.yaml'), 'line: underwear\nsite_name: Crest Knit\nweb_domain: crestknit.com   # stage 00\n');
  await mkdir(join(project, 'brand'));
  await writeFile(join(project, 'brand/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"></svg>');
  await writeFile(join(project, 'brand/icon-512.png'), png(512, 512));
  await writeFile(join(project, 'brand/favicon.ico'), 'ico');
  await writeFile(join(project, 'brand/site.webmanifest'), '{}');
  const identity = await importBrandKit({ project, root });
  assert.deepEqual([identity.source, identity.siteName, identity.origin], ['stage-00', 'Crest Knit', 'https://crestknit.com']);
  assert.deepEqual(identity.logo, { src: '/logo.svg', width: 400, height: 100 });
  assert.deepEqual(identity.schemaLogo, { src: '/icon-512.png', width: 512, height: 512 });
  assert.equal(identity.manifest, '/site.webmanifest');
  assert.equal(await readFile(join(root, 'public/favicon.ico'), 'utf8'), 'ico');
  assert.deepEqual(identityErrors(identity), []);
  assert.match(identityErrors({ ...identity, schemaLogo: { src: '/x.png', width: 64, height: 64 }, icons: [] }).join('\n'), /schemaLogo[\s\S]*favicon of 48x48/);
  assert.deepEqual(imageSize('a.svg', Buffer.from('<svg width="800px" height="200" viewBox="0 0 1 1">')), { width: 800, height: 200 });
  assert.throws(() => projectIdentity('site_name: X\n'), /web_domain/);
  // YAML in its JSON form (Site Factory's handoff writes project.yaml so) reads the same.
  assert.deepEqual(projectIdentity('{\n  "site_name": "Strandmill",\n  "web_domain": "strandmill.com"\n}\n'), projectIdentity('site_name: Strandmill\nweb_domain: strandmill.com\n'));
});

test('the brand step brings in the project\'s own logo kit, else draws the site a wordmark, else typesets one', async () => {
  const { siteBrand } = await import('../site-brand.mjs');
  const root = await mkdtemp(join(tmpdir(), 'site-brand-'));
  const project = join(root, 'project');
  await mkdir(join(project, 'brand'), { recursive: true });
  await writeFile(join(project, 'project.yaml'), 'site_name: Strandmill\nweb_domain: strandmill.com\n');
  const calls = [];
  const importer = async () => { calls.push('import'); return { source: 'stage-00' }; };
  const typeset = async ({ name, domain }) => { calls.push(`typeset ${name} ${domain}`); return { source: 'build-brand-kit' }; };
  // The header logo is fitted after each (fit-header-logo.mjs); without an identity it has nothing to fit.
  const fit = async () => { calls.push('fit'); return null; };
  // No logo in the kit: a wordmark is drawn; none passes: typeset.
  assert.equal((await siteBrand({ project, root, importer, typeset, fit, wordmark: async () => ({ chosen: null }) })).source, 'build-brand-kit');
  // The image tool is unavailable: typeset too.
  assert.equal((await siteBrand({ project, root, importer, typeset, fit, wordmark: async () => { throw new Error('usage limit'); } })).source, 'build-brand-kit');
  // A drawn wordmark: its identity.
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ source: 'make-wordmark' }));
  assert.equal((await siteBrand({ project, root, importer, typeset, fit, wordmark: async ({ name, domain }) => { calls.push(`draw ${name} ${domain}`); return { chosen: 'docs/research/brand/wordmark-1.png' }; } })).source, 'make-wordmark');
  // The owner's or Site Factory's own logo: brought in, nothing drawn.
  await writeFile(join(project, 'brand/logo.png'), 'x');
  assert.equal((await siteBrand({ project, root, importer, typeset, fit, wordmark: async () => assert.fail('no drawing') })).source, 'stage-00');
  assert.deepEqual(calls, ['typeset Strandmill strandmill.com', 'fit', 'typeset Strandmill strandmill.com', 'fit', 'draw Strandmill strandmill.com', 'fit', 'import', 'fit']);
});
