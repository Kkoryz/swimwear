// The Codex prompt for one photo of the image plan (image-plan.mjs). Style has one source, the reference site
// (analyze:image-style): its photos attached, its written profile and its own shot list. The prompt adds only what the
// reference cannot give: our product's design and colour, the model's look, the constraints and the output (owner
// 2026-10-28: generic camera, pose and framing rules stacked on the profile contradicted it, and site10's models came
// out small in wide scenes where the competitor's fill the frame). Product wording is in config/image-briefs.json.

import { GENERAL } from './media-allocation.mjs';
import { ALT_MAX_CHARS, ALT_MIN_CHARS, PERSON_KINDS } from './rules.mjs';
import { forChildren, mentionsAny } from './image-plan.mjs';

// A config template with its {name} slots filled (a slot with no value stays as written).
export const fillTemplate = (template, slots) => template.replace(/\{(\w+)\}/g, (match, name) => slots[name] ?? match);
const sentence = (...parts) => parts.filter(Boolean).join(' ');
// The model line: who wears it when the page's theme says (entry.wearer, lib/page-theme.mjs: "one adult man" on the
// boardshorts page under Men's Swimwear, which "of the gender that wears it" left to the image model and it made a
// woman; site13 claude-seo audit 2026-11-17, M-13), else the casting alone.
// A photo of the making: the trade's worker line, and which of its few workers it shows (briefs.workerCasting).
const workerLine = (worker, prompts) => [prompts.worker, worker && prompts.workerLook ? fillTemplate(prompts.workerLook, { worker }) : ''].filter(Boolean).join(' ');
const modelLine = (entry, prompts) => (entry.wearer && prompts.modelWearer ? fillTemplate(prompts.modelWearer, { wearer: entry.wearer, casting: entry.casting ?? '' }) : fillTemplate(prompts.model, { casting: entry.casting }));
// The built-in tool by name, not the owner's reference-style-imagegen skill: the judge homes that make photos too have
// none of the owner's skills, and the same description made the same photo there (site10, 2026-10-30).
const TOOL = 'Use your built-in image generation tool (not a CLI fallback). Pass the description below to it as written: do not expand or reword it.';

// A product-only entry (made for children, or refused on a person) shows the product without a person.
export function productOnlySubject(entry, subjects, line) {
  const list = subjects?.[entry.kind] ?? subjects?.product;
  if (!list?.length) throw new Error(`no product-only subject for ${entry.kind} photos (config/image-briefs.json productOnlySubjects)`);
  return list[(entry.index - 1 + (entry.subjectShift ?? 0)) % list.length].replaceAll('{category}', entry.category === GENERAL ? line : entry.category);
}

// Our product as the photo shows it: a new design in the reference's product language, its fabrics, with the print and
// detail this photo was given (analyze:image-style ideas, taken in turn so a page's products differ) on the planned
// colour. Its cut is the page's product's own: the reference's cuts are of its products (site10's men's swimwear was
// asked for underwired cups and was refused). fabricOnly: the fabrics and print alone, no garment (a swatch chart of
// site10 named with its garments came out as garments beside fabric close-ups).
function productDesign(entry, subject, { name, garments, briefs, fabricOnly = false }) {
  if (['portrait', 'process'].includes(entry.kind)) return '';
  const children = forChildren(entry.category, briefs);
  const fields = ['fabrics'];
  const language = garments ? `${briefs.prompts.design}: ${fields.map((field) => `${field} ${garments[field]}`).join('; ')}.` : '';
  const ground = entry.colour ? `${entry.colour}${/colourways/.test(subject) ? ', with other colourways beside it' : ''}` : '';
  const print = entry.print ? `Print: ${entry.print}${ground ? `, on a ${ground} ground` : ''}.` : ground ? `Main colour ${ground}.` : '';
  if (fabricOnly) return sentence(garments ? `Fabrics: ${garments.fabrics}.` : '', print);
  return sentence(`The ${name}${entry.products ? ` (${entry.products})` : ''}:`, language, print, entry.detail && !children ? `Detail: ${entry.detail}.` : '');
}

// How the image model is kept from its retouched, rendered look (OpenAI's image prompting guide, 2026; awesome-gpt-image;
// Luma's realistic prompts: a real photograph taken in the moment, light from the place itself, real skin, a used place
// and real fabric, named concretely rather than with "ultra-realistic" words): the lines for what the photo shows
// (person: a person is in it; fabric: a garment is), then the constraints and the output. A chart has no realism lines.
// product: the page's name for the product the photo is made to show (lib/image-seo.mjs libraryProducts; Google's
// image SEO, owner 2026-11-20: the alt names the product in the page's words, once, where the photo shows it); without
// one the alt sentence is as it was.
function closing(entry, master, prompts, { person = false, fabric = false, modelled = false, chart = false, orientation, product = null }) {
  return [
    chart ? '' : prompts.realism,
    person ? prompts.realismPerson : '',
    entry.place ? prompts.realismPlace : '',
    fabric && !chart ? prompts.realismFabric : '',
    // A board or diagram draws no counts or labels either (site10's assortment diagrams carried "x40" under each part).
    `Constraints: ${chart ? 'no words, numbers or quantity marks anywhere in the image; ' : 'photorealistic; '}${orientation} ${entry.size}; ${modelled ? 'tasteful and non-suggestive; ' : ''}${prompts.constraints}${modelled ? `; ${prompts.notInProduction}` : ''}.`,
    `Save the final image into this workspace as ${master} (copy it there from the generated_images folder).`,
    `Finish by replying with only this JSON on one line, alt text in English: {"file": "${master}", "alt": "<one factual English sentence of ${ALT_MIN_CHARS} to ${ALT_MAX_CHARS} characters describing only what is visible${product ? `, calling the product "${product}" once if the photo shows it` : ''}; no 'image of' or 'photo of', no brand, price, quantity, lead time or other claim>"}`,
  ];
}

const orientationOf = (size) => {
  const [width, height] = size.split('x').map(Number);
  return width > height ? 'landscape' : width < height ? 'portrait' : 'square';
};

// The prompt for a photo made as one of the reference's kinds of image (lib/image-types.mjs): the kind's recipe, the
// reference photos of that kind for their light, colour and camera language only, our place or plain setting, pose and
// design. A kind that shows making is shown by a worker, never a model (a model in a workshop came out of site10's
// production slot); a photo of it is a stand-in a real photo replaces.
export function typedPrompt(entry, { type, master, briefs, garments = null, line = '', attached = 0, product = null }) {
  const { prompts } = briefs;
  const name = entry.category === GENERAL ? line : entry.category;
  const worn = type.shows === 'worn';
  const making = type.shows === 'making';
  const chart = type.shows === 'chart';
  const fabricOnly = entry.kind === 'material';
  const topic = entry.topic ? `, for the page section "${entry.topic}" (show what it is about)` : '';
  const orientation = orientationOf(entry.size);
  // The photo's own shape leads, and the frame is filled: a recipe's "wide horizontal frame" made site10's men's phone
  // hero landscape, and its video-still recipe kept the letterbox bars.
  return [
    TOOL,
    `Make ONE new ${orientation} image (${entry.size}), filling the whole frame with no borders or letterbox bars, of this kind: ${type.name}. How this kind is made (recompose it for the ${orientation} frame where it describes another shape): ${type.recipe}`,
    attached ? (making
      ? `The ${attached} attached images are the reference website's images of this kind: take their light, colour, camera language and kind of place (the working production floor they show) from them, never their exact layout, people or garments.`
      : `The ${attached} attached images are the reference website's images of this kind: take only their light, colour and ${chart ? 'layout' : 'camera language'} from them, never their place, props, people or garments.`) : '',
    entry.place ? `Setting: ${entry.place}.` : entry.backdrop ? fillTemplate(prompts.productOnlySetting, { backdrop: entry.backdrop }) : '',
    worn && entry.shot ? `Pose: ${entry.shot.pose}` : '',
    worn && entry.prop ? fillTemplate(prompts.prop, { prop: entry.prop }) : '',
    // A photo of a model says the model wears it: "it shows our swim trunks" with a long-haired casting gave site10's
    // swim-trunks page a woman in a bikini.
    making ? `It shows our ${name} being made${topic}.` : worn ? `The model wears our ${name}${topic}.` : fabricOnly ? `It shows the fabrics of our ${name}${topic}, as fabric only.` : `It shows our ${name}${topic}.`,
    productDesign({ ...entry, kind: 'product' }, entry.subject ?? '', { name, garments, briefs, fabricOnly }),
    entry.modestCut ? prompts.modestCut : '',
    worn && entry.casting ? modelLine(entry, prompts) : '',
    worn && entry.coverUp ? prompts.coverUp : '',
    making ? workerLine(entry.worker, prompts) : '',
    !worn && !making && !chart ? 'No person in the image.' : '',
    ...closing(entry, master, prompts, { person: worn || making, fabric: true, modelled: worn, chart, orientation, product }),
  ].filter(Boolean).join('\n');
}

// The prompt for one visual of a GEO blog article (import-geo-article.mjs, 06-visuals.json): what the writer says it
// shows, as a photograph in the light, colour and rendering of the site's photos (profile), or, for a hero, chart or
// diagram, as an illustration with no words or numbers. The labels and scales a description names are left out of the
// image (the page's caption names them; an image model's lettering is not to be trusted). A photo the writer meant to
// come from the company is a stand-in a real photo replaces.
// others: the article's other pictures ({ title, setting }), so this one differs from them (owner 2026-10-30: ten
// pictures of one article were mostly one navy swimsuit on one pool deck).
// source: what the picture is for ('article', or 'page' for a page section's photo); extra: lines on what it shows
// (a worn product and its model, intentPrompt); modelled: a person wears the product.
// peopleLine: who is in the photo, said by the caller in place of the line the description's people words give
// (scenePrompt: a class whose photos show no one).
export function articleVisualPrompt(visual, { master, profile, briefs, article, size = '1536x1024', others = [], source = 'article', extra = [], modelled = false, worker = null, peopleLine = null, product = null }) {
  const { prompts } = briefs;
  const orientation = orientationOf(size);
  const photo = visual.type === 'photo';
  // Who counts as a person in the description: the trade's words (briefs.personWords: a service's staff, owners and
  // guests), else a manufacturer's.
  const people = briefs.personWords ? new RegExp(`\\b(${briefs.personWords.join('|')})\\b`, 'i') : /\b(person|people|worker|workers|hands?|model|buyer|team|operator|technician|exhibitor)\b/i;
  const person = !modelled && !peopleLine && people.test(`${visual.content} ${visual.setting ?? ''}`);
  return [
    TOOL,
    photo
      ? `Make ONE new ${orientation} photograph (${size}), filling the whole frame with no borders, for the section "${visual.section}" of the ${source} "${article}": ${visual.title}.`
      : `Make ONE new ${orientation} illustration (${size}), filling the whole frame with no borders, for the ${source} "${article}": ${visual.title}.`,
    `What it shows: ${visual.content}.`,
    ...extra,
    visual.setting ? `Setting: ${visual.setting}.` : '',
    `What it is for: ${visual.purpose}.`,
    others.length ? `The article's other pictures show: ${others.map((other) => other.setting || other.title).join('; ')}. This one looks different from them: another place, background, angle and distance.` : '',
    // One picture, one thing to see (owner 2026-10-30: a hero described as a six-step journey came out as a four-panel
    // collage that said too much at once).
    'One moment and one main subject, with only what it needs around it: never a collage, grid of panels, split screen, inset or sequence of steps. Where the description names several steps or items, show the main one and leave the rest to the article; things compared stand side by side in one shot.',
    'Leave out any labels, captions, scales, legends or written values the description names: show the objects themselves.',
    // A photo in the writer's setting takes that place's own light and colours (owner 2026-10-30: the product photos'
    // outdoor sun moved a sampling room's bench onto a stone terrace); only the site's camera rendering stays.
    photo && visual.setting ? `The light and colours are the setting's own. Rendering as on the company's website: ${profile.rendering}`
      : photo ? `Light, colour and rendering as on the company's website: ${sentence(profile.lighting, profile.colour, profile.rendering)}` : `Colour as on the company's website: ${profile.colour}`,
    peopleLine ?? (person ? workerLine(worker, prompts) : photo && !modelled ? 'No person in the image.' : ''),
    ...closing({ size }, master, prompts, { person: photo && (person || modelled), fabric: photo, modelled, chart: !photo, orientation, product }),
  ].filter(Boolean).join('\n');
}

// The photo a page section asks for (Site Factory's visuals, entry.intent: what it shows and where), made as an
// article's photo is: the section's subject in its own setting, unlike the page's other photos (others). Where someone
// wears the product, it is our product of the page (its design, print and colour) on a model of the casting.
export function intentPrompt(entry, { master, profile, briefs, garments = null, line = '', others = [], product = null }) {
  const { intent } = entry;
  const name = entry.category === GENERAL ? line : entry.category;
  // A trade whose photos are scenes (briefs.photos) has no product worn by a model.
  const worn = briefs.photos !== 'scenes' && /\b(wears?|wearer|wearing|worn|model|swimmer)\b/i.test(`${intent.content} ${intent.setting ?? ''}`);
  const extra = worn ? [
    `The model wears our ${name}.`,
    productDesign({ ...entry, kind: 'product' }, '', { name, garments, briefs }),
    entry.casting ? modelLine(entry, briefs.prompts) : '',
  ] : [];
  const visual = { type: 'photo', title: intent.caption ?? intent.content, content: intent.content, setting: intent.setting ?? undefined, purpose: intent.purpose ?? intent.caption ?? '', section: intent.section ?? name };
  return articleVisualPrompt(visual, { master, profile, briefs, article: name, size: entry.size, others, source: 'page', extra, modelled: worn, worker: entry.worker, product });
}

// A photo of a trade whose photos are scenes of its work (briefs.photos "scenes": a service business), not a product on
// a model: its subject made as a page section's photo is (articleVisualPrompt), in its class's light and rendering.
// The class's profile goes with it whole (owner 2026-11-18: Staylumen's opening photos were people at desks and guests at
// doors where the reference's show unoccupied houses and landscapes, "no foreground people": the prompt carried the
// profile's light, colour and rendering only): its kind of place and framing, who appears, what to avoid. Where the
// profile says no person or people only far off (profile.people), a subject that names a person is shown as its own
// place, unoccupied ("a guest bedroom" and "styled for guests" name a person word and a room: each photo keeps its
// subject), and the trade's people line never joins it ("for guests" called the staff and clients in).
export function scenePrompt(entry, { master, profile, briefs, line = '' }) {
  const name = entry.category === GENERAL ? line : entry.category;
  const purpose = entry.kind === 'hero' ? "the page's opening photo, under or beside its headline" : entry.topic ? `the page section "${entry.topic}"` : `a photo of the ${name} business's work`;
  const people = briefs.personWords ? new RegExp(`\\b(${briefs.personWords.join('|')})\\b`, 'i') : null;
  const empty = ['none', 'background'].includes(profile.people);
  const subject = empty && people?.test(entry.subject) ? `${entry.subject.replace(/[.\s]+$/, '')}, shown as the place alone, unoccupied` : entry.subject;
  const extra = [
    profile.background || profile.framing ? `Kind of place and framing as on the company's website: ${sentence(profile.background, profile.framing)}` : '',
    profile.casting ? `People as on the company's website: ${profile.casting}` : '',
    profile.avoid ? `Avoid: ${profile.avoid}` : '',
  ];
  const peopleLine = { none: 'No person in the image.', background: 'No person in the foreground; anyone shown is small and far off.' }[profile.people] ?? null;
  const visual = { type: 'photo', title: subject, content: subject, purpose, section: entry.topic ?? name };
  return articleVisualPrompt(visual, { master, profile, briefs, article: name, size: entry.size, source: 'page', extra, peopleLine });
}

// The prompt for one entry. shot: the framing and pose taken from the reference's shot list (photos of a model);
// attached: how many reference photos go with the prompt.
export function imagePrompt(entry, { master, profile, briefs, shot = null, garments = null, productOnlySubjects = null, line = '', attached = entry.styleRefs?.length ?? 0, product = null }) {
  if (!profile) throw new Error(`no style profile for ${entry.kind} photos (run analyze:image-style)`);
  const { prompts, productionSceneWords } = briefs;
  const orientation = orientationOf(entry.size);
  const name = entry.category === GENERAL ? line : entry.category;
  const subject = entry.productOnly ? productOnlySubject(entry, productOnlySubjects, line) : entry.subject;
  const topic = entry.topic && entry.kind !== 'portrait' ? `, for the page section "${entry.topic}" (show what it is about)` : '';
  const withModel = PERSON_KINDS.includes(entry.kind) && entry.kind !== 'portrait' && !entry.productOnly;
  // The manufacturer's own factory is shown only in real photos, so a photo of a model is never staged there, even
  // when the reference's profile was read from its factory photos.
  const place = (field) => (withModel && mentionsAny(productionSceneWords, profile[field] ?? '') ? prompts.productionSceneReplaced : profile[field]);
  const finish = closing(entry, master, prompts, { person: withModel || (['portrait', 'process'].includes(entry.kind) && !entry.productOnly), fabric: entry.kind !== 'portrait', modelled: withModel, orientation, product });
  // A product on its own: a product shot on one of the reference's plain settings (analyze:image-style productSettings),
  // lit, coloured and rendered like the reference, never in its scenery (site10's product-only photos all stood by the
  // sea, then all on one wall).
  if (entry.productOnly) {
    return [
      TOOL,
      `Make ONE new product photograph with no person: ${subject}${topic}.`,
      productDesign(entry, subject, { name, garments, briefs }),
      fillTemplate(prompts.productOnlySetting, { backdrop: entry.backdrop }),
      `Light, colour and rendering as on the reference website: ${sentence(profile.lighting, profile.colour, profile.rendering)}`,
      ...finish,
    ].filter(Boolean).join('\n');
  }
  const source = attached ? `the ${attached} attached photos from the reference website` : 'the reference website described below';
  return [
    TOOL,
    // A photo of a model is set in one of our places (analyze:image-style ideas): the attached photos give its light,
    // colour and camera language, not its place (site10's one-piece page stood ten times by the same sea).
    entry.place
      ? `Make ONE new photograph in the style of ${source}: the same light, colour and camera language, with a new subject, a new composition and the setting below.`
      : `Make ONE new photograph in the style of ${source}: the same kind of place, light, colour and camera language, with a new subject and a new composition.`,
    entry.place ? `Setting: ${entry.place}.` : '',
    `Their style: ${sentence(place('settings'), place('background'), profile.lighting, profile.colour, profile.rendering, shot ? profile.poseAndEnergy : profile.framing)}`,
    shot ? `Shot: ${shot.framing} Pose: ${shot.pose}` : '',
    shot && entry.prop ? fillTemplate(prompts.prop, { prop: entry.prop }) : '',
    `Subject: ${subject}${topic}.`,
    productDesign(entry, subject, { name, garments, briefs }),
    entry.modestCut ? prompts.modestCut : '',
    withModel && entry.casting ? modelLine(entry, prompts) : '',
    withModel && entry.coverUp ? prompts.coverUp : '',
    entry.kind === 'portrait' ? prompts.portrait : '',
    `Avoid: ${profile.avoid}`,
    ...finish,
  ].filter(Boolean).join('\n');
}
