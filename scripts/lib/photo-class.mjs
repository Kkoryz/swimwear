// The owner's photo classes and the text check of a photo before it is made (owner 2026-11-17, via Site Factory: "关键
// 是未来如何避免类似问题": the four sites were audited after they were built, their photos were off their pages (a men's
// page with a woman, a watersports page with a garden, a service site of hotel scenes) and RateHarbor and MotelPilot
// made 20 and 30 photos again).
//
// Each photo's class is decided when the image plan is made, from its trade (config/image-briefs*.json photoClasses),
// its class of photography (the page type's blocks ask for it), its page's copy (a section's brief) and what it shows:
// - goods (实物类): the product, its materials, trims or packaging, worn or on its own as the reference shows it;
// - process (工厂流程类): the factory and its work; every one goes on the handoff's 必须实拍替换 list (photo-sources.mjs);
// - service (线上服务类): a de-identified report, a working screen or a delivered file; on a service site a photo that
//   names none of these is a generic scene ("scene"), never planned and held before it is made.
// A portrait (a client quoted) is its own class.
//
// The text check (code only, no model): a photo to be made shares at least PHOTO_TEXT_MIN_SHARED words of what it
// shows with its page's H1 and copy (a section's brief with the H1 and its section), names no audience its page's
// theme excludes (a woman modelling on a men's page, an adult on a children's page), and is no generic scene. One that
// fails is held out of the queue (status held-text) and reported (check-photo-text.mjs).

import checkConfig from '../../config/photo-text-check.json' with { type: 'json' };
import { CHILDREN_THEME, namesTheme, themeList } from './page-theme.mjs';
import { REAL_ONLY_KINDS } from './rules.mjs';

export const PHOTO_CLASSES = Object.freeze(['goods', 'process', 'service']);
// Words of a photo's subject its page's text must share (one: the check catches a subject about something else, and
// leaves the wording to the brief; site12 and site13's planned photos 2026-11-17, check-photo-text.mjs).
export const PHOTO_TEXT_MIN_SHARED = 1;
// The status of a photo the text check holds out of the queue (not made, reported).
export const HELD_TEXT = 'held-text';

// A word as the check reads it: lower case, a plural made singular ("towels" towel, "dresses" dress).
const singular = (word) => (word.length > 4 && word.endsWith('es') && /(ss|x|ch|sh)$/.test(word.slice(0, -2)) ? word.slice(0, -2) : word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
const tokens = (text) => String(text ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular);
const phrase = (text) => ` ${tokens(text).join(' ')} `;
// Whether a text names one of the words or phrases (whole words, plurals too).
export const namesAny = (list, text) => { const found = phrase(text); return (list ?? []).some((word) => found.includes(phrase(word))); };

// A word's stem for the topic: its first STEM_LETTERS letters when longer ("consultant" and "consultation", "printed"
// and "printing" one word; site12's quote page planned a consultant's call for its "consultation" section).
const STEM_LETTERS = 5;
const stem = (word) => (word.length > STEM_LETTERS ? word.slice(0, STEM_LETTERS) : word);
const STOP = new Set(checkConfig.stopWords.map((word) => stem(singular(word.toLowerCase()))));
// The words a text is about: three letters or more, the check's stop words left out, by stem.
export const topicWords = (text) => new Set(tokens(text).filter((word) => word.length >= 3).map(stem).filter((word) => !STOP.has(word)));

// What a photo shows: a section's ask (its intent) or the plan's subject.
const shows = (entry) => entry.intent?.content ?? entry.subject ?? '';

// A photo's class (see above): briefs are the trade's image briefs (lib/trade.mjs imageBriefs).
export function photoClassOf(entry, briefs) {
  if (entry.kind === 'portrait') return 'portrait';
  const classes = briefs.photoClasses ?? {};
  const content = shows(entry);
  if (classes.default === 'service') return namesAny(classes.serviceWords, content) ? 'service' : 'scene';
  if (REAL_ONLY_KINDS.includes(entry.kind) || (briefs.placeholderKinds ?? []).includes(entry.kind)) return 'process';
  if (namesAny(classes.processWords, content)) return 'process';
  // A section set on the factory floor shows its work unless it shows the product worn (a model in the fit room).
  if (entry.intent?.setting && namesAny(classes.processWords, entry.intent.setting) && !namesAny(classes.wearWords, content)) return 'process';
  return classes.default ?? 'goods';
}

// What is wrong with a photo before it is made, by the text of the pages it is for ({ code, detail }; none: it may be
// made). texts: its pages' H1 and copy (a section's ask: the H1, the section's heading and text); theme: its page's
// theme (lib/page-theme.mjs), or null.
export function photoTextProblems(entry, { texts = [], theme = null, briefs }) {
  const problems = [];
  const photoClass = entry.photoClass ?? photoClassOf(entry, briefs);
  const content = shows(entry);
  if (photoClass === 'scene') problems.push({ code: 'generic_scene', detail: 'a service site shows a de-identified report, a working screen or a delivered file; this names none' });
  const own = topicWords(content);
  if (texts.length && own.size) {
    const page = new Set(texts.flatMap((text) => [...topicWords(text)]));
    const shared = [...own].filter((word) => page.has(word));
    const named = [...new Set(tokens(content).filter((word) => word.length >= 3 && !STOP.has(stem(word))))];
    if (shared.length < PHOTO_TEXT_MIN_SHARED) problems.push({ code: 'off_topic', detail: `none of its words (${named.slice(0, 8).join(', ')}) is in its page's H1 or copy` });
  }
  // A model of an audience the page's theme leaves out (the product worn, not a worker at the factory).
  if (theme && photoClass === 'goods' && namesAny(briefs.photoClasses?.wearWords ?? ['wearing', 'model'], content)) {
    const shown = themeList(briefs).filter((other) => other.wearer && !other.needs && namesTheme(other, content)).map((other) => other.id);
    const needed = theme.id === CHILDREN_THEME ? [] : theme.wearer ? theme.needs ?? [theme.id] : null;
    if (shown.length && needed && shown.some((id) => !needed.includes(id))) problems.push({ code: 'wrong_audience', detail: `it shows ${shown.join(' and ')} on a ${theme.id} page` });
  }
  return problems;
}
