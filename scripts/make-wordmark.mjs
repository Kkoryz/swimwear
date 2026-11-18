#!/usr/bin/env node

// The site's own logo when Site Factory brings none (owner 2026-10-25): a pure wordmark in the manner of a high-end
// fashion house, drawn by Codex's built-in image tool (gpt-image-2) after the competitor analysis has set the site's
// ink colour and display face, so the logo belongs to the site's design. A few typographic directions are drawn on
// white; a judge reads each drawing letter by letter (it must spell the site name exactly) and code checks the white
// ground, the margins and that no letters touch. Any drawing that passes will do: one is picked by the site name (the
// same each run); its first letter, drawn again in the same face, is
// the mark for the favicon and app icons. Both are made transparent in the site's ink by code (gpt-image-2 draws no
// transparency) and written under the files build-brand-kit.mjs writes, with site-identity.json. A sheet of every
// drawing is kept for the owner, who may pick another or bring the real logo (the handoff lists the logo as
// replaceable). Nothing passes: the typeset fallback (build-brand-kit.mjs) stays.
// Usage: node scripts/make-wordmark.mjs --name "<site name>" --domain <domain> [--designs 4]

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalOrigin, identityFromFiles, resolveToken } from './lib/brand-kit.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { runCodex } from './lib/codex-exec.mjs';
import { replyJson } from './lib/agent-step.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { writeShareImage } from './lib/share-image.mjs';

// The typographic directions of a high-end wordmark, one drawing each: only type, never a symbol.
export const DIRECTIONS = Object.freeze([
  'refined high-contrast Didone serif in capitals with generous, even letter-spacing (a Paris couture house)',
  'clean geometric sans-serif in capitals, light to regular weight, very wide letter-spacing (a minimalist luxury label)',
  'elegant classical serif in capitals with moderate letter-spacing and fine serifs (an heritage atelier)',
  'modern grotesk sans-serif in bold capitals with tight, precise letter-spacing (a contemporary fashion brand)',
]);
const DIR = 'docs/research/brand';
const LOGO_HEIGHT = 240;
const MARK_SIZES = Object.freeze([{ file: 'icon-512.png', size: 512 }, { file: 'icon-192.png', size: 192 }, { file: 'apple-touch-icon.png', size: 180 }, { file: 'favicon-48.png', size: 48 }]);

export function wordmarkPrompt({ name, ink, direction, file }) {
  return [
    'Use the built-in image_gen tool (not the CLI fallback) to draw one logo.',
    `A horizontal wordmark (logotype) that spells exactly "${name}" and nothing else: ${direction}.`,
    'Draw it to professional logotype standards, as a type designer would set it: one consistent cap height, baseline and stroke contrast for every letter; optically even letter-spacing, the same visual amount of white between every pair of letters, with open pairs (T, A, L, V, Y next to their neighbours) kerned tighter and straight-sided pairs looser, so no part of the word looks looser or tighter than another; generous tracking that suits the style; no two letters touching or overlapping; a perfectly straight, level baseline; crisp, vector-clean edges.',
    `Only type: no symbol, icon, emblem, frame, underline, tagline or second line. One flat colour, ${ink}, on a pure white (#FFFFFF) background; no gradient, texture, shadow or mock-up. The word is centred with wide empty margins on every side; landscape 1536x1024.`,
    `Save the final image into this workspace as ${file} (copy it there from the generated_images folder).`,
    `Finish by replying with only this JSON on one line: {"file": "${file}"}`,
  ].join('\n');
}

export function monogramPrompt({ letter, file, wordmark }) {
  return [
    'Use the built-in image_gen tool (not the CLI fallback) to draw one logo mark.',
    `The attached image is a wordmark. Draw only its letter "${letter}", in exactly the same typeface, weight and colour, centred on a pure white (#FFFFFF) square with wide empty margins; nothing else. Square 1024x1024.`,
    `Save the final image into this workspace as ${file} (copy it there from the generated_images folder).`,
    `Finish by replying with only this JSON on one line: {"file": "${file}", "wordmark": "${wordmark}"}`,
  ].join('\n');
}

// The letters a judge read against the name: letters only, case and spacing aside.
export const spells = (read, name) => String(read ?? '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() === String(name).replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();

// What code checks of a drawing (sharp): a white ground, the ink clear of every edge, and a drawing wider than tall.
export async function drawingProblems(sharp, path, { wide }) {
  const { data, info } = await sharp(path).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let left = info.width; let right = -1; let top = info.height; let bottom = -1; let paper = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[y * info.width + x] >= 235) { paper += 1; continue; }
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const problems = [];
  if (right < 0) return ['nothing drawn'];
  if (paper / (info.width * info.height) < 0.7) problems.push('not on white');
  const margin = Math.min(left, top, info.width - 1 - right, info.height - 1 - bottom);
  if (margin < Math.min(info.width, info.height) * 0.04) problems.push('touches an edge');
  if (wide && (right - left) / Math.max(1, bottom - top) < 2.2) problems.push('not a horizontal wordmark');
  return problems;
}

// Whether a drawing's letters touch: each letter is a run of dark columns, so letters that touch show fewer runs.
export async function lettersTouch(sharp, path, letters) {
  const { data, info } = await sharp(path).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let runs = 0;
  let inside = false;
  for (let x = 0; x < info.width; x += 1) {
    let dark = false;
    for (let y = 0; y < info.height && !dark; y += 1) dark = data[y * info.width + x] < 140;
    if (dark && !inside) runs += 1;
    inside = dark;
  }
  return runs < letters;
}

// A drawing in one ink on white as that ink with transparency, trimmed to the drawing: each pixel's darkness is its
// opacity, so the edges stay smooth. drawnIn: the ink it was drawn in, when another ink is to colour it (the opacity is
// measured against the drawn ink's darkness).
const rgbOf = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
export async function inkOnTransparent(sharp, path, ink, drawnIn = ink) {
  const [r, g, b] = rgbOf(ink);
  const [dr, dg, db] = rgbOf(drawnIn);
  const inkLight = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
  const { data, info } = await sharp(path).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const alpha = Math.max(0, Math.min(1, (255 - data[index]) / Math.max(1, 255 - inkLight)));
    out.set([r, g, b, Math.round(alpha * 255)], index * 4);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 8 }).png().toBuffer();
}

export async function makeWordmark({ name, domain, designs = DIRECTIONS.length, root = process.cwd(), draw = runCodex, dir = DIR }) {
  const { default: sharp } = await import('sharp');
  const css = await readFile(resolve(root, 'src/styles/global.css'), 'utf8');
  const ink = [resolveToken(css, '--heading-color'), resolveToken(css, '--text-primary')].find((value) => /^#[0-9a-f]{6}$/i.test(value ?? '')) ?? '#111111';
  await mkdir(resolve(root, dir), { recursive: true });
  // A judge reads what a drawing spells (a judge home, read-only).
  const reads = async (file) => {
    const lastMessage = resolve(root, `${file}.read.json`);
    await draw({ root, prompt: 'Read the word in the attached logo exactly as drawn, letter by letter. Reply with only {"text": "<the letters you see>"}.', images: [resolve(root, file)], lastMessage, sandbox: 'read-only', judge: true, lean: true });
    return replyJson(await readFile(lastMessage, 'utf8').catch(() => ''))?.text ?? null;
  };
  const drawAll = async () => {
  const drawings = [];
  for (const [index, direction] of DIRECTIONS.slice(0, designs).entries()) {
    const file = `${dir}/wordmark-${index + 1}.png`;
    await rm(resolve(root, file), { force: true });
    await draw({ root, prompt: wordmarkPrompt({ name, ink, direction, file }), lastMessage: resolve(root, `${file}.reply.json`), kind: 'image', label: 'wordmark drawing' });
    if (!existsSync(resolve(root, file))) { drawings.push({ file, direction, problems: ['not drawn'] }); continue; }
    const problems = await drawingProblems(sharp, resolve(root, file), { wide: true });
    const read = problems.length ? null : await reads(file);
    if (read !== null && !spells(read, name)) problems.push(`reads "${read}"`);
    if (await lettersTouch(sharp, resolve(root, file), name.replace(/[^\p{L}\p{N}]/gu, '').length)) problems.push('letters touch');
    drawings.push({ file, direction, read, problems });
  }
  // The sheet for the owner: every drawing, numbered.
  const shown = drawings.filter((drawing) => existsSync(resolve(root, drawing.file)));
  if (shown.length) {
    const tiles = await Promise.all(shown.map((drawing) => sharp(resolve(root, drawing.file)).resize({ width: 768, height: 512, fit: 'contain', background: '#ffffff' }).png().toBuffer()));
    await sharp({ create: { width: 768 * 2, height: 512 * Math.ceil(tiles.length / 2), channels: 3, background: '#ffffff' } }).composite(tiles.map((input, index) => ({ input, left: (index % 2) * 768, top: Math.floor(index / 2) * 512 }))).png().toFile(resolve(root, `${dir}/wordmarks.png`));
  }
  // Any drawing that passes will do (owner 2026-10-25): one of them by the site name, so a site keeps its pick.
  const passing = drawings.filter((drawing) => !drawing.problems.length);
  const chosen = passing.length ? passing[[...name].reduce((sum, char) => sum + char.codePointAt(0), 0) % passing.length] : undefined;
  const record = { name, ink, drawings, chosen: chosen?.file ?? null };
  if (!chosen) { await writeJson(resolve(root, `${dir}/wordmark.json`), record); return record; }
  // The mark: the name's first letter in the chosen face.
  const letter = [...name.trim()][0].toUpperCase();
  const markFile = `${dir}/mark.png`;
  await rm(resolve(root, markFile), { force: true });
  await draw({ root, prompt: monogramPrompt({ letter, file: markFile, wordmark: chosen.file }), images: [resolve(root, chosen.file)], lastMessage: resolve(root, `${markFile}.reply.json`), kind: 'image', label: 'wordmark mark' });
  const markOk = existsSync(resolve(root, markFile)) && !(await drawingProblems(sharp, resolve(root, markFile), { wide: false })).length && spells(await reads(markFile), letter);
  record.mark = markOk ? markFile : null;
  return record;
  };
  // Drawings already made for this name are kept: a change to this script rebuilds the site's files from them and
  // draws nothing again. A new ink colours the drawings by code (they are one flat ink on white: each pixel's darkness
  // is its opacity), as every logo is coloured: owner 2026-11-17, site13's 40-minute run, where a contrast fix moved
  // the heading colour from #171717 to #000000 and the brand step drew all four wordmarks and the mark again (12 minutes).
  // record.ink stays the ink the drawings were drawn in.
  const made = await readJson(resolve(root, `${dir}/wordmark.json`), null);
  const reusable = made?.name === name && /^#[0-9a-f]{6}$/i.test(made?.ink ?? '') && made.chosen && existsSync(resolve(root, made.chosen)) && (!made.mark || existsSync(resolve(root, made.mark)));
  const record = reusable ? made : await drawAll();
  const drawnIn = record.ink ?? ink;
  if (!record.chosen) return record;
  // The site files: the wordmark in ink on transparency; the icons the mark (or, without one, the wordmark's own
  // first letter is not cut out: the typeset fallback keeps its icons) in ink on white, opaque for every launcher.
  const files = {};
  const logo = await sharp(await inkOnTransparent(sharp, resolve(root, record.chosen), ink, drawnIn)).resize({ height: LOGO_HEIGHT }).png().toBuffer();
  await sharp(logo).toFile(resolve(root, 'public/logo.png'));
  const logoMeta = await sharp(logo).metadata();
  files['logo.png'] = { width: logoMeta.width, height: logoMeta.height };
  // The share image: the wordmark on the site's page colour.
  const paper = /^#[0-9a-f]{6}$/i.test(resolveToken(css, '--surface-primary') ?? '') ? resolveToken(css, '--surface-primary') : '#ffffff';
  files['og-image.png'] = await writeShareImage(sharp, { logo, background: paper, path: resolve(root, 'public/og-image.png') });
  if (record.mark) {
    const glyph = await inkOnTransparent(sharp, resolve(root, record.mark), ink, drawnIn);
    for (const { file, size } of MARK_SIZES) {
      const inner = Math.round(size * 0.68);
      const fitted = await sharp(glyph).resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: fitted, gravity: 'centre' }]).png().toFile(resolve(root, 'public', file));
      files[file] = { width: size, height: size };
    }
  }
  const before = await readFile(resolve(root, 'src/data/site-identity.json'), 'utf8').then(JSON.parse).catch(() => null);
  const kept = before && !record.mark ? Object.fromEntries(MARK_SIZES.filter(({ file }) => existsSync(resolve(root, 'public', file))).map(({ file, size }) => [file, { width: size, height: size }])) : {};
  const identity = { ...identityFromFiles({ siteName: name, origin: canonicalOrigin(domain), source: 'make-wordmark', files: { ...kept, ...files } }), generated: { wordmark: record.chosen, mark: record.mark, ink, replaceable: true } };
  await writeJson(resolve(root, 'src/data/site-identity.json'), identity);
  await writeJson(resolve(root, `${dir}/wordmark.json`), record);
  return record;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ name: { type: 'string' }, domain: { type: 'string' }, designs: { type: 'string' } });
  if (!values.name || !values.domain) return usage('Usage: node scripts/make-wordmark.mjs --name "<site name>" --domain <domain> [--designs 4]');
  console.log(JSON.stringify(await makeWordmark({ name: values.name, domain: values.domain, designs: Number(values.designs ?? DIRECTIONS.length) }), null, 2));
});
