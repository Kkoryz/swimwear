// Every model call a site-run makes, by run and step (.pipeline/model-calls.jsonl): the run's summary says what each
// step cost (owner 2026-11-17, site13's 40-minute run: "不要浪费这种不该跑的地方", measured, not estimated). site-run sets
// SITE_RUN_ID and SITE_RUN_STEP for the commands it runs; a call outside a run is not logged. In an iteration run
// (site-run --iterate) SITE_RUN_NO_MODELS is set and a call is refused: an iteration never spends.

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const MODEL_CALLS = '.pipeline/model-calls.jsonl';
export const NO_MODELS = 'SITE_RUN_NO_MODELS';

// Before a model is asked: refused in an iteration run, logged in any run. kind: "judge" or "image".
export async function noteModelCall(root, { label = '', kind = 'judge' } = {}, env = process.env) {
  if (env[NO_MODELS]) throw new Error(`a model call in an iteration run (site-run --iterate calls no model): ${label || kind}`);
  if (!env.SITE_RUN_ID || !root) return;
  const path = resolve(root, MODEL_CALLS);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ run: env.SITE_RUN_ID, step: env.SITE_RUN_STEP ?? null, kind, label, at: new Date().toISOString() })}\n`);
}

// The calls of one run, by step: { [step]: { judge, image } }.
export async function modelCallsOf(root, run) {
  const path = resolve(root, MODEL_CALLS);
  const counts = {};
  if (!existsSync(path)) return counts;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    let call;
    try { call = JSON.parse(line); } catch { continue; }
    if (call.run !== run) continue;
    const entry = (counts[call.step ?? '?'] ??= { judge: 0, image: 0 });
    entry[call.kind === 'image' ? 'image' : 'judge'] += 1;
  }
  return counts;
}
