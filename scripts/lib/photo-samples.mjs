// One sample of each photo class before the library (owner 2026-11-17, via Site Factory: "每一类先出 1 张样张，样张过了
// 配图判定再出全库"): RateHarbor's 20 and MotelPilot's 30 photos were all made before any was judged against its page.
// The images step makes, of each class (lib/photo-class.mjs: goods, process, service, portrait) with photos to make,
// its first photo alone (generate-images.mjs --samples), has the image-fit judge read it against its page
// (judge-image-fit.mjs --samples, config/agent-steps/image-fit.md), and makes the rest only once every class's sample
// fits (generate-images.mjs, SampleHold otherwise: the run waits). A sample that does not fit is sent back to be made
// again (on another scene, lib/image-plan.mjs), the library waiting until a person has looked
// (docs/research/images/samples.md). A class whose sample passed stays passed while that photo is in the library.

import { photoClassOf } from './photo-class.mjs';

export const SAMPLES_SCHEMA = 'seo-site-photo-samples-v1';
export const SAMPLES_PATH = 'docs/research/images/samples.json';
// Photos of each class made and judged before the rest of the library (the owner's one).
export const SAMPLES_PER_CLASS = 1;
const IN_LIBRARY = new Set(['generated', 'approved']);

// More photos to make than their classes' samples have passed for: the run waits for a person (site-run's images step).
export class SampleHold extends Error {}

export const classOf = (entry, briefs) => entry.photoClass ?? photoClassOf(entry, briefs);

// A class's sample: "passed" (it fits and is still in the library as judged), "pending" (made, not judged yet) or null
// (none, or sent back: one is to be made).
export function sampleState(record, plan, photoClass) {
  const sample = record?.classes?.[photoClass];
  const entry = sample && plan.entries.find((item) => item.id === sample.id);
  if (!entry || !IN_LIBRARY.has(entry.status) || entry.sha256 !== sample.sha256) return null;
  return sample.label === 'fits' ? 'passed' : sample.label ? null : 'pending';
}

// A class never made, so never sampled: a service site's generic scene (lib/photo-class.mjs), which is planned again
// as the online-service class or held by the text check (site14 2026-11-17: five scenes sent back by the library
// review held the library for a "scene" sample that could never be made).
export const UNSAMPLED_CLASSES = Object.freeze(['scene']);

// The classes of a queue whose sample has not passed.
export function openClasses(plan, queue, record, briefs) {
  return [...new Set(queue.map((entry) => classOf(entry, briefs)))].filter((photoClass) => !UNSAMPLED_CLASSES.includes(photoClass) && sampleState(record, plan, photoClass) !== 'passed');
}

// The samples to make from a queue: for each class with no sample passed or waiting for its judgment, the photo sent
// back as its last sample, else its first photo (a hero's phone twin is its hero's).
export function samplesToMake(plan, queue, record, briefs) {
  const picks = [];
  for (const photoClass of openClasses(plan, queue, record, briefs)) {
    if (sampleState(record, plan, photoClass) === 'pending') continue;
    const own = queue.filter((entry) => !entry.phoneOf && classOf(entry, briefs) === photoClass);
    const last = own.find((entry) => entry.id === record?.classes?.[photoClass]?.id);
    picks.push(...[...(last ? [last] : []), ...own.filter((entry) => entry !== last)].slice(0, SAMPLES_PER_CLASS));
  }
  return picks;
}

// The record after samples were made: each made sample waits for its judgment.
export function recordSamples(record, made, briefs, at = new Date().toISOString()) {
  const classes = { ...(record?.classes ?? {}) };
  for (const entry of made) if (IN_LIBRARY.has(entry.status)) classes[classOf(entry, briefs)] = { id: entry.id, sha256: entry.sha256, label: null, madeAt: at };
  return { schemaVersion: SAMPLES_SCHEMA, classes };
}

const LABEL = { fits: '通过', wrong_subject: '不对题（已退回重做）' };
const MISSED = { 'rejected-duplicate': '与图库里已有的照片太像', 'rejected-near-copy': '与竞品参考图太像', failed: '出图失败' };
export function samplesMarkdown(record, open = []) {
  const rows = Object.entries(record?.classes ?? {}).map(([photoClass, sample]) => `| ${photoClass} | ${sample.id} | ${sample.route ?? '—'} | ${sample.subject ?? '—'} | ${sample.label ? LABEL[sample.label] ?? sample.label : '待判定'} |`);
  return [
    '# 样张：每一类先出 1 张',
    '',
    '每一类照片（实物类 goods、工厂流程类 process、线上服务类 service、评价人像 portrait）先出 1 张样张，由配图判定（config/agent-steps/image-fit.md）对照它所在页面判定；每一类的样张都通过后才出其余照片。',
    '',
    '| 分类 | 样张 | 页面 | 页面主题 | 判定 |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    // A sample this run's own checks sent back every time it was made (generate-images.mjs SAMPLE_TRIES; site11
    // 2026-11-17): named with why, so a person is not left with an empty table.
    ...(record?.missed?.length ? ['这些样张出了几次都被出图检查退回，没有进入判定：', '', ...record.missed.map((item) => `- ${item.photoClass}：${item.id}，${MISSED[item.status] ?? item.status}${item.duplicateOf ? `（与 ${item.duplicateOf} 太像）` : ''}`), ''] : []),
    ...(open.length ? [`还没通过的分类：${open.join('、')}。全库暂不出图。看过样张后重跑 site:run：退回的样张会换场景重做一张再判定；规划本身不对的，先改照片规划（src/data/photo-briefs.json、site.json imageSubjects）。`, ''] : []),
  ].join('\n');
}
