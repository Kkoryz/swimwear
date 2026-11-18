#!/usr/bin/env node

// Generates the planned photographs with Codex's built-in image tool, one Codex run per image (in the owner's and
// the judge homes in turn, lib/codex-exec.mjs; --concurrency defaults to one at once per home), prompted from the reference site's photos, written profile, shot list and product language
// (docs/research/image-style.json; lib/image-prompt.mjs), or, for a photo given one of the reference's kinds of image
// (docs/research/image-types.json), from that kind's recipe and reference photos. A photo of a model the image model
// refuses takes a cover-up, then the reference's next shots, then shows the product alone. Each result: rejected when it
// is a near-copy of a reference photo or a near-duplicate of another library photo (both retried on the next run);
// checked against the references' measured style range (outside it: review "style-drift"); otherwise finished
// (lib/photo-finish.mjs) and saved as responsive WebP without metadata; that it is AI-generated (IPTC digital source type), its hash, alt and status
// are recorded in the image register, docs/research/image-plan.json. Resumable: only entries not yet generated are run.
// A run makes again at most MAX_BATCH photos the plan already made unless --max says more: a larger queue (a plan gone
// wrong) waits for a person (exit 2) with the list, docs/research/images/remake-hold.md: each photo, what it shows and
// why it is to be made again; new photos and review send-backs are not capped.
// One photo of each class comes first (lib/photo-samples.mjs; owner 2026-11-17): --samples makes those alone, and the
// rest waits (exit 2) until the image-fit judge has passed every class's sample (judge-image-fit.mjs --samples).
// A photo the text check held (check-photo-text.mjs, status held-text) is not made.
// Usage: node scripts/generate-images.mjs [--samples] [--limit 10] [--concurrency 3] [--only id,id] [--max 40]

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cliArgs, listOption, runMain } from './lib/cli.mjs';
import { imageHomes, runCodex, usageLimit } from './lib/codex-exec.mjs';
import { differenceHash, hamming } from './lib/image-hash.mjs';
import { forChildren, mentionsAny, rotateVariety } from './lib/image-plan.mjs';
import { imagePrompt, intentPrompt, scenePrompt, typedPrompt } from './lib/image-prompt.mjs';
import { imageStats, inTurn, pickShot, plainAt, SHOT_JUMP, SITE_STYLE, styleCheck, styleFor, takeTurn } from './lib/image-style.mjs';
import { typeOf } from './lib/image-types.mjs';
import { finishPhoto, finishTarget } from './lib/photo-finish.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { altProblems } from './lib/alt-text.mjs';
import { PERSON_KINDS } from './lib/rules.mjs';
import { LIBRARY_PATH } from './lib/release-guard.mjs';
import { writeResponsiveWebp } from './lib/web-image.mjs';
import { imageBriefs } from './lib/trade.mjs';
import { SAMPLES_PATH, SampleHold, UNSAMPLED_CLASSES, classOf, openClasses, recordSamples, samplesMarkdown, samplesToMake } from './lib/photo-samples.mjs';

export { SampleHold };

// The trade's prompt wording (config/image-briefs*.json via lib/trade.mjs: prompts, productionSceneWords).
// Hamming distances (of 64) at or below which a result counts as a near-copy of a reference photo, or as a
// near-duplicate of a photo already in the library (same framing and layout with another product).
const NEAR_COPY_BITS = 10;
const DUPLICATE_BITS = 14;
// Times one --samples run makes a class's sample when this run's own checks send it back (a look-alike, a near-copy, a
// failed call): the first try and two more, each with the next look (site11 2026-11-17).
export const SAMPLE_TRIES = 3;
export const MAX_BATCH = 12;

// More photos already made queued again than a run makes at once: the run waits for a person (site-run's images step).
export class RemakeHold extends Error {}

// The photos a run would make again, for the person to decide (Fable's plan 3.2): each with what it shows and why it is
// queued again (the plan keeps a made photo while its brief is the same, so its brief changed, or a person set it back).
async function writeRemakeHold(root, again, max) {
  const photos = again.map((entry) => ({ id: entry.id, kind: entry.kind ?? null, category: entry.category ?? null, subject: entry.subject ?? entry.topic ?? null, routes: entry.routes ?? (entry.route ? [entry.route] : []), why: entry.replanned ?? 'its brief changed since its photo was made (image-plan.json keeps a made photo while its brief is the same), or it was set back to planned' }));
  const folder = resolve(root, 'docs/research/images');
  await mkdir(folder, { recursive: true });
  await writeJson(resolve(folder, 'remake-hold.json'), { madeAt: new Date().toISOString(), max, photos });
  const lines = [
    '# 出图暂停：要重做的已有照片超过单次上限',
    '',
    `这一轮要重做 ${photos.length} 张已经做过的照片，单次上限 ${max} 张。新照片和图库评审退回的照片不受这个上限限制。`,
    '',
    `放行：确认下面每张都该重做后，运行 \`node scripts/generate-images.mjs --max ${photos.length}\`，再运行 site:run。不该重做的，先查 docs/research/image-plan.json 为什么重新排进来。`,
    '',
    '| 照片 | 类别 | 分类 | 内容 | 页面 | 为什么重做 |',
    '|---|---|---|---|---|---|',
    ...photos.map((photo) => `| ${photo.id} | ${photo.kind ?? '—'} | ${photo.category ?? '—'} | ${photo.subject ?? '—'} | ${photo.routes.join(', ') || '—'} | ${photo.why} |`),
    '',
  ];
  await writeFile(resolve(folder, 'remake-hold.md'), lines.join('\n'));
}
// Refusals of a photo of a model before it shows the product alone: with a cover-up, then cut more conservatively.
const SHOT_RETRIES = 2;
// Reference photos of its kind attached to a photo made as one of the reference's kinds of image.
const TYPE_REFS = 2;
// Our poses for a class (analyze:image-style ideas): its own and the whole site's together, as a class read from a
// few photos alone gives few.
// A category the image model will not show on a model: two of its photos were refused at every try and none was made
// with a model, so the rest show the product on its own at once (site10's bikinis: 18 refusals for one page, owner
// 2026-10-28).
export const REFUSED_CATEGORY = 2;
const refusedCategory = (plan, entry) => {
  // A hero and its phone twin are one photo here: two refused heroes are not a refused category.
  const others = plan.entries.filter((other) => other !== entry && !other.phoneOf && other.category === entry.category && other.status === 'generated');
  return !others.some((other) => other.shot && !other.productOnly) && others.filter((other) => other.productOnly && (other.refusals?.length ?? 0) > SHOT_RETRIES).length >= REFUSED_CATEGORY;
};
const ourPoses = (ideas, kind) => [...(ideas?.poses?.[kind] ?? []), ...(kind === SITE_STYLE ? [] : ideas?.poses?.[SITE_STYLE] ?? [])];
const TO_RUN = new Set(['planned', 'failed', 'rejected-near-copy', 'rejected-duplicate', 'rejected-review']);
const IN_LIBRARY = new Set(['generated', 'approved']);


// The reference photos a photo's look is held to: its class's, except a photo a section asked for in a setting of its
// own, held to the reference's photos of that kind of place: a production setting to its process photos, any other to
// the whole site's (owner 2026-10-30: a sewing floor is not a beach terrace, so the product photos' range drifted it).
export const styleKind = (entry, briefs) => (entry.intent?.setting ? (mentionsAny(briefs.productionSceneWords ?? [], entry.intent.setting) ? 'process' : SITE_STYLE) : entry.kind);

// Difference hash of the image, or of its mirror image (a flipped copy of a reference is still a copy).
async function hashImage(sharp, path, mirrored = false) {
  const pixels = await (mirrored ? sharp(path).flop() : sharp(path)).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  return differenceHash(pixels);
}

// run: the Codex call (a stand-in in tests).
// samples: make only one photo of each class whose sample has not passed (lib/photo-samples.mjs); requireSamples: make
// nothing while a class of the queue has no passed sample (SampleHold), the command line's default.
export async function generateImages({ root = process.cwd(), limit = Infinity, concurrency = imageHomes(root).length, only = null, max = MAX_BATCH, samples = false, requireSamples = false, run: codex = runCodex } = {}) {
  const { default: sharp } = await import('sharp');
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const briefs = await imageBriefs(root);
  const style = await readJson(resolve(root, 'docs/research/image-style.json'), null);
  if (!style?.kinds?.[SITE_STYLE]) throw new Error('docs/research/image-style.json is missing: run analyze:image-style first');
  // The reference's kinds of image and each photo's (analyze:image-types); without them every photo is made from its
  // class's profile.
  const imageTypes = await readJson(resolve(root, 'docs/research/image-types.json'), null);
  const toward = await finishTarget(sharp, style.productRefs?.length ? style.productRefs : style.kinds[SITE_STYLE].refs);
  // A photo of the making is finished toward the reference's photos of the making (muted workshop colour), not its
  // product photos (owner 2026-10-30: sewing-floor photos came out brighter than the competitor's).
  const towardMaking = style.kinds.process?.refs?.length ? await finishTarget(sharp, style.kinds.process.refs) : toward;
  const finishFor = (entry) => (styleKind(entry, briefs) === 'process' ? towardMaking : toward);
  await mkdir(resolve(root, 'docs/research/images/masters'), { recursive: true });
  await mkdir(resolve(root, 'public', LIBRARY_PATH), { recursive: true });
  // Every reference photo is a near-copy candidate, not only the entry's own style references: the images the kinds were
  // read from too (charts and boards among them).
  const referenceHashes = [];
  for (const path of new Set([...style.kinds[SITE_STYLE].refs, ...(imageTypes?.refs ?? [])])) referenceHashes.push({ path, hash: await hashImage(sharp, path) });
  // A photo recorded made whose master is gone (a run stopped while it was being made again: aloha 2026-11-17, three
  // photos) is made again: nothing can render, review or crop it.
  const gone = plan.entries.filter((entry) => entry.status === 'generated' && entry.master && !existsSync(resolve(root, entry.master)));
  for (const entry of gone) { entry.status = 'planned'; delete entry.master; }
  if (gone.length) await writeJson(planPath, plan);
  // A service site's generic scene is never made (lib/photo-class.mjs): one sent back by the library review after the
  // plan was made keeps its old scene subject until plan-images plans it again as the online-service class, which the
  // images step does before it makes the send-backs (site-run.mjs; site14 2026-11-17: five such scenes were queued as
  // they were, and held the library for a scene sample).
  const unmade = plan.entries.filter((entry) => TO_RUN.has(entry.status) && UNSAMPLED_CLASSES.includes(classOf(entry, briefs)));
  for (const entry of unmade) console.log(`not made ${entry.id}: a generic scene on a service site, to be planned again (plan-images.mjs)`);
  const wanted = plan.entries.filter((entry) => TO_RUN.has(entry.status) && !unmade.includes(entry) && (!only || only.includes(entry.id))).slice(0, limit);
  // The cap is on photos the plan made again (planned, a master already on disk): a new site's first library is made in
  // one go, and photos the library review sent back (rejected-*) are its own decision, retried whatever their number.
  // A photo sent back is planned again with the scenes it tried (lib/image-plan.mjs triedScenes): not capped either.
  const again = wanted.filter((entry) => entry.status === 'planned' && !entry.triedScenes?.length && existsSync(resolve(root, `docs/research/images/masters/${entry.id}.png`)));
  if (again.length > max) {
    await writeRemakeHold(root, again, max);
    throw new RemakeHold(`${again.length} photos already made are queued again, more than ${max} at once: look at docs/research/images/remake-hold.md first (why so many?), then run again with --max ${again.length} or --limit`);
  }
  // One photo of each class first (lib/photo-samples.mjs; owner 2026-11-17): --samples makes those alone; the library is
  // made once every class of its queue has a sample the image-fit judge passed.
  const samplesPath = resolve(root, SAMPLES_PATH);
  const sampled = await readJson(samplesPath, null);
  if (!samples && requireSamples) {
    const open = openClasses(plan, wanted, sampled, briefs);
    if (open.length) {
      await mkdir(resolve(root, 'docs/research/images'), { recursive: true });
      await writeFile(resolve(root, 'docs/research/images/samples.md'), samplesMarkdown(sampled, open));
      throw new SampleHold(`no passed sample for ${open.join(', ')}: ${wanted.length} photos wait (docs/research/images/samples.md); run generate-images --samples and judge-image-fit --samples first`);
    }
  }
  const queue = samples ? samplesToMake(plan, wanted, sampled, briefs) : wanted;
  const picked = [...queue];
  let saving = Promise.resolve();
  const save = () => { saving = saving.then(() => writeJson(planPath, plan)); return saving; };

  const generateOne = async (entry) => {
    const master = `docs/research/images/masters/${entry.id}.png`;
    const lastMessage = resolve(root, `docs/research/images/masters/${entry.id}.reply.json`);
    const classStyle = styleFor(style, styleKind(entry, briefs));
    // A photo sent back as a look-alike (hash or library review) is regenerated with the next visible attributes.
    if (['rejected-duplicate', 'rejected-review'].includes(entry.status)) Object.assign(entry, rotateVariety(entry, plan.variety));
    const masterPath = resolve(root, master);
    // A photo made again starts from no file: an earlier master left in place was edited instead of replaced (site10's
    // bikini-product-1 came back as the old plain bikini under an alt describing a floral one) and, on a failed run,
    // would pass for the new photo. Its earlier reply goes too, so a stale alt is never read.
    await rm(masterPath, { force: true });
    await rm(lastMessage, { force: true });
    await rm(resolve(root, `docs/research/images/masters/${entry.id}.finished.png`), { force: true });
    // A photo of a model takes its framing and pose from the reference's shot list, in proportion; a product on its own,
    // one of the reference's plain settings (analyze:image-style). The phone twin of a hero takes its hero's turn
    // shifted, so the pair are not one picture twice.
    const shotKind = style.kinds[entry.kind]?.shots ? entry.kind : SITE_STYLE;
    const framings = style.kinds[shotKind].shots?.framings;
    const poses = ourPoses(style.ideas, shotKind);
    const shots = framings && poses.length ? { framings, poses } : style.kinds[shotKind].shots;
    const settings = inTurn(style.ideas?.settings ?? style.productSettings ?? []);
    const places = inTurn(style.ideas?.scenes ?? style.scenes ?? []);
    const prints = inTurn((forChildren(entry.category, briefs) ? style.ideas?.childPrints : style.ideas?.prints) ?? []);
    const details = inTurn(style.ideas?.details ?? []);
    const props = style.props?.list ?? [];
    // An entry's turn in the whole library (plan order): consecutive photos take consecutive shots, places, prints and
    // settings, so a page's photos differ, and so do the pages: a turn counted within a page and class gave every
    // page's hero of site10 one stone terrace, one seated pose and one print. A phone twin takes its hero's turn shifted.
    const libraryTurn = plan.entries.findIndex((other) => other.id === (entry.phoneOf ?? entry.id));
    const turn = libraryTurn + (entry.phoneOf ? 1 : 0);
    // A product's print and detail stay when the photo is made again (refused, a look-alike): only its shot moves.
    const offset = turn;
    // A model no longer in the config's casting is not used (owner 2026-10-29: Black, white and Hispanic models only),
    // and a photo planned without a person that may now show one gets a model too: the photo takes one of the list in
    // its turn (a hero and its phone twin one model).
    if (PERSON_KINDS.includes(entry.kind) && entry.kind !== 'portrait' && briefs.casting?.length && !briefs.casting.includes(entry.casting)) entry.casting = takeTurn(briefs.casting, libraryTurn, 5);
    // A photo of the making shows one of the trade's few workers, in turn, the next one when it is made again as a
    // look-alike (briefs.workerCasting; owner 2026-11-18: site13's factory photos were one woman a dozen times).
    entry.worker = briefs.workerCasting?.length ? takeTurn(briefs.workerCasting, libraryTurn + (entry.workerShift ?? 0), 1) : undefined;
    // The garments the page's photos show (analyze:image-types), named with the category in the prompt.
    entry.products = imageTypes?.products?.by?.[entry.category];
    // A print only on what the products reading says can carry one (analyze:image-types printed), and on the share of
    // the photos the reference prints (analyze:image-style plain): the rest are plain, in their colour alone.
    entry.print = imageTypes?.products?.printed?.[entry.category] === false || plainAt(libraryTurn, style.plain?.share) ? undefined : takeTurn(prints, offset, 5);
    entry.detail = takeTurn(details, offset, 7);
    // A cover-up is a photo's own answer to its refusal, not its category's: carried to every photo of site10's men's
    // page it dressed all eight in one open shirt and saved no refusal.
    delete entry.coverUp;
    delete entry.modestCut;
    if (PERSON_KINDS.includes(entry.kind) && entry.kind !== 'portrait' && refusedCategory(plan, entry)) entry.productOnly = true;
    // What nobody wears (a service page's packaging or hardware) is shown on its own when no kind of the reference fits.
    if (imageTypes?.products?.worn?.[entry.category] === false && !typeOf(imageTypes, entry)) entry.productOnly = true;
    const withModel = PERSON_KINDS.includes(entry.kind) && entry.kind !== 'portrait';
    // A photo a section asked for (Site Factory's visual, entry.intent) is made from that ask (intentPrompt), in its
    // setting's light, unlike the page's other asked-for photos; a model of the casting only where it is worn.
    const others = entry.intent ? plan.entries.filter((other) => other.id !== entry.id && other.intent?.route === entry.intent.route).map((other) => ({ title: other.intent.caption ?? other.intent.content, setting: other.intent.setting })) : [];
    if (entry.intent && !entry.casting && briefs.casting?.length && /\b(wears?|wearer|wearing|worn|model|swimmer)\b/i.test(`${entry.intent.content} ${entry.intent.setting ?? ''}`)) entry.casting = takeTurn(briefs.casting, libraryTurn, 5);
    // A trade whose photos are scenes of its work (briefs.photos "scenes": a service business) has no product, model or
    // shot: each photo is its subject (or its section's ask) as a scene, in its class's light (scenePrompt).
    const scenes = briefs.photos === 'scenes';
    let prompt;
    let run;
    for (let refusals = 0; ; refusals += 1) {
      // The reference's kind of image for this photo; a product shown on its own is made as one.
      const type = entry.productOnly || entry.intent || scenes ? null : typeOf(imageTypes, entry);
      const modelled = entry.intent || scenes ? false : type ? type.shows === 'worn' : withModel && !entry.productOnly;
      entry.imageType = type?.name;
      entry.imageShows = type?.shows;
      entry.shot = modelled && shots ? pickShot(shots, turn + (entry.shotShift ?? 0)) : undefined;
      // Two photos of a model in three have one of our props, taken in turn (owner 2026-10-29: not every photo a bare
      // model); the third is the model alone.
      entry.prop = entry.shot && props.length && libraryTurn % 3 !== 2 ? takeTurn(props, libraryTurn, 7) : undefined;
      // The place stays too, so a refusal does not land the photo in its neighbour's place; a kind on a plain backdrop
      // takes one of the reference's plain settings, as a product on its own does.
      // Our places are where our models are photographed: a photo of the making keeps the reference's kind of place, the
      // production floor its photos of that kind show (site10's factory stand-ins were set on terraces and in sunrooms).
      const placed = type ? type.background === 'place' && type.shows === 'worn' : Boolean(entry.shot);
      // A product its page's theme places (entry.placeWords: watersports by the water; site13 claude-seo audit
      // 2026-11-17, M-13: its watersports and rash guard pages stood in gardens) takes the places that name one.
      const own = entry.placeWords?.length ? places.filter((item) => entry.placeWords.some((word) => new RegExp(`(^|[^a-z])${word}`, 'i').test(item))) : [];
      entry.place = placed ? takeTurn(own.length ? own : places, offset, 3) : undefined;
      entry.backdrop = (entry.productOnly || (type && !placed && type.shows !== 'chart')) && settings.length ? settings[(turn + (entry.shotShift ?? 0)) % settings.length] : undefined;
      // After a refusal the reference photos are no longer attached (a reference of a worn product can trip the input
      // check by itself); the written profile still carries the look. A product on its own is shot on a plain setting,
      // so the reference scenes are not attached to it. A kind attaches two of its own reference photos.
      const images = refusals || entry.productOnly || entry.intent || scenes ? [] : type ? type.refs.slice(0, TYPE_REFS) : entry.styleRefs;
      prompt = entry.intent
        ? intentPrompt(entry, { master, profile: entry.intent.setting ? style.kinds[SITE_STYLE].profile : classStyle.profile, briefs, garments: style.garments ?? null, line: plan.line, others })
        : scenes
        ? scenePrompt(entry, { master, profile: classStyle.profile, briefs, line: plan.line })
        : type
        ? typedPrompt(entry, { type, master, briefs, garments: style.garments ?? null, line: plan.line, attached: images.length })
        : imagePrompt(entry, { master, profile: classStyle.profile, briefs, shot: entry.shot, garments: style.garments ?? null, productOnlySubjects: imageTypes?.products?.worn?.[entry.category] === false && briefs.itemSubjects ? briefs.itemSubjects : plan.productOnlySubjects, line: plan.line, attached: images.length });
      run = await codex({ root, prompt, images, lastMessage, image: true });
      const reply = await readText(lastMessage, '');
      // The image model's safety check refuses some products worn by a person (site10's bikinis: five of six refused three
      // times). Styled with a cover-up first, then cut more conservatively in the next pose (a chart: cut more
      // conservatively); if those are refused too, the product is shown on its own (owner 2026-10-28, 2026-10-29).
      // Kept for later runs.
      const refused = !existsSync(masterPath) && /moderation_blocked|refus|declin|safety|拒绝|安全/i.test(`${run.stderr}\n${reply}`);
      // Each refusal is kept with what was asked, so a wording that trips the safety check can be found.
      if (refused) (entry.refusals ||= []).push({ at: new Date().toISOString(), shot: entry.shot ?? null, productOnly: Boolean(entry.productOnly), reply: `${reply}`.trim().slice(-300) });
      if (refused && entry.shot && !entry.coverUp) { entry.coverUp = true; continue; }
      if (refused && !entry.productOnly && !entry.modestCut && refusals < SHOT_RETRIES) { entry.modestCut = true; if (entry.shot) entry.shotShift = (entry.shotShift ?? 0) + SHOT_JUMP; continue; }
      if (refused && !entry.productOnly) { entry.productOnly = true; continue; }
      break;
    }
    if (run.code !== 0 || !(await stat(masterPath).catch(() => null))) {
      Object.assign(entry, { status: 'failed', error: `codex exit ${run.code}: ${run.stderr.trim().slice(-300)}` });
      // Out of Codex quota, or rate-limited (429): further calls fail the same way for a while, so the run stops (the
      // entries stay queued; site10's 19-photo test marked 18 failed one after another on a 429).
      if (usageLimit(run.stderr)) quotaExhausted = run.stderr.match(/try again at ([^.]+)/i)?.[1] ?? 'later';
      return save();
    }
    let reply = {};
    try { reply = JSON.parse((await readFile(lastMessage, 'utf8')).trim().split('\n').at(-1)); } catch {}
    const hash = await hashImage(sharp, masterPath);
    const closest = (list) => list.map((item) => ({ ...item, distance: hamming(hash, item.hash) })).sort((left, right) => left.distance - right.distance)[0];
    const mirror = await hashImage(sharp, masterPath, true);
    const nearest = referenceHashes.map((ref) => ({ path: ref.path, distance: Math.min(hamming(hash, ref.hash), hamming(mirror, ref.hash)) })).sort((left, right) => left.distance - right.distance)[0];
    const twin = closest(plan.entries.filter((other) => other !== entry && IN_LIBRARY.has(other.status) && other.dhash).map((other) => ({ id: other.id, hash: other.dhash })));
    const bytes = await readFile(masterPath);
    const meta = await sharp(masterPath).metadata();
    Object.assign(entry, {
      master, sha256: createHash('sha256').update(bytes).digest('hex'), dhash: hash, masterSize: `${meta.width}x${meta.height}`,
      similarity: nearest ? { nearestReference: nearest.path, distance: nearest.distance, threshold: NEAR_COPY_BITS } : null,
      nearestInLibrary: twin ? { id: twin.id, distance: twin.distance, threshold: DUPLICATE_BITS } : null,
      styleCheck: styleCheck(await imageStats(sharp, masterPath), classStyle.range),
      origin: { tool: 'codex image_gen', digitalSourceType: 'trainedAlgorithmicMedia' },
      generatedAt: new Date().toISOString(), prompt,
    });
    if (nearest && nearest.distance <= NEAR_COPY_BITS) {
      Object.assign(entry, { status: 'rejected-near-copy' });
      return save();
    }
    // A chart or board shares its kind's layout with the others of its kind (site10's design boards: two columns on
    // white), so it is not held to the library's look-alike check; the reference near-copy check still applies.
    if (twin && twin.distance <= DUPLICATE_BITS && entry.imageShows !== 'chart') {
      Object.assign(entry, { status: 'rejected-duplicate', duplicateOf: twin.id });
      return save();
    }
    // Published finished (lib/photo-finish.mjs); a chart or board as made.
    const chart = !entry.intent && typeOf(imageTypes, entry)?.shows === 'chart' && !entry.productOnly;
    const published = chart ? masterPath : await finishPhoto(sharp, masterPath, resolve(root, `docs/research/images/masters/${entry.id}.finished.png`), { toward: finishFor(entry), seed: entry.id });
    // The range is checked on what is published (the finish moves a photo's colour toward the reference: site10's masters
    // were all paler than its range); a chart is not a photograph and is not held to it.
    entry.styleCheck = chart ? { ...entry.styleCheck, inRange: true, off: [] } : styleCheck(await imageStats(sharp, published), classStyle.range);
    const web = await writeResponsiveWebp(sharp, published, { root, dir: LIBRARY_PATH, name: entry.id });
    const alt = typeof reply.alt === 'string' ? reply.alt.trim() : '';
    // The alt rules (lib/alt-text.mjs), in plain ASCII: otherwise a person reviews the alt with the image.
    const altIssues = [...altProblems(alt), ...(/^[\x20-\x7E]*$/.test(alt) ? [] : ['not_ascii'])];
    Object.assign(entry, {
      status: 'generated',
      review: entry.styleCheck.inRange ? 'pending' : 'style-drift',
      alt,
      altCheck: altIssues.length ? 'needs-review' : 'ok',
      ...(altIssues.length ? { altProblems: altIssues } : {}),
      web,
    });
    delete entry.error;
    delete entry.duplicateOf;
    return save();
  };

  let quotaExhausted = null;
  const work = () => Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length && !quotaExhausted) {
      const entry = queue.shift();
      console.log(`generating ${entry.id} ...`);
      await generateOne(entry);
      console.log(`${entry.id}: ${entry.status}${entry.similarity ? ` (reference distance ${entry.similarity.distance}, library distance ${entry.nearestInLibrary?.distance ?? '-'}, style ${entry.styleCheck.inRange ? 'in range' : entry.styleCheck.off.join('; ')})` : ''}`);
    }
  }));
  await work();
  // A sample this run's own checks send back (a look-alike of a library photo, a near-copy of a reference, a failed
  // call) was never judged against its page: it is made again at once, with the next look, up to SAMPLE_TRIES times,
  // instead of the library waiting for a person with no sample to look at (site11 2026-11-17: its one photo to make,
  // a send-back, was picked as the service sample, came out a look-alike of revenue-management-lifestyle-3, and the
  // run stopped on "no passed sample for service" with samples.json empty).
  for (let attempt = 1; samples && attempt < SAMPLE_TRIES && !quotaExhausted; attempt += 1) {
    const again = picked.filter((entry) => !IN_LIBRARY.has(entry.status) && TO_RUN.has(entry.status));
    if (!again.length) break;
    queue.push(...again);
    await work();
  }
  if (quotaExhausted) console.error(`Codex usage limit reached; stopped. Run again after ${quotaExhausted}.`);
  await saving;
  // The samples made wait for their judgment (judge-image-fit.mjs --samples).
  if (samples && picked.length) {
    // A class whose sample was sent back every time is named with why (samples.md), not left as an empty table.
    const missed = picked.filter((entry) => !IN_LIBRARY.has(entry.status)).map((entry) => ({ id: entry.id, photoClass: classOf(entry, briefs), status: entry.status, ...(entry.duplicateOf ? { duplicateOf: entry.duplicateOf } : {}) }));
    const record = { ...recordSamples(sampled, picked, briefs), ...(missed.length ? { missed } : {}) };
    await writeJson(samplesPath, record);
    await writeFile(resolve(root, 'docs/research/images/samples.md'), samplesMarkdown(record, [...new Set(missed.map((item) => item.photoClass))]));
  }
  return plan;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ limit: { type: 'string' }, concurrency: { type: 'string' }, only: { type: 'string' }, max: { type: 'string' }, samples: { type: 'boolean' } });
  const plan = await generateImages({
    limit: values.limit ? Number(values.limit) : Infinity,
    ...(values.concurrency ? { concurrency: Number(values.concurrency) } : {}),
    only: listOption(values.only),
    ...(values.max ? { max: Number(values.max) } : {}),
    // The samples come first and are judged (site-run's images step: --samples, the judge, then this), and the library
    // is made whatever their verdicts, which samples.md reports (owner 2026-11-18: "不要硬卡这些图了").
    samples: Boolean(values.samples),
    requireSamples: false,
  }).catch((error) => {
    if (!(error instanceof RemakeHold) && !(error instanceof SampleHold)) throw error;
    // Waits for a person (site-run: exit 2).
    console.error(error.message);
    process.exitCode = 2;
    return null;
  });
  if (!plan) return;
  const counts = {};
  for (const entry of plan.entries) counts[entry.status] = (counts[entry.status] || 0) + 1;
  console.log(JSON.stringify(counts));
}, { stack: true });
