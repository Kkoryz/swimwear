import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { noteModelCall } from './model-calls.mjs';

const CODEX_TIMEOUT_MS = 12 * 60 * 1000;

// The codex executable. On Windows npm installs it as a codex.cmd shim, which Node starts only through a shell (it
// refuses .cmd files without one), so the shim is found on PATH and run through cmd with every argument quoted.
export function codexCommand(platform = process.platform, path = process.env.PATH ?? '') {
  if (platform !== 'win32') return { file: 'codex', shell: false };
  for (const dir of path.split(delimiter).filter(Boolean)) {
    if (existsSync(join(dir, 'codex.exe'))) return { file: join(dir, 'codex.exe'), shell: false };
    if (existsSync(join(dir, 'codex.cmd'))) return { file: join(dir, 'codex.cmd'), shell: true };
  }
  return { file: 'codex', shell: false };
}
const quoteForCmd = (arg) => `"${String(arg).replace(/"/g, '""')}"`;

// A judgment run needs none of the user's own skills, plugins or apps: without them each turn sends some 22k
// characters less (the skills list), and the agent does not spend turns reading skills. Image generation keeps them.
export const LEAN_ARGS = Object.freeze(['-c', 'skills.include_instructions=false', '--disable', 'plugins', '--disable', 'apps']);

// Judgment runs use Codex homes of their own, as Site Factory's judgments do (core/codex_cli.py): the owner's
// ~/.codex holds his personal instructions (a form of address came back in the reviews), skills and plugins, which a
// run there reads whatever flags it gets. The owner signs in to each judge home once (CODEX_HOME=<home> codex login);
// their config.toml reads no project docs and turns the optional features and skills off. SF_CODEX_HOMES (a JSON
// list) names them, as for Site Factory; by default .codex-judge and .codex-judge2 next to the site's folder. The
// model and effort are the ones these steps were tuned with.
export const JUDGE_MODEL = 'gpt-6-astra';
export const JUDGE_EFFORT = 'medium';
// Unlike Site Factory's (everything in the prompt), these judgments read the site's files and the treatment and the
// repairs write its stylesheet: the shell the judge homes turn off (code_mode_host) is turned on, and on Windows the
// sandbox is the unelevated one (the elevated one needs a one-time administrator setup per Codex home).
export const JUDGE_ARGS = Object.freeze(['--enable', 'code_mode_host', ...(process.platform === 'win32' ? ['-c', 'windows.sandbox=unelevated'] : [])]);
export function judgeHomes(root, env = process.env) {
  const homes = env.SF_CODEX_HOMES ? JSON.parse(env.SF_CODEX_HOMES).map((home) => resolve(home)) : ['.codex-judge', '.codex-judge2'].map((name) => resolve(root, '..', name));
  if (homes.some((home) => home.toLowerCase() === resolve(homedir(), '.codex').toLowerCase())) throw new Error('the personal Codex home must not be used for judgments');
  return homes;
}
// A home that cannot be asked now (its usage or rate limit): the run goes to another home, and with none left the
// step reports the agent unavailable (lib/agent-step.mjs), by this one test.
// (Three sites reviewed at once got "429 Too Many Requests" from one home, which failed the runs instead of moving them.)
export const usageLimit = (text) => /hit your usage limit|usage limit reached|rate limit exceeded|429 Too Many Requests/i.test(text ?? '');
// Homes whose usage limit this process met: the next run goes to another one.
const exhausted = new Set();
// A rate limit ("429 Too Many Requests") passes within minutes, a usage limit lasts hours: a rate-limited run is asked
// again on the same home after each of these waits before it counts as a limit (site10's two page readings at once drew
// one 429 from each judge home, which marked both used up for the run, and every retry failed the same way).
export const RATE_WAITS_MS = [60_000, 120_000, 240_000];
// A model at capacity passes the same way (site10's design review and photo judgments failed on "Selected model is at
// capacity" and the step stopped waiting).
const rateLimited = (text) => /429 Too Many Requests|rate limit exceeded|model is at capacity/i.test(text ?? '') && !/hit your usage limit|usage limit reached/i.test(text ?? '');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
// Image generation runs in the owner's home and in every signed-in judge home, taking them in turn (owner
// 2026-10-30), so as many photos go at once as there are homes; a judge home has image generation turned off and gets
// it, with the shell, for the run. A rate-limited home passes the run to the next at once; with all of them limited
// the run waits as above; a used-up home is passed over for the rest of the process. null: the owner's home.
export const IMAGE_ARGS = Object.freeze(['--enable', 'image_generation', ...JUDGE_ARGS]);
export const imageHomes = (root, env = process.env) => [null, ...judgeHomes(root, env).filter((home) => existsSync(join(home, 'auth.json')))];
const imageExhausted = new Set();
let imageTurn = 0;
async function inImageHomes({ root, base, prompt, timeoutMs, spawnRun, wait }) {
  const homes = imageHomes(root);
  const start = imageTurn++ % homes.length;
  const order = [...homes.slice(start), ...homes.slice(0, start)];
  for (let attempt = 0; ; attempt += 1) {
    let limited = false;
    for (const home of order.filter((item) => !imageExhausted.has(item))) {
      const result = await spawnRun({ args: [...base, ...(home ? IMAGE_ARGS : []), '-'], prompt, env: home ? { ...process.env, CODEX_HOME: home } : process.env, timeoutMs });
      const why = `${result.stderr}\n${(result.events ?? []).join('\n')}`;
      if (result.code !== 0 && rateLimited(why)) { limited = true; continue; }
      if (result.code !== 0 && usageLimit(why)) { imageExhausted.add(home); continue; }
      return { code: result.code, stderr: result.stderr };
    }
    if (!limited || attempt >= RATE_WAITS_MS.length) return { code: 1, stderr: limited ? 'every image home is rate-limited (429 Too Many Requests)' : 'every image home hit its usage limit' };
    await wait(RATE_WAITS_MS[attempt]);
  }
}
async function withWaits(run, wait) {
  for (let attempt = 0; ; attempt += 1) {
    const result = await run();
    if (result.code === 0 || attempt >= RATE_WAITS_MS.length || !rateLimited(`${result.stderr}\n${(result.events ?? []).join('\n')}`)) return result;
    await wait(RATE_WAITS_MS[attempt]);
  }
}

// The token use a --json run reported (its turn.completed event), or null.
export function reportedUsage(lines) {
  for (const line of [...lines].reverse()) {
    try { const event = JSON.parse(line); if (event.type === 'turn.completed' && event.usage) return event.usage; } catch { /* not an event */ }
  }
  return null;
}

// A run that times out failed, whatever its exit: a killed child closes with code null, which is not success.
export function spawnCodex({ args, prompt, env, timeoutMs }) {
  return new Promise((done) => {
    const { file, shell } = codexCommand();
    const stdio = ['pipe', 'pipe', 'pipe'];
    const child = shell ? spawn([file, ...args].map(quoteForCmd).join(' '), { shell: true, stdio, env }) : spawn(file, args, { stdio, env });
    let stderr = '';
    // Of the JSON event stream only the events a caller reads are kept (the stream carries every tool output).
    const events = [];
    let pending = '';
    child.stdout.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) if (/"turn\.completed"|"error"|usage limit/.test(line)) events.push(line);
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    // A child that exits before reading its prompt closes the pipe; its exit code and stderr report why.
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    // Through cmd.exe (the codex.cmd shim) a kill would end cmd alone and Codex would go on writing in the site's
    // folder after the step ended: the whole process tree is ended.
    let timedOut = false;
    const stop = () => { timedOut = true; if (shell) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill(); };
    const timer = setTimeout(stop, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: timedOut ? code || 1 : code ?? 1, stderr: timedOut ? `${stderr}\ntimed out after ${Math.round(timeoutMs / 1000)}s` : stderr, events: pending ? [...events, pending] : events });
    });
    child.on('error', (error) => { clearTimeout(timer); done({ code: -1, stderr: error.message, events }); });
  });
}

// One non-interactive Codex run in the workspace with the given images attached; its final message goes to lastMessage.
// The prompt goes on stdin ("-"): it can be longer than a command line allows and never passes through a shell.
// judge: the run goes to a judge home (another one when a home's usage limit is reached) and, with tokenLog, its
// token use is appended to that file as one JSON line ({ label } names the run there).
// image: an image generation, in the image homes in turn (above).
// wait: the pause after a rate limit (a stand-in in tests).
export async function runCodex({ root, prompt, images = [], lastMessage, sandbox = 'workspace-write', timeoutMs = CODEX_TIMEOUT_MS, lean = false, judge = false, image = false, tokenLog = null, label = '', kind = null, spawnRun = spawnCodex, wait = pause }) {
  // Every call is counted for the run's summary, and refused in an iteration run (lib/model-calls.mjs).
  await noteModelCall(root, { label, kind: kind ?? (image ? 'image' : 'judge') });
  const base = ['exec', '--skip-git-repo-check', '-C', root, '-s', sandbox, ...(lean ? LEAN_ARGS : []), ...images.flatMap((image) => ['-i', image]), '-o', lastMessage];
  if (image) return inImageHomes({ root, base, prompt, timeoutMs, spawnRun, wait });
  if (!judge) {
    const { code, stderr } = await withWaits(() => spawnRun({ args: [...base, '-'], prompt, env: process.env, timeoutMs }), wait);
    return { code, stderr };
  }
  const homes = judgeHomes(root);
  const missing = homes.filter((home) => !existsSync(join(home, 'auth.json')));
  if (missing.length === homes.length) return { code: -1, stderr: `no judge home signed in (${homes.join(', ')}): set CODEX_HOME=<home> and run codex login once` };
  for (const home of homes.filter((item) => !missing.includes(item) && !exhausted.has(item))) {
    const started = Date.now();
    const args = [...base, ...JUDGE_ARGS, '--json', '--ephemeral', '-m', JUDGE_MODEL, '-c', `model_reasoning_effort=${JUDGE_EFFORT}`, '-'];
    const result = await withWaits(() => spawnRun({ args, prompt, env: { ...process.env, CODEX_HOME: home }, timeoutMs }), wait);
    // Still rate-limited after the waits: the next home takes this run, and this one is asked again by the next run.
    const why = `${result.stderr}\n${result.events.join('\n')}`;
    if (result.code !== 0 && rateLimited(why)) continue;
    if (result.code !== 0 && usageLimit(why)) { exhausted.add(home); continue; }
    if (tokenLog) {
      const usage = reportedUsage(result.events) ?? {};
      await mkdir(dirname(tokenLog), { recursive: true });
      await appendFile(tokenLog, `${JSON.stringify({ at: new Date().toISOString(), label, home: basename(home), model: JUDGE_MODEL, effort: JUDGE_EFFORT, code: result.code, seconds: Math.round((Date.now() - started) / 1000), ...Object.fromEntries(['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'].map((key) => [key, usage[key] ?? 0])) })}\n`);
    }
    // A failed run says why in its event stream (--json writes errors there, not to stderr): the log gets those lines too.
    const errors = result.code !== 0 ? result.events.filter((line) => /"error"/.test(line)) : [];
    return { code: result.code, stderr: [result.stderr, ...errors].filter(Boolean).join('\n') };
  }
  return { code: 1, stderr: `every judge home hit its usage or rate limit (429 Too Many Requests): ${homes.filter((home) => !missing.includes(home)).join(', ')}` };
}
