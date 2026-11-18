// The claude-seo full audit of a release build, the pipeline's only model audit (owner 2026-11-17: "在站点完成之后默认加一次
// claude seo全盘审计然后手改并且做流程修复", and "08 现在发布前已经有一道盲审式的模型审计，是不是可以去掉了 有claude seo就行了": it
// replaces the earlier blind audit, lib/llm-audit.mjs, whose checks claude-seo's lists lack are carried into its
// instructions, config/agent-steps/claude-seo-audit.md). The model is Strandmill's hand-run audit of 2026-11-17
// (docs/research/seo-audit-3/, score 79): claude-seo's seo-audit method (MIT, AgriciDaniel/claude-seo:
// skills/seo-audit/SKILL.md and nine agents/seo-*.md checklists, copied into the audit folder, never installed or run),
// the release build and the generated Nginx config copied into the audit folder, code's measurements with Playwright,
// every Google-based conclusion checked in the local Google rules library.
// This module: the audit folders (docs/research/seo-audit-N, N counting up; a bare seo-audit is 1), the key that says
// whether the release build, the server config or the instructions changed since the last audit, the issue list
// (findings.json, its schema config/claude-seo-findings.schema.json; findings_sf.json, Site Factory's items), the two
// checks a critical or high item passes before it holds the launch (code: its location is in the release build; a
// second model run, claude-seo-verify.md, confirms it), and the report and the action plan written from the reply.
// The launch gate never reads the score (claude-seo seo-content: scores are heuristics).
// Several independent auditors (owner 2026-11-17: "可以 而且可以并行不是吗"; config/claude-seo-auditors.json): one set of
// measurements, three replies at once, merged here into one issue list (each item's reported_by names who reported
// it), the scores their median; the two checks then run once, on the merged items.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './json-io.mjs';

export const AUDIT_SCHEMA = 'seo-site-claude-seo-audit-v1';
export const FINDINGS_SCHEMA = 'seo-site-claude-seo-findings-v1';
export const CHECK_SCHEMA = 'seo-site-claude-seo-check-v1';
export const FINDINGS_SCHEMA_FILE = fileURLToPath(new URL('../../config/claude-seo-findings.schema.json', import.meta.url));
// Where the audits go: docs/research/seo-audit-N (owner 2026-11-17: the hand-run audits were seo-audit, seo-audit-2
// and seo-audit-3); each audit keeps its folder, so the history is the folders.
export const AUDIT_PARENT = 'docs/research';
export const AUDIT_PREFIX = 'seo-audit';
export const FILES = Object.freeze({ findings: 'findings.json', findingsSf: 'findings_sf.json', check: 'findings-check.json', recheck: 'findings-recheck.json', merge: 'findings-merge.json', data: 'audit-data.json', report: 'FULL-AUDIT-REPORT.md', plan: 'ACTION-PLAN.md', pending: '.audit-pending' });
export const RECHECK_SCHEMA = 'seo-site-claude-seo-recheck-v1';
export const MERGE_SCHEMA = 'seo-site-claude-seo-merge-v1';
// The auditors (owner 2026-11-17: "可以 而且可以并行不是吗"): who they are and the Claude model each runs on.
export const AUDITORS_FILE = fileURLToPath(new URL('../../config/claude-seo-auditors.json', import.meta.url));
// Two auditors' findings are one problem when, on the same page, their locations share at least this many characters
// running (or the shorter location lies whole in the other) and their problems are alike (below). Measured on site13's
// two audits of 2026-11-17 (hand-run seo-audit-3 against the pipeline's seo-audit-4, 110 pairs on the same page): the
// same problem quoted the same passage (title, mail address, around the clock); different problems on one passage
// (the home H1) shared it too, so the location alone never merges.
export const SEO_AUDIT_MERGE_LOCATION_CHARS = 20;
// ... and their problems' character pairs (Dice coefficient of letter and digit bigrams, Chinese and English alike) at
// least this alike. Same measurement: the same problem in other words scored 0.35 and 0.46; different problems on one
// shared location 0.01 to 0.23. When unsure the two are kept apart (owner 2026-11-17: 拿不准的不合并).
export const SEO_AUDIT_MERGE_PROBLEM_SIMILARITY = 0.3;
export const WAIVERS_PATH = 'docs/research/audit-waivers.json';
// claude-seo seo-audit's scoring weights (percent): the health score.
export const WEIGHTED = Object.freeze({ 'Technical SEO': 22, 'Content Quality': 23, 'On-Page SEO': 20, 'Schema / Structured Data': 10, 'Performance (CWV)': 10, 'AI Search Readiness': 10, Images: 5 });
// The nine checklists the audit works through (owner 2026-11-17), each scored in the report's second table.
export const CHECKLISTS = Object.freeze(['seo-technical', 'seo-content', 'seo-schema', 'seo-sitemap', 'seo-geo', 'seo-agentic', 'seo-sxo', 'seo-performance', 'seo-visual']);
// The report's sections, in order (Strandmill's report, 2.1 to 2.11), with the owner's names for them.
export const SECTIONS = Object.freeze({ technical: '技术 SEO', content: '内容质量 / E-E-A-T', 'on-page': '页面要素 On-Page', schema: '结构化数据', sitemap: '站点地图 / 架构', geo: 'AI 搜索就绪 GEO', agentic: 'AI 代理访问 Agentic', sxo: '搜索体验 SXO', performance: '性能', images: '图片', visual: '视觉 / 手机' });
export const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
const SEVERITY_WORDS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const OWNERS = Object.freeze(['sf', '08', 'owner']);
export const OWNER_WORDS = Object.freeze({ sf: 'SF content', '08': '08 template', owner: '业主' });
// The launch checklist's group of each owner (lib/launch-checklist.mjs WHO).
export const OWNER_GROUP = Object.freeze({ sf: 'site-factory', '08': 'template', owner: 'owner' });
// What may hold the launch: critical and high items both checks confirm (owner 2026-11-17: the gate does not go by the score).
export const BLOCKING = Object.freeze(['critical', 'high']);
// A Google-rules quote: one sentence of the document, at most this many words (owner 2026-11-17: "一句原文（不超过 15 个词）").
export const SEO_AUDIT_QUOTE_WORDS = 15;
// A finding's location: copied from the page, at most this many characters (the earlier audit's evidence rule).
export const SEO_AUDIT_LOCATION_CHARS = 200;
// The local Google rules library (an MCP service on this machine, no credentials; owner 2026-11-17): the current
// Google Search Central rules as of the snapshot. GOOGLE_RULES_URL names another address.
export const GOOGLE_RULES = Object.freeze({ name: 'google-search-current-2026-09-19', snapshot: '2026-09-19', datasetId: '65ca8bacb3d711f1b2b075b972d762ee', url: 'http://127.0.0.1:9382/mcp' });

// Whether the site's certification runs the audit: on unless site.json says llmAudit: false (owner 2026-11-17; the
// switch of the audit it replaced keeps its name and its effect).
export const llmAuditOn = (site) => Boolean(site) && site.llmAudit !== false;

// The auditors of config/claude-seo-auditors.json: [{ id, model }], or an error saying what is wrong with the list.
export async function readAuditors(file = AUDITORS_FILE) {
  const list = (await readJson(file, null))?.auditors;
  if (!Array.isArray(list) || !list.length) throw new Error(`${file} names no auditor`);
  const seen = new Set();
  return list.map((entry) => {
    const id = text(entry?.id);
    const model = text(entry?.model);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) throw new Error(`${file}: auditor id ${JSON.stringify(entry?.id)} is not a unique short id (a1)`);
    if (!model) throw new Error(`${file}: auditor ${id} names no model`);
    seen.add(id);
    return { id, model };
  });
}

// The owner's waivers as the audit is told them: { waivers: [{ text, by?, at? }] } or a plain list of sentences.
export async function readWaivers(root) {
  const data = await readJson(resolve(root, WAIVERS_PATH), null);
  const list = Array.isArray(data) ? data : data?.waivers ?? [];
  return list.map((entry) => (typeof entry === 'string' ? entry : entry?.text)).filter((text) => typeof text === 'string' && text.trim()).map((text) => text.trim());
}

// The audit folders of a site, by number: [{ n, name, path }].
export async function auditDirs(root) {
  const parent = resolve(root, AUDIT_PARENT);
  if (!existsSync(parent)) return [];
  const pattern = new RegExp(`^${AUDIT_PREFIX}(?:-([0-9]+))?$`);
  const dirs = [];
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    const match = entry.isDirectory() ? pattern.exec(entry.name) : null;
    if (match) dirs.push({ n: match[1] ? Number(match[1]) : 1, name: entry.name, path: join(parent, entry.name) });
  }
  return dirs.sort((left, right) => left.n - right.n);
}

// The folder this audit writes: the last one again when an audit of this pipeline started there and did not finish
// (its .audit-pending marker), else the next number. A folder of a hand-run audit is never written over.
export async function nextAuditDir(root) {
  const dirs = await auditDirs(root);
  const last = dirs.at(-1);
  if (last && existsSync(join(last.path, FILES.pending))) return last.name;
  return `${AUDIT_PREFIX}-${(last?.n ?? 0) + 1}`;
}

// The newest finished audit of this pipeline (audit-data.json of this schema, complete), with its issue list, its
// checks and its latest recheck (scripts/claude-seo-recheck.mjs, null before one): { dir, data, findings, check,
// recheck }, or null.
export async function latestAudit(root) {
  for (const dir of (await auditDirs(root)).reverse()) {
    const data = await readJson(join(dir.path, FILES.data), null);
    if (data?.schemaVersion !== AUDIT_SCHEMA || !data.complete) continue;
    const findings = await readJson(join(dir.path, FILES.findings), null);
    const check = await readJson(join(dir.path, FILES.check), null);
    const recheck = await readJson(join(dir.path, FILES.recheck), null);
    if (findings && check) return { dir: `${AUDIT_PARENT}/${dir.name}`, data, findings, check, recheck: recheck?.schemaVersion === RECHECK_SCHEMA && recheck.audit === `${AUDIT_PARENT}/${dir.name}` ? recheck : null };
  }
  return null;
}

// Whether a record ({ release, sources } of an audit or a recheck) is of the build now: the same files and config; or,
// should a build not come out byte for byte the same, the same sources (lib/verified-build.mjs sourceHash) and the same
// server config. now: { release: the current release key, sources }.
export const sameBuild = (record, now) => Boolean(record) && (record.release?.key === now?.release?.key || (Boolean(record.sources) && record.sources === now?.sources && record.release?.server === now?.release?.server));

// The check that stands for the build now (owner 2026-11-18: one audit a site; what is fixed after it is rechecked item
// by item, never audited again): the audit's own when it is of this build, else its recheck of this build, else null.
export function standingCheck(audit, now) {
  if (!audit) return null;
  if (sameBuild({ release: audit.data.release, sources: audit.data.sources }, now)) return { kind: 'audit', check: audit.check };
  if (sameBuild(audit.recheck, now)) return { kind: 'recheck', check: audit.recheck };
  return null;
}

const walk = async (dir) => (existsSync(dir) ? (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])))).flat() : []);
const sha = (parts) => { const hash = createHash('sha256'); for (const part of parts) hash.update(part); return hash.digest('hex').slice(0, 16); };

// What decides whether an audit is still of this release: every file of the build by path and content, and the
// Nginx config generated for it (build-nginx-config.mjs nginxFiles: { server, snippet }). The build names its bundles
// by their content, so an unchanged build has the same files. { dist, server, key }.
export async function releaseKey(distDir, server) {
  const parts = [];
  for (const file of (await walk(distDir)).sort()) parts.push(relative(distDir, file).replaceAll('\\', '/'), '\0', await readFile(file), '\0');
  const dist = sha(parts);
  const served = sha([server?.server ?? 'no server config', '\0', server?.snippet ?? '']);
  return { dist, server: served, key: `${dist}-${served}` };
}

// The key of the release build in dist/ now, with the config build-nginx-config.mjs generates for it (the launch
// preflight's: the audit must be of this build and this config).
export async function currentReleaseKey(root) {
  const { nginxFiles } = await import('../build-nginx-config.mjs');
  return releaseKey(resolve(root, 'dist'), await nginxFiles({ root }));
}

// What decides whether the instructions changed: the filled audit instructions (the site, its pages, the waivers),
// the verification's, and the claude-seo files the audit follows.
export const instructionsKey = (texts) => sha(texts.flatMap((text) => [text, '\0']));

// --- the reply -------------------------------------------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value) => (Array.isArray(value) ? value : []);
const score = (value) => { const number = value === null || value === undefined || value === '' ? NaN : Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null; };

// The audit run's reply as the module keeps it; throws when it is not the shape the step asks for. The findings stay
// as given (validateFindings checks them against the schema).
export function normalizeReply(reply) {
  if (!reply || typeof reply !== 'object') throw new Error('the audit reply holds no JSON object');
  const weighted = list(reply.weighted).map((item) => {
    if (!(item?.name in WEIGHTED)) throw new Error(`unknown weighted category: ${item?.name}`);
    return { name: item.name, score: score(item.score), note: text(item.note) };
  });
  for (const name of Object.keys(WEIGHTED)) if (!weighted.some((item) => item.name === name)) throw new Error(`the reply scores no ${name}`);
  const checklists = list(reply.checklists).map((item) => {
    if (!CHECKLISTS.includes(item?.name)) throw new Error(`unknown checklist: ${item?.name}`);
    return { name: item.name, score: score(item.score), verdict: text(item.verdict) };
  });
  for (const name of CHECKLISTS) if (!checklists.some((item) => item.name === name)) throw new Error(`the reply scores no ${name}`);
  const sections = Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, { what_works: list(reply.sections?.[key]?.what_works).map(text).filter(Boolean), notes: list(reply.sections?.[key]?.notes).map(text).filter(Boolean) }]));
  if (!Array.isArray(reply.findings)) throw new Error('the audit reply has no findings list');
  return {
    business_type: text(reply.business_type),
    method_notes: list(reply.method_notes).map(text).filter(Boolean),
    not_covered: list(reply.not_covered).map(text).filter(Boolean),
    weighted, checklists, sections,
    rule_differences: list(reply.rule_differences).map((item) => ({ topic: text(item?.topic), claude_seo: text(item?.claude_seo), rules_library: text(item?.rules_library), handling: text(item?.handling) })).filter((item) => item.topic),
    top_findings: list(reply.top_findings).map(text).filter(Boolean),
    quick_wins: list(reply.quick_wins).map(text).filter(Boolean),
    findings: reply.findings,
  };
}

// The health score: the weighted categories as claude-seo weights them, over the ones scored.
export function healthScore(weighted) {
  const scored = weighted.filter((item) => item.score !== null);
  const weight = scored.reduce((sum, item) => sum + WEIGHTED[item.name], 0);
  return weight ? Math.round(scored.reduce((sum, item) => sum + item.score * WEIGHTED[item.name], 0) / weight) : null;
}

// --- the issue list --------------------------------------------------------------------------------------------------

// findings.json (or, with only, one owner's items: findings_sf.json).
export const findingsDoc = ({ audit, site = '', date, findings, only = null }) => ({ schemaVersion: FINDINGS_SCHEMA, audit, ...(site ? { site } : {}), ...(date ? { date } : {}), ...(only ? { only } : {}), findings: only ? findings.filter((item) => item.owner === only) : findings });

const words = (value) => value.trim().split(/\s+/).filter(Boolean).length;
let compiled = null;
// What is wrong with an issue list (empty when nothing): the schema, then ids unique, quotes short, locations short,
// a one-owner list holding that owner's items only.
export async function validateFindings(doc) {
  if (!compiled) {
    const { default: Ajv2020 } = await import('ajv/dist/2020.js');
    compiled = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(await readFile(FINDINGS_SCHEMA_FILE, 'utf8')));
  }
  if (!compiled(doc)) return compiled.errors.map((error) => `${error.instancePath || '/'} ${error.message}${error.params?.allowedValues ? ` (${error.params.allowedValues.join(', ')})` : ''}`);
  const errors = [];
  const seen = new Set();
  for (const item of doc.findings) {
    if (seen.has(item.id)) errors.push(`${item.id}: the id is used twice`);
    seen.add(item.id);
    if (item.evidence.kind === 'google-rules' && words(item.evidence.quote) > SEO_AUDIT_QUOTE_WORDS) errors.push(`${item.id}: the Google rules quote has ${words(item.evidence.quote)} words (at most ${SEO_AUDIT_QUOTE_WORDS})`);
    if (item.location.length > SEO_AUDIT_LOCATION_CHARS) errors.push(`${item.id}: the location has ${item.location.length} characters (at most ${SEO_AUDIT_LOCATION_CHARS})`);
    if (doc.only && item.owner !== doc.only) errors.push(`${item.id}: owner ${item.owner} in a list of ${doc.only} items`);
  }
  return errors;
}

// --- the auditors' replies merged ------------------------------------------------------------------------------------

// The page a finding's url names, as two auditors' urls are compared: no origin, no query or fragment, a route with
// its closing slash (/about-us and /about-us/ are one page); server/<file> as it is.
export function findingRoute(url) {
  const value = text(url).replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (!value.startsWith('/') || value.endsWith('/') || /\.[a-z0-9]+$/i.test(value)) return value || '/';
  return `${value}/`;
}

const longestCommon = (left, right) => {
  let best = 0;
  let previous = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    const row = new Array(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) if (left[i - 1] === right[j - 1]) { row[j] = previous[j - 1] + 1; if (row[j] > best) best = row[j]; }
    previous = row;
  }
  return best;
};

// Whether two locations quote the same passage: the shorter lies whole in the other, or they share at least
// SEO_AUDIT_MERGE_LOCATION_CHARS characters running (as locationIn reads them: entities, quotes and spaces alike).
export function locationsOverlap(left, right) {
  const [short, long] = [searchable(left), searchable(right)].sort((a, b) => a.length - b.length);
  if (!short) return false;
  if (long.includes(short)) return true;
  return short.length >= SEO_AUDIT_MERGE_LOCATION_CHARS && longestCommon(short, long) >= SEO_AUDIT_MERGE_LOCATION_CHARS;
}

const bigrams = (value) => {
  const letters = String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const grams = new Set();
  for (let index = 0; index < letters.length - 1; index += 1) grams.add(letters.slice(index, index + 2));
  return grams;
};
// How alike two problems are: the Dice coefficient of their letter and digit bigrams (0 to 1).
export function problemSimilarity(left, right) {
  const [a, b] = [bigrams(left), bigrams(right)];
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

// Whether two auditors' findings are one problem: the same page, the same passage, a problem alike; the similarity
// when they are, else null. Anything less stays two findings (owner 2026-11-17: 拿不准的不合并).
export function sameFinding(left, right) {
  if (findingRoute(left.url) !== findingRoute(right.url)) return null;
  if (!locationsOverlap(left.location, right.location)) return null;
  const similarity = problemSimilarity(left.problem, right.problem);
  return similarity >= SEO_AUDIT_MERGE_PROBLEM_SIMILARITY ? similarity : null;
}

const SEVERITY_LETTERS = { critical: 'C', high: 'H', medium: 'M', low: 'L' };
const rank = (severity) => SEVERITIES.indexOf(severity);

// The auditors' findings as one list (runs: [{ auditor, findings }], in the auditors' order). Each finding joins the
// group of an earlier auditor's finding it is the same problem as (sameFinding; the most alike when several are), a
// group holding at most one finding of each auditor; else it starts a group. A group is one item: the text of its most
// severe finding (the earlier auditor's on a tie), the highest severity, every page any of them named, reported_by the
// auditors who reported it; ids are numbered anew (C-1, H-1, M-1, L-1: one auditor's H-1 is not another's), by
// severity, then by how many reported it. { findings, groups: [{ id, severity, reported_by, members: [{ auditor, id,
// severity }] }], locations: { [id]: every member's location } } (code looks for each: lib checkLocations).
export function mergeFindings(runs) {
  const groups = [];
  for (const { auditor, findings } of runs) {
    for (const finding of findings) {
      let best = null;
      for (const group of groups) {
        if (group.members.some((member) => member.auditor === auditor)) continue;
        const score = Math.max(...group.members.map((member) => sameFinding(member.finding, finding) ?? -1));
        if (score >= 0 && (!best || score > best.score)) best = { group, score };
      }
      if (best) best.group.members.push({ auditor, finding });
      else groups.push({ order: groups.length, members: [{ auditor, finding }] });
    }
  }
  const auditors = runs.map((run) => run.auditor);
  const items = groups.map((group) => {
    const lead = [...group.members].sort((a, b) => rank(a.finding.severity) - rank(b.finding.severity) || auditors.indexOf(a.auditor) - auditors.indexOf(b.auditor))[0].finding;
    const url = lead.url;
    const pages = [...new Set(group.members.flatMap((member) => member.finding.pages ?? []))].filter((page) => findingRoute(page) !== findingRoute(url));
    const reportedBy = auditors.filter((auditor) => group.members.some((member) => member.auditor === auditor));
    const { reported_by: _, pages: __, ...rest } = lead;
    return { group, finding: { ...rest, ...(pages.length ? { pages } : {}), reported_by: reportedBy } };
  });
  items.sort((a, b) => rank(a.finding.severity) - rank(b.finding.severity) || b.finding.reported_by.length - a.finding.reported_by.length || a.group.order - b.group.order);
  const counters = {};
  const locations = {};
  const findings = [];
  const merged = [];
  for (const { group, finding } of items) {
    counters[finding.severity] = (counters[finding.severity] ?? 0) + 1;
    const id = `${SEVERITY_LETTERS[finding.severity]}-${counters[finding.severity]}`;
    findings.push({ ...finding, id });
    locations[id] = [...new Set([finding.location, ...group.members.map((member) => member.finding.location)])];
    merged.push({ id, severity: finding.severity, reported_by: finding.reported_by, members: group.members.map((member) => ({ auditor: member.auditor, id: member.finding.id, severity: member.finding.severity })) });
  }
  return { findings, groups: merged, locations };
}

// The middle of a list of numbers (of two, their mean), rounded; null when there are none.
export function median(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

const unique = (items) => [...new Set(items)];
// The finished auditors' replies as one reply for the report (runs: [{ id, reply }], in the auditors' order): each
// category and checklist with every auditor's score and their median, the lists of all of them (the same sentence
// once), the top findings and quick wins by auditor (they name that auditor's own ids; findings-merge.json maps them).
export function combineReplies(runs, findings) {
  const [first] = runs;
  const tagged = (key) => runs.flatMap((run) => run.reply[key].map((item) => `${run.id}：${item}`));
  return {
    business_type: first.reply.business_type,
    method_notes: unique(runs.flatMap((run) => run.reply.method_notes)),
    not_covered: unique(runs.flatMap((run) => run.reply.not_covered)),
    weighted: Object.keys(WEIGHTED).map((name) => {
      const scores = Object.fromEntries(runs.map((run) => [run.id, run.reply.weighted.find((item) => item.name === name)?.score ?? null]));
      return { name, score: median(Object.values(scores)), scores, note: first.reply.weighted.find((item) => item.name === name)?.note ?? '' };
    }),
    checklists: CHECKLISTS.map((name) => {
      const own = runs.map((run) => [run.id, run.reply.checklists.find((item) => item.name === name)]);
      const scores = Object.fromEntries(own.map(([id, item]) => [id, item?.score ?? null]));
      return { name, score: median(Object.values(scores)), scores, verdict: own.filter(([, item]) => item?.verdict).map(([id, item]) => (runs.length > 1 ? `${id}：${item.verdict}` : item.verdict)).join('；') };
    }),
    sections: Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, { what_works: unique(runs.flatMap((run) => run.reply.sections[key].what_works)), notes: unique(runs.flatMap((run) => run.reply.sections[key].notes)) }])),
    rule_differences: runs.flatMap((run) => run.reply.rule_differences).filter((item, index, all) => all.findIndex((other) => other.topic === item.topic && other.rules_library === item.rules_library) === index),
    top_findings: runs.length > 1 ? tagged('top_findings') : first.reply.top_findings,
    quick_wins: runs.length > 1 ? tagged('quick_wins') : first.reply.quick_wins,
    findings,
  };
}

// findings-merge.json: who audited, who finished, and which of each auditor's findings each merged item is.
export const mergeRecord = ({ auditors, groups }) => ({
  schemaVersion: MERGE_SCHEMA,
  rule: `one item for findings of different auditors on the same page whose locations share at least ${SEO_AUDIT_MERGE_LOCATION_CHARS} characters running (or the shorter lies whole in the other) and whose problems are at least ${SEO_AUDIT_MERGE_PROBLEM_SIMILARITY} alike (bigram Dice); anything less stays apart; the highest severity stands, each auditor's is kept here`,
  auditors, items: groups,
});

// --- code's check: the location is in the release build ----------------------------------------------------------

// The file a finding's url names inside the audit folder: a route of the release build (dist-release/), or a file of
// the server config (server/); null for anything outside them.
export function findingFile(auditDir, url) {
  const value = text(url).replace(/^https?:\/\/[^/]+/i, '');
  const inside = (base, rest) => { const root = resolve(auditDir, base); const path = resolve(root, rest); return path.startsWith(`${root}${sep}`) ? path : null; };
  if (value.startsWith('server/')) return inside('server', value.slice('server/'.length));
  if (!value.startsWith('/')) return null;
  const path = value.split(/[?#]/)[0];
  if (path === '/') return inside('dist-release', 'index.html');
  if (path.endsWith('/')) return inside('dist-release', `${path.slice(1)}index.html`);
  if (/\.[a-z0-9]+$/i.test(path)) return inside('dist-release', path.slice(1));
  return inside('dist-release', `${path.slice(1)}/index.html`);
}

// Text as a location is looked for in it: entities decoded, curly quotes straight, white space collapsed, lower case.
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
export const searchable = (value) => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&([a-z]+);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();
const withoutTags = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');

// Whether a location is in a file's content: as markup, or as the page's text; fragments between an ellipsis
// (... or the ellipsis character) each found, in order.
export function locationIn(content, location) {
  const fragments = searchable(location).split(/\s*(?:…|\.\.\.)\s*/).map((part) => part.replace(/^["'`]+|["'`]+$/g, '').trim()).filter(Boolean);
  if (!fragments.length) return false;
  return [searchable(content), searchable(withoutTags(content))].some((body) => {
    let at = 0;
    for (const fragment of fragments) {
      const found = body.indexOf(fragment, at);
      if (found < 0) return false;
      at = found + fragment.length;
    }
    return true;
  });
}

// Code's half of the check, for every critical and high item: its location in the file its url names, or in one of
// its other pages. A merged item (mergeFindings) is looked for by each of its auditors' locations (locations[id]):
// one found is enough, and it is the location the item then shows (withFoundLocations). { [id]: { found, file,
// location? } }, location only when another auditor's was the one found.
export async function checkLocations(auditDir, findings, read = (path) => readFile(path, 'utf8'), locations = {}) {
  const cache = new Map();
  const content = async (path) => {
    if (!cache.has(path)) cache.set(path, path && existsSync(path) ? await read(path) : null);
    return cache.get(path);
  };
  const result = {};
  for (const item of findings.filter((finding) => BLOCKING.includes(finding.severity))) {
    result[item.id] = { found: false, file: null };
    search: for (const location of unique([item.location, ...(locations[item.id] ?? [])])) {
      for (const url of [item.url, ...(item.pages ?? [])]) {
        const path = findingFile(auditDir, url);
        const body = path ? await content(path) : null;
        if (body !== null && locationIn(body, location)) { result[item.id] = { found: true, file: relative(auditDir, path).replaceAll('\\', '/'), ...(location !== item.location ? { location } : {}) }; break search; }
      }
    }
  }
  return result;
}

// The issue list with each item showing the location code found (another auditor's, where its own was not).
export const withFoundLocations = (findings, located) => findings.map((item) => (located[item.id]?.location ? { ...item, location: located[item.id].location } : item));

// What the verification run is given: only the critical and high items code found, as they are (no score, no other item).
export const verifyItems = (findings, located) => findings.filter((item) => located[item.id]?.found);

// The check record (findings-check.json): for each critical and high item, code's result and the verifier's verdict.
// confirmed (or wrong_owner, confirmed with its owner corrected) stands; anything else, or no verdict, does not.
export function checkRecord(findings, located, reply) {
  const verdicts = new Map(list(reply?.verdicts).map((verdict) => [verdict?.id, verdict]));
  const items = findings.filter((item) => BLOCKING.includes(item.severity)).map((item) => {
    const where = located[item.id] ?? { found: false, file: null };
    if (!where.found) return { id: item.id, severity: item.severity, located: false, file: null, verdict: null, stands: false, note: 'void: its location is not in the release build (code check)' };
    const verdict = verdicts.get(item.id);
    const stands = verdict?.verdict === 'confirmed' || verdict?.verdict === 'wrong_owner';
    const owner = verdict?.verdict === 'wrong_owner' && OWNERS.includes(verdict.owner) && verdict.owner !== item.owner ? verdict.owner : null;
    return { id: item.id, severity: item.severity, located: true, file: where.file, verdict: verdict?.verdict ?? null, ...(owner ? { ownerWas: item.owner, owner } : {}), stands, note: text(verdict?.note) || (verdict ? verdict.verdict : 'no verdict') };
  });
  return { schemaVersion: CHECK_SCHEMA, rule: 'a critical or high item holds the launch when its location is in the release build and the verification confirms it; the score never holds', items, holds: items.filter((item) => item.stands).map((item) => item.id) };
}

// The issue list with the owners the verification corrected.
export const withCorrectedOwners = (findings, check) => {
  const corrected = new Map(check.items.filter((item) => item.owner).map((item) => [item.id, item.owner]));
  return findings.map((item) => (corrected.has(item.id) ? { ...item, owner: corrected.get(item.id) } : item));
};

// The items that hold the launch: { findings, check } of an audit.
export const auditHolds = ({ findings, check }) => {
  const holds = new Set(check?.holds ?? []);
  return (findings?.findings ?? []).filter((item) => holds.has(item.id));
};
// The items that do not: medium and low, and critical and high ones a check did not confirm.
export const auditOpen = ({ findings, check }) => {
  const holds = new Set(check?.holds ?? []);
  return (findings?.findings ?? []).filter((item) => !holds.has(item.id));
};

// --- the report and the action plan ---------------------------------------------------------------------------------

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const statusWords = (entry) => (!entry ? '' : !entry.located ? '作废（位置在发布构建里找不到）' : entry.stands ? `成立，拦截上线${entry.owner ? `（负责人改为 ${OWNER_WORDS[entry.owner]}）` : ''}` : `复核未确认（${entry.note}）`);
const evidenceWords = (evidence) => (evidence.kind === 'google-rules' ? `〔来源：《${evidence.doc}》"${evidence.quote}"〕` : `证据：${evidence.ref}`);

const done = (auditors) => auditors.filter((auditor) => auditor.status === 'done');
// Who reported an item: its auditors, how many of the finished ones, and each one's severity where they differ.
function reporterWords(item, group, finished) {
  if (!item.reported_by?.length) return '';
  const severities = group?.members ?? [];
  const differ = new Set(severities.map((member) => member.severity)).size > 1;
  return `${item.reported_by.join('、')}（${finished} 个完成的审计员中 ${item.reported_by.length} 个报出${differ ? `；各自严重度：${severities.map((member) => `${member.auditor} ${SEVERITY_WORDS[member.severity]}`).join('、')}，取最高` : ''}）`;
}

function findingLines(item, entry, group, finished) {
  return [
    `- **${item.id} ${item.problem}**`,
    `  - 页面：\`${item.url}\`${item.pages?.length ? `；另见 ${item.pages.map((page) => `\`${page}\``).join('、')}` : ''}`,
    `  - 位置：${item.location.includes('`') ? item.location : `\`${item.location}\``}`,
    `  - ${evidenceWords(item.evidence)}`,
    `  - 改法：${item.fix}（${OWNER_WORDS[item.owner]}）`,
    ...(item.check ? [`  - 验证：${item.check}`] : []),
    ...(item.reported_by?.length ? [`  - 报出：${reporterWords(item, group, finished)}`] : []),
    ...(entry ? [`  - 核对：${statusWords(entry)}`] : []),
  ];
}

// FULL-AUDIT-REPORT.md: the method and its limits first, the score by SKILL weights, the nine checklists, then each
// section's findings by severity with their evidence, the rule differences, the top items, the launch holds.
// The auditors (merge: findings-merge.json) are listed with their scores, each category and checklist with every
// finished auditor's score and the median; each finding says who reported it.
export function reportMarkdown({ site, reply, data, findings, check, merge }) {
  const byId = new Map(check.items.map((entry) => [entry.id, entry]));
  const groups = new Map((merge?.items ?? []).map((group) => [group.id, group]));
  const auditors = merge?.auditors ?? [];
  const finished = done(auditors);
  // A column per auditor when more than one finished; one auditor's scores are the scores.
  const ids = finished.length > 1 ? finished.map((auditor) => auditor.id) : [];
  const auditorWords = (auditor) => `${auditor.id}（${auditor.model}）${auditor.status === 'done' ? `完成，总分 ${auditor.health_score ?? '未评'}` : `未完成：${cell(auditor.detail)}`}`;
  const lines = [
    `# ${site.siteName || site.host}（${site.host}）上线前全站 SEO 审计报告`, '',
    '## 审计概况', '',
    '| 项目 | 内容 |', '|---|---|',
    `| 审计日期 | ${data.date} |`,
    `| 审计对象 | ${cell(reply.business_type || site.business)} |`,
    `| 审计范围 | 发布构建 \`dist-release/\`：${data.scope.pages} 个 HTML 页面（另有 \`404.html\`）；服务器配置 ${data.scope.server.map((file) => `\`server/${file}\``).join('、') || '无（站点没有 origin）'} |`,
    `| 方法 | 按 claude-seo \`method/SKILL.md\`（seo-audit）流程，逐项对照 9 份清单：${CHECKLISTS.join('、')}。claude-seo 未安装、脚本未运行，不调用付费接口 |`,
    `| Google 规则依据 | 本机 Google 现行规则库（数据集 \`${GOOGLE_RULES.name}\`，快照日期 ${GOOGLE_RULES.snapshot}）。凡以 Google 规则为依据的结论都注明文档标题和一句原文；查不到的标"未在现行规则库中找到" |`,
    `| 工具 | 自写 Node 静态服务（目录请求 301 补斜杠，未知路径返回 \`404.html\` 且状态码 404）；站点自己的 Playwright ${data.tools.playwright}（Chromium） |`,
    '| 无 JS 抽取 | 关闭 JavaScript 逐页抽取 title、meta、canonical、robots、OG、标题层级、正文字数、JSON-LD、图片、链接、表单（`measurements/pages/`） |',
    `| 有 JS 渲染 | ${data.tools.focus.length} 个重点页 × 2 视口：桌面 ${data.tools.desktop}；手机 ${data.tools.phone}（\`measurements/site.json\` render，截图在 \`screenshots/\`） |`,
    `| 手机全站检查 | 全部页面在手机视口滚动到底，查横向溢出、脚本错误、失败请求、破图（\`measurements/site.json\` sweep） |`,
    '| 服务器层评估 | 安全头、CSP、压缩、缓存、301、404 一律按 Nginx 配置文件评；本地静态服务做不到的部分不扣分 |',
    ...(auditors.length ? [`| 审计员 | ${auditors.length} 个独立审计员同时开跑：同一份测量、同一份发布构建、同一套清单和权重、同一个规则库，互相看不到对方的结果。${auditors.map(auditorWords).join('；')} |`, `| 完成情况 | ${finished.length === auditors.length ? `${auditors.length} 个审计员全部完成` : `只有 ${finished.length} / ${auditors.length} 个审计员完成，问题清单只合并了完成的那几个`} |`, '| 合并 | 同一页面、位置原文重合、问题描述相近的条目才合并为一条（拿不准的不合并，保留两条）；严重度取最高；分数取各审计员总分的中位数；每条注明由哪几个审计员报出（`findings-merge.json` 记录对应关系和各自的严重度） |'] : []),
    ...reply.method_notes.map((note) => `| 说明 | ${cell(note)} |`),
    '',
    '### 没有覆盖的内容（不猜分）', '',
    ...(reply.not_covered.length ? reply.not_covered.map((item) => `- ${item}`) : ['- （审计没有列出）']), '',
    '### 业务类型判定', '',
    reply.business_type || '（审计没有判定）', '',
    '---', '',
    '## 一、总分', '',
    '### 按 SKILL.md 权重计算', '',
    `| 类别（SKILL 权重表） | 权重 | ${ids.map((id) => `${id} | `).join('')}${ids.length > 1 ? '中位数' : '得分'} | 加权 |`, `|---|---|${ids.map(() => '---|').join('')}---|---|`,
    ...reply.weighted.map((item) => `| ${item.name} | ${WEIGHTED[item.name]}% | ${ids.map((id) => `${item.scores?.[id] ?? '未评'} | `).join('')}${item.score ?? '未评'} | ${item.score === null ? '—' : (item.score * WEIGHTED[item.name] / 100).toFixed(1)} |`),
    `| **SEO Health Score 总分** | 100% | ${finished.filter((auditor) => ids.includes(auditor.id)).map((auditor) => `${auditor.health_score ?? '未评'} | `).join('')}— | **${data.summary.health_score ?? '未评'} / 100** |`, '',
    ...(ids.length > 1 ? ['总分取各审计员总分的中位数（不是各类别中位数再加权）。'] : []),
    '分数只是启发式参考（claude-seo seo-content："scores are heuristics"），上线闸门从不读它。', '',
    '### 按 claude-seo 清单的评分', '',
    `| 清单 | ${ids.map((id) => `${id} | `).join('')}${ids.length > 1 ? '中位数' : '分数'} | 一句话结论 |`, `|---|${ids.map(() => '---|').join('')}---|---|`,
    ...reply.checklists.map((item) => `| ${item.name} | ${ids.map((id) => `${item.scores?.[id] ?? '未评'} | `).join('')}${item.score ?? '未评'} | ${cell(item.verdict)} |`), '',
    '---', '',
    '## 二、各维度发现', '',
    '> 严重度按 SKILL.md：Critical = 阻止索引、导致处罚，或告诉买家虚假、有害的信息；High = 显著影响排名、AI 引用或买家信任（1 周内修）；Medium = 优化机会（1 个月内）；Low = 锦上添花。', '',
  ];
  let number = 0;
  for (const [key, title] of Object.entries(SECTIONS)) {
    const items = findings.filter((item) => (item.section ?? 'technical') === key);
    const { what_works: works, notes } = reply.sections[key];
    if (!items.length && !works.length && !notes.length) continue;
    number += 1;
    lines.push(`### 2.${number} ${title}`, '');
    if (works.length) lines.push('**做得好的地方**', '', ...works.map((item) => `- ${item}`), '');
    for (const severity of SEVERITIES) {
      const group = items.filter((item) => item.severity === severity);
      if (group.length) lines.push(`**${SEVERITY_WORDS[severity]}**`, '', ...group.flatMap((item) => findingLines(item, byId.get(item.id), groups.get(item.id), finished.length)), '');
    }
    if (notes.length) lines.push('**Info**', '', ...notes.map((item) => `- ${item}`), '');
  }
  if (reply.rule_differences.length) {
    lines.push('---', '', '## 三、claude-seo 清单与 Google 现行规则库的差别（以规则库为准）', '', '| 主题 | claude-seo 清单说法 | 规则库原文 | 本报告处理 |', '|---|---|---|---|');
    lines.push(...reply.rule_differences.map((item) => `| ${cell(item.topic)} | ${cell(item.claude_seo)} | ${cell(item.rules_library)} | ${cell(item.handling)} |`), '');
  }
  lines.push('---', '', '## 四、最重要的问题与速赢', '', ...(ids.length ? ['每条前面是提出它的审计员，编号是那位审计员自己的编号（与合并后编号的对应见第六节）。', ''] : []), '**最重要的问题**', '', ...(reply.top_findings.length ? reply.top_findings.map((item, index) => `${index + 1}. ${item}`) : ['- 无']), '', '**速赢**', '', ...(reply.quick_wins.length ? reply.quick_wins.map((item, index) => `${index + 1}. ${item}`) : ['- 无']), '');
  lines.push('---', '', '## 五、上线拦截（代码核对 + 模型复核）', '', '上线闸门不按分数拦。Critical 和 High 的条目先由代码核对它的位置（原句或元素）确实在发布构建里，核对不上的作废；再由第二次模型运行复核；两步都成立的才拦上线。复核对合并后的条目做一次；只被 1 个审计员报出的条目同样走这道关，不因票数少而丢掉。', '');
  const reporters = (id) => findings.find((item) => item.id === id)?.reported_by?.join('、') ?? '';
  lines.push(...(check.items.length ? ['| 编号 | 严重度 | 报出 | 结果 |', '|---|---|---|---|', ...check.items.map((entry) => `| ${entry.id} | ${SEVERITY_WORDS[entry.severity]} | ${reporters(entry.id)} | ${cell(statusWords(entry))} |`)] : ['本次没有 Critical 或 High 条目。']), '');
  if (groups.size) {
    lines.push('---', '', '## 六、各审计员条目与合并后编号', '', `| 合并后编号 | 严重度 | 报出（${finished.length} 个完成） | 各审计员的编号和严重度 |`, '|---|---|---|---|');
    lines.push(...findings.map((item) => `| ${item.id} | ${SEVERITY_WORDS[item.severity]} | ${item.reported_by?.length ?? 0}：${item.reported_by?.join('、') ?? ''} | ${(groups.get(item.id)?.members ?? []).map((member) => `${member.auditor} ${member.id}（${SEVERITY_WORDS[member.severity]}）`).join('、')} |`), '');
  }
  lines.push(`问题清单：\`${data.artifacts.findings}\`（归 SF 的：\`${data.artifacts.findings_sf}\`），核对记录：\`${data.artifacts.check}\`${data.artifacts.merge ? `，合并记录：\`${data.artifacts.merge}\`` : ''}。`);
  return lines.join('\n');
}

// ACTION-PLAN.md: what holds the launch first, then by severity, each with its owner and how to see it fixed.
export function actionPlanMarkdown({ site, data, findings, check }) {
  const byId = new Map(check.items.map((entry) => [entry.id, entry]));
  const holds = new Set(check.holds);
  const row = (item) => `| ${item.id} | ${SEVERITY_WORDS[item.severity]} | ${cell(`${item.problem} 改法：${item.fix}`)} | ${OWNER_WORDS[item.owner]} | ${cell(item.check ?? '')} | ${item.reported_by?.join('、') ?? ''} | ${cell(statusWords(byId.get(item.id)) || '不核对（Medium 及以下）')} |`;
  const table = (items) => (items.length ? ['| 编号 | 严重度 | 事项 | 负责人 | 怎么验证已修好 | 报出 | 核对 |', '|---|---|---|---|---|---|---|', ...items.map(row)] : ['- 无']);
  return [
    `# ${site.siteName || site.host} 上线前修复清单（ACTION PLAN）`, '',
    `- 依据：\`FULL-AUDIT-REPORT.md\`（${data.date}，总分 ${data.summary.health_score ?? '未评'}/100，分数不拦上线）。编号与报告一致。`,
    '- 负责人代号：**业主**（提供事实、证据、决定）、**SF content**（文案与页面内容）、**08 template**（模板、构建、服务器配置、结构化数据、图片）。',
    `- 拦截上线的：${check.holds.length ? check.holds.join('、') : '无'}。`, '',
    '## 阶段 1：拦截上线（核对成立的 Critical 和 High）', '', ...table(findings.filter((item) => holds.has(item.id))), '',
    '## 阶段 2：其余 Critical 和 High（核对未成立，仍建议 1 周内看一遍）', '', ...table(findings.filter((item) => BLOCKING.includes(item.severity) && !holds.has(item.id))), '',
    '## 阶段 3：优化（Medium，1 个月内）', '', ...table(findings.filter((item) => item.severity === 'medium')), '',
    '## 阶段 4：锦上添花（Low）', '', ...table(findings.filter((item) => item.severity === 'low')), '',
  ].join('\n');
}
