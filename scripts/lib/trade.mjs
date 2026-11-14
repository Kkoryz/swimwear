// The site's trade (site.json trade, default "apparel"): which config files its photos, stand-in proof and placeholder
// wording come from. The template was made for B2B clothing manufacturers; a service business (owner 2026-11-06:
// site11's motel management pages showed sewing floors and "150,000 pcs a month") names "service" and gets
// config/<file>.service.json in place of config/<file>.json. siteKind (site.json) names what the site is in the image
// prompts, over the trade file's own.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './json-io.mjs';

export const DEFAULT_TRADE = 'apparel';
const CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), '../../config');

export async function siteTrade(root = process.cwd()) {
  const site = await readJson(resolve(root, 'site.json'), null);
  return { trade: site?.trade ?? DEFAULT_TRADE, siteKind: site?.siteKind ?? null, imageSubjects: site?.imageSubjects ?? null };
}

// A config file for the trade: config/<name>.json for the default trade, else config/<name>.<trade>.json (an unknown
// trade fails rather than falling back to clothing).
export function tradeConfigPath(name, trade = DEFAULT_TRADE) {
  const path = resolve(CONFIG, trade === DEFAULT_TRADE ? `${name}.json` : `${name}.${trade}.json`);
  if (!existsSync(path)) throw new Error(`site.json trade "${trade}" has no config/${name}.${trade}.json`);
  return path;
}

// The image briefs (config/image-briefs*.json) for the site's trade, with site.json siteKind over the file's own and
// site.json imageSubjects (by class) over its subjects (the scenes of the site's own trade).
export async function imageBriefs(root = process.cwd()) {
  const { trade, siteKind, imageSubjects } = await siteTrade(root);
  const briefs = await readJson(tradeConfigPath('image-briefs', trade));
  return { ...briefs, trade, ...(siteKind ? { siteKind } : {}), ...(imageSubjects ? { subjects: { ...briefs.subjects, ...imageSubjects } } : {}) };
}
