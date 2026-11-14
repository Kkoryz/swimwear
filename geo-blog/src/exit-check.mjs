import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUYING_STAGES, receiptName } from './config.mjs';
import { normalizeUrl } from './urls.mjs';

export const GAP_TYPES = ['original_data', 'first_hand', 'analysis'];

const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const norm = (u) => { try { return normalizeUrl(u); } catch { return u; } };

// questions <-> receipts <-> gaps <-> outline must line up before writing. Returns a list of failures (empty = pass).
export function exitCheck(config) {
  const dir = config.runDir;
  const failures = [];
  const fail = (msg) => failures.push(msg);

  // 1. Questions: the configured count, all four buying stages, real-question evidence.
  const questions = load(join(dir, '01-questions.json'))?.questions;
  if (!questions) return ['01-questions.json missing'];
  if (questions.length !== config.questions_count) fail(`expected ${config.questions_count} questions, got ${questions.length}`);
  const stages = new Set(questions.map((q) => q.buying_stage));
  for (const s of BUYING_STAGES) if (!stages.has(s)) fail(`buying stage not covered: ${s}`);
  for (const q of questions) if (!q.evidence?.length) fail(`${q.id}: no real-question evidence`);

  // 2. Receipts: every question x engine x run, each with an answer or a note saying why not.
  const receipts = {};
  for (const q of questions) {
    receipts[q.id] = {};
    for (const engine of config.engines) {
      for (let run = 1; run <= config.runs; run++) {
        const name = receiptName(q.id, engine, run);
        const r = load(join(dir, '02-receipts', name));
        if (!r) { fail(`${q.id}: receipt missing ${name}`); continue; }
        if (!r.answer_text && !r.notes) fail(`${name}: empty answer with no note`);
        receipts[q.id][name] = r;
      }
    }
  }
  const urlsOf = (qid) => new Set(Object.values(receipts[qid] ?? {}).flatMap((r) => (r.citations || []).map((c) => norm(c.url))));

  // 3. Gaps: consensus backed by enough receipts and their real URLs; typed gaps we can fill ourselves.
  const gapsDir = join(dir, '04-gaps');
  const gaps = Object.fromEntries(
    (existsSync(gapsDir) ? readdirSync(gapsDir) : []).filter((f) => f.endsWith('.json')).map((f) => {
      const g = load(join(gapsDir, f));
      return [g.question_id, g];
    }),
  );
  for (const q of questions) {
    const g = gaps[q.id];
    if (!g) { fail(`${q.id}: no gap analysis`); continue; }
    const total = Object.values(receipts[q.id]).filter((r) => r.status !== 'unavailable').length;
    const minReceipts = Math.max(2, Math.ceil(config.consensus_min_share * total));
    for (const field of ['consensus', 'missing', 'our_angle']) if (!g[field]?.length) fail(`${q.id}: gap field "${field}" is empty`);
    for (const c of g.consensus ?? []) {
      const backing = (c.receipts ?? []).filter((name) => receipts[q.id][name]);
      if (backing.length < minReceipts) fail(`${q.id}/${c.id}: consensus backed by ${backing.length} receipts, needs ${minReceipts}`);
      for (const name of c.receipts ?? []) if (!receipts[q.id][name]) fail(`${q.id}/${c.id}: unknown receipt ${name}`);
      for (const u of c.source_urls ?? []) if (!urlsOf(q.id).has(norm(u))) fail(`${q.id}/${c.id}: url not in receipts: ${u}`);
    }
    for (const m of g.missing ?? []) {
      if (!GAP_TYPES.includes(m.type)) fail(`${q.id}/${m.id}: gap type must be one of ${GAP_TYPES.join('/')}`);
      if (!m.fill_with) fail(`${q.id}/${m.id}: gap names nothing we can fill it with`);
    }
    const ids = new Set([...(g.missing ?? []), ...(g.our_angle ?? [])].map((x) => x.id));
    for (const a of g.our_angle ?? []) for (const f of a.fills ?? []) if (!ids.has(f)) fail(`${q.id}/${a.id}: fills unknown gap ${f}`);
  }

  // 4. Outline: exactly one section per question, covering its angles and at least one gap, with a verifiable source.
  const outline = load(join(dir, '05-outline.json'));
  if (!outline) fail('05-outline.json missing');
  for (const q of questions) {
    const secs = (outline?.sections ?? []).filter((s) => s.question_id === q.id);
    if (secs.length !== 1) { fail(`${q.id}: expected exactly 1 outline section, got ${secs.length}`); continue; }
    const sec = secs[0];
    const g = gaps[q.id];
    if (!g) continue;
    const known = new Set([...(g.missing ?? []), ...(g.our_angle ?? [])].map((x) => x.id));
    for (const a of g.our_angle ?? []) if (!sec.covers?.includes(a.id)) fail(`${q.id}: section does not cover ${a.id}`);
    for (const id of sec.covers ?? []) if (!known.has(id)) fail(`${q.id}: section covers unknown id ${id}`);
    if (!(g.missing ?? []).some((m) => sec.covers?.includes(m.id))) fail(`${q.id}: section covers no gap (consensus-only)`);
    if (!sec.sources?.length) fail(`${q.id}: section has no verifiable source`);
    const allowed = new Set([...urlsOf(q.id), ...readPriority(dir)]);
    for (const u of sec.sources ?? []) if (!allowed.has(norm(u))) fail(`${q.id}: section source not in receipts or fetched pages: ${u}`);
  }
  for (const s of outline?.sections ?? []) {
    if (s.question_id && !questions.some((q) => q.id === s.question_id)) fail(`section "${s.heading}" points to unknown question ${s.question_id}`);
  }
  return failures;
}

// Receipts an engine could not answer (usage limit): not a mismatch, but the research is missing that engine there.
export function exitWarnings(config) {
  const dir = join(config.runDir, '02-receipts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => [f, load(join(dir, f))])
    .filter(([, r]) => r?.status === 'unavailable')
    .map(([f, r]) => `${f}: ${r.notes}`);
}

function readPriority(dir) {
  return (load(join(dir, '03-priority.json')) ?? []).map((p) => norm(p.url));
}
