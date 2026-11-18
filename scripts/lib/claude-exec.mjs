// A judgment run in Claude Code (claude -p), with the same contract as runCodex (lib/codex-exec.mjs): the prompt on
// stdin, the images named in it (Claude reads them with its Read tool), the final message written to lastMessage;
// { code, stderr }, a usage limit or a sign-in that has run out said in stderr in words lib/codex-exec.mjs usageLimit
// knows, so the step waits instead of failing.
// It runs apart from the owner's own Claude, as the Codex judgments run in judge homes and as Site Factory's Claude
// calls do (src/sitefactory/core/claude_cli.py): a config directory of its own (CLAUDE_CONFIG_DIR, never ~/.claude:
// not the owner's hooks, instructions, memory or language), safe mode (no CLAUDE.md, skills, plugins, hooks), no
// setting sources, no MCP, no slash commands, no session kept, and none of the parent session's variables
// (CLAUDECODE*, CLAUDE_CODE_*, ANTHROPIC_*, CLAUDE_AGENT_SDK*). The judge directories: SITE_CLAUDE_CONFIG_DIRS (a JSON
// list), else .claude-judge08 next to the site's folder; the owner signs in in each himself (CLAUDE_CONFIG_DIR=<dir>
// claude, then /login); no credential is ever copied. A directory at its usage limit or without a sign-in is set aside
// for the rest of the process and the next one answers; with none left the run reports the limit and the step waits.
// A run that only answers (sandbox read-only) may read and search; one that writes (a repair) may edit files too.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { noteModelCall } from './model-calls.mjs';

const CLAUDE_TIMEOUT_MS = 12 * 60 * 1000;
// The model and effort Site Factory's judgments use (site.json agentModel or CLAUDE_JUDGE_MODEL names another model).
export const JUDGE_MODEL = 'claude-opus-5-5';
export const JUDGE_EFFORT = 'high';
export const READ_TOOLS = Object.freeze(['Read', 'Glob', 'Grep']);
export const WRITE_TOOLS = Object.freeze([...READ_TOOLS, 'Edit', 'Write', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)']);

// The claude executable: SITE_CLAUDE_BIN or SF_CLAUDE_BIN (the desktop app's own claude.exe, whose path changes with
// each release) first, else claude.exe or an npm claude.cmd shim on PATH (a shim runs through cmd).
export function claudeCommand(platform = process.platform, path = process.env.PATH ?? '', env = process.env) {
  const named = env.SITE_CLAUDE_BIN || env.SF_CLAUDE_BIN;
  if (named) return { file: named, shell: /\.cmd$/i.test(named) };
  if (platform !== 'win32') return { file: 'claude', shell: false };
  for (const dir of path.split(delimiter).filter(Boolean)) {
    if (existsSync(join(dir, 'claude.exe'))) return { file: join(dir, 'claude.exe'), shell: false };
    if (existsSync(join(dir, 'claude.cmd'))) return { file: join(dir, 'claude.cmd'), shell: true };
  }
  return { file: 'claude', shell: false };
}
const quoteForCmd = (arg) => `"${String(arg).replace(/"/g, '""')}"`;

// stream: every message as an event line (stream-json), the run's result the last line as with json.
export function claudeArgs({ sandbox = 'workspace-write', model = null, effort = JUDGE_EFFORT, stream = false } = {}) {
  const tools = sandbox === 'read-only' ? READ_TOOLS : WRITE_TOOLS;
  return ['-p', '--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--output-format', ...(stream ? ['stream-json', '--verbose'] : ['json']), '--model', model || JUDGE_MODEL, '--effort', effort, '--permission-mode', sandbox === 'read-only' ? 'default' : 'acceptEdits', '--allowedTools', ...tools];
}

// The judge directories, in order (SITE_CLAUDE_CONFIG_DIRS, a JSON list; else .claude-judge08 beside the site's folder).
export function judgeDirs(root, env = process.env) {
  const dirs = env.SITE_CLAUDE_CONFIG_DIRS ? JSON.parse(env.SITE_CLAUDE_CONFIG_DIRS).map((dir) => resolve(dir)) : [resolve(root, '..', '.claude-judge08')];
  if (dirs.some((dir) => dir.toLowerCase() === resolve(homedir(), '.claude').toLowerCase())) throw new Error("the owner's own Claude directory must not be used for judgments");
  return dirs;
}
// The environment of a judge run: the parent session's own variables dropped, the judge directory set.
const DROPPED = /^(CLAUDECODE|CLAUDE_CODE_|ANTHROPIC_|CLAUDE_AGENT_SDK)/;
export const judgeEnv = (dir, env = process.env) => ({ ...Object.fromEntries(Object.entries(env).filter(([name]) => !DROPPED.test(name))), CLAUDE_CONFIG_DIR: dir });
// Directories met at their limit or without a sign-in in this process: passed over by the next runs.
const setAside = new Set();

// The prompt with the images it is to look at (Codex takes them as attachments; Claude reads them from disk).
export const withImages = (prompt, images = []) => (images.length ? `${prompt}\n\nThe attached images, in order (read each with the Read tool before you answer):\n${images.map((image, index) => `${index + 1}. ${image}`).join('\n')}\n` : prompt);

// Words of a run that could not be asked, in the terms usageLimit (lib/codex-exec.mjs) knows.
export function unavailableWhy(text = '') {
  if (/usage limit|hit your .*limit|rate.?limit|429|overloaded|529/i.test(text)) return `usage limit reached (Claude): ${text.slice(0, 300)}`;
  if (/authenticat|OAuth|not logged in|log ?in|credit balance/i.test(text)) return `usage limit reached (Claude cannot be asked: ${text.slice(0, 200)}; sign in with CLAUDE_CONFIG_DIR=<dir> claude, then /login)`;
  return null;
}

export function spawnClaude({ args, prompt, cwd, env, timeoutMs }) {
  const { file, shell } = claudeCommand(process.platform, env?.PATH ?? process.env.PATH ?? '', env ?? process.env);
  return new Promise((done) => {
    const child = spawn(shell ? quoteForCmd(file) : file, shell ? args.map(quoteForCmd) : args, { cwd, env, shell, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 1, stdout, stderr }); });
    child.on('error', (error) => { clearTimeout(timer); done({ code: 1, stdout, stderr: `${stderr}${error.message}` }); });
    child.stdin.end(prompt);
  });
}

export async function runClaude({ root, prompt, images = [], lastMessage, sandbox = 'workspace-write', timeoutMs = CLAUDE_TIMEOUT_MS, model = process.env.CLAUDE_JUDGE_MODEL || null, tokenLog = null, label = '', spawnRun = spawnClaude, env = process.env, earlierJson = false }) {
  // Every call is counted for the run's summary, and refused in an iteration run (lib/model-calls.mjs).
  await noteModelCall(root, { label }, env);
  const passed = [];
  for (const dir of judgeDirs(root, env).filter((item) => !setAside.has(item))) {
    const result = await runIn({ dir, root, prompt, images, lastMessage, sandbox, timeoutMs, model, tokenLog, label, spawnRun, env, earlierJson });
    // At its limit or without a sign-in: set aside for the process, and the next directory takes the run.
    if (result.code !== 0 && result.unavailable) { setAside.add(dir); passed.push(`${dir}: ${result.stderr}`); continue; }
    return { code: result.code, stderr: result.stderr };
  }
  return { code: 1, stderr: `usage limit reached: no Claude judge directory can answer (${passed.join('; ') || 'all set aside in this run'}); sign in with CLAUDE_CONFIG_DIR=<dir> claude, then /login` };
}

// The run's reply from its output: the result event (the last line), and with earlierJson (a judge whose answer is a
// JSON object) the last of its messages that holds one when the final message does not (aloha 2026-11-18: two of three
// auditors gave the JSON, then closed on a note, "the final JSON is my previous reply").
const holdsJson = (text) => /```json|^\s*\{/m.test(String(text ?? ''));
export function replyOf(stdout, { earlierJson = false } = {}) {
  const lines = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  let reply = null;
  try { reply = JSON.parse(lines.at(-1) ?? ''); } catch { reply = null; }
  let text = reply?.result ?? '';
  if (earlierJson && reply && !holdsJson(text)) {
    const said = lines.flatMap((line) => { try { const event = JSON.parse(line); return event.type === 'assistant' ? (event.message?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text) : []; } catch { return []; } });
    const earlier = said.filter(holdsJson).at(-1);
    if (earlier) text = earlier;
  }
  return { reply, text };
}

async function runIn({ dir, root, prompt, images, lastMessage, sandbox, timeoutMs, model, tokenLog, label, spawnRun, env, earlierJson = false }) {
  const started = Date.now();
  const result = await spawnRun({ args: claudeArgs({ sandbox, model, stream: earlierJson }), prompt: withImages(prompt, images), cwd: root, env: judgeEnv(dir, env), timeoutMs });
  const { reply, text } = replyOf(result.stdout, { earlierJson });
  const failed = result.code !== 0 || !reply || reply.is_error;
  if (lastMessage && reply && !reply.is_error) {
    await mkdir(dirname(lastMessage), { recursive: true });
    await writeFile(lastMessage, text);
  }
  if (tokenLog) {
    const usage = reply?.usage ?? {};
    await mkdir(dirname(tokenLog), { recursive: true });
    await appendFile(tokenLog, `${JSON.stringify({ at: new Date().toISOString(), label, agent: 'claude', home: dir.split(/[\\/]/).at(-1), model: model || JUDGE_MODEL, effort: JUDGE_EFFORT, code: failed ? 1 : 0, seconds: Math.round((Date.now() - started) / 1000), input_tokens: usage.input_tokens ?? 0, cached_input_tokens: usage.cache_read_input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cost_usd: reply?.total_cost_usd ?? 0 })}\n`);
  }
  if (!failed) return { code: 0, stderr: result.stderr };
  const why = `${text}\n${result.stderr}`.trim();
  const unavailable = unavailableWhy(why);
  return { code: result.code || 1, stderr: unavailable ?? (why || 'claude gave no answer'), unavailable: Boolean(unavailable) };
}
