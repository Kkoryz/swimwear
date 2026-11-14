#!/usr/bin/env node

// Whether each photo a built page shows is of the page's subject (owner via Fable, 2026-10-27): one vision judgment
// per photo and page subject (config/agent-steps/image-fit.md), a label only, fits or wrong_subject, no reason. The
// page subject is the site plan's primary query (else its label); the photo's section heading and alt go with it.
// Judgments are kept by the photo's content hash and the page subject (docs/research/image-fit.json): a photo is judged
// again only when it changes (a remade or a real photo) or its instructions do. --reads 2 judges each twice and
// reports how often the two agree (the prototype's check).
// Usage: node scripts/judge-image-fit.mjs [--routes /a/,/b/] [--reads 1] [--concurrency 2]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, readBuiltPage } from './lib/built-site.mjs';
import { cliArgs, listOption, runMain } from './lib/cli.mjs';
import { JUDGE_MODEL } from './lib/codex-exec.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

export const FIT_SCHEMA = 'seo-site-image-fit-v1';
export const LABELS = Object.freeze(['fits', 'wrong_subject']);
const PROMPT = fileURLToPath(new URL('../config/agent-steps/image-fit.md', import.meta.url));

const plain = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// The photos of a built page's main content: { src, alt, section } in page order, section the heading of the block
// the photo sits in (the page's H1 for the hero). The logo and icons outside /media/ are not photos of the page.
export function pagePhotos(html) {
  const main = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
  const starts = [...main.matchAll(/data-authoring-block="[^"]*"/g)].map((match) => match.index);
  const blockAt = (index) => { const start = [...starts].reverse().find((at) => at <= index) ?? 0; const end = starts.find((at) => at > start) ?? main.length; return main.slice(start, end); };
  return [...main.matchAll(/<img\b[^>]*>/g)].flatMap(({ 0: tag, index }) => {
    const src = tag.match(/\ssrc="([^"]*)"/)?.[1] ?? '';
    if (!src.startsWith('/media/')) return [];
    const heading = blockAt(index).match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/)?.[1];
    return [{ src, alt: decode(tag.match(/\salt="([^"]*)"/)?.[1] ?? ''), section: heading ? plain(heading) : '' }];
  });
}

// The label a reply gives, or null.
export function fitLabel(reply) {
  const line = String(reply ?? '').trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  try { const label = JSON.parse(line ?? '').label; return LABELS.includes(label) ? label : null; } catch { return null; }
}

export async function judgeImageFit({ root = process.cwd(), routes = null, reads = 1, concurrency = 2, run = runJudge } = {}) {
  const template = await readFile(PROMPT, 'utf8');
  const rules = createHash('sha256').update(template).digest('hex').slice(0, 16);
  const site = await readJson(resolve(root, 'site.json'), {});
  const plan = site.siteFactory ? await readJson(resolve(root, site.siteFactory, 'pages.json'), null) : null;
  const subjectOf = (page) => { const row = plan?.pages?.find((item) => item.url === page.route); return row?.primary_query || row?.label || page.hero?.heading || page.route; };
  const path = resolve(root, 'docs/research/image-fit.json');
  const previous = await readJson(path, null);
  const judgments = previous?.rules === rules ? { ...previous.judgments } : {};
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
      const key = `${sha}|${subject}`;
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
      const prompt = template.replace('{{pageSubject}}', item.subject).replace('{{section}}', item.section || '(none)').replace('{{alt}}', item.alt || '(none)');
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
  const shown = pages.map((page) => ({ ...page, images: page.images.map(({ key, ...image }) => ({ ...image, fit: judgments[key]?.label ?? null, fit_model: judgments[key]?.model ?? null })) }));
  await writeJson(path, { schemaVersion: FIT_SCHEMA, rules, judgments, pages: shown });
  const twice = [...labels.values()].filter((list) => list.length > 1);
  return { judged: labels.size, failures, agreement: twice.length ? twice.filter((list) => list.every((label) => label === list[0])).length / twice.length : null, pages: shown };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ routes: { type: 'string' }, reads: { type: 'string' }, concurrency: { type: 'string' } });
  const result = await judgeImageFit({ routes: values.routes ? listOption(values.routes) : null, reads: Number(values.reads ?? 1), concurrency: Number(values.concurrency ?? 2) });
  for (const page of result.pages) for (const image of page.images) console.log(`${page.route} [${page.pageSubject}] ${image.fit ?? 'unjudged'} ${image.src} (${image.section})`);
  console.log(JSON.stringify({ judged: result.judged, failures: result.failures.length, agreement: result.agreement }));
  for (const failure of result.failures) console.log(`failed: ${failure.src}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
});
