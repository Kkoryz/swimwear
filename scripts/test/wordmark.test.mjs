import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { drawingProblems, inkOnTransparent, spells, wordmarkPrompt } from '../make-wordmark.mjs';

test('a wordmark must spell the site name exactly, letters only', () => {
  assert.ok(spells('S T R A N D M I L L', 'Strandmill'));
  assert.ok(!spells('STRANDMIL', 'Strandmill'));
  assert.ok(!spells(null, 'Strandmill'));
  const prompt = wordmarkPrompt({ name: 'Strandmill', ink: '#003049', direction: 'a Didone', file: 'docs/research/brand/wordmark-1.png' });
  assert.match(prompt, /spells exactly "Strandmill" and nothing else/);
  assert.match(prompt, /#003049, on a pure white/);
});

test('a drawing is checked for its white ground, its margins and its shape; its ink becomes transparency', async () => {
  const { default: sharp } = await import('sharp');
  const dir = await mkdtemp(join(tmpdir(), 'wordmark-'));
  const word = join(dir, 'word.png');
  // A dark bar 600 x 120 in the middle of a white 1000 x 400 drawing: a horizontal wordmark with margins.
  await sharp({ create: { width: 1000, height: 400, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width: 600, height: 120, channels: 3, background: '#003049' } }, left: 200, top: 140 }]).png().toFile(word);
  assert.deepEqual(await drawingProblems(sharp, word, { wide: true }), []);
  const edge = join(dir, 'edge.png');
  await sharp({ create: { width: 1000, height: 400, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width: 600, height: 300, channels: 3, background: '#003049' } }, left: 0, top: 50 }]).png().toFile(edge);
  assert.deepEqual(await drawingProblems(sharp, edge, { wide: true }), ['not on white', 'touches an edge', 'not a horizontal wordmark']);
  const cut = await sharp(await inkOnTransparent(sharp, word, '#003049')).metadata();
  assert.deepEqual([cut.width, cut.height, cut.hasAlpha], [600, 120, true]);
});

test('letters that touch are found: fewer dark column runs than letters', async () => {
  const { default: sharp } = await import('sharp');
  const { lettersTouch } = await import('../make-wordmark.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'touch-'));
  const bars = (lefts) => sharp({ create: { width: 1000, height: 300, channels: 3, background: '#ffffff' } }).composite(lefts.map((left) => ({ input: { create: { width: 80, height: 100, channels: 3, background: '#000000' } }, left, top: 100 }))).png().toFile(join(dir, `${lefts.join('-')}.png`)).then(() => join(dir, `${lefts.join('-')}.png`));
  assert.equal(await lettersTouch(sharp, await bars([100, 300, 500]), 3), false);
  assert.equal(await lettersTouch(sharp, await bars([100, 180, 500]), 3), true, 'the first two touch');
});

test('a wordmark already drawn for the name and ink is reused: the site files, share image included, are made again without drawing', async () => {
  const { default: sharp } = await import('sharp');
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const { makeWordmark } = await import('../make-wordmark.mjs');
  const root = await mkdtemp(join(tmpdir(), 'wordmark-reuse-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'docs/research/brand'), { recursive: true });
  await writeFile(join(root, 'src/styles/global.css'), ':root { --heading-color: #111111; --surface-primary: #fafafa; }');
  const draw = (file, width, height) => sharp({ create: { width: 1000, height: 400, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width, height, channels: 3, background: '#111111' } }, left: 200, top: 140 }]).png().toFile(join(root, file));
  await draw('docs/research/brand/wordmark-1.png', 600, 120);
  await draw('docs/research/brand/mark.png', 100, 120);
  await writeFile(join(root, 'docs/research/brand/wordmark.json'), JSON.stringify({ name: 'Needle Field', ink: '#111111', drawings: [], chosen: 'docs/research/brand/wordmark-1.png', mark: 'docs/research/brand/mark.png' }));
  const record = await makeWordmark({ name: 'Needle Field', domain: 'needlefield.com', root, draw: async () => assert.fail('nothing is drawn again') });
  assert.equal(record.chosen, 'docs/research/brand/wordmark-1.png');
  const identity = JSON.parse(await readFile(join(root, 'src/data/site-identity.json'), 'utf8'));
  assert.deepEqual([identity.ogImage.src, identity.ogImage.width, identity.ogImage.height], ['/og-image.png', 1200, 630]);
  assert.deepEqual((await sharp(join(root, 'public/og-image.png')).metadata()).width, 1200);
  assert.equal(identity.schemaLogo.src, '/icon-512.png');
});
