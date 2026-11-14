import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { downloadFaces, fetchCached, fontPlan, fontsCss, googleCssUrl, installedFonts, parseFaces, stripFontFaces, withFontsImport } from '../lib/font-install.mjs';
import { installFonts } from '../install-fonts.mjs';
import { fontErrors } from '../validate-template.mjs';

// The reference of the hotel site: Josefin Sans headings and navigation, a commercial body face, a second heading face
// no role uses.
const run = (family, weight, extra = {}) => ({ family, weight, size: '16px', evidence: [{ observedValue: { 'font-family': family, 'font-weight': '900' } }], ...extra });
const fontRoles = {
  schemaVersion: 'seo-site-font-roles-v1',
  roles: {
    display: { viewports: { 'desktop-1440': [run('"Josefin Sans", Helvetica, Arial, _sans-serif', '700')] } },
    heading: { viewports: { 'desktop-1440': [run('"Josefin Sans", Helvetica, Arial, _sans-serif', '700'), run('futura-pt, Helvetica, Arial, _sans-serif', '700')] } },
    body: { viewports: { 'desktop-1440': [run('freight-text-pro, Helvetica, Arial, _sans-serif', '400'), run('freight-text-pro, Helvetica, Arial, _sans-serif', '700'), run('freight-text-pro, Helvetica', '400', { fontStyle: 'italic' })] } },
    UI: { viewports: { 'mobile-390': [run('"Josefin Sans", Helvetica, Arial, _sans-serif', '600')] } },
  },
  // An agent's proposal is not an observation: it has no weight and is not read.
  fontLockProposal: { roles: { body: { family: 'Lora' } } },
};
const fontLock = {
  schemaVersion: 'seo-site-font-lock-v1',
  roles: {
    // A lock edited by hand: the reference's family is the one it stands in for.
    body: { family: 'Georgia', substituteFor: 'freight-text-pro', weight: '400' },
    hero: { family: 'Josefin Sans', weight: '700' },
    display: { family: 'Josefin Sans', weight: '700' },
    subheading: { family: 'Josefin Sans', weight: '700' },
    navigation: { family: 'Josefin Sans', weight: '400' },
  },
};

test('the plan: each role\'s family after substitution, every weight and style the reference shows it in', () => {
  const plan = fontPlan({ fontRoles, fontLock });
  assert.equal(plan.roles.body.family, 'Source Serif 4');
  assert.equal(plan.roles.body.substituteFor, 'freight-text-pro');
  assert.equal(plan.roles.body.stack, '"Source Serif 4", serif');
  assert.equal(plan.roles.navigation.stack, '"Josefin Sans", sans-serif');
  assert.equal(plan.roles.navigation.token, '--font-ui');
  assert.deepEqual(plan.families, [
    { family: 'Josefin Sans', source: 'google-fonts', weights: [400, 600, 700], styles: ['normal'] },
    { family: 'Source Serif 4', source: 'google-fonts', substituteFor: ['freight-text-pro'], weights: [400, 700], styles: ['italic', 'normal'] },
  ]);
  // futura-pt is observed but no role uses it: listed, not installed.
  assert.deepEqual(plan.unused, [{ observed: 'futura-pt', family: 'Jost', substituteFor: 'futura-pt', weights: [700] }]);
  assert.throws(() => fontPlan({ fontRoles, fontLock: { roles: { body: fontLock.roles.body } } }), /no family for the hero role/);
});

test('a system family is used as it is, with no file', () => {
  const plan = fontPlan({ fontRoles: { roles: {} }, fontLock: { roles: Object.fromEntries(Object.keys(fontLock.roles).map((role) => [role, { family: 'Georgia', weight: '400' }])) } });
  assert.deepEqual(plan.families, [{ family: 'Georgia', source: 'system', weights: [400], styles: ['normal'] }]);
  assert.equal(plan.roles.body.stack, '"Georgia", serif');
});

test('the CSS2 request names one family with its weights, and the italic axis when an italic is used', () => {
  assert.equal(googleCssUrl({ family: 'Josefin Sans', weights: [400, 700], styles: ['normal'] }), 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;700&display=swap');
  assert.equal(googleCssUrl({ family: 'Source Serif 4', weights: [400, 700], styles: ['italic', 'normal'] }), 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,700;1,400;1,700&display=swap');
});

// A CSS2 answer: three subsets of each weight and style asked for, a variable family's one file per subset.
const answer = (url) => {
  const query = new URL(url).searchParams.get('family');
  const [name, axes] = query.split(':');
  const family = name.replace(/\+/g, ' ');
  const tuples = axes.split('@')[1].split(';').map((tuple) => (tuple.includes(',') ? tuple.split(',') : ['0', tuple]));
  const slug = family.toLowerCase().replace(/\s+/g, '');
  return tuples.flatMap(([italic, weight]) => ['cyrillic', 'latin-ext', 'latin'].map((subset) => `/* ${subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: ${italic === '1' ? 'italic' : 'normal'};\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/${slug}/v1/${subset}-${italic}.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}\n`)).join('');
};
function fakeFetch({ fail = null } = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (fail?.(url)) throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND fonts.googleapis.com') });
    if (url.includes('Freight')) return new Response('<html>not found</html>', { status: 400 });
    if (url.startsWith('https://fonts.googleapis.com/')) return new Response(answer(url));
    return new Response(Buffer.concat([Buffer.from('wOF2'), Buffer.from(url)]));
  };
  return { fetch, calls };
}

test('the CSS2 answer is read face by face with its subset', () => {
  const faces = parseFaces(answer('https://fonts.googleapis.com/css2?family=Jost:wght@700'));
  assert.equal(faces.length, 3);
  assert.deepEqual(faces[2], { subset: 'latin', family: 'Jost', style: 'normal', weight: 700, unicodeRange: 'U+0000-00FF', url: 'https://fonts.gstatic.com/s/jost/v1/latin-0.woff2' });
});

test('downloads are cached by URL: the same request is not made twice', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'font-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const { fetch, calls } = fakeFetch();
  const first = await fetchCached({ url: 'https://fonts.gstatic.com/s/x.woff2', cacheDir, kind: 'files', fetch });
  const second = await fetchCached({ url: 'https://fonts.gstatic.com/s/x.woff2', cacheDir, kind: 'files', fetch });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.body, first.body);
  assert.equal(calls.length, 1);
  // The whole download: once over the network, then from the cache alone.
  const plan = fontPlan({ fontRoles, fontLock });
  const fresh = await downloadFaces({ plan, cacheDir, fetch });
  const asked = calls.length;
  const again = await downloadFaces({ plan, cacheDir, fetch });
  assert.ok(fresh.downloads > 0);
  assert.equal(again.downloads, 0);
  assert.equal(calls.length, asked);
  assert.deepEqual(again.faces.map((face) => face.url), fresh.faces.map((face) => face.url));
  // Only the site's subsets.
  assert.ok(fresh.faces.every((face) => ['latin', 'latin-ext'].includes(face.subset)));
});

test('a network failure or a family Google Fonts does not have fails with what to do; nothing is cached', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'font-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const plan = fontPlan({ fontRoles, fontLock });
  const offline = fakeFetch({ fail: () => true });
  await assert.rejects(downloadFaces({ plan, cacheDir, fetch: offline.fetch }), /could not be downloaded: could not reach .*ENOTFOUND.*no system font is used instead/);
  assert.deepEqual(await readdir(cacheDir), []);
  const unknown = { ...plan, families: [{ family: 'Freight Text Pro', source: 'google-fonts', weights: [400], styles: ['normal'] }] };
  await assert.rejects(downloadFaces({ plan: unknown, cacheDir, fetch: fakeFetch().fetch }), /Google Fonts has no "Freight Text Pro".*SUBSTITUTES/);
});

test('fonts.css is generated from the record: the faces and the role tokens over every other definition', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'font-cache-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const plan = fontPlan({ fontRoles, fontLock });
  const download = await downloadFaces({ plan, cacheDir, fetch: fakeFetch().fetch });
  const lock = installedFonts({ plan, ...download });
  const css = fontsCss(lock);
  assert.equal((css.match(/^@font-face/gm) ?? []).length, lock.faces.length);
  assert.match(css, /@font-face \{ font-family: "Source Serif 4"; font-style: italic; font-weight: 700; font-display: swap; src: url\("\/fonts\/source-serif-4-latin-[0-9a-f]{10}\.woff2"\) format\("woff2"\); unicode-range: U\+0000-00FF; \}/);
  assert.match(css, /:root:root:root \{\n {2}--font-body: "Source Serif 4", serif;\n {2}--font-hero: "Josefin Sans", sans-serif;/);
  assert.equal(fontsCss(lock), css, 'the same record gives the same stylesheet');
  assert.equal(lock.families.find((family) => family.family === 'Josefin Sans').request, 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;600;700&display=swap');
});

test('the treatment keeps no @font-face, and global.css imports fonts.css after it', () => {
  const reference = '/* note */\n@font-face { font-family: "Josefin Sans"; src: url("/fonts/j.woff2"); font-weight: 400; }\n:root:root { --font-body: Georgia; }\n';
  assert.equal(stripFontFaces(reference), '/* note */\n:root:root { --font-body: Georgia; }\n');
  const global = '@import "tailwindcss";\r\n@import "./reference.css";\r\n\r\n:root { }\r\n';
  assert.equal(withFontsImport(global), '@import "tailwindcss";\r\n@import "./reference.css";\r\n@import "./fonts.css";\r\n\r\n:root { }\r\n');
  assert.equal(withFontsImport(withFontsImport(global)), withFontsImport(global));
});

test('install-fonts writes the files, the record and fonts.css; it owns public/fonts; a second run downloads nothing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'font-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, text) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), text); };
  await write('docs/research/analysis/font-roles.json', JSON.stringify(fontRoles));
  await write('docs/research/raw/font-lock.json', JSON.stringify(fontLock));
  await write('src/styles/global.css', '@import "./reference.css";\n:root { --font-body: Inter; }\n');
  await write('src/styles/reference.css', '@font-face { font-family: "Josefin Sans"; src: url("/fonts/josefin-sans-latin.woff2"); font-weight: 400; }\n:root:root { --surface-primary: #fff; }\n');
  await write('public/fonts/josefin-sans-latin.woff2', 'wOF2 by hand');
  await write('public/fonts/README.txt', 'kept');
  const { fetch, calls } = fakeFetch();
  const cacheDir = join(root, '.pipeline/cache/fonts');
  const result = await installFonts({ root, fetch, cacheDir });
  assert.equal(result.roles.body, 'Source Serif 4 (for freight-text-pro)');
  assert.deepEqual(result.removed, ['josefin-sans-latin.woff2']);
  assert.equal(result.strippedFaces, true);
  const lock = JSON.parse(await readFile(join(root, 'docs/research/installed-fonts.json'), 'utf8'));
  const files = (await readdir(join(root, 'public/fonts'))).sort();
  assert.deepEqual(files, [...new Set(lock.faces.map((face) => face.file.replace('/fonts/', ''))), 'README.txt'].sort());
  assert.equal(await readFile(join(root, 'src/styles/fonts.css'), 'utf8'), fontsCss(lock));
  assert.match(await readFile(join(root, 'src/styles/global.css'), 'utf8'), /@import "\.\/reference\.css";\n@import "\.\/fonts\.css";/);
  assert.doesNotMatch(await readFile(join(root, 'src/styles/reference.css'), 'utf8'), /@font-face/);
  // What validate:template checks of the installed fonts holds; a file changed by hand does not.
  assert.deepEqual(await fontErrors(root), []);
  await writeFile(join(root, 'public', lock.faces[0].file), 'wOF2 edited');
  assert.match((await fontErrors(root)).join('\n'), /is not the one docs\/research\/installed-fonts\.json records/);
  await writeFile(join(root, 'src/styles/reference.css'), '@font-face { font-family: X; src: url("/x.woff2"); }\n');
  assert.match((await fontErrors(root)).join('\n'), /reference\.css declares @font-face/);
  const asked = calls.length;
  const again = await installFonts({ root, fetch, cacheDir });
  assert.equal(again.downloads, 0);
  assert.equal(calls.length, asked);
  assert.deepEqual(await fontErrors(root), []);
});

test('a failed download installs nothing: the site keeps its fonts as they were', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'font-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  await mkdir(join(root, 'docs/research/raw'), { recursive: true });
  await writeFile(join(root, 'docs/research/analysis/font-roles.json'), JSON.stringify(fontRoles));
  await writeFile(join(root, 'docs/research/raw/font-lock.json'), JSON.stringify(fontLock));
  await assert.rejects(installFonts({ root, fetch: fakeFetch({ fail: () => true }).fetch, cacheDir: join(root, 'cache') }), /could not be downloaded/);
  assert.equal(await readFile(join(root, 'docs/research/installed-fonts.json'), 'utf8').catch(() => null), null);
  assert.match((await fontErrors(root)).join('\n'), /Missing docs\/research\/installed-fonts\.json/);
});

test("a role the home page does not show is taken from the competitor's other pages; the home page's own come first (Concord's home has no title)", async () => {
  const { withPageRoles } = await import('../lib/font-install.mjs');
  const home = { roles: { body: { family: 'freight-text-pro' }, hero: null, display: { family: 'Josefin Sans', weight: '700' } } };
  const pages = [null, { roles: { hero: { family: 'Josefin Sans', weight: '700', size: '64px' }, display: { family: 'Other' } } }];
  const roles = withPageRoles(home, pages).roles;
  assert.equal(roles.hero.family, 'Josefin Sans');
  assert.equal(roles.hero.size, '64px');
  assert.equal(roles.display.family, 'Josefin Sans');
  assert.equal(withPageRoles(home, []).roles.hero, null);
});
