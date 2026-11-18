#!/usr/bin/env node
// The prelaunch checks (owner 2026-11-18): links, cannibalisation, near-duplicate content, the owner's materials list,
// technical checks and the site-wide conflict check (its interface only), each switched in site.json prelaunch
// (lib/prelaunch/config.mjs): off, "report" (the default: reported, never holds) or "block" (its issues hold the
// release). No model call and no request: the built site (dist) and the site's data only. Each check writes
// docs/research/prelaunch/<check>.json and .md, and summary.json and summary.md gather them; the preflight holds on a
// blocked summary (lib/preflight/release-checks.mjs prelaunch_blocked).
// --launch (or SITE_LAUNCH=1): a build for launch, whose noindex, robots.txt and sitemap are checked too (a preview
// build stays noindex and is not). --root: the site (default the working directory), so a template checkout can check
// a site without syncing its core.
// Exit code 2 when a "block" check has issues (site-run waits for people), else 0; --no-hold writes the same reports
// and exits 0 (site-run's check after the audits: the release step and the preflight are where a release is held).
// Usage: node scripts/prelaunch.mjs [--root <site>] [--launch] [--no-hold]   (pnpm check:prelaunch)

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBuiltPages } from './lib/built-site.mjs';
import { isReleaseBuild } from './lib/blog.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { mainText } from './lib/content-fingerprint.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { cannibalFindings } from './lib/prelaunch/cannibal.mjs';
import { CHECK_IDS, prelaunchModes } from './lib/prelaunch/config.mjs';
import { conflictFindings } from './lib/prelaunch/conflicts.mjs';
import { linkFindings } from './lib/prelaunch/links.mjs';
import { nearFindings, PAGE_NEAR, PARAGRAPH_NEAR } from './lib/prelaunch/near.mjs';
import { ownerListRows } from './lib/prelaunch/owner-list.mjs';
import { checkMarkdown, summaryMarkdown } from './lib/prelaunch/report.mjs';
import { formFindings, launchFindings, phoneFindings, structuredDataFindings } from './lib/prelaunch/tech.mjs';
import { pageSearches, postSearches, sitePath } from './lib/site-keywords.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { latestAudit } from './lib/claude-seo-audit.mjs';

export const PRELAUNCH_SCHEMA = 'seo-site-prelaunch-v1';
export const PRELAUNCH_DIR = 'docs/research/prelaunch';

// Whether the build is one for launch.
export const isLaunch = ({ launch = false, env = process.env } = {}) => launch || env.SITE_LAUNCH === '1';

// A route or file of dist: /a/ is dist/a/index.html, /a.txt dist/a.txt, /a/ also a folder.
const distHas = (root) => (route) => {
  let path;
  try { path = decodeURIComponent(route).replace(/^\/+/, ''); } catch { return false; }
  return path === '' ? existsSync(resolve(root, 'dist/index.html')) : existsSync(resolve(root, 'dist', path, 'index.html')) || existsSync(resolve(root, 'dist', path));
};

// Everything the checks read, once.
export async function prelaunchContext(root, { launch = false } = {}) {
  const data = (path, fallback = null) => readJson(resolve(root, path), fallback);
  const site = await data('site.json', {});
  const pages = await loadSitePages(root, { release: launch || isReleaseBuild() });
  const built = await readBuiltPages(root, pages);
  const identity = await data('src/data/site-identity.json');
  const snapshot = sitePath(root, site.siteFactory);
  const plan = snapshot ? await readJson(resolve(snapshot, 'pages.json'), { pages: [] }) : { pages: [] };
  const sitePlan = snapshot ? await readJson(resolve(snapshot, 'site_plan.json'), {}) : {};
  const urlOf = new Map((plan.pages ?? []).map((row) => [row.page_id, row.url]));
  const navOnly = new Set([...(plan.pages ?? []).filter((row) => row.nav_only && row.url).map((row) => row.url), ...(site.navOnly ?? []).map((id) => urlOf.get(id) ?? sitePlan.routes?.[id]?.url).filter(Boolean)]);
  const unbuilt = new Map((sitePlan.unbuilt_pages ?? []).map((row) => [sitePlan.routes?.[row.id]?.url, `${row.page_name ?? row.id}, ${row.build_reason ?? 'not built'}`]).filter(([url]) => url));
  const host = identity?.origin ? new URL(identity.origin).host : null;
  return {
    root, site, pages, built, identity, launch, navOnly, unbuilt, distHas: distHas(root),
    posts: await data('src/data/blog-posts.json', []),
    form: await data('config/lead-form.json'),
    company: await data('src/data/site-company.json'),
    nginx: host ? await readText(resolve(root, 'deploy/nginx', `${host}.conf`), null) : null,
    headers: host ? await readText(resolve(root, 'deploy/nginx', `${host}-headers.conf`), null) : null,
    robots: await readText(resolve(root, 'dist/robots.txt'), null),
    sitemap: await readText(resolve(root, 'dist/sitemap.xml'), null),
    layoutAudit: await data('docs/research/authoring-layout-audit.json'),
    // The latest claude-seo audit's phone measurements (its CLS), when the site has one.
    seoMeasure: await latestAudit(root).then(async (audit) => (audit ? { dir: audit.dir, render: (await data(`${audit.dir}/measurements/site.json`, {}))?.render ?? [] } : null), () => null),
    signoff: await data('docs/research/release-signoff.json'),
    contact: await data('src/data/site-contact.json'),
    proof: await data('src/data/site-proof.json'),
    imageSlots: await data('docs/research/image-slots.json'),
    imagePlan: await data('docs/research/image-plan.json'),
  };
}

// Each check: (ctx) -> { findings, notes?, status? } (status 'pending' for a check that waits for its inputs).
export const CHECKS = {
  links: (ctx) => ({ findings: linkFindings(ctx), notes: [`nav_only groups: ${[...ctx.navOnly].join(', ') || 'none'}; held-back pages: ${[...ctx.unbuilt.keys()].join(', ') || 'none'}`] }),
  cannibal: async (ctx) => {
    const { source, searches } = await pageSearches(ctx.root);
    const posts = postSearches(ctx.posts);
    return { findings: cannibalFindings([...searches, ...posts]), notes: [source ? `${searches.filter((entry) => entry.role === 'primary').length} page primaries and ${searches.filter((entry) => entry.role === 'secondary').length} secondaries (${source}), ${posts.length} article search(es)` : `no Site Factory keywords (site.json siteFactory): only the ${posts.length} article search(es) are compared`] };
  },
  near: (ctx) => ({ findings: nearFindings(ctx.pages, ctx.built, mainText), notes: [`pages of one pageType compared: a pair ${PAGE_NEAR} alike (MinHash of 5-word shingles) is an issue; paragraphs ${PARAGRAPH_NEAR} alike (shared 5-word shingles) are listed`] }),
  owner_list: (ctx) => ({ findings: ownerListRows(ctx).map((row) => ({ level: 'info', kind: row.category, ...row })), notes: ['a placeholder list: every row reported, none holds the release'] }),
  tech: (ctx) => ({
    findings: [
      ...structuredDataFindings(ctx.pages, ctx.built, { serviceArea: Boolean(ctx.company?.serviceArea?.length) }),
      ...formFindings(ctx.pages, ctx.built, ctx.form, ctx.nginx, { launch: ctx.launch }),
      ...(ctx.launch ? launchFindings(ctx.pages, ctx.built, ctx.identity, { robots: ctx.robots, sitemap: ctx.sitemap, headers: ctx.headers, distHas: ctx.distHas }) : []),
      ...phoneFindings(ctx.layoutAudit, ctx.seoMeasure),
    ],
    notes: [ctx.launch ? 'a launch build: noindex, robots.txt and the sitemap checked' : 'not a launch build (no --launch, SITE_LAUNCH unset): noindex, robots.txt and the sitemap not checked; a preview stays noindex'],
  }),
  conflicts: (ctx) => conflictFindings({ root: ctx.root, site: ctx.site, pages: ctx.pages, built: ctx.built }),
};

export async function prelaunch({ root = process.cwd(), launch = false, env = process.env, now = new Date() } = {}) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const { modes, notes: configNotes } = prelaunchModes(site);
  const ctx = await prelaunchContext(root, { launch: isLaunch({ launch, env }) });
  // Nothing built is nothing checked, not a pass.
  if (![...ctx.built.values()].some(Boolean)) throw new Error(`no page of the site is built in ${resolve(root, 'dist')}: build it first (pnpm build or pnpm build:release)`);
  const dir = resolve(root, PRELAUNCH_DIR);
  await mkdir(dir, { recursive: true });
  const checks = [];
  for (const id of CHECK_IDS) {
    const mode = modes[id];
    const result = mode === 'off' ? { findings: [], notes: [] } : await CHECKS[id](ctx);
    const issues = result.findings.filter((finding) => finding.level === 'issue').length;
    const status = mode === 'off' ? 'off' : result.status === 'pending' ? 'pending' : !issues ? 'passed' : mode === 'block' ? 'blocked' : 'reported';
    const report = { schemaVersion: PRELAUNCH_SCHEMA, check: id, mode, status, checkedAt: now.toISOString(), launch: ctx.launch, issues, info: result.findings.length - issues, notes: [...configNotes.filter((note) => note.startsWith(`${id}:`)), ...(result.notes ?? [])], findings: result.findings };
    await writeJson(resolve(dir, `${id}.json`), report);
    await writeFile(resolve(dir, `${id}.md`), `${checkMarkdown(report)}\n`);
    checks.push(report);
  }
  const status = checks.some((check) => check.status === 'blocked') ? 'blocked' : checks.some((check) => check.status === 'reported') ? 'reported' : 'passed';
  const summary = { schemaVersion: PRELAUNCH_SCHEMA, status, checkedAt: now.toISOString(), launch: ctx.launch, checks: checks.map(({ check, mode, status: state, issues, info }) => ({ check, mode, status: state, issues, info, report: `${PRELAUNCH_DIR}/${check}.md` })) };
  await writeJson(resolve(dir, 'summary.json'), summary);
  await writeFile(resolve(dir, 'summary.md'), `${summaryMarkdown(summary, { site: ctx.identity?.siteName ?? '' })}\n`);
  return summary;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ root: { type: 'string' }, launch: { type: 'boolean' }, 'no-hold': { type: 'boolean' } });
  const summary = await prelaunch({ root: resolve(values.root ?? process.cwd()), launch: values.launch === true });
  console.log(`prelaunch ${summary.status}${summary.launch ? ' (launch build)' : ''}: ${summary.checks.map((check) => `${check.check} ${check.status}${check.issues ? ` ${check.issues}` : ''}`).join(', ')}`);
  if (summary.status === 'blocked') process.exitCode = values['no-hold'] ? 0 : 2;
});
