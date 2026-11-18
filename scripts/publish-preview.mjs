#!/usr/bin/env node
// A preview of the built site for people to look at (GitHub Pages under a sub-path): dist copied to <out> (its .git
// kept), root-absolute URLs given the base prefix, every page noindex, robots.txt disallowing all, .nojekyll for the
// _astro folder. Only the verified build is published (lib/verified-build.mjs; owner 2026-11-12: the owner was shown
// a build nobody had reviewed). --unreviewed publishes another one anyway, with a banner on every page saying so.
// Every publish is logged in docs/research/preview-log.json.
// Usage: node scripts/publish-preview.mjs <out> --base /motelpilot [--unreviewed]

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { verifiedNow } from './lib/verified-build.mjs';
import { REFERENCE_PATHS } from './lib/release-guard.mjs';

export const UNREVIEWED_BANNER = '<div data-preview-banner style="position:sticky;top:0;z-index:9999;padding:8px 16px;background:#b42318;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center">未评审预览：这一版还没通过审计和整页评审 / Unreviewed preview</div>';
const TEXT = new Set(['.html', '.css', '.js', '.xml', '.json', '.webmanifest', '.txt']);
const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])))).flat();

// One file's text with root-absolute URLs under prefix (and, for a page, noindex and the banner when given).
export function rewriteForBase(text, ext, prefix, { banner = null } = {}) {
  const fixUrl = (url) => (url.startsWith('/') && !url.startsWith('//') && !url.startsWith(`${prefix}/`) ? `${prefix}${url}` : url);
  let out = text;
  if (ext === '.html') {
    out = out.replace(/\b(href|src|action|poster|data-src|data-href|content)="(\/[^"]*)"/g, (all, name, url) => `${name}="${fixUrl(url)}"`);
    out = out.replace(/\b(srcset|imagesrcset)="([^"]*)"/g, (all, name, list) => `${name}="${list.split(',').map((part) => part.trim().replace(/^(\S+)/, (url) => fixUrl(url))).join(', ')}"`);
    out = out.replace(/<meta name="robots"[^>]*>/g, '').replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
    if (banner) out = out.replace(/<body([^>]*)>/, `<body$1>${banner}`);
  }
  out = out.replace(/url\((['"]?)(\/[^)'"]*)\1\)/g, (all, quote, url) => `url(${quote}${fixUrl(url)}${quote})`);
  if (ext === '.js' || ext === '.html') out = out.replace(/(["'`])\/(_astro|media|fonts|images)\//g, (all, quote, folder) => `${quote}${prefix}/${folder}/`);
  return out;
}

// A build whose audits pass but whose design review has not (owner 2026-11-14, Fable's review audit: a preview needs the
// audits only; the release still needs the review) goes out with no banner (owner 2026-11-18): its open findings are
// written to the preview log and printed, never into the pages.
const findingLine = (finding) => `${finding.severity} ${finding.route ?? ''} ${finding.viewport ?? ''} ${finding.block}: ${finding.issue}`.replace(/\s+/g, ' ');

export async function publishPreview({ root = process.cwd(), out, base, unreviewed = false, at = new Date().toISOString() }) {
  const { current, problems, record } = await verifiedNow(root);
  // A preview needs the audits passed; the design review's open findings only go to the log.
  const audited = !problems.some((problem) => problem.code === 'layout_audit_not_passed');
  if (!audited && !unreviewed) throw new Error(`not publishing a build whose audits have not passed (--unreviewed to publish it with a banner saying so):\n${problems.map((problem) => `- ${problem.code}: ${problem.detail}`).join('\n')}`);
  const open = current || !audited ? [] : ((await readJson(resolve(root, 'docs/research/design-review.json'), null))?.findings ?? []).filter((finding) => finding.severity !== 'P2' && (finding.scope ?? 'site') === 'site' && !finding.resolution);
  const prefix = base.replace(/\/$/, '');
  const target = resolve(out);
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(target)) if (entry !== '.git') await rm(resolve(target, entry), { recursive: true, force: true });
  await cp(resolve(root, 'dist'), target, { recursive: true });
  // The competitor's files never go out, used by a page or not (a development build keeps media/reference/).
  for (const path of REFERENCE_PATHS) await rm(resolve(target, path), { recursive: true, force: true });
  const banner = audited ? null : UNREVIEWED_BANNER;
  for (const file of await walk(target)) {
    if (file.includes(`${join(target, '.git')}`) || !TEXT.has(extname(file))) continue;
    const text = await readFile(file, 'utf8');
    const next = rewriteForBase(text, extname(file), prefix, { banner });
    if (next !== text) await writeFile(file, next);
  }
  await writeFile(resolve(target, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await writeFile(resolve(target, '.nojekyll'), '');
  const logPath = resolve(root, 'docs/research/preview-log.json');
  const log = await readJson(logPath, { schemaVersion: 'seo-site-preview-log-v1', entries: [] });
  const entry = { at, out: target.replaceAll('\\', '/'), base: prefix, verified: current, audited, ...(audited && !current ? { openFindings: open.length, findings: open.map(findingLine) } : {}), ...(current ? { verifiedAt: record.at, auditedOnly: record.auditedOnly } : { problems: problems.map((problem) => problem.code) }) };
  log.entries.push(entry);
  await writeJson(logPath, log);
  return entry;
}

runMain(import.meta.url, async () => {
  const { values, positionals: [out] } = cliArgs({ base: { type: 'string' }, unreviewed: { type: 'boolean' } });
  if (!out || !values.base) return usage('Usage: node scripts/publish-preview.mjs <out> --base /<sub-path> [--unreviewed]');
  const entry = await publishPreview({ out, base: values.base, unreviewed: values.unreviewed === true });
  console.log(`${entry.verified ? 'verified' : entry.audited ? `audited (${entry.openFindings} design finding(s) open)` : 'UNREVIEWED'} preview in ${entry.out} under ${entry.base}/${entry.verified && entry.auditedOnly.length ? ` (${entry.auditedOnly.length} page(s) audited only, not reviewed)` : ''}`);
  for (const line of entry.findings ?? []) console.log(`- ${line}`);
});
