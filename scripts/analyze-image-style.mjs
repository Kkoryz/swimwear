#!/usr/bin/env node

// Writes docs/research/image-style.json: for each photography class the plan generates (and for the whole site, used by
// classes without reference photos), a written style profile from Codex looking at the reference photos, the measured
// colourfulness/brightness/contrast range of those photos and, for classes that show a model, the reference's shot
// list (framings and poses with their counts); for the site, the reference's product language, the places it shows its
// models in and the plain settings its photos give a product shown on its own; and our own ideas: new poses, places and
// settings in the reference's spirit, none the same as one of its own (generate:images takes these). generate:images builds
// every prompt from these and checks each result against the range. A class whose reference photos are unchanged keeps
// what was read from them.
// Usage: node scripts/analyze-image-style.mjs [--force]

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { IMAGE_STYLE_SCHEMA, PROFILE_FIELDS, SITE_STYLE, garmentsPrompt, ideasPrompt, imageStats, parseGarments, parseIdeas, parsePlainShare, parseProductSettings, parseProps, parseShots, parseStyleProfile, plainSharePrompt, productSettingsPrompt, propsPrompt, scenesPrompt, shotsPrompt, statsRange, styleProfilePrompt } from './lib/image-style.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { isProductionScene } from './lib/image-plan.mjs';
import { PERSON_KINDS } from './lib/rules.mjs';
import { styleReferences } from './lib/style-references.mjs';
import { imageBriefs } from './lib/trade.mjs';

// Codex looks at up to this many photos per class, spread evenly over the class's references; at more for lists of
// distinct items (shots, settings), where 8 of site10's 31 gave three poses.
const MAX_IMAGES = 8;
const MAX_LIST_IMAGES = 16;
// Classes whose photos show a model take a shot list (a portrait is a head-and-shoulders photo of a client).
const SHOT_KINDS = [SITE_STYLE, ...PERSON_KINDS.filter((kind) => kind !== 'portrait')];
const spread = (list, count) => (list.length <= count ? list : Array.from({ length: count }, (_, index) => list[Math.floor((index * list.length) / count)]));

export async function analyzeImageStyle({ root = process.cwd(), force = false } = {}) {
  const { default: sharp } = await import('sharp');
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const plan = await readJson(resolve(root, 'docs/research/image-plan.json'));
  const refs = await styleReferences(root, variants.components);
  const stylePath = resolve(root, 'docs/research/image-style.json');
  const previous = await readJson(stylePath, null);
  const all = [...new Set(Object.values(refs).flat().map((ref) => ref.path))];
  // The product language and a product's settings come from the photos of the product, not of the factory (site10's
  // settings took a worktop and window blinds from its factory photos).
  const briefs = await imageBriefs(root);
  const products = [...new Set(Object.values(refs).flat().filter((ref) => !isProductionScene(ref, briefs.productionSceneWords)).map((ref) => ref.path))];
  // A trade whose photos are scenes of its work (briefs.photos "scenes") has no model, garment or product setting: its
  // photos take the profiles alone (light, colour, rendering), and none of the readings for models and products is made.
  const sceneTrade = briefs.photos === 'scenes';
  const classes = { [SITE_STYLE]: all };
  for (const kind of new Set(plan.entries.map((entry) => entry.kind))) if (refs[kind]?.length) classes[kind] = refs[kind].map((ref) => ref.path);
  await mkdir(resolve(root, 'docs/research/images'), { recursive: true });
  // One Codex reading of a set of photos: the earlier one while the photos are the same, else a new one parsed.
  const read = async ({ name, paths, before, kept, prompt, parse, most = MAX_IMAGES }) => {
    if (!force && kept && JSON.stringify(before) === JSON.stringify(paths)) return kept;
    const images = spread(paths, most);
    const lastMessage = resolve(root, `docs/research/images/${name}.reply.txt`);
    const run = await runJudge({ root, prompt: prompt(images.length), images, lastMessage, sandbox: 'read-only', judge: true });
    if (run.code !== 0) throw new Error(`codex exit ${run.code} on ${name}: ${run.stderr.trim().slice(-300)}`);
    return parse(await readFile(lastMessage, 'utf8'));
  };
  const kinds = {};
  await Promise.all(Object.entries(classes).map(async ([kind, paths]) => {
    const stats = [];
    for (const path of paths) stats.push({ path, ...(await imageStats(sharp, path)) });
    const before = previous?.kinds?.[kind];
    // A profile written before a field was added (rendering, 2026-10-28) is read again.
    const whole = PROFILE_FIELDS.every((field) => before?.profile?.[field]) ? before.profile : null;
    const profile = await read({ name: `style-${kind}`, paths, before: before?.refs, kept: whole, prompt: (count) => styleProfilePrompt(kind, count, plan.siteKind), parse: parseStyleProfile });
    // The site's shots come from its photos of the product too (a factory photo gave site10 a model behind a worktable).
    const shots = SHOT_KINDS.includes(kind) && !sceneTrade ? await read({ name: `shots-${kind}`, paths: kind === SITE_STYLE ? products : paths, before: kind === SITE_STYLE ? previous?.productRefs : before?.refs, kept: before?.shots, prompt: (count) => shotsPrompt(kind, count, plan.siteKind), parse: parseShots, most: MAX_LIST_IMAGES }) : null;
    kinds[kind] = { refs: paths, profile, ...(shots ? { shots } : {}), range: statsRange(stats), stats };
  }));
  if (sceneTrade) {
    const style = { schemaVersion: IMAGE_STYLE_SCHEMA, kinds, productRefs: products };
    await writeJson(stylePath, style);
    return style;
  }
  const garments = await read({ name: 'garments', paths: products, before: previous?.productRefs, kept: previous?.garments, prompt: (count) => garmentsPrompt(count, plan.siteKind), parse: parseGarments, most: MAX_LIST_IMAGES });
  const productSettings = await read({ name: 'product-settings', paths: products, before: previous?.productRefs, kept: previous?.productSettings, prompt: (count) => productSettingsPrompt(count, plan.siteKind), parse: parseProductSettings, most: MAX_LIST_IMAGES });
  const scenes = await read({ name: 'scenes', paths: products, before: previous?.productRefs, kept: previous?.scenes, prompt: (count) => scenesPrompt(count, plan.siteKind), parse: parseProductSettings, most: MAX_LIST_IMAGES });
  // Our own poses, places and settings: one text-only reading of the lists above, kept while they are the same.
  const shotClasses = Object.keys(kinds).filter((kind) => kinds[kind].shots);
  const sources = { poses: Object.fromEntries(shotClasses.map((kind) => [kind, kinds[kind].shots.poses.map((item) => item.text)])), scenes: scenes.map((item) => item.text), settings: productSettings.map((item) => item.text), garments };
  let ideas = previous?.ideas;
  if (force || !ideas || JSON.stringify(ideas.from) !== JSON.stringify(sources)) {
    const lastMessage = resolve(root, 'docs/research/images/ideas.reply.txt');
    const run = await runJudge({ root, prompt: ideasPrompt({ ...sources, profile: kinds[SITE_STYLE].profile }), images: [], lastMessage, sandbox: 'read-only', judge: true });
    if (run.code !== 0) throw new Error(`codex exit ${run.code} on ideas: ${run.stderr.trim().slice(-300)}`);
    ideas = { from: sources, ...parseIdeas(await readFile(lastMessage, 'utf8'), shotClasses) };
  }
  // Our props: a reading of their own, kept while the poses and places are the same.
  const propSources = { poses: sources.poses[SITE_STYLE] ?? Object.values(sources.poses).flat(), scenes: sources.scenes };
  let props = previous?.props;
  if (force || !props || JSON.stringify(props.from) !== JSON.stringify(propSources)) {
    const lastMessage = resolve(root, 'docs/research/images/props.reply.txt');
    const run = await runJudge({ root, prompt: propsPrompt({ ...propSources, profile: kinds[SITE_STYLE].profile }), images: [], lastMessage, sandbox: 'read-only', judge: true });
    if (run.code !== 0) throw new Error(`codex exit ${run.code} on props: ${run.stderr.trim().slice(-300)}`);
    props = { from: propSources, list: parseProps(await readFile(lastMessage, 'utf8')) };
  }
  // How many of its products the reference shows plain: a reading of its own, kept while its print language is the same.
  let plain = previous?.plain;
  if (force || !plain || plain.from !== garments.prints) {
    const lastMessage = resolve(root, 'docs/research/images/plain-share.reply.txt');
    const run = await runJudge({ root, prompt: plainSharePrompt(garments), images: [], lastMessage, sandbox: 'read-only', judge: true });
    if (run.code !== 0) throw new Error(`codex exit ${run.code} on the plain share: ${run.stderr.trim().slice(-300)}`);
    plain = { from: garments.prints, share: parsePlainShare(await readFile(lastMessage, 'utf8')) };
  }
  const style = { schemaVersion: IMAGE_STYLE_SCHEMA, kinds, productRefs: products, garments, productSettings, scenes, ideas, props, plain };
  await writeJson(stylePath, style);
  return style;
}

runMain(import.meta.url, async () => {
  const style = await analyzeImageStyle({ force: cliArgs({ force: { type: 'boolean' } }).values.force === true });
  for (const [kind, entry] of Object.entries(style.kinds)) console.log(`${kind} (${entry.refs.length} photos): ${entry.profile.summary}${entry.shots ? ` [${entry.shots.framings.length} framings, ${entry.shots.poses.length} poses]` : ''}`);
});
