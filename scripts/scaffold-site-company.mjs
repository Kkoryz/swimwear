#!/usr/bin/env node

// Writes the company behind the site (src/data/site-company.json, lib/site-company.mjs): its legal name and form,
// address, founding date, service area and profiles, from Site Factory's package (its company block), the identity's
// project.yaml (company, market) and the approved facts, with invented stand-ins for what none of them gives (owner
// 2026-11-17, after the four-site audit 2026-11-17 found the Organization thin and no Service with areaServed). The
// stand-ins are listed in the file's standIns, stated in the structured data and held by the launch preflight; then
// `pnpm proof:signoff` lists them for the owner's sign-off. A value the owner puts in (and takes out of standIns) is kept.
// Usage: node scripts/scaffold-site-company.mjs [--package <authoring_package.json>] [--facts <facts.yaml> ...]
// (by default the Site Factory snapshot's, site.json siteFactory)

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { factsFromFile } from './lib/facts.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { companyFrom } from './lib/site-company.mjs';

// project.yaml (JSON, as the identity's is written, or YAML): the fields the company needs.
export function projectFields(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { /* YAML */ }
  const field = (name) => text.match(new RegExp(`^${name}:\\s*["']?([^"'#\\n]+?)["']?\\s*(?:#.*)?$`, 'm'))?.[1]?.trim();
  const country = text.match(/^market:\s*\{[^}]*\bcountry:\s*["']?(\w+)/m)?.[1] ?? text.match(/^market:\s*\n(?:[ \t]+.*\n)*?[ \t]+country:\s*["']?(\w+)/m)?.[1];
  const extra = Object.fromEntries(['service_area', 'seo_market'].map((name) => [name, field(name)]).filter(([, value]) => value));
  return { site_name: field('site_name'), web_domain: field('web_domain'), category: field('category'), ...(country ? { market: { country } } : {}), ...extra };
}

export async function scaffoldSiteCompany({ root = process.cwd(), packagePath = null, factsPaths = null } = {}) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const snap = site.siteFactory ? resolve(root, site.siteFactory) : null;
  const pack = packagePath ? resolve(packagePath) : snap && resolve(snap, 'authoring_package.json');
  const authoringPackage = pack && existsSync(pack) ? await readJson(pack) : null;
  // The package's own facts (a page fact such as "operating since 2016"), then the fact files over them.
  let facts = factsFromFile('facts.json', JSON.stringify({ facts: authoringPackage?.facts ?? [] }));
  for (const path of factsPaths ?? (snap && existsSync(resolve(snap, 'facts.yaml')) ? [resolve(snap, 'facts.yaml')] : [])) facts = new Map([...facts, ...factsFromFile(path, await readText(resolve(path)))]);
  const projectPath = site.identity ? resolve(root, site.identity, 'project.yaml') : null;
  const project = projectFields(projectPath && existsSync(projectPath) ? await readText(projectPath) : '');
  // The market Site Factory's keywords target, from its project.yaml (the snapshot's manifest names it) when the
  // identity's has none: the company's seoMarket, never its service area (worldwide by default, owner 2026-11-17).
  let market = project.market?.country ?? null;
  if (!market && snap) {
    const upstream = ((await readJson(resolve(snap, 'manifest.json'), null))?.inputs ?? []).find((input) => /project\.ya?ml$/.test(input.path ?? ''))?.path;
    if (upstream && existsSync(upstream)) market = projectFields(await readText(upstream)).market?.country ?? null;
  }
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const target = resolve(root, 'src/data/site-company.json');
  const company = companyFrom({
    given: authoringPackage?.company ?? null,
    project,
    market,
    facts,
    contact: await readJson(resolve(root, 'src/data/site-contact.json'), null),
    siteName: project.site_name || identity?.siteName || basename(resolve(root)),
    domain: project.web_domain || (identity?.origin ? new URL(identity.origin).host : null),
    category: project.category ?? null,
    previous: await readJson(target, null),
  });
  await mkdir(dirname(target), { recursive: true });
  await writeJson(target, company);
  return { path: target, company };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ package: { type: 'string' }, facts: { type: 'string', multiple: true } });
  const { path, company } = await scaffoldSiteCompany({ packagePath: values.package ?? null, factsPaths: values.facts?.length ? values.facts : null });
  console.log(`wrote ${path}${company.standIns.length ? ` (stand-ins: ${company.standIns.join(', ')})` : ''}`);
});
