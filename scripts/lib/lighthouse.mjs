// One Lighthouse run of a live page (four-site audit 2026-11-17, Fable's plan A5 and P-2): the site's own Lighthouse
// (its node_modules; this template does not install it), else nothing and a clear reason. The Agentic Browsing category
// is read as claude-seo reads it (MIT, AgriciDaniel/claude-seo: scripts/lighthouse_agentic.py calculate_fraction,
// skills/seo-agentic/references/lighthouse-agentic-category.md): "X/N passed", never turned into a percentage;
// notApplicable, manual and hidden audits are not counted, informative ones are counted apart. It is a lab category
// "still under development", present from Lighthouse 13.2; an older Lighthouse has none and says so.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const AGENTIC_CATEGORY = 'agentic-browsing';
const PASS_MIN_SCORE = 0.9;

// The Lighthouse CLI of the site (node_modules/lighthouse/cli/index.js), or null.
export function lighthouseCli(root) {
  const cli = resolve(root, 'node_modules/lighthouse/cli/index.js');
  return existsSync(cli) ? cli : null;
}

// The Agentic Browsing fraction of a Lighthouse result: { available, passed, counted, informative, display } (display
// "X/N"), or { available: false } when the result has no such category.
export function agenticFraction(lhr) {
  const category = lhr?.categories?.[AGENTIC_CATEGORY];
  if (!category) return { available: false };
  const audits = lhr.audits ?? {};
  let passed = 0;
  let counted = 0;
  let informative = 0;
  for (const ref of category.auditRefs ?? []) {
    const audit = audits[ref.id];
    const mode = audit?.scoreDisplayMode;
    if (!audit || ref.group === 'hidden' || mode === 'manual' || mode === 'notApplicable') continue;
    if (mode === 'informative') { informative += 1; continue; }
    counted += 1;
    if (mode !== 'error' && typeof audit.score === 'number' && audit.score >= PASS_MIN_SCORE) passed += 1;
  }
  return { available: true, passed, counted, informative, display: `${passed}/${counted}` };
}

// What a run keeps: the version, each category's score (0-100; the agentic one as its fraction), the lab metrics.
export function lighthouseSummary(lhr) {
  const categories = Object.fromEntries(Object.entries(lhr?.categories ?? {}).filter(([id]) => id !== AGENTIC_CATEGORY).map(([id, category]) => [id, typeof category.score === 'number' ? Math.round(category.score * 100) : null]));
  const metric = (id) => lhr?.audits?.[id]?.numericValue ?? null;
  return {
    version: lhr?.lighthouseVersion ?? null,
    url: lhr?.finalDisplayedUrl ?? lhr?.finalUrl ?? lhr?.requestedUrl ?? null,
    formFactor: lhr?.configSettings?.formFactor ?? null,
    categories,
    agentic: agenticFraction(lhr),
    lab: { lcpMs: metric('largest-contentful-paint'), cls: metric('cumulative-layout-shift'), tbtMs: metric('total-blocking-time') },
  };
}

// Runs the site's Lighthouse on url (mobile, the default) into outPath; { skipped } without one, { failed } when it
// fails, else the summary. From 13.2 the four usual categories and agentic-browsing are asked for; an older version
// runs its defaults and the summary says it has no Agentic Browsing category.
export async function runLighthouse({ root, url, outPath, spawnRun = spawnNode, timeoutMs = 5 * 60 * 1000 }) {
  const cli = lighthouseCli(root);
  if (!cli) return { skipped: 'no Lighthouse in the site\'s node_modules (pnpm add -D lighthouse in the site to run it; it needs Chrome)' };
  const version = JSON.parse(await readFile(resolve(dirname(dirname(cli)), 'package.json'), 'utf8')).version;
  const [major, minor] = String(version).split('.').map(Number);
  const agentic = major > 13 || (major === 13 && minor >= 2);
  await mkdir(dirname(outPath), { recursive: true });
  const args = [cli, url, '--output=json', `--output-path=${outPath}`, '--quiet', '--chrome-flags=--headless=new', ...(agentic ? [`--only-categories=performance,accessibility,best-practices,seo,${AGENTIC_CATEGORY}`] : [])];
  const result = await spawnRun(args, timeoutMs);
  if (result.code !== 0 || !existsSync(outPath)) return { failed: `Lighthouse ${version} exited ${result.code}: ${result.stderr.slice(-400)}` };
  const summary = lighthouseSummary(JSON.parse(await readFile(outPath, 'utf8')));
  return { ...summary, ...(agentic ? {} : { agenticNote: `Lighthouse ${version} has no Agentic Browsing category (13.2 or later)` }) };
}

function spawnNode(args, timeoutMs) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, stderr }); });
    child.on('error', (error) => { clearTimeout(timer); done({ code: 1, stderr: error.message }); });
  });
}
