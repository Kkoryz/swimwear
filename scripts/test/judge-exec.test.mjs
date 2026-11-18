import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { agentFor, runJudge } from '../lib/judge-exec.mjs';
import { claudeArgs, runClaude, unavailableWhy, withImages } from '../lib/claude-exec.mjs';
import { usageLimit } from '../lib/codex-exec.mjs';

const site = async (json) => {
  const root = await mkdtemp(join(tmpdir(), 'judge-'));
  if (json) await writeFile(join(root, 'site.json'), JSON.stringify(json));
  return root;
};

test('a site judges with Claude by default and with Codex where it says so; images are always made by Codex (owner 2026-11-14)', async () => {
  const calls = [];
  const claude = async (options) => { calls.push(['claude', options.sandbox, options.model]); return { code: 0, stderr: '' }; };
  const codex = async (options) => { calls.push(['codex', options.image ?? false]); return { code: 0, stderr: '' }; };
  const plain = await site({ agent: 'codex' });
  assert.equal(agentFor(await site(null), {}), 'claude');
  assert.equal(agentFor(await site({}), {}), 'claude');
  assert.equal(agentFor(plain, {}), 'codex');
  assert.equal(agentFor(plain, { SITE_AGENT: 'claude' }), 'claude');
  const claudeSite = await site({ agentModel: 'claude-sonnet-5-5' });
  await runJudge({ root: claudeSite, prompt: 'review', sandbox: 'read-only' }, { claude, codex, env: {} });
  await runJudge({ root: claudeSite, prompt: 'a photo', image: true }, { claude, codex, env: {} });
  await runJudge({ root: plain, prompt: 'review', sandbox: 'read-only' }, { claude, codex, env: {} });
  // A run naming its own model (the claude-seo audit's auditors, owner 2026-11-17) keeps it over the site's.
  await runJudge({ root: claudeSite, prompt: 'audit', sandbox: 'read-only', model: 'claude-opus-5-5' }, { claude, codex, env: { CLAUDE_JUDGE_MODEL: 'claude-haiku-5-5' } });
  assert.deepEqual(calls, [['claude', 'read-only', 'claude-sonnet-5-5'], ['codex', true], ['codex', false], ['claude', 'read-only', 'claude-opus-5-5']]);
});

test("a Claude run keeps apart from the owner's settings, answers into lastMessage, and a limit or sign-in waits as Codex's does", async () => {
  const readOnly = claudeArgs({ sandbox: 'read-only' });
  assert.ok(readOnly.includes('--safe-mode') && readOnly[readOnly.indexOf('--setting-sources') + 1] === '', 'not the owner\'s hooks, instructions or memory');
  assert.deepEqual([readOnly[readOnly.indexOf('--model') + 1], readOnly[readOnly.indexOf('--effort') + 1]], ['claude-opus-5-5', 'high']);
  assert.ok(!readOnly.includes('Edit') && !readOnly.includes('Write'), 'a review writes nothing');
  assert.ok(claudeArgs({ sandbox: 'workspace-write' }).includes('Edit'), 'a repair edits');
  assert.match(withImages('Review.', ['a.png', 'b.png']), /1\. a\.png\n2\. b\.png/);
  const root = await site({});
  const lastMessage = join(root, 'out.md');
  const tokenLog = join(root, 'tokens.jsonl');
  const ok = await runClaude({ root, prompt: 'p', lastMessage, tokenLog, spawnRun: async ({ args, prompt }) => { assert.equal(prompt, 'p'); assert.ok(args.includes('-p')); return { code: 0, stdout: JSON.stringify({ type: 'result', is_error: false, result: '```json\n{"findings":[]}\n```', usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.01 }), stderr: '' }; } });
  assert.equal(ok.code, 0);
  assert.match(await readFile(lastMessage, 'utf8'), /"findings":\[\]/);
  assert.match(await readFile(tokenLog, 'utf8'), /"agent":"claude"/);
  const expired = await runClaude({ root, prompt: 'p', lastMessage: join(root, 'x.md'), spawnRun: async () => ({ code: 1, stdout: JSON.stringify({ is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' }), stderr: '' }) });
  assert.ok(expired.code !== 0 && usageLimit(expired.stderr), 'an expired sign-in makes the step wait, it does not fail the run');
  assert.ok(usageLimit(unavailableWhy('Claude AI usage limit reached|1731600000')));
  assert.equal(unavailableWhy('the reply holds no JSON'), null);
});

test("a Claude run uses the judge directories in turn, never the owner's, and none of the parent session's variables", async () => {
  const { judgeDirs, judgeEnv } = await import('../lib/claude-exec.mjs');
  const { homedir } = await import('node:os');
  const root = await site({});
  assert.equal(judgeDirs(join(root, 'site'), {})[0], join(root, '.claude-judge08'));
  assert.throws(() => judgeDirs(root, { SITE_CLAUDE_CONFIG_DIRS: JSON.stringify([join(homedir(), '.claude')]) }), /owner's own Claude directory/);
  const clean = judgeEnv('J', { PATH: 'p', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x', ANTHROPIC_API_KEY: 'k', CLAUDE_AGENT_SDK_VERSION: 'v', OTHER: 'o' });
  assert.deepEqual(clean, { PATH: 'p', OTHER: 'o', CLAUDE_CONFIG_DIR: 'J' });
  // The first directory is at its limit: set aside, the second answers; the next run goes straight to the second.
  const [first, second] = [join(root, 'judge-a'), join(root, 'judge-b')];
  const env = { SITE_CLAUDE_CONFIG_DIRS: JSON.stringify([first, second]) };
  const asked = [];
  const spawnRun = async ({ env: runEnv }) => {
    asked.push(runEnv.CLAUDE_CONFIG_DIR);
    return runEnv.CLAUDE_CONFIG_DIR === first ? { code: 1, stdout: JSON.stringify({ is_error: true, result: "You've hit your usage limit" }), stderr: '' } : { code: 0, stdout: JSON.stringify({ is_error: false, result: 'ok' }), stderr: '' };
  };
  assert.equal((await runClaude({ root, prompt: 'p', lastMessage: join(root, 'a.md'), env, spawnRun })).code, 0);
  assert.equal((await runClaude({ root, prompt: 'p', lastMessage: join(root, 'b.md'), env, spawnRun })).code, 0);
  assert.deepEqual(asked, [first, second, second]);
  // With every directory out, the run says so in the words that make the step wait.
  const none = await runClaude({ root, prompt: 'p', lastMessage: join(root, 'c.md'), env: { SITE_CLAUDE_CONFIG_DIRS: JSON.stringify([first]) }, spawnRun });
  assert.ok(none.code !== 0 && usageLimit(none.stderr));
});

test("a judge whose answer is JSON gets it from an earlier message when its final one is a note (aloha 2026-11-18: two auditors closed on a note)", async () => {
  const { replyOf, claudeArgs } = await import('../lib/claude-exec.mjs');
  const said = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  const result = (text) => JSON.stringify({ type: 'result', result: text, is_error: false, usage: {} });
  const stdout = [said('Reading the pages.'), said('```json\n{"findings": []}\n```'), said('Waiting on the last reader.'), result('The final JSON is my previous reply.')].join('\n');
  assert.match(replyOf(stdout, { earlierJson: true }).text, /"findings"/);
  assert.equal(replyOf(stdout).text, 'The final JSON is my previous reply.', 'other judges keep their final message');
  assert.equal(replyOf([said('{"a": 1}'), result('{"b": 2}')].join('\n'), { earlierJson: true }).text, '{"b": 2}', 'a final JSON stands');
  assert.deepEqual(claudeArgs({ stream: true }).slice(claudeArgs({ stream: true }).indexOf('--output-format'), claudeArgs({ stream: true }).indexOf('--output-format') + 3), ['--output-format', 'stream-json', '--verbose']);
});
