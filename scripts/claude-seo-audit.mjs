#!/usr/bin/env node

// The claude-seo full audit of the release build in dist/, the pipeline's only model audit (lib/claude-seo-audit.mjs;
// owner 2026-11-17: "在站点完成之后默认加一次claude seo全盘审计然后手改并且做流程修复", and it replaces the blind
// llm-audit: "有claude seo就行了"). In order:
// 1. the key of this release build and its Nginx config, and of the instructions (with the auditors and their
//    models): all three as the last finished audit had them, the audit is not run again (it says which folder stands);
// 2. the audit folder (docs/research/seo-audit-N): the release build copied to dist-release/, the generated Nginx
//    config to server/, claude-seo's SKILL and nine checklists to method/;
// 3. code's measurements (lib/claude-seo-measure.mjs): measurements/ and screenshots/, once; its browser and its
//    static server are closed before any auditor starts;
// 4. the auditors of config/claude-seo-auditors.json, all at once (owner 2026-11-17: "可以 而且可以并行不是吗"), each
//    through the site's judge (lib/judge-exec.mjs) on its own model, with the read tools and curl to the local Google
//    rules library; they share the folder and read files only, none sees another's reply; one that fails or times out
//    is left out, and with none finished the step waits or fails as one audit did;
// 5. each reply checked against the schema, the replies merged (lib/claude-seo-audit.mjs mergeFindings: reported_by,
//    the highest severity, the median score); each merged critical and high item's location looked for in the release
//    build (code), then one verification run (config/agent-steps/claude-seo-verify.md) on those found;
// 6. findings.json, findings_sf.json, findings-check.json, findings-merge.json, audit-data.json, FULL-AUDIT-REPORT.md,
//    ACTION-PLAN.md.
// The launch preflight holds on the items both checks confirm (claude_seo_audit_blocking), never on the score. On in
// certification runs (site-run's claude-seo-audit step) unless site.json says llmAudit: false; never in iteration
// mode. Exits 2 when it must wait (the judge cannot be asked now, the rules library does not answer or does not start).
// Usage: node scripts/claude-seo-audit.mjs   (after pnpm build:release)

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nginxFiles } from './build-nginx-config.mjs';
import { AGENT_TIMEOUT_MS, fillPrompt, replyJson } from './lib/agent-step.mjs';
import { runClaude, spawnClaude } from './lib/claude-exec.mjs';
import { runMain } from './lib/cli.mjs';
import { JUDGE_MODEL as CODEX_JUDGE_MODEL, usageLimit } from './lib/codex-exec.mjs';
import { agentFor, runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { closeRulesLibrary, openRulesLibrary } from './lib/rules-library.mjs';
import { ownConfigFiles, serverResponses } from './lib/nginx-config.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { distFile } from './lib/built-site.mjs';
import { sourceHash } from './lib/verified-build.mjs';
import { focusPages, measureSite } from './lib/claude-seo-measure.mjs';
import { RECHECK_SCHEMA, standingCheck } from './lib/claude-seo-audit.mjs';
import { AUDIT_PARENT, AUDIT_SCHEMA, CHECKLISTS, FILES, GOOGLE_RULES, OWNER_WORDS, WEIGHTED, auditHolds, checkLocations, checkRecord, combineReplies, findingsDoc, healthScore, instructionsKey, latestAudit, llmAuditOn, median, mergeFindings, mergeRecord, nextAuditDir, normalizeReply, readAuditors, readWaivers, releaseKey, reportMarkdown, actionPlanMarkdown, validateFindings, verifyItems, withCorrectedOwners, withFoundLocations } from './lib/claude-seo-audit.mjs';

const prompt = (name) => fileURLToPath(new URL(`../config/agent-steps/${name}.md`, import.meta.url));
export const UNAVAILABLE = 2;
export const rulesUrl = (env = process.env) => env.GOOGLE_RULES_URL || GOOGLE_RULES.url;

// The audit's one tool besides reading: curl to the rules library, as the owner's audit called it. The rule is added
// to the arguments of the site's Claude judge (lib/claude-exec.mjs claudeArgs ends with its allowed tools), so that
// module and every judgment step that runs through it stay as they are. A Codex judge runs read-only and cannot call
// the library; the audit then says so in what it did not cover.
export const rulesTool = (url = rulesUrl()) => `Bash(curl -s -m 60 -X POST ${url}:*)`;
export const withRulesTool = (spawnRun = spawnClaude, url = rulesUrl()) => (run) => spawnRun({ ...run, args: [...run.args, rulesTool(url)] });
export const auditJudge = (options) => runJudge(options, { claude: (claudeOptions) => runClaude({ ...claudeOptions, spawnRun: withRulesTool(), earlierJson: true }) });

// Whether the rules library answers: one retrieval (local and free).
// Whether a retrieval reply holds rules: the MCP container answers with a result while its search backends are down,
// the error in the result's text (aloha 2026-11-18: "[Errno -2] Name or service not known" to every auditor, the probe
// having passed); only chunks of text are the library answering. The body is JSON or one SSE data line.
export function retrievedRules(body) {
  const line = String(body ?? '').split(/\r?\n/).map((text) => text.replace(/^data:\s*/, '')).find((text) => text.trim().startsWith('{'));
  try {
    const text = JSON.parse(line).result?.content?.[0]?.text ?? '';
    const chunks = JSON.parse(text).chunks;
    return Array.isArray(chunks) && chunks.length ? { ok: true } : { ok: false, detail: `no rules retrieved: ${text.slice(0, 160)}` };
  } catch {
    return { ok: false, detail: `no rules retrieved: ${String(body ?? '').slice(0, 160)}` };
  }
}

export async function probeRules(url = rulesUrl()) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ragflow_retrieval', arguments: { question: 'canonical URL', dataset_ids: [GOOGLE_RULES.datasetId], page_size: 1 } } }), signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    return response.ok ? retrievedRules(body) : { ok: false, detail: `${response.status} ${body.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

// The rules library runs only while an audit needs it (owner 2026-11-17: "就是内存得释放"): opened here, at the audit's
// probe, so a reused audit never starts it, and closed by the finally of the command line below. A start that fails
// is the step's wait (UNAVAILABLE), never an audit without the library.
export const openRules = async (url = rulesUrl(), deps) => {
  const opened = await openRulesLibrary({ url, label: 'claude-seo-audit', ready: () => probeRules(url), deps });
  return opened.ok ? probeRules(url) : { ok: false, detail: `it could not be started: ${opened.detail}` };
};

// Where claude-seo is: CLAUDE_SEO_DIR, site.json claudeSeoDir, else claude-seo beside the site's folder (as the judge
// homes are). Its SKILL and the nine checklists, or an error naming what is missing.
export function methodFiles(root, site, env = process.env) {
  const dir = resolve(root, env.CLAUDE_SEO_DIR || site?.claudeSeoDir || '../claude-seo');
  const files = [['SKILL.md', resolve(dir, 'skills/seo-audit/SKILL.md')], ['LICENSE.txt', resolve(dir, 'skills/seo-audit/LICENSE.txt')], ...CHECKLISTS.map((name) => [`agents/${name}.md`, resolve(dir, 'agents', `${name}.md`)])];
  const missing = files.filter(([name, path]) => name !== 'LICENSE.txt' && !existsSync(path)).map(([, path]) => path);
  if (missing.length) throw new Error(`claude-seo is not where the audit looks (${dir}; set CLAUDE_SEO_DIR or site.json claudeSeoDir): missing ${missing.join(', ')}`);
  return { dir, files: files.filter(([, path]) => existsSync(path)) };
}

// One judge run that answers in JSON (model: an auditor's own, else the site's judge model); { code, unavailable,
// stderr, json }.
async function ask({ root, judge, name, values, lastMessage, label, model = null }) {
  await rm(lastMessage, { force: true });
  const result = await judge({ root, prompt: fillPrompt(await readFile(prompt(name), 'utf8'), values), images: [], lastMessage, timeoutMs: AGENT_TIMEOUT_MS, lean: true, judge: true, sandbox: 'read-only', tokenLog: resolve(root, '.pipeline/agent-tokens.jsonl'), label, ...(model ? { model } : {}) });
  const text = existsSync(lastMessage) ? await readFile(lastMessage, 'utf8') : '';
  return { code: result.code, unavailable: result.code !== 0 && usageLimit(result.stderr ?? ''), stderr: result.stderr ?? '', json: result.code === 0 ? replyJson(text) : null };
}

// What the audit run is told ({{name}} values of config/agent-steps/claude-seo-audit.md).
export function auditValues({ site, auditDir, pages, waivers, date, server, focus, url = rulesUrl() }) {
  return {
    siteName: site.siteName || '(unnamed site)',
    origin: site.origin || '(no origin yet)',
    business: site.business || '(not described)',
    date,
    auditDir,
    pages: ['| route | page type | file |', '|---|---|---|', ...pages.map((page) => `| ${page.route} | ${page.pageType} | ${auditDir}/dist-release/${page.file} |`)].join('\n'),
    server: server.length ? [...server.map((file) => `- ${auditDir}/server/${file}`), `- ${auditDir}/server/answers.md (the same config in plain words)`].join('\n') :'- (none: the site has no origin yet, so no Nginx config is generated)',
    focus: focus.map((route) => `- ${route}`).join('\n'),
    waivers: waivers.length ? waivers.map((text) => `- ${text}`).join('\n') : '- (none)',
    weighted: Object.entries(WEIGHTED).map(([name, weight]) => `- ${name} (${weight}%)`).join('\n'),
    checklists: CHECKLISTS.map((name) => `- ${auditDir}/method/agents/${name}.md`).join('\n'),
    rulesName: GOOGLE_RULES.name,
    rulesSnapshot: GOOGLE_RULES.snapshot,
    rulesCommand: `curl -s -m 60 -X POST ${url} -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ragflow_retrieval","arguments":{"question":"<your question in English>","dataset_ids":["${GOOGLE_RULES.datasetId}"],"page_size":3}}}'`,
  };
}

// The verifier is not told how many auditors reported an item: it judges the evidence, not the votes.
const verifyValues = ({ auditDir, items }) => ({ auditDir, findings: JSON.stringify(items.map(({ reported_by: _, ...item }) => item), null, 2) });

// The auditors as this site runs them: config/claude-seo-auditors.json, each on its Claude model, or, on a site whose
// agent is codex, on Codex's judge model (a Codex run takes no model of its own). [{ id, model, claudeModel }].
export async function siteAuditors(root, env = process.env, file) {
  const codex = agentFor(root, env) === 'codex';
  return (await readAuditors(file)).map((auditor) => ({ id: auditor.id, model: codex ? CODEX_JUDGE_MODEL : auditor.model, claudeModel: auditor.model }));
}

// One auditor's run, its reply checked as one audit's was: { id, model, status: 'done', reply, findings,
// health_score } or { id, model, status: 'unavailable' | 'audit' | 'schema', detail }. Its reply is written outside the
// audit folder (staging) while the others still run: they read that folder, and none may see another's reply.
async function runAuditor({ root, judge, auditor, values, staging, auditDir, origin, date }) {
  const base = { id: auditor.id, model: auditor.model };
  const reply = `${auditDir}/audit-reply-${auditor.id}.md`;
  try {
    const asked = await ask({ root, judge, name: 'claude-seo-audit', values, lastMessage: resolve(staging, `audit-reply-${auditor.id}.md`), label: `claude-seo-audit ${auditor.id}`, model: auditor.claudeModel });
    if (asked.code !== 0) return { ...base, status: asked.unavailable ? 'unavailable' : 'audit', detail: asked.stderr.slice(0, 500) || `exit ${asked.code}` };
    if (!asked.json) return { ...base, status: 'audit', detail: `the audit reply holds no JSON (${reply})` };
    const normalized = normalizeReply(asked.json);
    const errors = await validateFindings(findingsDoc({ audit: auditDir, site: origin, date, findings: normalized.findings }));
    if (errors.length) return { ...base, status: 'schema', detail: `the issue list does not match config/claude-seo-findings.schema.json (${reply}): ${errors.slice(0, 20).join('; ')}` };
    return { ...base, status: 'done', reply: normalized, findings: normalized.findings, health_score: healthScore(normalized.weighted) };
  } catch (error) {
    return { ...base, status: 'audit', detail: `${error.message} (${reply})` };
  }
}

// judge: every auditor's (auditJudge: the site's judge with the rules tool, the auditor's model in its options);
// verifyJudge: the verification's (read only); measure, probe, auditorsFile: a test passes its own. Returns { skipped }
// | { reused } | { failed, detail } | { dir, data, holds }.
export async function claudeSeoAudit({ root = process.cwd(), judge = auditJudge, verifyJudge = runJudge, measure = measureSite, probe = openRules, date = new Date().toISOString().slice(0, 10), env = process.env, auditorsFile } = {}) {
  const site = await readJson(resolve(root, 'site.json'), null);
  if (!llmAuditOn(site)) return { skipped: site ? 'site.json llmAudit is false' : 'no site.json' };
  if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('no build in dist/ (run pnpm build:release first)');
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const pages = (await loadSitePages(root, { release: true })).filter((page) => existsSync(distFile(root, page.route))).map((page) => ({ route: page.route, pageType: page.pageType, file: relative(resolve(root, 'dist'), distFile(root, page.route)).replaceAll('\\', '/') }));
  const waivers = await readWaivers(root);
  const method = methodFiles(root, site, env);
  const server = await nginxFiles({ root });
  const serverFiles = server ? ownConfigFiles(server.host) : [];
  const host = identity?.origin ? new URL(identity.origin).host : '';
  const about = { siteName: identity?.siteName ?? '', origin: identity?.origin ?? '', host, business: site.siteKind ?? '' };
  const auditors = await siteAuditors(root, env, auditorsFile);

  // 1. Unchanged since the last finished audit: it stands.
  const release = await releaseKey(resolve(root, 'dist'), server);
  const dirName = await nextAuditDir(root);
  const auditDir = `${AUDIT_PARENT}/${dirName}`;
  const methodTexts = await Promise.all(method.files.map(([, path]) => readFile(path, 'utf8')));
  // The instructions as this run would fill them (the folder's name and the date aside: they change with every audit).
  const keyValues = auditValues({ site: about, auditDir: '{{auditDir}}', pages, waivers, date: '-', server: serverFiles, focus: focusPages(pages).map((page) => page.route) });
  // The auditors count too (owner 2026-11-17): another number of them or another model is another audit.
  const instructions = instructionsKey([fillPrompt(await readFile(prompt('claude-seo-audit'), 'utf8'), keyValues), await readFile(prompt('claude-seo-verify'), 'utf8'), ...methodTexts, JSON.stringify(auditors.map(({ id, model }) => ({ id, model })))]);
  const last = await latestAudit(root);
  // An audit made before its rules were seen retrieved (rules.retrieved) stands for nothing: its auditors may have read
  // no rule (aloha 2026-11-18: all three, the library's backends down behind an answering probe).
  if (last && last.data.release?.key === release.key && last.data.instructions === instructions && last.data.rules?.retrieved === true) return { reused: last };

  // 2. The audit folder.
  const probed = await probe();
  if (!probed.ok) return { failed: 'unavailable', detail: `the Google rules library (${rulesUrl(env)}, ${GOOGLE_RULES.name}) does not answer: ${probed.detail}` };
  const dir = resolve(root, auditDir);
  for (const sub of ['dist-release', 'server', 'method', 'measurements', 'screenshots']) await rm(resolve(dir, sub), { recursive: true, force: true });
  // The replies of an unfinished earlier attempt in this folder go too: an auditor must not read them.
  if (existsSync(dir)) for (const name of await readdir(dir)) if (/^(audit|verify)-reply.*\.md$/.test(name)) await rm(resolve(dir, name), { force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, FILES.pending), `started ${new Date().toISOString()}\n`);
  await cp(resolve(root, 'dist'), resolve(dir, 'dist-release'), { recursive: true });
  if (server) {
    await mkdir(resolve(dir, 'server'), { recursive: true });
    await writeFile(resolve(dir, 'server', serverFiles[0]), server.server);
    await writeFile(resolve(dir, 'server', serverFiles[1]), server.snippet);
    // The same config in plain words (lib/nginx-config.mjs serverResponses; four-site audit 2026-11-17, Fable's plan
    // T5: the blind audit misread what the server answers when it had only the build).
    await writeFile(resolve(dir, 'server', 'answers.md'), `# What the server answers (from the two config files beside this one)\n\n${serverResponses(server).join('\n')}\n`);
  }
  for (const [name, path] of method.files) { await mkdir(resolve(dir, 'method', name, '..'), { recursive: true }); await cp(path, resolve(dir, 'method', name)); }

  // 3. Code's measurements, once for every auditor (its browser and server are closed when it returns).
  const measured = await measure({ dir, pages });

  // 4. The auditors, all at once (owner 2026-11-17: "可以 而且可以并行不是吗"): only the model runs are parallel; each
  // reads the files above and starts no browser or server of its own (previously two sites at once ran out of memory).
  const values = auditValues({ site: about, auditDir, pages, waivers, date, server: serverFiles, focus: measured.focus });
  const staging = resolve(root, '.pipeline', 'claude-seo-audit');
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const runs = await Promise.all(auditors.map((auditor) => runAuditor({ root, judge, auditor, values, staging, auditDir, origin: about.origin, date })));
  for (const auditor of auditors) {
    const staged = resolve(staging, `audit-reply-${auditor.id}.md`);
    if (existsSync(staged)) await cp(staged, resolve(dir, `audit-reply-${auditor.id}.md`));
  }
  await rm(staging, { recursive: true, force: true });
  const finished = runs.filter((run) => run.status === 'done');
  // None finished: as one audit's failure did (a limit or a sign-in waits).
  if (!finished.length) return { failed: runs.some((run) => run.status === 'unavailable') ? 'unavailable' : runs[0].status, detail: runs.map((run) => `${run.id} (${run.model}): ${run.detail}`).join('\n') };

  // 5. The issue list: the replies merged, then code's check and one verification of the merged critical and high
  // items. An item one auditor reported goes through the same two checks as one all of them did.
  const merged = mergeFindings(finished.map((run) => ({ auditor: run.id, findings: run.findings })));
  const doc = findingsDoc({ audit: auditDir, site: about.origin, date, findings: merged.findings });
  const errors = await validateFindings(doc);
  if (errors.length) return { failed: 'schema', detail: `the merged issue list does not match config/claude-seo-findings.schema.json:\n${errors.slice(0, 20).join('\n')}` };
  const reply = combineReplies(finished, doc.findings);
  const located = await checkLocations(dir, doc.findings, undefined, merged.locations);
  const placed = withFoundLocations(doc.findings, located);
  const toVerify = verifyItems(placed, located);
  let verdicts = null;
  if (toVerify.length) {
    const verified = await ask({ root, judge: verifyJudge, name: 'claude-seo-verify', values: verifyValues({ auditDir, items: toVerify }), lastMessage: resolve(dir, 'verify-reply.md'), label: 'claude-seo-audit verify' });
    if (verified.code !== 0) return { failed: verified.unavailable ? 'unavailable' : 'verify', detail: verified.stderr.slice(0, 500) };
    verdicts = verified.json;
  }
  const check = checkRecord(placed, located, verdicts);
  const findings = withCorrectedOwners(placed, check);

  // 6. The files. The score is the median of the finished auditors' scores (owner 2026-11-17), each listed.
  const audited = runs.map((run) => ({ id: run.id, model: run.model, status: run.status, ...(run.status === 'done' ? { health_score: run.health_score } : { detail: run.detail }) }));
  const merge = mergeRecord({ auditors: audited, groups: merged.groups });
  const artifacts = { findings: `${auditDir}/${FILES.findings}`, findings_sf: `${auditDir}/${FILES.findingsSf}`, check: `${auditDir}/${FILES.check}`, merge: `${auditDir}/${FILES.merge}`, report: `${auditDir}/${FILES.report}`, plan: `${auditDir}/${FILES.plan}` };
  const counts = Object.fromEntries(Object.keys(OWNER_WORDS).map((owner) => [owner, findings.filter((item) => item.owner === owner).length]));
  const data = {
    schemaVersion: AUDIT_SCHEMA, complete: true, date, site: about.origin, dir: auditDir,
    release, instructions, sources: await sourceHash(root),
    rules: { name: GOOGLE_RULES.name, snapshot: GOOGLE_RULES.snapshot, retrieved: true },
    tools: { playwright: measured.playwright, focus: measured.focus, desktop: '1366×768', phone: '390×844、DPR 3、150 ms RTT、1.6 Mbps、4 倍 CPU 降速' },
    scope: { pages: pages.length, server: serverFiles },
    summary: { health_score: median(finished.map((run) => run.health_score)), score_note: 'heuristic (claude-seo seo-audit weights); the median of the auditors\' scores; the launch gate never reads it', business_type: reply.business_type, weighted: reply.weighted, checklists: reply.checklists, auditors: audited },
    counts: { findings: findings.length, byOwner: counts, holds: check.holds.length, auditors: { planned: auditors.length, done: finished.length } },
    artifacts,
  };
  await writeJson(resolve(root, artifacts.findings), { ...doc, findings });
  await writeJson(resolve(root, artifacts.findings_sf), findingsDoc({ audit: auditDir, site: about.origin, date, findings, only: 'sf' }));
  await writeJson(resolve(root, artifacts.check), check);
  await writeJson(resolve(root, artifacts.merge), merge);
  await writeFile(resolve(root, artifacts.report), `${reportMarkdown({ site: about, reply, data, findings, check, merge })}\n`);
  await writeFile(resolve(root, artifacts.plan), `${actionPlanMarkdown({ site: about, data, findings, check })}\n`);
  await writeJson(resolve(dir, FILES.data), data);
  await rm(resolve(dir, FILES.pending), { force: true });
  return { dir: auditDir, data, holds: auditHolds({ findings: { findings }, check }) };
}

// The recheck of the latest audit (owner 2026-11-18: "每站只审一轮，修完只做逐条复查，不整站重审"), in its findings-check
// notation: each item that held the launch is looked for again in the release build in dist/ (code), and every one of
// them is verified again on that build (config/agent-steps/claude-seo-verify.md, one run): a fix rewrites the sentence
// the audit quoted, so a location no longer found is no proof the problem is gone. An item stands while the
// verification confirms it.
// The build it read goes to the audit folder's recheck/ (dist-release/, server/) and the record to
// findings-recheck.json beside findings-check.json, of this release (its key and sources). No new finding is looked
// for. Returns { skipped } | { unchanged } (the audit is of this build) | { reused } (a recheck of this build stands) |
// { failed, detail } | { dir, record }.
export async function claudeSeoRecheck({ root = process.cwd(), verifyJudge = runJudge, now = new Date() } = {}) {
  const site = await readJson(resolve(root, 'site.json'), null);
  if (!llmAuditOn(site)) return { skipped: site ? 'site.json llmAudit is false' : 'no site.json' };
  const last = await latestAudit(root);
  if (!last) return { skipped: 'no claude-seo audit to recheck' };
  if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('no build in dist/ (run pnpm build:release first)');
  const server = await nginxFiles({ root });
  const current = { release: await releaseKey(resolve(root, 'dist'), server), sources: await sourceHash(root) };
  const stands = standingCheck(last, current);
  if (stands?.kind === 'audit') return { unchanged: last.dir };
  if (stands?.kind === 'recheck') return { reused: last.dir };
  const held = (last.findings.findings ?? []).filter((item) => (last.check.holds ?? []).includes(item.id));
  const recheckDir = `${last.dir}/recheck`;
  const dir = resolve(root, recheckDir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await cp(resolve(root, 'dist'), resolve(dir, 'dist-release'), { recursive: true });
  if (server) {
    const files = ownConfigFiles(server.host);
    await mkdir(resolve(dir, 'server'), { recursive: true });
    await writeFile(resolve(dir, 'server', files[0]), server.server);
    await writeFile(resolve(dir, 'server', files[1]), server.snippet);
  }
  const located = await checkLocations(dir, held);
  let verdicts = null;
  if (held.length) {
    const verified = await ask({ root, judge: verifyJudge, name: 'claude-seo-verify', values: verifyValues({ auditDir: recheckDir, items: held }), lastMessage: resolve(dir, 'verify-reply.md'), label: 'claude-seo-recheck verify' });
    if (verified.code !== 0) return { failed: verified.unavailable ? 'unavailable' : 'verify', detail: verified.stderr.slice(0, 500) };
    verdicts = verified.json;
  }
  // The audit's record of each item (checkRecord), its location found or not: here the verdict alone decides.
  const check = checkRecord(held, Object.fromEntries(held.map((item) => [item.id, { found: true, file: located[item.id]?.file ?? null }])), verdicts);
  const items = check.items.map((item) => ({ ...item, located: Boolean(located[item.id]?.found), file: located[item.id]?.file ?? null, ...(item.stands || located[item.id]?.found ? {} : { note: `fixed: its location is no longer in the release build and the verification does not confirm it (${item.note})` }) }));
  const record = {
    ...check, items, schemaVersion: RECHECK_SCHEMA, audit: last.dir, checkedAt: now.toISOString(), release: current.release, sources: current.sources,
    rule: 'one audit a site: each item that held is looked for again in this release build and verified again on it; it holds while the verification confirms it',
  };
  await writeJson(resolve(root, last.dir, FILES.recheck), record);
  return { dir: last.dir, record };
}

runMain(import.meta.url, async () => {
  let result;
  try { result = await claudeSeoAudit(); } finally { await closeRulesLibrary(); }
  if (result.skipped) { console.log(`claude-seo audit skipped: ${result.skipped}`); return; }
  if (result.reused) {
    const { dir, data } = result.reused;
    console.log(`claude-seo audit unchanged: the release build, its server config and the instructions are as ${dir} audited them`);
    console.log(`findings: ${data.artifacts.findings}\nfindings for Site Factory: ${data.artifacts.findings_sf}`);
    return;
  }
  if (result.failed) {
    console.error(`claude-seo audit ${result.failed === 'unavailable' ? 'waits' : `failed (${result.failed})`}: ${result.detail}`);
    process.exitCode = result.failed === 'unavailable' ? UNAVAILABLE : 1;
    return;
  }
  const { data } = result;
  console.log(`auditors: ${data.counts.auditors.done} of ${data.counts.auditors.planned} finished (${data.summary.auditors.map((auditor) => `${auditor.id} ${auditor.model} ${auditor.status === 'done' ? auditor.health_score ?? 'n/a' : `not finished: ${auditor.detail}`}`).join('; ')})`);
  console.log(`${result.dir}: median score ${data.summary.health_score ?? 'n/a'} (heuristic, not gated); ${data.counts.findings} finding(s) (${Object.entries(data.counts.byOwner).map(([owner, count]) => `${owner} ${count}`).join(', ')}); ${result.holds.length} hold the launch`);
  for (const item of result.holds) console.log(`- ${item.id} [${item.severity}] ${item.problem} (${item.owner})`);
  console.log(`findings: ${data.artifacts.findings}\nfindings for Site Factory: ${data.artifacts.findings_sf}`);
});
