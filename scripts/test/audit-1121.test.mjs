// The code audit of 2026-11-21: one test per fix.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pageAltProblems } from '../lib/alt-text.mjs';
import { isDecorative, parsePage } from '../lib/built-site.mjs';
import { wholeNumber } from '../lib/cli.mjs';
import { PLACEHOLDER_PATTERN } from '../lib/schema-rules.mjs';
import { pageProblems } from '../lib/seo-audit.mjs';
import { blockKindsSha256 } from '../lib/sf-handoff.mjs';
import { normalizeFact, statedIn, verifyStructured } from '../lib/sf-structured.mjs';
import { createWorkspace } from '../create-workspace.mjs';
import { sfReport, siteFactoryIssues } from '../sf-report.mjs';

test('a JSON-LD stand-in is "[Placeholder]" or "[Company Name]", never a lowercase aside in brackets', () => {
  for (const text of ['[Placeholder] Site', '[placeholder]', '[Company Name]', 'REPLACE_PHONE', 'Lorem ipsum dolor']) assert.ok(PLACEHOLDER_PATTERN.test(text), text);
  for (const text of ['Fabric shrinks about 3% [see note]', 'as the mill wrote it [sic]', 'replace_me later']) assert.ok(!PLACEHOLDER_PATTERN.test(text), text);
});

test('a figure is stated in a fact only as the whole number it is', () => {
  const fact = normalizeFact('We run 50 sewing lines and ship 1,500 pieces a day at 3.5% defects.');
  for (const value of ['50', '1,500', '3.5%', '50 sewing lines', '1,500 pieces']) assert.ok(statedIn(fact, value), value);
  for (const value of ['5', '500', '1', '3', '0 sewing lines', '']) assert.ok(!statedIn(fact, value), value);
  assert.ok(statedIn(normalizeFact('Samples take 7-10 days.'), '10 days'));
  const facts = new Map([['lines', { text: 'We run 50 sewing lines.', approved: true }]]);
  assert.throws(() => verifyStructured('p', { key_figures: [{ value: '5', fact_id: 'lines' }] }, facts), /key figure "5" is not stated in fact lines/);
  verifyStructured('p', { key_figures: [{ value: '50', fact_id: 'lines' }] }, facts);
});

test("the report back names block-kinds by the hash the handoff check compares: LF line endings whatever the checkout's", async () => {
  const root = await mkdtemp(join(tmpdir(), 'audit-1121-'));
  try {
    await mkdir(join(root, 'config'), { recursive: true });
    await writeFile(join(root, 'config/block-kinds.json'), '{\r\n  "kinds": []\r\n}\r\n');
    const lf = createHash('sha256').update('{\n  "kinds": []\n}\n').digest('hex');
    assert.equal(await blockKindsSha256(root), lf);
    assert.equal((await sfReport({ root })).template.block_kinds_sha256, lf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a page whose JSON-LD lost Markdown is reported under its route (the import lists routes)', () => {
  assert.deepEqual(siteFactoryIssues({ imported: { jsonLdMarkdown: ['/a/'] } }).map((issue) => issue.route), ['/a/']);
});

test("a description's length is counted as a reader sees it, like the title's", () => {
  const page = (description) => `<html lang="en"><head><title>A title of a fair length for a page | Brand</title><meta name="description" content="${description}"><link rel="canonical" href="https://x.test/a/"></head><body><main><h1>A</h1></main></body></html>`;
  const lengths = (description) => pageProblems({ html: page(description), page: { route: '/a/', pageType: 'product', status: 'authored', blocks: [], seo: { title: 'A', description: 'd', canonical: '/a/' }, jsonLd: [], hero: { heading: 'A' } }, identity: null, nav: { header: [], footer: [] } }).filter((problem) => problem.issue === 'description_length');
  // 160 characters as read; 196 as written (nine &amp;).
  const shown = `${'Cut &amp; sew '.repeat(9)}${'x'.repeat(70)}`;
  assert.equal(shown.replaceAll('&amp;', '&').length, 160);
  assert.deepEqual(lengths(shown), []);
  assert.equal(lengths('x'.repeat(170)).length, 1);
});

test("an overlay hero's photo with an alt is a content photo; without one it is a backdrop still", () => {
  const html = '<html lang="en"><body><main><img class="page-hero__backdrop" src="/a.webp" alt="A man in an aloha shirt on a beach"><img class="page-hero__backdrop" src="/b.webp" alt=""><img class="cta__backdrop" src="/c.webp" alt="Says something"></main></body></html>';
  const images = parsePage(html).images;
  assert.deepEqual(images.map(isDecorative), [false, true, true]);
  assert.deepEqual(pageAltProblems(images.map((image) => ({ src: image.src, alt: image.alt, decorative: isDecorative(image) }))).map((item) => `${item.src} ${item.problem}`), ['/c.webp decorative_with_alt']);
});

test('a link passes the attributes it was given (a tile button named by its page)', async () => {
  const source = await readFile(new URL('../../src/components/site/SmartLink.astro', import.meta.url), 'utf8');
  assert.match(source, /<a href=\{href\} class=\{className\} \{\.\.\.attributes\}>/);
});

test('a count option is a whole number of at least 1', () => {
  assert.equal(wholeNumber('--limit', '3'), 3);
  assert.equal(wholeNumber('--limit', '10'), 10);
  for (const value of ['abc', '0', '-1', '1.5', '', '1d']) assert.throws(() => wholeNumber('--limit', value), /--limit takes a whole number/);
});

test("a new workspace leaves this repository's other checkouts behind", async () => {
  const base = await mkdtemp(join(tmpdir(), 'audit-1121-ws-'));
  try {
    await mkdir(join(base, 'source/.claude/worktrees/other/scripts'), { recursive: true });
    await mkdir(join(base, 'source/.claude/skills'), { recursive: true });
    await writeFile(join(base, 'source/.claude/worktrees/other/scripts/a.mjs'), '');
    await writeFile(join(base, 'source/.claude/skills/s.md'), '');
    await writeFile(join(base, 'source/site-template.json'), '{}');
    await createWorkspace({ source: join(base, 'source'), destination: join(base, 'site'), sourceUrl: 'https://example.com/', repo: false }).catch((error) => { if (!/ENOENT|template|manifest/i.test(error.message)) throw error; });
    await assert.rejects(readFile(join(base, 'site/.claude/worktrees/other/scripts/a.mjs')), /ENOENT/);
    await readFile(join(base, 'site/.claude/skills/s.md'));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
