#!/usr/bin/env node

// Writes docs/research/image-types.json: the kinds of image the reference site uses and the kind each planned photo is
// made as (lib/image-types.mjs). Every image of the captured reference pages is described in batches with where it sits on the captured pages;
// one text-only reading groups the descriptions into kinds with generic recipes; one text-only reading per page gives
// each of its planned photos a kind. Each reading is kept while what it was read from is unchanged. Runs after
// plan:images and before generate:images.
// Usage: node scripts/analyze-image-types.mjs [--force]

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { DESCRIBE_BATCH, IMAGE_TYPES_SCHEMA, allowedTypes, notWornIn, spreadSlots, typeCategory, typedPhoto, describePrompt, parseDescribed, parseProducts, parseSlots, parseTypes, photoContexts, productsPrompt, section, slotsPrompt, typesPrompt, usedFor } from './lib/image-types.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { pageCategory } from './lib/image-plan.mjs';
import { GENERAL, SERVICE_HERO } from './lib/media-allocation.mjs';
import { styleReferences } from './lib/style-references.mjs';
import { imageBriefs } from './lib/trade.mjs';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// Pages given kinds at once (text-only readings; three at once hit Codex's rate limit on site10).
const PAGE_CONCURRENCY = 2;

// The captured reference pages: each page's rendered HTML and asset map.
async function capturedPages(root) {
  const base = resolve(root, 'docs/research/reference-pages');
  if (!existsSync(base)) return [];
  const pages = [];
  for (const page of await readdir(base)) {
    const html = resolve(base, page, 'raw/rendered.html');
    const map = resolve(base, page, 'raw/asset-map.json');
    if (existsSync(html) && existsSync(map)) pages.push({ page, html: await readFile(html, 'utf8'), map: await readJson(map) });
  }
  return pages;
}

// Every image of the captured pages at least MIN_SIDE pixels each way, once each: the style references leave out the
// reference's charts, boards and swatch cards (site10: 31 of its 48), which are kinds of image too.
const MIN_SIDE = 300;
async function capturedPhotos(root) {
  const base = resolve(root, 'docs/research/reference-pages');
  if (!existsSync(base)) return [];
  const { default: sharp } = await import('sharp');
  const seen = new Set();
  const photos = [];
  for (const page of (await readdir(base)).sort()) {
    const dir = resolve(base, page, 'public/reference-assets');
    if (!existsSync(dir)) continue;
    for (const file of (await readdir(dir)).sort()) {
      if (!/\.(jpe?g|png|webp)$/i.test(file) || seen.has(file)) continue;
      seen.add(file);
      const meta = await sharp(resolve(dir, file)).metadata().catch(() => null);
      if (meta?.width >= MIN_SIDE && meta?.height >= MIN_SIDE) photos.push(resolve(dir, file));
    }
  }
  return photos;
}

// run: the Codex call (a stand-in in tests).
export async function analyzeImageTypes({ root = process.cwd(), force = false, run: codex = runJudge } = {}) {
  const briefs = await imageBriefs(root);
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const plan = await readJson(resolve(root, 'docs/research/image-plan.json'));
  const outPath = resolve(root, 'docs/research/image-types.json');
  const previous = force ? null : await readJson(outPath, null);
  const captured = await capturedPhotos(root);
  const refs = captured.length ? captured : [...new Set(Object.values(await styleReferences(root, variants.components)).flat().map((ref) => ref.path))];
  if (!refs.length) throw new Error('no reference photos (docs/research/reference-pages, docs/research/analysis/media.json)');
  const siteKind = plan.siteKind ?? briefs.siteKind;
  await mkdir(resolve(root, 'docs/research/images'), { recursive: true });
  // One Codex reading, asked again once when its reply cannot be read. A reading is a judgment: it runs in the judge
  // homes (lib/codex-exec.mjs), which pass a rate-limited home over, and leaves the image model's home to the photos
  // (site10's readings and photos together drew 429s from the one home).
  const ask = async (name, prompt, images, parse) => {
    const lastMessage = resolve(root, `docs/research/images/${name}.reply.txt`);
    for (let attempt = 0; ; attempt += 1) {
      const result = await codex({ root, prompt, images, lastMessage, sandbox: 'read-only', judge: true, label: name });
      if (result.code !== 0) throw new Error(`codex exit ${result.code} on ${name}: ${result.stderr.trim().slice(-300)}`);
      try { return parse(await readFile(lastMessage, 'utf8')); } catch (error) { if (attempt) throw new Error(`${name}: ${error.message}`); }
    }
  };

  const contexts = photoContexts(refs, await capturedPages(root));
  let described = same(previous?.refs, refs) ? previous.described : null;
  if (!described) {
    described = [];
    for (let start = 0; start < contexts.length; start += DESCRIBE_BATCH) {
      const batch = contexts.slice(start, start + DESCRIBE_BATCH);
      described.push(...await ask(`types-describe-${start + 1}`, describePrompt(batch, start, siteKind), batch.map((item) => item.path), (reply) => parseDescribed(reply, start, batch.length)));
    }
  }
  // What is read so far is saved after each reading, so a run stopped part way (a rate limit) goes on from there.
  const pages = {};
  let saving = Promise.resolve();
  let productsRead = null;
  const save = (types) => (saving = saving.then(() => writeJson(outPath, { schemaVersion: IMAGE_TYPES_SCHEMA, refs, described, types, pages: Object.fromEntries(Object.entries({ ...(same(previous?.types, types) ? previous.pages : {}), ...pages }).sort()), ...(productsRead ? { products: productsRead } : {}) })));
  await save(same(previous?.described, described) ? previous.types : null);
  const grouped = same(previous?.described, described) && previous.types ? previous.types : await ask('types-group', typesPrompt(described, siteKind), [], (reply) => parseTypes(reply, refs.length));
  // Each kind with the reference's sections that show it.
  const types = grouped.map((type) => ({ ...type, usedFor: usedFor(type, contexts) }));
  await save(types);

  // What each category's photos show, from its name and its page's headings (the whole line for general pages), and
  // whether it is worn: read before the kinds, which a category nobody wears takes none of a model.
  const authored = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  // A theme's set is the line's product (typeCategory); a service page's own opening photo has no product to read.
  const categories = [...new Set(plan.entries.filter((entry) => entry.status !== 'retired' && entry.intent?.id !== SERVICE_HERO).map((entry) => typeCategory(entry.category)))].sort();
  const productSources = categories.map((category) => ({ category, ...(category === GENERAL ? { about: `the whole ${plan.line} line` } : {}), headings: authored.filter((page) => (plan.routes?.[page.route] ?? pageCategory(page, briefs)) === category).flatMap((page) => page.blocks.map((block) => block.heading).filter(Boolean)) }));
  const products = previous?.products?.printed && same(previous.products.from, productSources) ? previous.products : { from: productSources, ...(await ask('types-products', productsPrompt(productSources, siteKind), [], (reply) => parseProducts(reply, productSources.map((item) => item.category)))) };
  productsRead = products;
  await save(types);
  const marked = (entry) => notWornIn({ products }, entry);

  // Each page's photos that a kind is chosen for (a process photo when the reference has a kind that shows making).
  const queue = [...Map.groupBy(plan.entries.map(marked).filter((entry) => typedPhoto(entry) && allowedTypes(entry, types).length), (entry) => typeCategory(entry.category))];
  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, async () => {
    while (queue.length) {
      const [category, entries] = queue.shift();
      const from = { types: types.map((type) => [type.name, type.usedFor]), photos: entries.map((entry) => [entry.id, section(entry)]) };
      const kept = previous?.pages?.[category];
      // Kept while its photos and the kinds are the same and every photo's kind is still one it may take.
      // Kept as read (read), spread over the kinds on use (slots).
      const read = kept?.read ?? kept?.slots;
      if (kept && same(kept.from, from) && same(previous.types, types) && entries.every((entry) => allowedTypes(entry, types).includes(read[entry.id]))) { pages[category] = { from, read, slots: spreadSlots(read, entries) }; continue; }
      const answer = await ask(`types-page-${category.replace(/[^a-z0-9]+/gi, '-')}`, slotsPrompt(category, entries, types, siteKind), [], (reply) => parseSlots(reply, entries, types));
      pages[category] = { from, read: answer, slots: spreadSlots(answer, entries) };
      await save(types);
    }
  }));
  // The pages of this plan only: a page no longer planned is dropped.
  const result = { schemaVersion: IMAGE_TYPES_SCHEMA, refs, described, types, pages: Object.fromEntries(Object.entries(pages).sort()), products };
  await saving;
  await writeJson(outPath, result);
  return result;
}

runMain(import.meta.url, async () => {
  const result = await analyzeImageTypes({ force: cliArgs({ force: { type: 'boolean' } }).values.force === true });
  for (const [index, type] of result.types.entries()) {
    const used = Object.values(result.pages).reduce((sum, page) => sum + Object.values(page.slots).filter((kind) => kind === index).length, 0);
    console.log(`${type.name} [${type.shows}, face ${type.face}, ${type.background}]: ${type.photos.length} reference photos, ${used} planned`);
  }
});
