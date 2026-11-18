// Where each photo a page shows comes from, read from the pipeline's own records and never from the page (owner,
// 2026-10-24: nothing on the site says how a photo was made; that is recorded in the pre-launch handoff only): the
// image register (the library's photos, made by the image model), the site's photo record (Site Factory's media:
// AI-drawn stand-ins until the owner's real photos are read back), and the competitor's development placeholders (by
// their folder, which a release build removes).

import { REAL_ONLY_KINDS } from './rules.mjs';

export const HANDOFF_SCHEMA = 'seo-site-handoff-v1';

// Every web size of a photo record (src and each srcset entry).
const sizesOf = (web) => [web.src, ...(web.srcset ?? '').split(', ').map((source) => source.split(' ')[0])].filter(Boolean);

// (src) -> { source: 'library' | 'site' | 'competitor' | null, kind } from the image plan and src/data/site-media.json.
export function photoSources({ plan = null, siteMedia = null } = {}) {
  const bySrc = new Map();
  for (const entry of plan?.entries ?? []) if (entry.web) for (const src of sizesOf(entry.web)) bySrc.set(src, { source: 'library', kind: entry.kind, id: entry.id, ...(entry.photoClass ? { photoClass: entry.photoClass } : {}) });
  for (const photo of siteMedia?.photos ?? []) for (const src of sizesOf(photo)) bySrc.set(src, { source: 'site', kind: photo.class, file: photo.sourceFile });
  return (src) => bySrc.get(src) ?? { source: src?.includes('/media/reference/') ? 'competitor' : null, kind: src?.match(/\/media\/reference\/(hero|product|process|material|lifestyle|portrait)-/)?.[1] ?? null };
}

// The srcs of the site photos the owner supplied as real (their Site Factory file names, read back from the filled
// handoff).
export function realPhotoSrcs(siteMedia, realFiles = []) {
  const real = new Set(realFiles);
  return (siteMedia?.photos ?? []).filter((photo) => real.has(photo.sourceFile)).flatMap(sizesOf);
}

// A photo in a class a visitor reads as real (the factory, staff, a client's face) that is not the owner's real photo:
// the handoff asks for a real one. So does every photo of the factory-process class the image plan gave it (a
// section's photo of sewing or inspection made as a product photo; lib/photo-class.mjs, owner 2026-11-17: process
// photos go on the 必须实拍替换 list).
export const standInForReal = (photo, src, realSrcs) => (REAL_ONLY_KINDS.includes(photo.kind) || photo.photoClass === 'process') && !realSrcs.has(src);
