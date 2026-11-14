#!/usr/bin/env node

// After stage 08: turns one GEO blog article (geo-blog-research runs/<slug>: 06-article.md, 06-visuals.json; read only)
// into a blog post of this site, in the site's own article layout (lib/geo-article.mjs, BlogPostView). Its visuals
// are made the way the site's photos are (Codex's built-in image tool in the owner's and the judge homes in turn; the
// light, colour and rendering of the site's photos, docs/research/image-style.json; lib/image-prompt.mjs
// articleVisualPrompt), checked against what the writer says they show (config/agent-steps/image-fit.md, made again
// once when they do not) and published as responsive WebP under /media/blog/<slug>/. A photo the writer wanted from the
// company is a stand-in, listed for a real photo to replace (standIns). Visuals are made again only when what the
// writer says about them changes, so the article is imported again after every edit (geo apply) at no image cost.
// The post is built for review (status review: noindex, out of the sitemap and the hub; preflight holds the release)
// and saved as a package in content/blog-queue/drafts with the blog checks' report: a person reviews it, adds review.by
// and review.at, and publishes it with blog:publish. A published post of the same slug is never overwritten.
// Usage: node scripts/import-geo-article.mjs <runs/slug> [--visuals V1,V2]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogGates } from './lib/blog-gates.mjs';
import { cliArgs, listOption, runMain, usage } from './lib/cli.mjs';
import { imageHomes } from './lib/codex-exec.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { companyFacts } from './lib/facts.mjs';
import { articlePost, parseArticle, pictureDensity, pictureTarget, placedVisuals, slugOf } from './lib/geo-article.mjs';
import { articleVisualPrompt } from './lib/image-prompt.mjs';
import { SITE_STYLE } from './lib/image-style.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { differenceHash, hamming } from './lib/image-hash.mjs';
import { finishPhoto, finishTarget } from './lib/photo-finish.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { writeResponsiveWebp } from './lib/web-image.mjs';
import { fitLabel } from './judge-image-fit.mjs';
import { DEFAULT_TRADE, imageBriefs } from './lib/trade.mjs';

export const GEO_ARTICLE_SCHEMA = 'seo-site-geo-article-v1';
const FIT_PROMPT = fileURLToPath(new URL('../config/agent-steps/image-fit.md', import.meta.url));
// Tries of a visual before it is kept as made, its misfit reported.
const FIT_TRIES = 2;
const SIZE = '1536x1024';
// What the writer wants from the company itself (06-visuals.json produce).
const REAL_PHOTO = /real photo/i;
// Visuals made as images; a chart is drawn by the template from its data (ArticleChart.astro).
const MADE = new Set(['hero', 'photo', 'diagram']);

// The prompt's rules (lib/image-prompt.mjs articleVisualPrompt): raised when they change, so visuals made under the
// earlier rules are made again (2: one moment and one subject, no collage; 3: the writer's setting, unlike the
// article's other pictures; 4: a photo in its setting takes the setting's light).
const VISUAL_RULES = 4;
// Hamming distance (of 64) of two pictures' difference hashes at or below which they look alike (the library's
// duplicate threshold, generate-images.mjs).
const LOOK_ALIKE_BITS = 14;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// What a visual is made from: a change of any of these makes it again. A trade other than the default is part of it
// (its people and constraints are worded its own way, lib/trade.mjs): site11's motel articles, made with the clothing
// trade's words, showed a Chinese factory worker fixing a motel lamp.
const visualKey = (visual, trade = DEFAULT_TRADE) => sha(JSON.stringify([visual.type, visual.title, visual.content, visual.setting ?? null, visual.purpose, visual.section, SIZE, VISUAL_RULES, ...(trade === DEFAULT_TRADE ? [] : [trade])])).slice(0, 16);

export async function importGeoArticle({ root = process.cwd(), runDir, only = null, run = runJudge } = {}) {
  const source = resolve(runDir);
  const runName = basename(source);
  const article = parseArticle(await readFile(resolve(source, '06-article.md'), 'utf8'));
  const visuals = (await readJson(resolve(source, '06-visuals.json'))).visuals ?? [];
  const byId = new Map(visuals.map((visual) => [visual.id, visual]));
  const placed = placedVisuals(article);
  const unknown = placed.filter((item) => !byId.has(item.id)).map((item) => item.id);
  if (unknown.length) throw new Error(`06-article.md places visuals 06-visuals.json does not list: ${unknown.join(', ')}`);

  const dir = `docs/research/geo-articles/${runName}`;
  const recordPath = resolve(root, dir, 'record.json');
  const record = await readJson(recordPath, null);
  // The slug stays the one first given (a rewritten title does not move the page), unless the frontmatter names one.
  const slug = article.fields.slug || record?.slug || slugOf(article.title);
  const made = { ...(record?.visuals ?? {}) };
  await mkdir(resolve(root, dir), { recursive: true });
  await mkdir(resolve(root, 'public/media/blog', slug), { recursive: true });

  const style = await readJson(resolve(root, 'docs/research/image-style.json'), null);
  if (!style?.kinds?.[SITE_STYLE]) throw new Error('docs/research/image-style.json is missing: run the site\'s images step first');
  const briefs = await imageBriefs(root);
  const keyOf = (visual) => visualKey(visual, briefs.trade);
  const fitTemplate = await readFile(FIT_PROMPT, 'utf8');
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  const toward = await finishTarget(sharp, style.productRefs?.length ? style.productRefs : style.kinds[SITE_STYLE].refs);

  const judge = async (visual, master, tries) => {
    const prompt = fitTemplate.replace('{{pageSubject}}', article.title).replace('{{section}}', visual.section || '(none)').replace('{{alt}}', visual.content);
    const lastMessage = resolve(root, dir, `${visual.id}.fit-${tries}.reply.txt`);
    const result = await run({ root, prompt, images: [master], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: `geo-article fit ${visual.id}` });
    return result.code === 0 ? fitLabel(await readText(lastMessage, '')) : null;
  };

  const makeOne = async (visual) => {
    const key = keyOf(visual);
    const master = `${dir}/${visual.id}.png`;
    const masterPath = resolve(root, master);
    const photo = visual.type === 'photo';
    // A photo with no setting of its own is a product photo of the site; in the writer's setting, the site's general
    // rendering (the product photos' describes their sand and stone).
    const profile = (photo && !visual.setting ? style.kinds.product : style.kinds[SITE_STYLE])?.profile ?? style.kinds[SITE_STYLE].profile;
    // The article's other pictures, so this one is made unlike them, and checked against those already made.
    const others = wanted.filter((other) => other.id !== visual.id);
    let fit = null;
    let alike = null;
    let dhash = null;
    let tries = 0;
    for (; tries < FIT_TRIES && (fit !== 'fits' || alike); tries += 1) {
      await rm(masterPath, { force: true });
      const prompt = articleVisualPrompt(visual, { master, profile, briefs, article: article.title, size: SIZE, others });
      const result = await run({ root, prompt, images: [], lastMessage: resolve(root, dir, `${visual.id}.reply.json`), image: true });
      if (result.code !== 0 || !existsSync(masterPath)) return { id: visual.id, error: `codex exit ${result.code}: ${result.stderr.trim().slice(-300)}` };
      fit = await judge(visual, masterPath, tries);
      dhash = differenceHash(await sharp(masterPath).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer());
      alike = others.map((other) => made[other.id]).find((other) => other?.dhash && other.key === keyOf(wanted.find((item) => item.id === other.id) ?? {}) && hamming(dhash, other.dhash) <= LOOK_ALIKE_BITS)?.id ?? null;
    }
    // A photo is finished toward the site's photos (lib/photo-finish.mjs); an illustration is published as made.
    const published = photo ? await finishPhoto(sharp, masterPath, resolve(root, dir, `${visual.id}.finished.png`), { toward, seed: `${slug}-${visual.id}` }) : masterPath;
    const web = await writeResponsiveWebp(sharp, published, { root, dir: `media/blog/${slug}`, name: visual.id });
    const widest = web.srcset.split(', ').map((item) => item.split(' ')).at(-1);
    const wideMeta = await sharp(resolve(root, 'public', widest[0].slice(1))).metadata();
    made[visual.id] = {
      type: visual.type, title: visual.title, key, master, sha256: sha(await readFile(masterPath)),
      web, wide: { src: widest[0], width: wideMeta.width, height: wideMeta.height },
      fit: fit ?? 'unjudged', tries, dhash, ...(alike ? { lookAlike: alike } : {}),
      standIn: REAL_PHOTO.test(visual.produce ?? ''),
      origin: { tool: 'codex image_gen', digitalSourceType: 'trainedAlgorithmicMedia' },
      generatedAt: new Date().toISOString(),
    };
    return { id: visual.id };
  };

  // The visuals to make: placed, of a kind that is an image, not made from what the writer says now (or asked for).
  const wanted = placed.map((item) => byId.get(item.id)).filter((visual) => MADE.has(visual.type));
  const queue = wanted.filter((visual) => (only ? only.includes(visual.id) : true) && (made[visual.id]?.key !== keyOf(visual) || !existsSync(resolve(root, made[visual.id].master))));
  const failures = [];
  const workers = Array.from({ length: Math.max(1, imageHomes(root).length) }, async () => {
    for (let visual = queue.shift(); visual; visual = queue.shift()) {
      console.log(`making ${visual.id} (${visual.type}) ...`);
      const result = await makeOne(visual);
      if (result.error) failures.push(result);
      console.log(`${visual.id}: ${result.error ?? made[visual.id].fit}`);
    }
  });
  await Promise.all(workers);

  // A new slug (the frontmatter names one) moves the article: its visuals are published again under the new slug from
  // their masters, and the earlier page in review and its files go.
  const moved = record?.slug && record.slug !== slug ? record.slug : null;
  for (const [id, item] of Object.entries(made)) {
    if (item.web.src.startsWith(`/media/blog/${slug}/`)) continue;
    const finished = resolve(root, dir, `${id}.finished.png`);
    const web = await writeResponsiveWebp(sharp, item.type === 'photo' && existsSync(finished) ? finished : resolve(root, item.master), { root, dir: `media/blog/${slug}`, name: id });
    const widest = web.srcset.split(', ').at(-1).split(' ')[0];
    const wideMeta = await sharp(resolve(root, 'public', widest.slice(1))).metadata();
    Object.assign(item, { web, wide: { src: widest, width: wideMeta.width, height: wideMeta.height } });
  }
  if (moved) await rm(resolve(root, 'public/media/blog', moved), { recursive: true, force: true });

  // Only visuals made from what the writer says now go on the page.
  const current = Object.fromEntries(wanted.filter((visual) => made[visual.id]?.key === keyOf(visual)).map((visual) => [visual.id, { ...made[visual.id].web, wide: made[visual.id].wide }]));
  const postsPath = resolve(root, 'src/data/blog-posts.json');
  const posts = await readJson(postsPath, []);
  const previous = posts.find((post) => post.slug === slug) ?? null;
  const { post, missing, seoMissing } = articlePost(article, { visuals, images: current, previous: previous ?? (record?.datePublished ? { slug, datePublished: record.datePublished } : null) });
  post.slug = slug;
  // The GEO module counts the site's posts by this mark and matches them to its runs (geo site).
  post.geo = { run: source.replace(/\\/g, '/'), keyword: article.fields.keyword || null };
  const isPublished = previous?.status === 'published';
  if (!isPublished) await writeJson(postsPath, [...posts.filter((item) => item.slug !== slug && !(item.slug === moved && item.status === 'review')), post]);
  if (moved) await rm(resolve(root, 'content/blog-queue/drafts', `${moved}.json`), { force: true });
  await mkdir(resolve(root, 'content/blog-queue/drafts'), { recursive: true });
  await writeJson(resolve(root, 'content/blog-queue/drafts', `${slug}.json`), { ...post, source: { tool: 'geo-blog-research', run: source } });

  // The blog checks, as blog:publish runs them (with a review stand-in: the review is what a person adds).
  const facts = await companyFacts(root);
  const pages = (await loadSitePages(root)).filter((page) => page.status !== 'placeholder');
  const { failures: checks, warnings } = blogGates({ ...post, status: 'published', review: { by: '(review pending)', at: post.dateModified } }, { facts, pages, today: new Date(Date.now() + 1000) });
  // A stand-in is what the writer asks the company for now (06-visuals produce), whenever the visual was made.
  for (const [id, item] of Object.entries(made)) item.standIn = REAL_PHOTO.test(byId.get(id)?.produce ?? '');
  const standIns = Object.entries(made).filter(([id, item]) => item.standIn && current[id]).map(([id, item]) => ({ id, title: item.title, src: item.web.src, replace: 'real photo from the company' }));
  const misfits = Object.entries(made).filter(([id, item]) => current[id] && (item.fit !== 'fits' || item.lookAlike)).map(([id, item]) => ({ id, fit: item.fit, ...(item.lookAlike ? { lookAlike: item.lookAlike } : {}) }));
  const report = { schemaVersion: GEO_ARTICLE_SCHEMA, run: source, slug, route: `/blog/${slug}/`, datePublished: post.datePublished, importedAt: new Date().toISOString(), published: isPublished, missing, seoMissing, pictures: pictureDensity(article, visuals, pictureTarget((await readJson(resolve(root, 'src/data/article-rhythm.json'), null))?.wordsPerPicture)), failures, misfits, standIns, checks: { failures: checks, warnings }, visuals: made };
  await writeJson(recordPath, report);
  return report;
}

runMain(import.meta.url, async () => {
  const { values, positionals } = cliArgs({ visuals: { type: 'string' } });
  if (!positionals[0]) return usage('Usage: node scripts/import-geo-article.mjs <runs/slug> [--visuals V1,V2]');
  const report = await importGeoArticle({ runDir: positionals[0], only: listOption(values.visuals) });
  console.log(`${report.route}: ${report.published ? 'a published post of this slug exists: the draft package was updated, the page was not' : 'built for review (noindex)'}`);
  if (report.missing.length) console.log(`visuals not made yet (left out of the page): ${report.missing.join(', ')}`);
  if (report.seoMissing.length) console.log(`frontmatter without ${report.seoMissing.join(', ')}: the H1 and the opening stand in`);
  const { pictures } = report;
  if (!pictures.enough) console.log(`too few pictures in the text: ${pictures.pictures} for ${pictures.words} words (aim for one every ${pictures.target}); sections wanting one: ${pictures.sectionsShort.map((section) => `"${section.heading}" (${section.words} words, ${section.pictures} of ${section.wants})`).join('; ') || 'none'}`);
  for (const item of report.standIns) console.log(`stand-in, replace with a real photo: ${item.id} ${item.title} (${item.src})`);
  for (const item of report.misfits) console.log(`visual to look at: ${item.id} (${item.fit}${item.lookAlike ? `, looks like ${item.lookAlike}` : ''})`);
  for (const warning of report.checks.warnings) console.log(`warning: ${warning}`);
  console.log(`blog checks: ${report.checks.failures.length} failure(s), ${report.checks.warnings.length} warning(s) (docs/research/geo-articles/${basename(resolve(positionals[0]))}/record.json)`);
  for (const failure of report.failures) console.log(`failed: ${failure.id}: ${failure.error}`);
  if (report.failures.length) process.exitCode = 1;
});
