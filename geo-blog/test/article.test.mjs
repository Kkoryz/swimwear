import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { articleCheck, writeLists } from '../src/article-check.mjs';
import { applyReplacements } from '../src/replace.mjs';

const ARTICLE = `---
seo_title: "Swimwear manufacturer guide"
seo_description: "How a US swimwear brand plans, samples and ships its first collection with a manufacturer."
slug: "swimwear-manufacturer-guide"
---
# Title

## Intro

![Factory floor](visuals/V1.png)

Our first run took 38 days from sample approval to dispatch.

We plan every order backward from the US arrival date.

| Step | Days |
| --- | --- |
| Sample | 12 |
`;
const REPL = [
  { id: 'R1', section: 'Intro', text: 'Our first run took 38 days from sample approval to dispatch.', kind: 'timeline', needed: 'real days from approval to ship', status: 'placeholder' },
  { id: 'R2', section: 'Intro', text: '| Sample | 12 |', kind: 'number', needed: 'real sample days', status: 'placeholder' },
];
const VIS = [
  { id: 'V1', section: 'Intro', type: 'hero', title: 'Factory', setting: 'sampling room table', produce: 'generate' },
  { id: 'T1', section: 'Intro', type: 'table', title: 'Timeline', produce: 'table in text' },
];

function makeRun({ article = ARTICLE, repl = REPL, vis = VIS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'geo-article-'));
  writeFileSync(join(dir, '06-article.md'), article);
  writeFileSync(join(dir, '06-replacements.json'), JSON.stringify({ replacements: repl }));
  writeFileSync(join(dir, '06-visuals.json'), JSON.stringify({ visuals: vis }));
  return { runDir: dir };
}

test('texts found once and placed images pass, and the readable lists are written', (t) => {
  const config = makeRun();
  t.after(() => rmSync(config.runDir, { recursive: true }));
  assert.deepEqual(articleCheck(config), []);
  writeLists(config.runDir);
  assert.match(readFileSync(join(config.runDir, '06-replacements.md'), 'utf8'), /\| R1 \| Intro \| timeline \| real days from approval to ship \| Our first run took 38 days/);
  assert.match(readFileSync(join(config.runDir, '06-visuals.md'), 'utf8'), /\| V1 \| Intro \| hero \| Factory \|/);
});

test('a text missing or repeated, and unmatched images, fail', (t) => {
  const config = makeRun({
    article: `${ARTICLE.replace('took 38 days', 'took 40 days').replace('visuals/V1.png', 'visuals/V9.png')}\n| Sample | 12 |\n`,
  });
  t.after(() => rmSync(config.runDir, { recursive: true }));
  const f = articleCheck(config).join('\n');
  assert.match(f, /replacement R1: its text occurs 0 times/);
  assert.match(f, /replacement R2: its text occurs 2 times/);
  assert.match(f, /image V9 is not in 06-visuals.json/);
  assert.match(f, /visual V1 has no image line/);
});

test('apply swaps filled entries by their text; replaced entries are no longer checked', (t) => {
  const config = makeRun({ repl: [{ ...REPL[0], real: 'Our first run took 41 days from sample approval to dispatch.' }, REPL[1]] });
  t.after(() => rmSync(config.runDir, { recursive: true }));
  assert.deepEqual(applyReplacements(config.runDir), { applied: ['R1'], remaining: ['R2'] });
  assert.match(readFileSync(join(config.runDir, '06-article.md'), 'utf8'), /took 41 days/);
  assert.deepEqual(articleCheck(config), []);
});

test('SEO lengths and links to existing site pages are checked against the sitemap', (t) => {
  const config = makeRun({ article: `${ARTICLE.replace('Swimwear manufacturer guide', 'x'.repeat(61))}\nSee [FAQ](/faq/) and [contact](/contact-us/) and [old](/gone/).\n` });
  writeFileSync(join(config.runDir, 'sitemap.xml'), ['/', '/faq/', '/contact-us/', '/bikini-manufacturer/'].map((p) => `<url><loc>https://s.com${p}</loc></url>`).join(''));
  config.site_sitemap = join(config.runDir, 'sitemap.xml');
  t.after(() => rmSync(config.runDir, { recursive: true }));
  const f = articleCheck(config).join('\n');
  assert.match(f, /seo_title must be 1–60 characters \(got 61\)/);
  assert.match(f, /page the site does not have: \/gone\//);
  assert.match(f, /at least 3 site pages \(got 2\)/);
  assert.match(f, /product or service page/);
});

test('an opening section with a single paragraph fails (the site takes it as the lead)', (t) => {
  const config = makeRun({ article: ARTICLE.replace('\nWe plan every order backward from the US arrival date.\n', '') });
  t.after(() => rmSync(config.runDir, { recursive: true }));
  assert.match(articleCheck(config).join('\n'), /opening section needs at least 2 paragraphs/);
});

test('charts must be drawable from the text, and photos need distinct settings', async () => {
  const { visualSpecFailures } = await import('../src/article-check.mjs');
  const text = 'Samples took from January 4 to 2026-01-19. Inventory costs $5,600 and development $750.';
  const ok = [
    { id: 'V2', type: 'chart', produce: 'draw', chart: { kind: 'bar', unit: 'USD', items: [{ label: 'Delivered inventory', value: 5600 }, { label: 'Development', value: 750 }] } },
    { id: 'V3', type: 'chart', produce: 'draw', chart: { kind: 'timeline', items: [{ label: 'First samples', start: '2026-01-04', end: '2026-01-19' }] } },
    { id: 'V4', type: 'photo', setting: 'QC bench, worker measuring a leg opening' },
  ];
  assert.deepEqual(visualSpecFailures(text, ok), []);
  const bad = [
    { id: 'V2', type: 'chart', produce: 'draw', chart: { kind: 'bar', items: [{ label: 'One two three four five six', value: 9999 }] } },
    { id: 'V3', type: 'chart', produce: 'generate', chart: { kind: 'pie', items: [] } },
    { id: 'V4', type: 'photo', setting: 'QC bench' },
    { id: 'V5', type: 'photo', setting: 'qc bench' },
    { id: 'V6', type: 'chart', produce: 'draw', chart: { kind: 'steps', items: [{ label: 'Brief' }] } },
  ];
  const f = visualSpecFailures(text, bad).join('\n');
  assert.match(f, /V2: label over 5 words/);
  assert.match(f, /V2: 9999 does not appear in the article/);
  assert.match(f, /V3: a chart needs produce "draw"/);
  assert.match(f, /V5: same setting as V4/);
  assert.match(f, /V6: steps chart has 1 items/);
});

test('figure density comes from the site, clamped to 150–400 words per picture', async (t) => {
  const { wordsPerPicture } = await import('../src/article-check.mjs');
  const { mkdirSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'geo-rhythm-'));
  t.after(() => rmSync(dir, { recursive: true }));
  assert.equal(wordsPerPicture({ site_import: { cwd: dir } }), 400);
  mkdirSync(join(dir, 'src/data'), { recursive: true });
  writeFileSync(join(dir, 'src/data/article-rhythm.json'), JSON.stringify({ wordsPerPicture: 130 }));
  assert.equal(wordsPerPicture({ site_import: { cwd: dir } }), 150);
  writeFileSync(join(dir, 'src/data/article-rhythm.json'), JSON.stringify({ wordsPerPicture: 260 }));
  assert.equal(wordsPerPicture({ site_dir: dir }), 260);
});
