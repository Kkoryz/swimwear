// The reference site's photographic style, in two forms: a written profile per photography class (Codex looks at
// the reference photos and describes what they share) that goes into every generation prompt, and measured ranges
// (colourfulness, brightness, contrast) that each generated photo is checked against. Without these the image model
// falls back to its own default look, which is style drift even when every photo is well made.

export const IMAGE_STYLE_SCHEMA = 'seo-site-image-style-v1';
// Classes without reference photos of their own are written against every reference photo together.
export const SITE_STYLE = 'site';
export const PROFILE_FIELDS = ['summary', 'settings', 'background', 'colour', 'lighting', 'rendering', 'casting', 'poseAndEnergy', 'framing', 'avoid'];
// How far outside the references' measured range a result may fall, as a share of the value, before it is flagged.
const RANGE_MARGIN = 0.1;
const METRICS = ['colourfulness', 'brightness', 'contrast'];

// Colourfulness (Hasler and Suesstrunk), mean luminance and luminance spread from raw RGB bytes.
export function pixelStats(rgb) {
  const count = rgb.length / 3;
  let sums = [0, 0, 0, 0, 0, 0];
  for (let index = 0; index < rgb.length; index += 3) {
    const [red, green, blue] = [rgb[index], rgb[index + 1], rgb[index + 2]];
    const rg = red - green;
    const yb = (red + green) / 2 - blue;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    sums = [sums[0] + rg, sums[1] + rg * rg, sums[2] + yb, sums[3] + yb * yb, sums[4] + luma, sums[5] + luma * luma];
  }
  const mean = (sum) => sum / count;
  const spread = (sum, squares) => Math.sqrt(Math.max(0, mean(squares) - mean(sum) ** 2));
  const colourfulness = Math.hypot(spread(sums[0], sums[1]), spread(sums[2], sums[3])) + 0.3 * Math.hypot(mean(sums[0]), mean(sums[2]));
  return { colourfulness: Math.round(colourfulness), brightness: Math.round(mean(sums[4])), contrast: Math.round(spread(sums[4], sums[5])) };
}

export async function imageStats(sharp, path) {
  const rgb = await sharp(path).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return pixelStats(rgb);
}

export function statsRange(list) {
  return Object.fromEntries(METRICS.map((metric) => {
    const values = list.map((stats) => stats[metric]);
    return [metric, { min: Math.min(...values), max: Math.max(...values) }];
  }));
}

// A generated photo against its class's reference range: the metrics that fall outside it (with the margin).
export function styleCheck(stats, range) {
  const off = METRICS.filter((metric) => {
    const { min, max } = range[metric];
    return stats[metric] < min * (1 - RANGE_MARGIN) || stats[metric] > max * (1 + RANGE_MARGIN);
  }).map((metric) => `${metric} ${stats[metric]} outside ${range[metric].min}-${range[metric].max}`);
  return { ...stats, inRange: off.length === 0, off };
}

export function styleProfilePrompt(kind, count, siteKind) {
  return [
    `The ${count} attached images are the ${kind === SITE_STYLE ? '' : `${kind} `}photographs of the website of ${siteKind}.`,
    'Describe the photographic style they share, concretely enough that a new photograph can match it. Name colours, surfaces and places; do not describe individual people or products. Write what is visible, without praise words (polished, glamorous, luxurious, flawless, stunning): they push a new photo toward a retouched look. Leave out wet or oiled skin and water on bodies: described, they come back as an oily sheen.',
    'Do not generate or edit any image and do not change any file.',
    `Reply with only this JSON on one line, English strings: {${PROFILE_FIELDS.map((field) => `"${field}": "..."`).join(', ')}}`,
    'summary: one sentence; settings: the kinds of places shown; background: backdrop treatment; colour: saturation and palette; lighting; rendering: how the camera renders them (lens look, depth of field, grain or noise, sharpness, how much skin and surfaces are retouched, skin texture); casting: who appears and how many; poseAndEnergy: still or in motion, mood; framing: crop, lens, subject placement; avoid: looks these photos clearly do not have.',
  ].join('\n');
}

export function parseStyleProfile(reply) {
  const line = reply.trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  const profile = line ? JSON.parse(line) : null;
  const missing = PROFILE_FIELDS.filter((field) => typeof profile?.[field] !== 'string' || !profile[field].trim());
  if (missing.length) throw new Error(`style profile is missing ${missing.join(', ')}`);
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, profile[field].trim()]));
}

const lastJson = (reply) => { const line = reply.trim().split('\n').reverse().find((text) => text.trim().startsWith('{')); return line ? JSON.parse(line) : null; };

// The reference's camera language for photos of a person: its framings and poses, each with how many of its photos use
// it, so generated photos take them in the same proportion (owner 2026-10-28: our own camera and pose lists put
// site10's models small in wide scenes, where the competitor's fill the frame). The head stays in frame: the image
// model refuses headless body crops of swimwear.
export function shotsPrompt(kind, count, siteKind) {
  return [
    `The ${count} attached images are the ${kind === SITE_STYLE ? '' : `${kind} `}photographs of the website of ${siteKind}.`,
    'For each photo that shows one person, note its framing (how much of the person is in frame and how large they are in it, camera distance and angle) and the pose. List every distinct framing and every distinct pose; merge only those a viewer would call the same. Leave out photos without a person and photos of groups.',
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line, English strings: {"framings":[{"text":"...","photos":n}],"poses":[{"text":"...","photos":n}]}',
    'framings: each a short camera instruction a photographer can follow, most used first; where a photo crops the head off, write the closest framing that keeps the head in frame. poses: each a short pose instruction, most used first. Write both for a model of any gender ("the model", never he or she). photos: how many of the attached photos use it.',
  ].join('\n');
}

// No list (null) when no photo of the class shows one person (concordhotels.com's hero and product photos are rooms,
// buildings and groups): the class then takes the site's shot list, as a class without one already does.
export function parseShots(reply) {
  const shots = lastJson(reply);
  if (shots?.framings?.length === 0 && shots?.poses?.length === 0) return null;
  const valid = (list) => Array.isArray(list) && list.length && list.every((item) => typeof item?.text === 'string' && item.text.trim() && Number.isInteger(item.photos) && item.photos > 0);
  if (!valid(shots?.framings) || !valid(shots?.poses)) throw new Error('shot list needs framings and poses, each [{ text, photos }]');
  return { framings: shots.framings, poses: shots.poses };
}

// A list taken in proportion to how many reference photos use each item, in rounds, so neighbours differ: two items
// used by 2 and 1 photos give A B A, A B A ...
export function inTurn(list) {
  const left = list.map((item) => ({ text: item.text.trim(), photos: item.photos }));
  const order = [];
  while (left.some((item) => item.photos > 0)) for (const item of left) if (item.photos > 0) { order.push(item.text); item.photos -= 1; }
  return order;
}

// The n-th photo's item of a list, stepping by step: the step is moved to the next number sharing no factor with the
// list's length, so the photos take every item before one comes back (site10's 20 prints stepped by 5 came back every
// fourth photo, and its hero and last section photo stood on the same steps).
export function takeTurn(list, n, step) {
  if (!list.length) return undefined;
  const gcd = (left, right) => (right ? gcd(right, left % right) : left);
  let stride = step;
  while (gcd(stride, list.length) !== 1) stride += 1;
  return list[(n * stride) % list.length];
}

// How far a photo moves along the shot list when it is made again (refused, or a look-alike): far enough not to land on
// the shot of the next photo of its page (site10's refused photos took their neighbour's pose).
export const SHOT_JUMP = 11;

// The framing and pose of the n-th photo of a page's class (consecutive photos take consecutive turns, so photos of one
// page differ in both).
export function pickShot(shots, n) {
  const framings = inTurn(shots.framings);
  const poses = inTurn(shots.poses);
  return { framing: framings[n % framings.length], pose: poses[(n + Math.floor(n / poses.length)) % poses.length] };
}

// The settings the reference's photos would give a product shown on its own: its plain surfaces and backdrops with
// their light, no view (owner 2026-10-28: one wall for every product photo looked alike).
export function productSettingsPrompt(count, siteKind) {
  return [
    `The ${count} attached images are photographs from the website of ${siteKind}.`,
    'List the plain surfaces and backdrops in them that a product could be photographed on or against on its own, each with the light that falls on it in these photos: walls, floors, paving, fabrics, timber and the like. No views, scenery, people or props.',
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line, English strings: {"settings":[{"text":"...","photos":n}]}',
    'text: a short backdrop a photographer can set up (for example "a sunlit cream plaster wall with soft leaf shadows"), most used first; photos: how many of the attached photos show it.',
  ].join('\n');
}

export function parseProductSettings(reply) {
  const settings = lastJson(reply)?.settings;
  if (!Array.isArray(settings) || !settings.length || !settings.every((item) => typeof item?.text === 'string' && item.text.trim() && Number.isInteger(item.photos) && item.photos > 0)) throw new Error('settings need [{ text, photos }]');
  return settings;
}

// The places the reference photographs its models in, each with its light: a photo's place is named in its prompt, so
// a page is not one terrace over and over (site10's one-piece page: ten photos by the same sea).
export function scenesPrompt(count, siteKind) {
  return [
    `The ${count} attached images are photographs from the website of ${siteKind}.`,
    'List the distinct places their models are photographed in, each with the light it has in these photos: for example a shoreline, a planted courtyard, a terrace, a poolside, an interior. Merge only places a viewer would call the same. No people, poses or products.',
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line, English strings: {"settings":[{"text":"...","photos":n}]}',
    'text: a short place a photographer can find (for example "a planted stone courtyard in late-morning sun with dappled shade"), most used first; photos: how many of the attached photos show it.',
  ].join('\n');
}

// Our own poses, places and product settings: new ones in the reference's spirit, none the same as one of its own
// (owner 2026-10-28: taken as read, the photos copy the competitor's). One text-only reading of the lists read from its
// photos.
export function ideasPrompt({ poses, scenes, settings, profile, garments }) {
  return [
    'A website photographs its models and products as follows.',
    `Style: ${profile.lighting} ${profile.colour} ${profile.poseAndEnergy}`,
    `Poses its photos use, by photo class: ${JSON.stringify(poses)}`,
    `Places its models are photographed in: ${JSON.stringify(scenes)}`,
    `Plain settings its photos give a product shown on its own: ${JSON.stringify(settings)}`,
    `Its product language: prints ${garments.prints} trims ${garments.trims} details ${garments.details}`,
    'Write new ones for another brand photographed in the same style: clearly the same style and mood, none the same as one listed.',
    'For each listed pose write 2 new poses: change the body position, the arms, the gaze or a small natural prop; relaxed and natural; the head in frame; written for a model of any gender ("the model", never he or she). For each listed place write 2 new places of the same character (another garden, terrace, shore, interior or time of day). For each listed setting write 2 new plain settings: another surface, material or light in the same palette; no view, scenery or props beyond the surface. Then write 20 prints of our own in its product language (motif, scale and accent colours, no ground colour: the ground colour is chosen per product), 12 trims or details of our own (one each) that suit any garment of the line, for men, women or children (seams, edges, ties, zips, hardware), none tied to one cut, and 8 prints for products made for children (florals, plain colours or simple graphics).',
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line, English strings: {"poses":{"<class>":["..."]},"scenes":["..."],"settings":["..."],"prints":["..."],"details":["..."],"childPrints":["..."]}',
  ].join('\n');
}

// Our own props: small everyday things a model would hold, wear or have beside them in our places, so a page is not
// one bare model after another (owner 2026-10-29). One text-only reading of the reference's poses and places.
export const PROP_COUNT = 12;
export function propsPrompt({ poses, scenes, profile }) {
  return [
    'A website photographs its models as follows.',
    `Style: ${profile.poseAndEnergy}`,
    `Poses its photos use: ${JSON.stringify(poses)}`,
    `Places its models are photographed in: ${JSON.stringify(scenes)}`,
    `List ${PROP_COUNT} props of our own for another brand photographed in the same style: small everyday things a model would naturally hold, wear or have beside them in places like these (for example a straw hat, a paperback, a woven bag, fruit, sunglasses, a towel, a ceramic cup), each different, none tied to a brand, none the same as one in the poses listed.`,
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line, English strings: {"props":["..."]}',
  ].join('\n');
}

export function parseProps(reply) {
  const props = lastJson(reply)?.props;
  if (!Array.isArray(props) || props.length < 3 || !props.every((text) => typeof text === 'string' && text.trim())) throw new Error('props need {"props":["..."]}');
  return props.map((text) => text.trim());
}

// The share of the reference's products shown plain (one solid colour, no print), from its product language: our
// photos take a print in the reference's proportion, never on every garment (owner 2026-10-30: another line, t-shirts
// or workwear, would have been printed throughout). One text-only reading.
export function plainSharePrompt(garments) {
  return [
    `A website's products have this product language: prints ${garments.prints}`,
    'About what share of its products are shown plain, in one solid colour with no print or pattern? A number from 0 (every one printed) to 1 (none printed).',
    'Do not generate or edit any image and do not change any file.',
    'Reply with only this JSON on one line: {"plainShare":0.3}',
  ].join('\n');
}

export function parsePlainShare(reply) {
  const share = lastJson(reply)?.plainShare;
  if (typeof share !== 'number' || share < 0 || share > 1) throw new Error('plain share needs {"plainShare": 0 to 1}');
  return share;
}

// Whether the photo at this turn of the library is plain: the turns spread evenly over the library, plainShare of them.
export const plainAt = (turn, share = 0) => ((turn * 0.6180339887) % 1) < share;

export function parseIdeas(reply, classes) {
  const ideas = lastJson(reply);
  const list = (value) => Array.isArray(value) && value.length && value.every((text) => typeof text === 'string' && text.trim());
  if (!['scenes', 'settings', 'prints', 'details', 'childPrints'].every((key) => list(ideas?.[key])) || !classes.every((kind) => list(ideas?.poses?.[kind]))) throw new Error(`ideas need poses for ${classes.join(', ')}, scenes, settings, prints, details and childPrints`);
  const counted = (texts) => texts.map((text) => ({ text: text.trim(), photos: 1 }));
  return { poses: Object.fromEntries(classes.map((kind) => [kind, counted(ideas.poses[kind])])), ...Object.fromEntries(['scenes', 'settings', 'prints', 'details', 'childPrints'].map((key) => [key, counted(ideas[key])])) };
}

// The reference's product language: what its products look like, so ours are new designs in the same collection
// rather than plain stand-ins (owner 2026-10-28). Cuts in neutral catalogue terms: words about how revealing a cut is
// made the image model refuse site10's photos.
export const GARMENT_FIELDS = ['prints', 'fabrics', 'trims', 'cuts', 'details'];
export function garmentsPrompt(count, siteKind) {
  return [
    `The ${count} attached images are photographs from the website of ${siteKind}.`,
    'Describe the design language of the products they show, concretely enough that a designer could make NEW products that clearly belong to the same collection without copying any one of them. Do not describe people, places or photography.',
    'Do not generate or edit any image and do not change any file.',
    `Reply with only this JSON on one line, English strings: {${GARMENT_FIELDS.map((field) => `"${field}": "..."`).join(', ')}}`,
    'prints: print and pattern types, motifs, scale and colours (and how often products are plain); fabrics: surface and texture; trims: hardware, ties, beads, edging; cuts: the shapes, in neutral catalogue terms, not how much of the body they show; details: construction and finishing that recur.',
  ].join('\n');
}

export function parseGarments(reply) {
  const garments = lastJson(reply);
  const missing = GARMENT_FIELDS.filter((field) => typeof garments?.[field] !== 'string' || !garments[field].trim());
  if (missing.length) throw new Error(`product language is missing ${missing.join(', ')}`);
  return Object.fromEntries(GARMENT_FIELDS.map((field) => [field, garments[field].trim()]));
}

// The written profile and measured range a class is generated against (its own, else the whole site's).
export function styleFor(style, kind) {
  return style?.kinds?.[kind] ?? style?.kinds?.[SITE_STYLE] ?? null;
}
