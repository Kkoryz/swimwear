#!/usr/bin/env node

// The hand fix that gives a finished site (built before lib/image-seo.mjs) Google Images SEO in one go, without running
// its flow again (owner 2026-11-20: "已完成的旧站不走流程开关，用手改脚本单独处理"):
//   1. alt text in the product's words: a file of new alts (--alts <file>, { "<src>": "<alt>" }, as --draft-alts writes
//      it once its prompt is approved) replaces each photo's alt wherever the site's data gives it with that photo;
//   2. descriptive file names: every photo the site's data shows (the image register's and the blog's) is renamed to
//      what it shows and its product (lib/image-seo.mjs imageSlug, photoTerm), each of its sizes and phone crops, and
//      every reference in src/data, docs/research and content/ is rewritten; each photo's subject record
//      (docs/research/photo-focus/) follows its file;
//   3 and 4. site.json imageSeo is set on, so the build writes the image sitemap entries and the ImageObjects.
// Rerunnable: a photo already renamed keeps its name (handfix/image-seo/url-map.json), a reference already rewritten is
// left. Every file changed is backed up once, as it was, under handfix/image-seo/backup/; --undo puts the files and
// the names back. Writes handfix/image-seo/url-map.json and url-map.csv (old URL -> new URL, for redirects later) and
// appends to handfix/image-seo/ledger.jsonl. Without --apply it only says what it would do.
// --undo is for right after an apply: it puts each changed file back whole, so an edit made to one of them since is
// lost with it.
// --draft-alts: the alt rewrite's model calls (one per ALT_BATCH photos, each with its photo), the first --limit photos
// (20 unless given: a sample is read before the rest are asked); only with --prompt <file>, the approved prompt being
// config/agent-steps/image-alt-rewrite.md; without, it prints how many calls it would make. A drafted alt that breaks
// the alt rules (lib/alt-text.mjs) or names the product twice is left out, so its photo keeps its alt.
// Usage: node scripts/handfix-image-seo.mjs [--root <site>] [--apply] [--alts <file>] [--undo]
//        node scripts/handfix-image-seo.mjs --draft-alts [--limit 20] [--prompt config/agent-steps/image-alt-rewrite.md] [--root <site>]

import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { focusPath } from './lib/photo-focus.mjs';
import { imageSlug, photoTerm, productMentions, productTerm, publishedStem, uniqueName } from './lib/image-seo.mjs';
import { altProblems } from './lib/alt-text.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { ALT_MAX_CHARS, ALT_MIN_CHARS } from './lib/rules.mjs';
import { pageHash } from './lib/page-dates.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

export const HANDFIX_DIR = 'handfix/image-seo';
// The site's text files whose references follow a renamed photo.
const TEXT_DIRS = ['src/data', 'docs/research', 'content'];
const TEXT_FILE = /\.(?:json|md|txt|csv)$/i;
const MEDIA_PATH = /\/media\/[A-Za-z0-9._\/-]+?\.(?:webp|png|jpe?g)/g;
const SIZE = /^-\d+(?:-phone-\d+)?\.webp$/;
// Photos per alt-rewrite call (a batch of like judgments, about ten).
export const ALT_BATCH = 10;

const posix = (path) => path.split('\\').join('/');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])))).flat();
}
const textFiles = async (root) => (await Promise.all(TEXT_DIRS.map((dir) => walk(resolve(root, dir))))).flat().filter((file) => TEXT_FILE.test(file)).sort();

// Every object in a JSON value that has a src (and the path to it), depth first.
function* withSrc(value) {
  if (Array.isArray(value)) for (const item of value) yield* withSrc(item);
  else if (value && typeof value === 'object') {
    if (typeof value.src === 'string') yield value;
    for (const item of Object.values(value)) yield* withSrc(item);
  }
}
const filesOf = (web) => [web?.src, web?.wide?.src, ...String(web?.srcset ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])].filter(Boolean);

// The photos the site's data shows, each once: { key, dir, stem, files, alt, term, entry } in a fixed order (the image
// register's order, then the blog's articles by name). alt: the alt the pages give it; term: its product (photoTerm).
export async function sitePhotos(root) {
  const dataFiles = (await walk(resolve(root, 'src/data'))).filter((file) => file.endsWith('.json')).sort();
  const shown = new Map();
  for (const file of dataFiles) for (const item of withSrc(await readJson(file))) if (!shown.has(item.src) && typeof item.alt === 'string') shown.set(item.src, item.alt);
  const plan = await readJson(resolve(root, 'docs/research/image-plan.json'), { entries: [] });
  const pages = [...await readJson(resolve(root, 'src/data/authoring-pages.json'), []), ...await readJson(resolve(root, 'src/data/placeholder-pages.json'), [])];
  const home = productTerm(pages.find((page) => page.route === '/'));
  const groups = [];
  const add = (web, entry, termOf) => {
    const files = filesOf(web);
    const src = files.find((file) => shown.has(file));
    if (!src) return;
    const dir = src.slice(0, src.lastIndexOf('/') + 1);
    const stem = publishedStem(src);
    if (groups.some((group) => group.dir === dir && group.stem === stem)) return;
    const alt = shown.get(src);
    groups.push({ key: `${dir}${stem}`, dir, stem, src, alt, entry, term: termOf(alt) });
  };
  for (const entry of plan.entries ?? []) if (entry.web) add(entry.web, entry, (alt) => photoTerm(entry, { routes: plan.routes ?? {}, pages, alt }));
  const articles = resolve(root, 'docs/research/geo-articles');
  for (const name of (await readdir(articles, { withFileTypes: true }).catch(() => [])).filter((item) => item.isDirectory()).map((item) => item.name).sort()) {
    const record = await readJson(join(articles, name, 'record.json'), null);
    for (const visual of Object.values(record?.visuals ?? {})) add({ ...visual.web, wide: visual.wide }, null, (alt) => (productMentions(alt, home) > 0 ? home : null));
  }
  return groups;
}

// The file renames of the photos: { map: old URL -> new URL, renames: [{ from, to }] (public/ paths) }. A photo in the
// earlier url-map keeps its new name; the others are named apart from every name kept.
export async function planRenames(root, groups, previous = {}) {
  const publicDir = resolve(root, 'public');
  const map = {};
  const renames = [];
  const named = new Map(Object.entries(previous).map(([from, to]) => [`${from.slice(0, from.lastIndexOf('/') + 1)}${publishedStem(from)}`, publishedStem(to)]));
  // Names kept: every published name that is not renamed here, and the names given before.
  const renamed = new Set(groups.map((group) => group.key));
  const taken = new Set();
  for (const file of await walk(resolve(publicDir, 'media'))) {
    const path = `/${posix(relative(publicDir, file))}`;
    const key = `${path.slice(0, path.lastIndexOf('/') + 1)}${publishedStem(path)}`;
    if (!renamed.has(key)) taken.add(publishedStem(path));
  }
  for (const name of named.values()) taken.add(name);
  // A photo already under the name an earlier run gave it.
  const given = new Set(Object.values(previous).map((to) => `${to.slice(0, to.lastIndexOf('/') + 1)}${publishedStem(to)}`));
  for (const group of groups) {
    if (given.has(group.key)) continue;
    const done = named.get(group.key);
    const name = done ?? (() => { const slug = imageSlug({ alt: group.alt, term: group.term }); return slug ? uniqueName(slug, taken) : null; })();
    if (!name || name === group.stem) continue;
    const folder = resolve(publicDir, group.dir.slice(1));
    for (const file of (await readdir(folder).catch(() => [])).sort()) {
      if (!file.startsWith(`${group.stem}-`) || !SIZE.test(file.slice(group.stem.length))) continue;
      const from = `${group.dir}${file}`;
      const to = `${group.dir}${name}${file.slice(group.stem.length)}`;
      map[from] = to;
      renames.push({ from, to });
    }
  }
  return { map: { ...previous, ...map }, renames };
}

// A file backed up once, as it was before the first change (rerunnable: a later run keeps that first copy).
async function backup(root, file) {
  const target = resolve(root, HANDFIX_DIR, 'backup', relative(root, file));
  if (existsSync(target)) return;
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
}

// Each photo's alt replaced (alts: { "<src>": "<new alt>" }, keyed by any file of the photo) wherever the site's data
// gives it with one of its files, and in its register entry: the files changed and how many alts.
export async function applyAlts(root, alts, groups, { write = false } = {}) {
  const bySrc = new Map();
  for (const group of groups) {
    const files = group.entry ? filesOf(group.entry.web) : [group.src];
    const alt = Object.entries(alts).find(([src]) => files.includes(src))?.[1];
    if (alt && alt !== group.alt) for (const file of files) bySrc.set(file, { from: group.alt, to: alt });
  }
  const changed = [];
  let count = 0;
  const targets = [...(await walk(resolve(root, 'src/data'))).filter((file) => file.endsWith('.json')).sort(), resolve(root, 'docs/research/image-plan.json')];
  for (const file of targets) {
    if (!existsSync(file)) continue;
    const data = await readJson(file);
    let hits = 0;
    for (const item of withSrc(data)) { const swap = bySrc.get(item.src); if (swap && item.alt === swap.from) { item.alt = swap.to; hits += 1; } }
    // The register keeps a photo's alt on its entry (web.src beside it).
    for (const entry of Array.isArray(data?.entries) ? data.entries : []) { const swap = entry.web && bySrc.get(entry.web.src); if (swap && entry.alt === swap.from) { entry.alt = swap.to; hits += 1; } }
    if (!hits) continue;
    count += hits;
    changed.push(posix(relative(root, file)));
    if (write) { await backup(root, file); await writeJson(file, data); }
  }
  if (write) for (const group of groups) { const swap = bySrc.get(group.src); if (swap) group.alt = swap.to; }
  return { files: changed, alts: count };
}

// The references to renamed photos rewritten in the site's text files: the files changed.
export async function rewriteReferences(root, map, { write = false } = {}) {
  const changed = [];
  for (const file of await textFiles(root)) {
    if (file.startsWith(resolve(root, HANDFIX_DIR))) continue;
    const text = await readFile(file, 'utf8');
    const next = text.replace(MEDIA_PATH, (path) => map[path] ?? path);
    if (next === text) continue;
    changed.push(posix(relative(root, file)));
    if (write) { await backup(root, file); await writeFile(file, next); }
  }
  return changed;
}

export async function handfixImageSeo({ root = process.cwd(), apply = false, alts = null } = {}) {
  const dir = resolve(root, HANDFIX_DIR);
  const mapPath = resolve(dir, 'url-map.json');
  const previous = await readJson(mapPath, {});
  // Each page's content hash before (src/data/page-dates.json): a renamed file or an alt is no change of the page's
  // copy, so a page's recorded date is kept for its new hash (rebound, not dated today).
  const before = apply ? new Map((await loadSitePages(root)).map((page) => [page.route, pageHash(page)])) : null;
  const groups = await sitePhotos(root);
  const altResult = alts ? await applyAlts(root, alts, groups, { write: apply }) : { files: [], alts: 0 };
  const { map, renames } = await planRenames(root, groups, previous);
  const pending = renames.filter(({ from }) => existsSync(resolve(root, 'public', from.slice(1))));
  const references = await rewriteReferences(root, map, { write: apply });
  // Each photo's subject record follows its main file (lib/photo-focus.mjs names it after the src).
  const focus = Object.entries(map).filter(([from, to]) => from !== to && existsSync(resolve(root, focusPath(from))) && !existsSync(resolve(root, focusPath(to))));
  const site = await readJson(resolve(root, 'site.json'), {});
  if (apply) {
    await mkdir(dir, { recursive: true });
    for (const { from, to } of pending) await rename(resolve(root, 'public', from.slice(1)), resolve(root, 'public', to.slice(1)));
    for (const [from, to] of focus) await rename(resolve(root, focusPath(from)), resolve(root, focusPath(to)));
    if (site.imageSeo !== true) { if (existsSync(resolve(root, 'site.json'))) await backup(root, resolve(root, 'site.json')); await writeJson(resolve(root, 'site.json'), { ...site, imageSeo: true }); }
    const datesPath = resolve(root, 'src/data/page-dates.json');
    const dates = await readJson(datesPath, null);
    let rebound = 0;
    if (dates) {
      for (const page of await loadSitePages(root)) {
        const record = dates[page.route];
        const hash = pageHash(page);
        if (record && record.hash !== hash && record.hash === before.get(page.route)) { dates[page.route] = { ...record, hash }; rebound += 1; }
      }
      if (rebound) { await backup(root, datesPath); await writeJson(datesPath, dates); }
    }
    await writeJson(mapPath, map);
    await writeFile(resolve(dir, 'url-map.csv'), `old_url,new_url\n${Object.entries(map).map(([from, to]) => `${from},${to}`).join('\n')}\n`);
    await appendFile(resolve(dir, 'ledger.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), action: 'apply', photos: groups.length, renamed: pending.length, references: references.length, focus: focus.length, rebound, alts: altResult.alts, altFiles: altResult.files.length })}\n`);
  }
  return { photos: groups.length, renames: pending, map, references, focus: focus.length, alts: altResult, siteSwitch: site.imageSeo !== true };
}

// The undo: the renamed files back to their old names, each backed-up file restored.
export async function undoImageSeo({ root = process.cwd() } = {}) {
  const dir = resolve(root, HANDFIX_DIR);
  const map = await readJson(resolve(dir, 'url-map.json'), {});
  let files = 0;
  for (const [from, to] of Object.entries(map)) {
    const now = resolve(root, 'public', to.slice(1));
    if (existsSync(now) && !existsSync(resolve(root, 'public', from.slice(1)))) { await rename(now, resolve(root, 'public', from.slice(1))); files += 1; }
    if (existsSync(resolve(root, focusPath(to))) && !existsSync(resolve(root, focusPath(from)))) await rename(resolve(root, focusPath(to)), resolve(root, focusPath(from)));
  }
  const backups = resolve(dir, 'backup');
  let restored = 0;
  for (const file of await walk(backups)) { await copyFile(file, resolve(root, relative(backups, file))); restored += 1; }
  await appendFile(resolve(dir, 'ledger.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), action: 'undo', files, restored })}\n`);
  return { files, restored };
}

// The photos whose alt the rewrite is asked about: shown by the site, with a product they were made to show
// (photoTerm) that their alt does not name; at most limit, in the site's order.
export const altCandidates = (groups, limit = Infinity) => groups.filter((group) => group.entry && group.term && productMentions(group.alt, group.term) === 0).slice(0, limit);

// The alt rewrite's model calls (only with a prompt approved for it): each batch of ALT_BATCH photos is one call with
// its photos; the reply's JSON lines { id, alt } become { "<src>": "<alt>" } (--alts).
export async function draftAlts({ root = process.cwd(), limit = 20, prompt = null, run = runJudge } = {}) {
  const groups = altCandidates(await sitePhotos(root), limit);
  const calls = Math.ceil(groups.length / ALT_BATCH);
  if (!prompt) return { photos: groups.length, calls, drafted: null };
  const template = (await readFile(resolve(prompt), 'utf8')).replace('{{min}}', ALT_MIN_CHARS).replace('{{max}}', ALT_MAX_CHARS);
  const drafted = {};
  for (let start = 0; start < groups.length; start += ALT_BATCH) {
    const batch = groups.slice(start, start + ALT_BATCH);
    const items = batch.map((group, index) => ({ id: `p${start + index + 1}`, product: group.term.core.join(' '), alt: group.alt, group }));
    const lastMessage = resolve(root, HANDFIX_DIR, `alts-${start / ALT_BATCH + 1}.reply.txt`);
    await mkdir(dirname(lastMessage), { recursive: true });
    const filled = template.replace('{{photos}}', items.map((item, index) => `${item.id} (image ${index + 1}): product "${item.product}"; current alt "${item.alt}"`).join('\n'));
    const images = batch.map((group) => resolve(root, 'public', group.src.slice(1)));
    const result = await run({ root, prompt: filled, images, lastMessage, sandbox: 'read-only', label: `image-seo alts ${start / ALT_BATCH + 1}` });
    if (result.code !== 0) throw new Error(`alt rewrite call ${start / ALT_BATCH + 1} failed (exit ${result.code})`);
    for (const line of (await readFile(lastMessage, 'utf8')).split('\n')) {
      try { const reply = JSON.parse(line.trim()); const item = items.find((one) => one.id === reply.id); const alt = typeof reply.alt === 'string' ? reply.alt.trim() : ''; if (item && alt && !altProblems(alt).length && productMentions(alt, item.group.term) <= 1) drafted[item.group.src] = alt; } catch { /* not a JSON line */ }
    }
  }
  await writeJson(resolve(root, HANDFIX_DIR, 'alts-draft.json'), drafted);
  return { photos: groups.length, calls, drafted };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ root: { type: 'string' }, apply: { type: 'boolean' }, alts: { type: 'string' }, undo: { type: 'boolean' }, 'draft-alts': { type: 'boolean' }, limit: { type: 'string' }, prompt: { type: 'string' } });
  const root = resolve(values.root ?? '.');
  if (values.undo) { console.log(JSON.stringify(await undoImageSeo({ root }))); return; }
  if (values['draft-alts']) {
    const result = await draftAlts({ root, limit: Number(values.limit ?? 20), prompt: values.prompt ?? null });
    console.log(result.drafted ? `${Object.keys(result.drafted).length} alt(s) drafted in ${result.calls} call(s): ${HANDFIX_DIR}/alts-draft.json` : `${result.photos} photo(s) to ask about, ${result.calls} model call(s) (${ALT_BATCH} photos a call); give --prompt <approved prompt> to make them`);
    return;
  }
  const result = await handfixImageSeo({ root, apply: Boolean(values.apply), alts: values.alts ? await readJson(resolve(values.alts)) : null });
  console.log(`${result.photos} photo(s) shown; ${result.renames.length} file(s) ${values.apply ? 'renamed' : 'to rename'}; ${result.references.length} file(s) of references; ${result.focus} subject record(s); ${result.alts.alts} alt(s) in ${result.alts.files.length} file(s)${result.siteSwitch ? '; site.json imageSeo set on' : ''}${values.apply ? '' : ' (dry run: --apply to make the changes)'}`);
  for (const { from, to } of result.renames.filter(({ from }) => from.endsWith('-960.webp')).slice(0, 12)) console.log(`  ${from} -> ${to}`);
}, { stack: true });
