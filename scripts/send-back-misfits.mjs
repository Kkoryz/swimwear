#!/usr/bin/env node

// The library photos the image-fit judge found off their page's subject (judge-image-fit.mjs), sent back to generation
// once: a photo on a page of its own category that does not show it (site10's case photos on the men's swimwear page,
// a product photo of the wrong garment) is made again, whatever code made it. A factory stand-in (briefs.placeholderKinds)
// waits for a real photo, and a site-wide photo on a site-wide page is not sent back (making it again shows the line
// again). A trade whose photos are scenes planned from its pages' copy (briefs.photos "scenes", plan-photo-briefs.mjs)
// sends back a photo made for a section of the page it is judged on, whatever its class or category: it was made for
// that section alone. Each photo is sent back at most once (fitRemakes).
// Usage: node scripts/send-back-misfits.mjs [--check]   --check: list them, exit 2 while there are any; without it:
// send them back (status rejected-review), exit 2 when there was none to send.

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { GENERAL } from './lib/media-allocation.mjs';
import { imageBriefs } from './lib/trade.mjs';

export const FIT_REMAKES = 1;

// The plan's entries to send back: [{ entry, route }].
export function misfits(plan, imageFit, placeholderKinds = [], { scenes = false } = {}) {
  const bySrc = new Map(plan.entries.filter((entry) => entry.status === 'generated' && entry.web?.srcset).flatMap((entry) => entry.web.srcset.split(',').map((part) => [part.trim().split(' ')[0], entry])));
  const found = new Map();
  for (const page of imageFit?.pages ?? []) {
    const category = plan.routes?.[page.route] ?? GENERAL;
    for (const image of page.images.filter((item) => item.fit === 'wrong_subject')) {
      const entry = bySrc.get(image.src);
      const ownSection = scenes && entry?.intent?.route === page.route;
      if (!entry || (!ownSection && (category === GENERAL || entry.category !== category || placeholderKinds.includes(entry.kind))) || (entry.fitRemakes ?? 0) >= FIT_REMAKES) continue;
      found.set(entry.id, { entry, route: page.route });
    }
  }
  return [...found.values()];
}

export async function sendBackMisfits({ root = process.cwd(), check = false } = {}) {
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const briefs = await imageBriefs(root);
  const list = misfits(plan, await readJson(resolve(root, 'docs/research/image-fit.json'), null), briefs.placeholderKinds ?? [], { scenes: briefs.photos === 'scenes' });
  if (!check && list.length) {
    for (const { entry, route } of list) Object.assign(entry, { status: 'rejected-review', reviewNote: `image-fit: not the subject of ${route}`, fitRemakes: (entry.fitRemakes ?? 0) + 1 });
    await writeJson(planPath, plan);
  }
  return list;
}

runMain(import.meta.url, async () => {
  const check = cliArgs({ check: { type: 'boolean' } }).values.check === true;
  const list = await sendBackMisfits({ check });
  for (const { entry, route } of list) console.log(`${check ? 'off its subject' : 'sent back'}: ${entry.id} on ${route}`);
  if (check ? list.length : !list.length) process.exitCode = 2;
});
