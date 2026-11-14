// Which agent a run goes to (owner 2026-11-14: "做一个配置默认claude生图默认codex"): images are made by Codex (its image
// generation, in the owner's and the judge homes); every other run, the judgments and the repairs, by the site's agent:
// site.json "agent" ("claude", the default, or "codex"; "none" turns the agent steps off in site-run), SITE_AGENT
// overriding it. Each run takes the contract of runCodex: { root, prompt, images, lastMessage, sandbox, image, ... }.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runClaude } from './claude-exec.mjs';
import { runCodex } from './codex-exec.mjs';

export const DEFAULT_AGENT = 'claude';
export const AGENTS = Object.freeze(['claude', 'codex']);

export function agentFor(root = process.cwd(), env = process.env) {
  let site = null;
  try { site = JSON.parse(readFileSync(resolve(root, 'site.json'), 'utf8')); } catch { site = null; }
  const agent = env.SITE_AGENT || site?.agent || DEFAULT_AGENT;
  return AGENTS.includes(agent) ? agent : DEFAULT_AGENT;
}

export function runJudge(options, { claude = runClaude, codex = runCodex, env = process.env } = {}) {
  if (options.image) return codex(options);
  if (agentFor(options.root, env) === 'codex') return codex(options);
  const { root, prompt, images, lastMessage, sandbox, timeoutMs, tokenLog, label } = options;
  let model = env.CLAUDE_JUDGE_MODEL || null;
  try { model ||= JSON.parse(readFileSync(resolve(root, 'site.json'), 'utf8')).agentModel || null; } catch { /* no site.json */ }
  return claude({ root, prompt, images, lastMessage, sandbox, timeoutMs, tokenLog, label, model });
}
