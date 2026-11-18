#!/usr/bin/env node

// Whether each photo a built page shows is of the page's subject (owner via Fable, 2026-10-27): one vision judgment
// per photo and page subject (config/agent-steps/image-fit.md), a label only, fits or wrong_subject, no reason. The
// page subject is the site plan's primary query (else its label); the photo's section heading and alt go with it.
// Judgments are kept by exactly what the judge is asked (docs/research/image-fit.json): the photo's content hash and the
// filled prompt (its instructions, the page subject, the section heading and the alt), so a photo is judged again only
// when it changes (a remade or a real photo) or anything it is shown with does (owner 2026-11-17, site13's 40-minute
// run: a judgment is reused for the same question only, and always for it). --reads 2 judges each twice and
// reports how often the two agree (the prototype's check). --samples judges, before the library is made, the sample of
// each photo class generate-images.mjs --samples made (judgeSamples; owner 2026-11-17).
// Usage: node scripts/judge-image-fit.mjs [--samples] [--routes /a/,/b/] [--reads 1] [--concurrency 2]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, readBuiltPage } from './lib/built-site.mjs';
import { cliArgs, listOption, runMain } from './lib/cli.mjs';
import { JUDGE_MODEL } from './lib/codex-exec.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { SAMPLES_PATH, sampleState, samplesMarkdown } from './lib/photo-samples.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

export const FIT_SCHEMA = 'seo-site-image-fit-v1';
export const LABELS = Object.freeze(['fits', 'wrong_subject']);
const PROMPT = fileURLToPath(new URL('../config/agent-steps/image-fit.md', import.meta.url));

const plain = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// The photos of a built page's main content: { src, alt, section, block } in page order, section the heading of the
// block the photo sits in (the page's H1 for the hero), block its id (data-block-id: the photo briefs keep a position
// whose photo fits, plan-photo-briefs.mjs). The logo and icons outside /media/ are not photos of the page.
export function pagePhotos(html) {
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const starts = [...main.matchAll(/data-authoring-block="[^"]*"/g)].map((match) => match.index);
  const startOf = (index) => [...starts].reverse().find((at) => at <= index) ?? 0;
  const blockAt = (index) => { const start = startOf(index); const end = starts.find((at) => at > start) ?? main.length; return main.slice(start, end); };
  const idAt = (index) => { const start = startOf(index); return main.slice(start, main.indexOf('>', start)).match(/data-block-id="([^"]*)"/)?.[1] ?? null; };
  return [...main.matchAll(/<img\b[^>]*>/g)].flatMap(({ 0: tag, index }) => {
    const src = tag.match(/\ssrc="([^"]*)"/)?.[1] ?? '';
    if (!src.startsWith('/media/')) return [];
    const heading = blockAt(index).match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/)?.[1];
    const block = idAt(index);
    return [{ src, alt: decode(tag.match(/\salt="([^"]*)"/)?.[1] ?? ''), section: heading ? plain(heading) : '', ...(block ? { block } : {}) }];
  });
}

// The label a reply gives, or null.
export function fitLabel(reply) {
  const line = String(reply ?? '').trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  try { const label = JSON.parse(line ?? '').label; return LABELS.includes(label) ? label : null; } catch { return null; }
}

// A page's subject as the judge is given it: the site plan's primary query, else its label, its H1 or its route.
async function pageSubjects(root) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const plan = site.siteFactory ? await readJson(resolve(root, site.siteFactory, 'pages.json'), null) : null;
  return (page) => { const row = plan?.pages?.find((item) => item.url === page.route); return row?.primary_query || row?.label || page.hero?.heading || page.route; };
}
const fillPrompt = (template, item) => template.replace('{{pageSubject}}', item.subject).replace('{{section}}', item.section || '(none)').replace('{{alt}}', item.alt || '(none)');

// The samples of each photo class (lib/photo-samples.mjs; owner 2026-11-17), judged as a built page's photos are, before
// the rest of the library is made: each against the page it is for (a section's ask: its page and section; any other
// photo: the first page of its category), its master or finished file, the alt the image model gave it. A sample that
// does not fit is sent back to be made again (status rejected-review) and the library waits (generate-images.mjs).
export async function judgeSamples({ root = process.cwd(), run = runJudge } = {}) {
  const template = await readFile(PROMPT, 'utf8');
  const recordPath = resolve(root, SAMPLES_PATH);
  const record = await readJson(recordPath, null);
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const subjectOf = await pageSubjects(root);
  const pages = await loadSitePages(root);
  const judged = [];
  await mkdir(resolve(root, 'docs/research/images/samples'), { recursive: true });
  for (const [photoClass, sample] of Object.entries(record?.classes ?? {})) {
    if (sampleState(record, plan, photoClass) !== 'pending') continue;
    const entry = plan.entries.find((item) => item.id === sample.id);
    const route = entry.intent?.route ?? Object.entries(plan.routes ?? {}).find(([, category]) => category === entry.category)?.[0] ?? Object.entries(plan.themes ?? {}).find(([, id]) => `theme:${id}` === entry.category)?.[0] ?? '/';
    const page = pages.find((item) => item.route === route) ?? { route, hero: {} };
    const finished = resolve(root, `docs/research/images/masters/${entry.id}.finished.png`);
    const item = { subject: subjectOf(page), section: entry.intent?.section ?? entry.intent?.caption ?? page.hero?.heading ?? '', alt: entry.alt ?? '' };
    const lastMessage = resolve(root, 'docs/research/images/samples', `${entry.id}.reply.txt`);
    const result = await run({ root, prompt: fillPrompt(template, item), images: [existsSync(finished) ? finished : resolve(root, entry.master)], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: `image-fit sample ${entry.id}` });
    const label = result.code === 0 ? fitLabel(await readFile(lastMessage, 'utf8').catch(() => '')) : null;
    if (!label) { judged.push({ photoClass, id: entry.id, label: null, error: result.code === 0 ? 'no label in the reply' : result.stderr.slice(-300) }); continue; }
    Object.assign(sample, { label, route, subject: item.subject, model: JUDGE_MODEL, at: new Date().toISOString() });
    if (label === 'wrong_subject') Object.assign(entry, { status: 'rejected-review', review: 'sample-misfit', fitRemakes: (entry.fitRemakes ?? 0) + 1 });
    judged.push({ photoClass, id: entry.id, label });
  }
  if (judged.some((item) => item.label === 'wrong_subject')) await writeJson(planPath, plan);
  if (judged.length) {
    await writeJson(recordPath, record);
    await writeFile(resolve(root, 'docs/research/images/samples.md'), samplesMarkdown(record));
  }
  return { judged, record };
}

export async function judgeImageFit({ root = process.cwd(), routes = null, reads = 1, concurrency = 2, run = runJudge } = {}) {
  const template = await readFile(PROMPT, 'utf8');
  const rules = createHash('sha256').update(template).digest('hex').slice(0, 16);
  const subjectOf = await pageSubjects(root);
  const path = resolve(root, 'docs/research/image-fit.json');
  const previous = await readJson(path, null);
  const promptOf = (item) => fillPrompt(template, item);
  const keyOf = (item, sha) => createHash('sha256').update(promptOf(item)).update('\0').update(sha).digest('hex').slice(0, 32);
  // Keys of the earlier form (photo|subject) are not this question; a judgment of that form is carried once to the
  // question its page last showed it with (the report's pages: section and alt), under the same instructions.
  const judgments = Object.fromEntries(Object.entries(previous?.judgments ?? {}).filter(([key]) => !key.includes('|')));
  if (previous?.rules === rules) {
    for (const page of previous.pages ?? []) for (const image of page.images ?? []) {
      const legacy = previous.judgments?.[`${image.image_sha256}|${page.pageSubject}`];
      if (legacy && image.fit === legacy.label) judgments[keyOf({ subject: page.pageSubject, section: image.section, alt: image.alt }, image.image_sha256)] ??= legacy;
    }
  }
  const pages = [];
  const queue = new Map();
  for (const page of await loadSitePages(root)) {
    if (routes && !routes.includes(page.route)) continue;
    const html = await readBuiltPage(root, page.route);
    if (!html) continue;
    const subject = subjectOf(page);
    const images = [];
    for (const photo of pagePhotos(html)) {
      const file = resolve(root, 'dist', photo.src.replace(/^\//, ''));
      if (!existsSync(file)) continue;
      const sha = createHash('sha256').update(await readFile(file)).digest('hex');
      const key = keyOf({ subject, ...photo }, sha);
      if (!judgments[key] && !queue.has(key)) queue.set(key, { file, subject, ...photo });
      images.push({ ...photo, image_sha256: sha, key });
    }
    pages.push({ route: page.route, pageSubject: subject, images });
  }
  await mkdir(resolve(root, 'docs/research/image-fit'), { recursive: true });
  const jobs = [...queue].flatMap(([key, item]) => Array.from({ length: reads }, (_, read) => ({ key, item, read })));
  const labels = new Map();
  const failures = [];
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { key, item, read } = job;
      const prompt = promptOf(item);
      const lastMessage = resolve(root, 'docs/research/image-fit', `${key.slice(0, 16)}-${read}.reply.txt`);
      const result = await run({ root, prompt, images: [item.file], lastMessage, sandbox: 'read-only', lean: true, judge: true, tokenLog: resolve(root, 'docs/research/image-fit/tokens.jsonl'), label: `image-fit ${item.src}` });
      const label = result.code === 0 ? fitLabel(await readFile(lastMessage, 'utf8').catch(() => '')) : null;
      if (!label) { failures.push({ src: item.src, subject: item.subject, error: result.code === 0 ? 'no label in the reply' : result.stderr.slice(-300) }); continue; }
      labels.set(key, [...(labels.get(key) ?? []), label]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const at = new Date().toISOString();
  // The first read is the judgment; further reads only measure agreement.
  for (const [key, list] of labels) judgments[key] = { label: list[0], model: JUDGE_MODEL, reads: list, at };
  // A full run keeps the judgments its pages show; a run of some routes keeps every other one too.
  if (!routes) { const shownKeys = new Set(pages.flatMap((page) => page.images.map((image) => image.key))); for (const key of Object.keys(judgments)) if (!shownKeys.has(key)) delete judgments[key]; }
  const shown = pages.map((page) => ({ ...page, images: page.images.map(({ key, ...image }) => ({ ...image, fit: judgments[key]?.label ?? null, fit_model: judgments[key]?.model ?? null })) }));
  await writeJson(path, { schemaVersion: FIT_SCHEMA, rules, judgments, pages: shown });
  const twice = [...labels.values()].filter((list) => list.length > 1);
  return { judged: labels.size, failures, agreement: twice.length ? twice.filter((list) => list.every((label) => label === list[0])).length / twice.length : null, pages: shown };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ routes: { type: 'string' }, reads: { type: 'string' }, concurrency: { type: 'string' }, samples: { type: 'boolean' } });
  if (values.samples) {
    const { judged } = await judgeSamples();
    for (const item of judged) console.log(`sample ${item.photoClass} ${item.id}: ${item.label ?? `unjudged (${item.error})`}`);
    // A sample left unjudged is no failure here: the library waits for it (generate-images.mjs).
    return;
  }
  const result = await judgeImageFit({ routes: values.routes ? listOption(values.routes) : null, reads: Number(values.reads ?? 1), concurrency: Number(values.concurrency ?? 2) });
  for (const page of result.pages) for (const image of page.images) console.log(`${page.route} [${page.pageSubject}] ${image.fit ?? 'unjudged'} ${image.src} (${image.section})`);
  console.log(JSON.stringify({ judged: result.judged, failures: result.failures.length, agreement: result.agreement }));
  for (const failure of result.failures) console.log(`failed: ${failure.src}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
});
