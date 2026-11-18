#!/usr/bin/env node

// Plans the stage 09 image library for a workspace: which photographs to generate for which category, with style
// references taken from the reference template's photos. Writes docs/research/image-plan.json (keeps entries already
// generated when their brief is unchanged). Then: analyze:image-style, generate:images, apply:image-library.
// The line names the product in the general photos' subjects, so changing it plans every general photo again: a line
// other than the plan's own is refused unless --change-line says so; without --line the plan's own is kept.
// The trade (site.json trade, lib/trade.mjs) decides what the photos show, so a plan made for another trade keeps none
// of its photos: refused unless --change-trade says so (its photos are then retired, their masters kept on disk).
// Each photo gets its class (lib/photo-class.mjs) and every photo still to be made is checked against its page's text
// (check-photo-text.mjs); a service site's generic scenes made before stay unless --replace-scenes plans them again.
// Usage: node scripts/plan-images.mjs [--line "<the line's product, e.g. activewear>"] [--change-line] [--change-trade] [--replace-scenes]

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { TEXT_WAIVERS, checkPlanText, writeTextCheck } from './check-photo-text.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { libraryGaps, ownPhotoRoutes, photoDemand, planLibrary } from './lib/image-plan.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { styleReferences } from './lib/style-references.mjs';
import { DEFAULT_TRADE, imageBriefs } from './lib/trade.mjs';


// What the image plan is made from, as planImages reads it: the photo demand (lib/image-plan.mjs photoDemand) and the
// style references. site-run hashes it for the images step (plan:photo-slots).
export async function imageDemand(root = process.cwd()) {
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const briefs = await imageBriefs(root);
  const previous = await readJson(resolve(root, 'docs/research/image-plan.json'), null);
  const own = new Set(((await readJson(resolve(root, 'src/data/site-media.json'), null))?.photos ?? []).map((photo) => photo.class));
  const pages = await loadSitePages(root);
  const ownRoutes = ownPhotoRoutes(pages, await readJson(resolve(root, 'docs/research/image-fit.json'), null), briefs, previous);
  const sitePhotos = (await readJson(resolve(root, 'src/data/site-media.json'), null))?.photos ?? [];
  return {
    demand: photoDemand({ pages, components: variants.components, briefs: { ...briefs, placeholderKinds: (briefs.placeholderKinds ?? []).filter((kind) => own.has(kind)) }, ownRoutes, nav: await readJson(resolve(root, 'src/data/site-nav.json'), null), line: previous?.line ?? null }),
    gaps: libraryGaps({ pages, components: variants.components, briefs, sitePhotos }),
    styleRefs: await styleReferences(root, variants.components),
  };
}

export async function planImages({ line = null, changeLine = false, changeTrade = false, replaceScenes = false, root = process.cwd() }) {
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const briefs = await imageBriefs(root);
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const recorded = await readJson(planPath, null);
  const madeFor = recorded?.trade ?? DEFAULT_TRADE;
  if (recorded && madeFor !== briefs.trade && !changeTrade) throw new Error(`the plan was made for trade ${madeFor}, not ${briefs.trade}: a new trade plans every photo again (pass --change-trade to mean it)`);
  const previous = recorded && madeFor !== briefs.trade ? { ...recorded, entries: recorded.entries.map((entry) => ({ ...entry, status: 'retired' })) } : recorded;
  if (!line && !previous?.line) throw new Error('no line: pass --line "<the line\'s product>" (there is no plan whose line to keep)');
  if (line && previous?.line && line !== previous.line && !changeLine) throw new Error(`the plan's line is ${previous.line}, not ${line}: a new line plans every general photo again (pass --change-line to mean it)`);
  line ??= previous.line;
  // A class left to the site's own photos (briefs.placeholderKinds: its factory and process) is made too while the site
  // has none of it: stand-ins the pre-launch handoff lists as 必须实拍替换 (Site Factory's identity no longer brings
  // them, owner 2026-10-25), never an empty frame.
  const own = new Set(((await readJson(resolve(root, 'src/data/site-media.json'), null))?.photos ?? []).map((photo) => photo.class));
  const pages = await loadSitePages(root);
  const sitePhotos = (await readJson(resolve(root, 'src/data/site-media.json'), null))?.photos ?? [];
  // The words the photos' subjects name the line by (site.json lineLabel): the line itself is the plan's key, and a
  // service site's is a code (site12 "hotel-rm", site14 "str-cohost", 2026-11-17: "a printed hotel-rm worksheet",
  // judged off its page); a label changes the wording only, so no photo already made is made again.
  const lineName = (await readJson(resolve(root, 'site.json'), null))?.lineLabel ?? null;
  const plan = planLibrary({
    pages,
    gaps: libraryGaps({ pages, components: variants.components, briefs, sitePhotos }),
    ownRoutes: ownPhotoRoutes(pages, await readJson(resolve(root, 'docs/research/image-fit.json'), null), briefs, previous),
    components: variants.components,
    line,
    lineName,
    briefs: { ...briefs, placeholderKinds: (briefs.placeholderKinds ?? []).filter((kind) => own.has(kind)) },
    styleRefs: await styleReferences(root, variants.components),
    previous,
    // The menu items above each page name its theme (lib/page-theme.mjs) where its category does not.
    nav: await readJson(resolve(root, 'src/data/site-nav.json'), null),
    replaceScenes,
    // The categories nobody wears (analyze-image-types.mjs, read before the second planning of the images step).
    notWorn: Object.entries((await readJson(resolve(root, 'docs/research/image-types.json'), null))?.products?.worn ?? {}).filter(([, worn]) => worn === false).map(([category]) => category),
  });
  // Every photo still to be made checked against its page's H1 and copy before any is made (check-photo-text.mjs;
  // owner 2026-11-17): one that does not match is held out of the queue and reported.
  const textCheck = checkPlanText({ plan, pages, briefs, waivers: await readJson(resolve(root, TEXT_WAIVERS), {}) });
  await writeTextCheck(root, textCheck);
  // A generated image the plan no longer keeps stays on disk (a plan gone wrong must not cost the library): the release
  // build leaves out generated files no page uses (lib/release-guard.mjs); its master stays in docs/research/images.
  await mkdir(dirname(planPath), { recursive: true });
  await writeJson(planPath, plan);
  return { ...plan, textCheck };
}

runMain(import.meta.url, async () => {
  const { line, 'change-line': changeLine, 'change-trade': changeTrade, 'replace-scenes': replaceScenes } = cliArgs({ line: { type: 'string' }, 'change-line': { type: 'boolean' }, 'change-trade': { type: 'boolean' }, 'replace-scenes': { type: 'boolean' } }).values;
  const plan = await planImages({ line: line ?? null, changeLine: Boolean(changeLine), changeTrade: Boolean(changeTrade), replaceScenes: Boolean(replaceScenes) });
  const summary = {};
  for (const entry of plan.entries) (summary[entry.category] ||= {})[entry.kind] = ((summary[entry.category] ||= {})[entry.kind] || 0) + 1;
  const classes = {};
  for (const entry of plan.entries.filter((item) => item.status !== 'retired')) classes[entry.photoClass] = (classes[entry.photoClass] ?? 0) + 1;
  console.log(JSON.stringify({ entries: plan.entries.length, planned: plan.entries.filter((entry) => entry.status === 'planned').length, held: plan.textCheck.held.length, photoClasses: classes, byCategory: summary }, null, 2));
  for (const item of plan.textCheck.held) console.log(`held ${item.id}: ${item.problems.map((problem) => problem.code).join(', ')} (docs/research/images/text-check.md)`);
}, { stack: true });
