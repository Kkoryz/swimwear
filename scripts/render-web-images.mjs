#!/usr/bin/env node

// Re-renders the published sizes of every generated photo (and the chat agent's headshot) from their masters, with no
// metadata in the files: what an image is and where it came from lives in the image register
// (docs/research/image-plan.json, docs/research/images/masters/chat-agent.record.json), not in the published file.
// Same file names and sizes, so pages need no change.
// Usage: node scripts/render-web-images.mjs

import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AVATAR_SRC } from './lib/chat-setup.mjs';
import { runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { renderAvatar, renderWebp } from './lib/web-image.mjs';

const exists = (path) => access(path).then(() => true, () => false);

export async function renderWebImages({ root = process.cwd() } = {}) {
  const { default: sharp } = await import('sharp');
  // No cached file handles: on Windows an open handle blocks rewriting a file in place.
  sharp.cache(false);
  const plan = await readJson(resolve(root, 'docs/research/image-plan.json'), { entries: [] });
  let files = 0;
  for (const entry of plan.entries.filter((item) => item.master && item.web?.srcset)) {
    const master = resolve(root, entry.master);
    if (!(await exists(master))) continue;
    for (const source of entry.web.srcset.split(', ')) {
      const [file, size] = source.split(' ');
      const target = resolve(root, 'public', file.slice(1));
      if (!(await exists(target))) continue;
      await renderWebp(sharp, master, Number.parseInt(size, 10), target);
      files += 1;
    }
  }
  const avatarMaster = resolve(root, 'docs/research/images/masters/chat-agent.png');
  const avatar = resolve(root, 'public', AVATAR_SRC.slice(1));
  if (await exists(avatarMaster) && await exists(avatar)) {
    await renderAvatar(sharp, avatarMaster, avatar);
    files += 1;
  }
  return files;
}

runMain(import.meta.url, async () => console.log(`${await renderWebImages()} published image file(s) re-rendered without metadata`));
