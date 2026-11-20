#!/usr/bin/env node

// Re-renders the published sizes of every generated photo (and the chat agent's headshot) from their masters. What an
// image is and where it came from lives in the image register (docs/research/image-plan.json,
// docs/research/images/masters/chat-agent.record.json); while site.json imageSeo is on, a photo's files also carry it
// as XMP (its digital source type, the site as creator and credit, the copyright: lib/web-image.mjs xmpPacket), else
// they have no metadata.
// Same file names; a file the image budget (lib/web-image.mjs WEB_IMAGE_MAX_BYTES) makes narrower has its new width
// named in the register's srcset (apply-image-library.mjs carries it to the pages).
// --over-budget: only the published files heavier than the budget (the images step runs it: site12 claude-seo audit
// 2026-11-17, I-1: photos published before the budget, 1536 wide and 400-525 KB, were never encoded again; no photo is
// made again for it, its master is).
// Usage: node scripts/render-web-images.mjs [--over-budget]

import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AVATAR_SRC } from './lib/chat-setup.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { renderAvatar, renderWebp, WEB_IMAGE_MAX_BYTES } from './lib/web-image.mjs';
import { siteXmp } from './lib/image-seo.mjs';

const exists = (path) => access(path).then(() => true, () => false);

export async function renderWebImages({ root = process.cwd(), overBudget = false } = {}) {
  const { default: sharp } = await import('sharp');
  // No cached file handles: on Windows an open handle blocks rewriting a file in place.
  sharp.cache(false);
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath, { entries: [] });
  const xmpOf = await siteXmp(root);
  let files = 0;
  let renamed = false;
  for (const entry of plan.entries.filter((item) => item.master && item.web?.srcset)) {
    // A photo is published from its finished file (generate-images.mjs, lib/photo-finish.mjs) where it has one, so a
    // re-render keeps its finish.
    const finished = resolve(root, entry.master.replace(/\.png$/, '.finished.png'));
    const master = (await exists(finished)) ? finished : resolve(root, entry.master);
    if (!(await exists(master))) continue;
    const sources = [];
    for (const source of entry.web.srcset.split(', ')) {
      const [file, size] = source.split(' ');
      const target = resolve(root, 'public', file.slice(1));
      const heavy = overBudget ? ((await stat(target).catch(() => null))?.size ?? 0) > WEB_IMAGE_MAX_BYTES : true;
      if (!(await exists(target)) || !heavy) { sources.push(source); continue; }
      const info = await renderWebp(sharp, master, Number.parseInt(size, 10), target, { keepWidth: true, xmp: xmpOf(entry.origin?.digitalSourceType) });
      files += 1;
      sources.push(`${file} ${info.width}w`);
      if (file === entry.web.src && info.width !== entry.web.width) Object.assign(entry.web, { width: info.width, height: info.height });
    }
    const srcset = sources.join(', ');
    if (srcset !== entry.web.srcset) { entry.web.srcset = srcset; renamed = true; }
  }
  if (renamed) await writeJson(planPath, plan);
  const avatarMaster = resolve(root, 'docs/research/images/masters/chat-agent.png');
  const avatar = resolve(root, 'public', AVATAR_SRC.slice(1));
  if (!overBudget && await exists(avatarMaster) && await exists(avatar)) {
    await renderAvatar(sharp, avatarMaster, avatar);
    files += 1;
  }
  return files;
}

runMain(import.meta.url, async () => {
  const { 'over-budget': overBudget } = cliArgs({ 'over-budget': { type: 'boolean' } }).values;
  console.log(`${await renderWebImages({ overBudget: Boolean(overBudget) })} published image file(s) re-rendered${overBudget ? ` (over ${WEB_IMAGE_MAX_BYTES / 1024} KB)` : ''}`);
});
