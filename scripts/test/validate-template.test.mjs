import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateTemplate } from '../validate-template.mjs';

async function fixture(manifest = {}) {
  const root = await mkdtemp(join(tmpdir(), 'seo-site-template-'));
  const files = [
    'astro.config.mjs',
    'src/pages/index.astro',
    'src/layouts/BaseLayout.astro',
    'src/styles/global.css',
    'docs/research/PAGE_TOPOLOGY.md',
    'docs/research/BEHAVIORS.md',
    'docs/design-references/.gitkeep',
  ];
  for (const file of files) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), 'fixture');
  }
  await writeFile(
    join(root, 'site-template.json'),
    JSON.stringify({
      schemaVersion: 'seo-site-template-v1',
      sourceUrl: 'https://example.com/',
      starter: true,
      route: '/',
      components: ['Hero'],
      islands: [],
      ...manifest,
    }),
  );
  return root;
}

test('accepts a complete Astro template contract', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await validateTemplate(root), []);
});

test('reports missing required files', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await rm(join(root, 'src/pages/index.astro'));
  assert.match((await validateTemplate(root)).join('\n'), /src\/pages\/index\.astro/);
});

test('rejects invalid source URL and empty components', async (t) => {
  const root = await fixture({ sourceUrl: 'not-a-url', components: [] });
  t.after(() => rm(root, { recursive: true, force: true }));
  const errors = (await validateTemplate(root)).join('\n');
  assert.match(errors, /sourceUrl/);
  assert.match(errors, /components/);
});

test('rejects Next.js residue', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/app'), { recursive: true });
  await writeFile(join(root, 'src/app/page.tsx'), 'export default function Page() {}');
  assert.match((await validateTemplate(root)).join('\n'), /Next\.js residue/);
});

test('requires capture evidence once the manifest is a reference run, not the starter', async (t) => {
  const root = await fixture({ sourceUrl: 'https://swimwearbali.com/', starter: undefined });
  t.after(() => rm(root, { recursive: true, force: true }));
  const errors = (await validateTemplate(root)).join('\n');
  assert.match(errors, /desktop-1440\.png/);
  assert.match(errors, /capture-summary\.json/);
  assert.match(errors, /components/);
  assert.match(errors, /font-lock\.json/);
  assert.match(errors, /design-lock\.json/);
});

test('requires navigation manifest and dynamic route in navigation-shell mode', async (t) => {
  const root = await fixture({ mode: 'navigation-shell', routes: ['/', '/about'] });
  t.after(() => rm(root, { recursive: true, force: true }));
  const errors = (await validateTemplate(root)).join('\n');
  assert.match(errors, /navigation-shell\.json/);
  assert.match(errors, /\[\.\.\.slug\]\.astro/);
});

async function authoringFixture({ routes = ['/sample/'], axes } = {}) {
  const root = await fixture({ mode: 'authoring', routes });
  const page = {
    id: 'sample', route: '/sample/', pageType: 'product_manufacturer', status: 'authored',
    seo: { title: 'T', description: 'D', canonical: '/sample/' }, jsonLd: [], hero: { heading: 'H1' },
    blocks: [{ id: 's1', type: 'intro', heading: 'Intro', paragraphs: ['Body.'] }],
  };
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'src/pages'), { recursive: true });
  await writeFile(join(root, 'src/pages/[...slug].astro'), 'fixture');
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page]));
  await writeFile(join(root, 'src/data/site-nav.json'), JSON.stringify({ header: [], footer: [] }));
  await mkdir(join(root, 'docs/research/raw'), { recursive: true });
  await writeFile(join(root, 'docs/research/raw/reference-density.json'), JSON.stringify({ schemaVersion: 'seo-site-reference-density-v1', pages: [], bands: {} }));
  await writeFile(join(root, 'docs/research/pattern-inventory.json'), JSON.stringify({ pages: [{ pageType: 'home', coverage: 92, sections: [{ index: 1, pattern: 'band' }] }] }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({
    schemaVersion: 'seo-site-template-variants-v1',
    ...(axes ? { axes } : {}),
    components: {},
  }));
  return root;
}

test('accepts a complete authoring-mode template', async (t) => {
  const root = await authoringFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await validateTemplate(root), []);
});

test('authoring mode requires declared routes to match rendered pages', async (t) => {
  const root = await authoringFixture({ routes: ['/sample/', '/missing/'] });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.match((await validateTemplate(root)).join('\n'), /routes must equal/);
});

test('a template follows its reference by default; a declared departure must be described', async (t) => {
  const root = await authoringFixture({ axes: { gridGeometry: { source: '3 columns' } } });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.match((await validateTemplate(root)).join('\n'), /axis gridGeometry needs source and candidate/);
});

test('authoring mode rejects pages that break the content contract', async (t) => {
  const root = await authoringFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'x', route: '/sample/', blocks: [{ id: 'b', type: 'carousel' }] }]));
  assert.match((await validateTemplate(root)).join('\n'), /unknown block type: carousel/);
});

test('authoring mode requires pattern coverage of the reference core pages', async (t) => {
  const root = await authoringFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'docs/research/pattern-inventory.json'), JSON.stringify({ pages: [{ pageType: 'home', coverage: 60, sections: [{ index: 1, pattern: 'unknown-thing' }] }] }));
  const errors = (await validateTemplate(root)).join('\n');
  assert.match(errors, /no library decision for pattern unknown-thing/);
  assert.match(errors, /pattern coverage for home is 60%/);
});

test('template treatments must be known values with styles', async (t) => {
  const root = await authoringFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ schemaVersion: 'seo-site-template-variants-v1', components: { featureGrid: 'rule', heroByPageType: { home: 'video' } } }));
  const errors = (await validateTemplate(root)).join('\n');
  assert.match(errors, /components.featureGrid is rule/);
  assert.match(errors, /heroByPageType.home is video/);
});

test('a treatment rule that puts the block inside its own pattern is reported', async (t) => {
  const root = await authoringFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'src/styles/reference.css'), '[data-pattern="media"] .block .feature-card__title { padding-inline: 20px; }\n.block [data-pattern="boxed"] .feature-card__title { padding: 12px; }\n');
  const errors = (await validateTemplate(root)).filter((error) => error.includes('never matches'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\[data-pattern="media"\] \.block \.feature-card__title/);
});
