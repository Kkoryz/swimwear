#!/usr/bin/env node

// After stage 08: turns one GEO blog article (geo-blog-research runs/<slug>: 06-article.md, 06-visuals.json; read only)
// into a blog post of this site, in the site's own article layout (lib/geo-article.mjs, BlogPostView). Its visuals
// are made the way the site's photos are (Codex's built-in image tool in the owner's and the judge homes in turn; the
// light, colour and rendering of the site's photos, docs/research/image-style.json; lib/image-prompt.mjs
// articleVisualPrompt), checked against what the writer says they show (config/agent-steps/image-fit.md, made again
// once when they do not) and published as responsive WebP under /media/blog/<slug>/. A photo the writer wanted from the
// company is a stand-in, listed for a real photo to replace (standIns). Visuals are made again only when what the
// writer says about them changes, so the article is imported again after every edit (geo apply) at no image cost.
// The article read is the run's final one (06-article.natural.md when the writer naturalized it) with its replacement
// list applied (lib/blog-review.mjs). The post is built unpublished (status review: noindex, out of the sitemap and the
// hub; preflight holds the release) and its AI review runs (owner 2026-11-16: always, no person): passed, its package
// waits in content/blog-queue/approved for the site's publishing day (blog:publish, site.json blogPublish); held, it
// stays in content/blog-queue/drafts with the reasons. A published post of the same slug is never overwritten.
// Usage: node scripts/import-geo-article.mjs <runs/slug> [--visuals V1,V2] [--routes map.json]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogGates } from './lib/blog-gates.mjs';
import { REVIEWER, applyReplacements, articleFiles, rerouteLinks, reviewArticle, reviewPlaceholders } from './lib/blog-review.mjs';
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

// The final check of the 11-16 blog flow (Site Factory's sitefactory.blog.site_run writes pipeline-report.json in the
// run): an article it held (A/B items still unanswered or wrong after its rewrite round, a gate, a conflict with the
// site's facts) is held here too, its reasons named. A run without the report (the earlier flow) has no such check.
export function flowHeld(report) {
  const final = report?.final;
  if (!final || final.passed) return [];
  const gates = Object.entries(final.gates ?? {}).filter(([, found]) => (Array.isArray(found) ? found.length : Object.keys(found ?? {}).length)).map(([name]) => name);
  const conflicts = [...Object.keys(final.conflicts?.against_site ?? {}), ...(final.conflicts?.internal ?? []).flat()];
  return [`blog flow final check: held${final.held?.length ? `; A/B not right: ${final.held.join(', ')}` : ''}${gates.length ? `; gates: ${gates.join(', ')}` : ''}${conflicts.length ? `; conflicts: ${conflicts.join(', ')}` : ''}`];
}

// The final check that stands for the article as it is now: the newest hand-fix recheck in the run (handfix_*.json:
// passed, conflicts, the gates, items), when it was made of this article - its article_sha256 the article's, or, without
// one, written no earlier than the article (owner: a hand fix after every step, rechecked; 2026-11-18, RateHarbor's
// recheck passed while the import still read the flow's held final) - else pipeline-report.json's final. Returns
// { by: the file it came from, or null; final: in pipeline-report's shape }.
const GATES = ['figures', 'sources', 'competitors', 'replacements', 'links'];
export async function flowFinal(source, articlePath) {
  const articleText = await readFile(articlePath);
  const articleTime = (await stat(articlePath)).mtimeMs;
  const articleSha = sha(articleText);
  const checks = [];
  for (const name of (await readdir(source)).filter((file) => /^handfix_.*\.json$/.test(file))) {
    const path = resolve(source, name);
    const check = await readJson(path, null);
    if (!check || typeof check.passed !== 'boolean') continue;
    const time = (await stat(path)).mtimeMs;
    const ofThis = check.article_sha256 ? check.article_sha256 === articleSha : time >= articleTime;
    if (ofThis) checks.push({ name, time, check });
  }
  const newest = checks.sort((a, b) => b.time - a.time)[0];
  if (newest) {
    const { check } = newest;
    const items = Object.entries(check.items ?? {}).filter(([, item]) => (item?.result ?? item) !== 'right').map(([id]) => id);
    return { by: newest.name, final: { passed: check.passed, held: items, gates: Object.fromEntries(GATES.filter((key) => key in check).map((key) => [key, check[key]])), conflicts: check.conflicts ?? {} } };
  }
  const report = await readJson(resolve(source, 'pipeline-report.json'), null);
  return { by: report?.final ? 'pipeline-report.json' : null, final: report?.final ?? null };
}

// routes: links the writer placed for routes this site names otherwise, { "/writer/route/": "/site/route/" }.
export async function importGeoArticle({ root = process.cwd(), runDir, only = null, run = runJudge, routes = {}, now = new Date() } = {}) {
  const source = resolve(runDir);
  const runName = basename(source);
  // The run's final article (naturalized when the writer made one) with its replacement list applied: what the owner
  // filled replaces the writer's text, our claims still stand-ins stay and are pending (lib/blog-review.mjs).
  const files = articleFiles(source, existsSync);
  if (!files.article) throw new Error(`${source} has no 06-article.md`);
  const replaced = applyReplacements(await readFile(files.article, 'utf8'), files.replacements ? (await readJson(files.replacements)).replacements ?? [] : []);
  const article = parseArticle(rerouteLinks(replaced.markdown, routes));
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
  const queuePath = (folder, name) => resolve(root, 'content/blog-queue', folder, `${name}.json`);
  if (moved) for (const folder of ['drafts', 'approved']) await rm(queuePath(folder, moved), { force: true });

  // The blog checks, as blog:publish runs them (the review is the AI review's, below; the placeholders are its own).
  const facts = await companyFacts(root);
  const pages = (await loadSitePages(root)).filter((page) => page.status !== 'placeholder');
  const { failures: checks, warnings } = blogGates({ ...post, status: 'published', review: { by: REVIEWER, at: post.dateModified } }, { facts, pages, today: new Date(Date.now() + 1000) });
  // A stand-in is what the writer asks the company for now (06-visuals produce), whenever the visual was made.
  for (const [id, item] of Object.entries(made)) item.standIn = REAL_PHOTO.test(byId.get(id)?.produce ?? '');
  const standIns = Object.entries(made).filter(([id, item]) => item.standIn && current[id]).map(([id, item]) => ({ id, title: item.title, src: item.web.src, replace: 'real photo from the company' }));
  const misfits = Object.entries(made).filter(([id, item]) => current[id] && (item.fit !== 'fits' || item.lookAlike)).map(([id, item]) => ({ id, fit: item.fit, ...(item.lookAlike ? { lookAlike: item.lookAlike } : {}) }));

  // The AI review (lib/blog-review.mjs): our claims still stand-ins, links the site cannot open, the judge's verdict on
  // every picture shown, and an article broken on its way in (frontmatter, picture files). With the publish checks it
  // decides the queue: passed, the package waits in approved for its publishing day; else it stays in drafts, the
  // reasons with it.
  const pictures = wanted.filter((visual) => current[visual.id]).map((visual) => ({ id: visual.id, fit: made[visual.id].fit, ...(made[visual.id].lookAlike ? { lookAlike: made[visual.id].lookAlike } : {}) }));
  const absent = Object.values(current).flatMap((web) => [web.src, web.wide?.src]).filter(Boolean).filter((src) => !existsSync(resolve(root, 'public', src.slice(1))));
  // The final check of the blog flow, or the hand fix's recheck made after it (flowFinal), named in the report.
  const finalCheck = await flowFinal(source, files.article);
  const reviewFailures = [
    ...reviewArticle({ post, pages, pending: replaced.pending, pictures, missing, seoMissing: [...seoMissing, ...(article.fields.slug ? [] : ['slug'])], broken: [...replaced.broken, ...absent.map((src) => `the picture file ${src} is missing`)] }),
    ...checks.filter((item) => !item.startsWith('link to a page that does not exist')).map((item) => `publish check: ${item}`),
    ...flowHeld({ final: finalCheck.final }),
  ];
  const review = { by: REVIEWER, at: now.toISOString(), passed: !reviewFailures.length, failures: reviewFailures, placeholders: reviewPlaceholders(replaced.pending) };
  const pack = { ...post, placeholders: replaced.pending, source: { tool: 'geo-blog-research', run: source, article: files.article, replacements: files.replacements } };
  for (const folder of ['drafts', 'approved']) await mkdir(resolve(root, 'content/blog-queue', folder), { recursive: true });
  if (review.passed) {
    await writeJson(queuePath('approved', slug), { ...pack, review: { by: REVIEWER, at: review.at } });
    await rm(queuePath('drafts', slug), { force: true });
  } else {
    await writeJson(queuePath('drafts', slug), { ...pack, aiReview: review });
    await rm(queuePath('approved', slug), { force: true });
  }
  const report = { schemaVersion: GEO_ARTICLE_SCHEMA, run: source, files, finalCheck: finalCheck.by, slug, route: `/blog/${slug}/`, datePublished: post.datePublished, importedAt: new Date().toISOString(), published: isPublished, review, missing, seoMissing, pictures: pictureDensity(article, visuals, pictureTarget((await readJson(resolve(root, 'src/data/article-rhythm.json'), null))?.wordsPerPicture)), failures, misfits, standIns, checks: { failures: checks, warnings }, visuals: made };
  await writeJson(recordPath, report);
  return report;
}

runMain(import.meta.url, async () => {
  const { values, positionals } = cliArgs({ visuals: { type: 'string' }, routes: { type: 'string' } });
  if (!positionals[0]) return usage('Usage: node scripts/import-geo-article.mjs <runs/slug> [--visuals V1,V2] [--routes map.json]');
  const routes = values.routes ? await readJson(resolve(values.routes)) : {};
  const report = await importGeoArticle({ runDir: positionals[0], only: listOption(values.visuals), routes });
  console.log(`${report.route}: ${report.published ? 'a published post of this slug exists: the package was updated, the page was not' : 'built (noindex until it is published)'}; read ${report.files.article}`);
  console.log(report.review.passed ? 'AI review passed: queued in content/blog-queue/approved for its publishing day' : `AI review held it in content/blog-queue/drafts:\n${report.review.failures.map((item) => `  - ${item}`).join('\n')}`);
  if (report.finalCheck) console.log(`final check read from ${report.finalCheck}`);
  if (report.review.placeholders.length) console.log(`${report.review.placeholders.length} placeholder(s) of our own claims kept for their real values (reported, not held)`);
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
