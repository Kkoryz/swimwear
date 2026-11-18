import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { JUDGE_MODEL, judgeHomes, runCodex, spawnCodex } from '../lib/codex-exec.mjs';

test('a judgment runs in a judge home, never the personal one; a home at its usage limit hands the run to the next, and the run\'s tokens are logged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'judge-'));
  const homes = [join(root, 'judge-a'), join(root, 'judge-b')];
  for (const home of homes) { await mkdir(home, { recursive: true }); await writeFile(join(home, 'auth.json'), '{}'); }
  const saved = process.env.SF_CODEX_HOMES;
  process.env.SF_CODEX_HOMES = JSON.stringify(homes);
  try {
    assert.throws(() => judgeHomes(root, { SF_CODEX_HOMES: JSON.stringify([join(homedir(), '.codex')]) }), /personal Codex home/);
    assert.deepEqual(judgeHomes(join(root, 'site'), {}), [join(root, '.codex-judge'), join(root, '.codex-judge2')]);
    const calls = [];
    const spawnRun = async ({ args, env }) => {
      calls.push({ home: env.CODEX_HOME, args });
      if (env.CODEX_HOME === homes[0]) return { code: 1, stderr: 'ERROR: You\'ve hit your usage limit.', events: [] };
      return { code: 0, stderr: '', events: [JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 800, output_tokens: 30 } })] };
    };
    const tokenLog = join(root, 'tokens.jsonl');
    const first = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, tokenLog, label: 'design-review home', spawnRun });
    assert.equal(first.code, 0);
    assert.deepEqual(calls.map((call) => call.home), homes);
    assert.ok(calls[1].args.includes('--json') && calls[1].args.includes(JUDGE_MODEL));
    const row = JSON.parse((await readFile(tokenLog, 'utf8')).trim());
    assert.equal(row.label, 'design-review home');
    assert.equal(row.home, 'judge-b');
    assert.equal(row.input_tokens, 1200);
    // The exhausted home is not asked again in this process.
    calls.length = 0;
    await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, spawnRun });
    assert.deepEqual(calls.map((call) => call.home), [homes[1]]);
    // A run that fails says why in its event stream, which reaches the step's log.
    const error = JSON.stringify({ type: 'error', message: 'stream disconnected before completion' });
    const failed = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, spawnRun: async () => ({ code: 1, stderr: '', events: [error] }) });
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /stream disconnected/);
    // A home that answers "too many requests" is passed over like one at its usage limit.
    const { usageLimit } = await import('../lib/codex-exec.mjs');
    assert.ok(usageLimit('{"type":"error","message":"exceeded retry limit, last status: 429 Too Many Requests"}'));
    // A run outside the judgments (image generation) keeps the owner's own home.
    calls.length = 0;
    await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), spawnRun: async ({ args, env }) => { calls.push({ home: env.CODEX_HOME, args }); return { code: 0, stderr: '', events: [] }; } });
    assert.equal(calls[0].home, process.env.CODEX_HOME);
    assert.ok(!calls[0].args.includes('--json'));
  } finally {
    if (saved === undefined) delete process.env.SF_CODEX_HOMES; else process.env.SF_CODEX_HOMES = saved;
  }
});

test('a rate-limited run (429) is asked again on the same home after a wait; still limited, the next home takes it and the first is not marked used up', async () => {
  const { RATE_WAITS_MS } = await import('../lib/codex-exec.mjs');
  const root = await mkdtemp(join(tmpdir(), 'judge-429-'));
  const homes = [join(root, 'judge-a'), join(root, 'judge-b')];
  for (const home of homes) { await mkdir(home, { recursive: true }); await writeFile(join(home, 'auth.json'), '{}'); }
  const saved = process.env.SF_CODEX_HOMES;
  process.env.SF_CODEX_HOMES = JSON.stringify(homes);
  const limited = { code: 1, stderr: '', events: ['{"type":"error","message":"exceeded retry limit, last status: 429 Too Many Requests"}'] };
  const ok = { code: 0, stderr: '', events: [] };
  try {
    const waits = [];
    const wait = async (ms) => { waits.push(ms); };
    // Limited once, then answers: the same home, after one wait.
    let calls = [];
    let first = true;
    const once = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, wait, spawnRun: async ({ env }) => { calls.push(env.CODEX_HOME); if (first) { first = false; return limited; } return ok; } });
    assert.deepEqual([once.code, calls, waits], [0, [homes[0], homes[0]], [RATE_WAITS_MS[0]]]);
    // Limited through every wait on the first home: the second answers; the first is asked again by the next run.
    calls = [];
    waits.length = 0;
    const spawnRun = async ({ env }) => { calls.push(env.CODEX_HOME); return env.CODEX_HOME === homes[0] ? limited : ok; };
    assert.equal((await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, wait, spawnRun })).code, 0);
    assert.deepEqual([calls.length, calls.at(-1), waits], [RATE_WAITS_MS.length + 2, homes[1], RATE_WAITS_MS]);
    calls = [];
    await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, wait, spawnRun });
    assert.equal(calls[0], homes[0]);
    // Image generation (the owner's home) waits the same way.
    calls = [];
    first = true;
    const own = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), wait, spawnRun: async () => { calls.push('own'); if (first) { first = false; return { code: 1, stderr: 'ERROR: exceeded retry limit, last status: 429 Too Many Requests', events: [] }; } return ok; } });
    assert.deepEqual([own.code, calls.length], [0, 2]);
    // A model at capacity is waited for like a rate limit.
    calls = [];
    first = true;
    const busy = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, wait, spawnRun: async ({ env }) => { calls.push(env.CODEX_HOME); if (first) { first = false; return { code: 1, stderr: '', events: ['{"type":"turn.failed","error":{"message":"Selected model is at capacity. Please try a different model."}}'] }; } return ok; } });
    assert.deepEqual([busy.code, calls.length], [0, 2]);
  } finally {
    if (saved === undefined) delete process.env.SF_CODEX_HOMES; else process.env.SF_CODEX_HOMES = saved;
  }
});

test("image generation takes the owner's home and the judge homes in turn; a rate-limited home passes the run on at once, a used-up one is passed over", async () => {
  const { imageHomes } = await import('../lib/codex-exec.mjs');
  const root = await mkdtemp(join(tmpdir(), 'image-homes-'));
  const homes = [join(root, 'judge-a'), join(root, 'judge-b'), join(root, 'judge-unsigned')];
  for (const home of homes.slice(0, 2)) { await mkdir(home, { recursive: true }); await writeFile(join(home, 'auth.json'), '{}'); }
  const saved = process.env.SF_CODEX_HOMES;
  process.env.SF_CODEX_HOMES = JSON.stringify(homes);
  const ok = { code: 0, stderr: '', events: [] };
  const limited = { code: 1, stderr: '', events: ['{"type":"error","message":"exceeded retry limit, last status: 429 Too Many Requests"}'] };
  const homeOf = ({ args, env }) => (args.includes('image_generation') ? env.CODEX_HOME : 'own');
  try {
    assert.deepEqual(imageHomes(root), [null, homes[0], homes[1]], 'the owner first, then the signed-in judge homes');
    const calls = [];
    for (let run = 0; run < 3; run += 1) await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), image: true, spawnRun: async (call) => { calls.push(homeOf(call)); return ok; } });
    assert.deepEqual(new Set(calls), new Set(['own', homes[0], homes[1]]), 'three runs, three homes');
    // Rate-limited: the next home takes it, with no wait.
    const waits = [];
    const passed = [];
    const one = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), image: true, wait: async (ms) => waits.push(ms), spawnRun: async (call) => { passed.push(homeOf(call)); return passed.length === 1 ? limited : ok; } });
    assert.deepEqual([one.code, passed.length, waits], [0, 2, []]);
    // A used-up home is not asked again in this process.
    const seen = [];
    const spend = async (call) => { seen.push(homeOf(call)); return homeOf(call) === homes[0] ? { code: 1, stderr: "You've hit your usage limit.", events: [] } : ok; };
    for (let run = 0; run < 3; run += 1) await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), image: true, spawnRun: spend });
    seen.length = 0;
    for (let run = 0; run < 3; run += 1) await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), image: true, spawnRun: spend });
    assert.ok(!seen.includes(homes[0]) && seen.length === 3);
  } finally {
    if (saved === undefined) delete process.env.SF_CODEX_HOMES; else process.env.SF_CODEX_HOMES = saved;
  }
});

test('a Codex run that times out fails and is ended with everything it started (on Windows the codex.cmd shim too)', async () => {
  const { existsSync } = await import('node:fs');
  const root = await mkdtemp(join(tmpdir(), 'codex-timeout-'));
  const marker = join(root, 'late.txt').replaceAll('\\', '/');
  // A codex that would write a file after the timeout, started the way the real one is (a .cmd shim on Windows).
  await writeFile(join(root, 'late.js'), `setTimeout(() => require('fs').writeFileSync('${marker}', 'late'), 4000);`);
  const script = join(root, 'late.js').replaceAll('\\', '/');
  if (process.platform === 'win32') await writeFile(join(root, 'codex.cmd'), `@node "${script}"\r\n`);
  else await writeFile(join(root, 'codex'), `#!/bin/sh\nexec node "${script}"\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${root}${delimiter}${saved}`;
  try {
    const result = await spawnCodex({ args: [], prompt: 'p', env: process.env, timeoutMs: 1500 });
    assert.notEqual(result.code, 0);
    assert.notEqual(result.code, null);
    assert.match(result.stderr, /timed out/);
  } finally {
    process.env.PATH = saved;
  }
  // Times wide enough that a busy machine (several sites' pipelines at once, 2026-11-17) has started the process before
  // the timeout: at 300 ms it was sometimes not yet running when it was ended, and wrote its file after.
  await new Promise((done) => setTimeout(done, 5000));
  assert.ok(!existsSync(marker), 'nothing it started runs on after the timeout');
});

test('a judgment with no signed-in judge home fails and says how to sign in', async () => {
  const root = await mkdtemp(join(tmpdir(), 'judge-none-'));
  const saved = process.env.SF_CODEX_HOMES;
  process.env.SF_CODEX_HOMES = JSON.stringify([join(root, 'nowhere')]);
  try {
    const result = await runCodex({ root, prompt: 'p', lastMessage: join(root, 'm.md'), judge: true, spawnRun: async () => assert.fail('no run') });
    assert.equal(result.code, -1);
    assert.match(result.stderr, /codex login/);
  } finally {
    if (saved === undefined) delete process.env.SF_CODEX_HOMES; else process.env.SF_CODEX_HOMES = saved;
  }
});
