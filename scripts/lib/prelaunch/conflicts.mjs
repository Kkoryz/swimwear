// Prelaunch check 6, site-wide conflicts: the place where the site's pages are held to Site Factory's site fact library
// (one set of site facts made at the start, owner 2026-11-17) once that library exists. Only the interface is here:
// site.json prelaunch.conflicts switches it (off by default) and siteFactLibrary names the library file; judge, when
// given, is (facts, pages, built) -> findings [{ level, kind, route, detail }]. No judgment is made here yet.

import { resolve } from 'node:path';
import { readJson } from '../json-io.mjs';

export const CONFLICT_JUDGE = null;

// { status: 'pending' | 'done', findings, notes }.
export async function conflictFindings({ root, site, pages, built, judge = CONFLICT_JUDGE }) {
  const path = site?.siteFactLibrary ? resolve(root, site.siteFactLibrary) : null;
  const facts = path ? await readJson(path, null) : null;
  if (!judge) return { status: 'pending', findings: [], notes: ['the site-wide conflict check waits for Site Factory\'s site fact library (site.json siteFactLibrary) and its judge; nothing is judged yet'] };
  if (!facts) return { status: 'pending', findings: [], notes: [`no site fact library${path ? ` at ${path}` : ' named (site.json siteFactLibrary)'}`] };
  return { status: 'done', findings: await judge(facts, pages, built), notes: [] };
}
