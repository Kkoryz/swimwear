// The judgment steps of site:run (the reference analysis, the module of each competitor section, the reference
// treatment, the design review) done by an agent: Codex runs in the site's folder with the step's instructions
// (config/agent-steps/<prompt>.md) and the images it has to look at. A step may be split into several runs (one per
// page type: a run sees only the images it judges); {{name}} in the instructions is filled from the run's values.
// Whether the step is done is still decided by its outputs (site-run.mjs), never by the agent's own word.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { usageLimit } from './codex-exec.mjs';
// The site's agent (lib/judge-exec.mjs: Claude by default, Codex where site.json says so).
import { runJudge } from './judge-exec.mjs';
import { writeJson } from './json-io.mjs';

// A judgment run reads many crops and may build the site: longer than an image run.
export const AGENT_TIMEOUT_MS = 60 * 60 * 1000;

// The instructions of one run: the step's file with {{name}} filled in (an unknown name is an error, not a blank).
export function fillPrompt(text, values = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`agent instructions use {{${name}}}, which this run does not set`);
    return String(values[name]);
  });
}

// PNG files of a folder (sorted), as paths the agent can be given.
export async function imagesIn(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith('.png')).sort().map((name) => resolve(dir, name));
}

// The JSON an agent replied with: its first ```json block, else the whole reply; null when it is no JSON.
export function replyJson(text) {
  const block = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  try { return JSON.parse((block ? block[1] : text).trim()); } catch { return null; }
}

// Runs at the same time for a step split into runs (one per page type): each run writes its own files.
export const AGENT_CONCURRENCY = 6;

// The exit code of a step whose agent could not be asked at all (its usage limit hit): nothing was tried.
export const AGENT_UNAVAILABLE = 75;

// Runs every run of an agent step, up to `concurrency` at a time; returns AGENT_UNAVAILABLE when a run found the agent
// unavailable, else the first non-zero exit code, else 0. The agent's final message of each run is appended to the
// step's log, in run order. A step with `reply` ((values, json) -> { path, data }) gets its answer as the run's final
// message, which this writes as UTF-8 JSON: the agent writes no file (writing JSON from a Windows shell cost runs
// several turns and broke non-ASCII text).
export async function runAgentStep({ step, root, log, codex = runJudge, concurrency = AGENT_CONCURRENCY }) {
  const instructions = await readFile(resolve(root, 'config/agent-steps', `${step.prompt}.md`), 'utf8');
  const runs = step.runs ? await step.runs(root) : [{ values: {}, images: [] }];
  const results = new Array(runs.length);
  let next = 0;
  const worker = async () => {
    while (next < runs.length) {
      const index = next;
      next += 1;
      const run = runs[index];
      const lastMessage = `${log}.${index + 1}.md`;
      // In a judge home (lib/codex-exec.mjs); a run that only answers (reply) cannot write anything.
      const result = await codex({ root, prompt: fillPrompt(instructions, run.values), images: run.images ?? [], lastMessage, timeoutMs: AGENT_TIMEOUT_MS, lean: true, judge: true, sandbox: step.reply ? 'read-only' : 'workspace-write', tokenLog: resolve(root, '.pipeline/agent-tokens.jsonl'), label: [step.id ?? step.prompt, ...Object.values(run.values).filter((value) => typeof value === 'string' && value.length < 40)].join(' ') });
      const reply = existsSync(lastMessage) ? await readFile(lastMessage, 'utf8') : '';
      let code = result.code;
      let note = '';
      if (code === 0 && step.reply) {
        const json = replyJson(reply);
        // A reply of the wrong shape (step.reply throws) fails the run like no JSON at all.
        let answer = null;
        try { answer = json === null ? null : step.reply(run.values, json); } catch (error) { note = `the reply is not what the step asks for (${error.message}): nothing written\n`; }
        // One file, or one per item when a run judges several (the photos of a batch).
        if (answer) {
          const files = [answer].flat();
          for (const file of files) await writeJson(resolve(root, file.path), file.data);
          note = `wrote ${files.map((file) => file.path).join(', ')} from the reply\n`;
        } else {
          code = 1;
          note ||= 'the reply holds no JSON: nothing written\n';
        }
      }
      results[index] = { code, unavailable: result.code !== 0 && usageLimit(result.stderr), text: `--- agent run ${index + 1}/${runs.length} ${JSON.stringify(run.values)}: exit ${result.code}\n${result.stderr}\n${reply}\n${note}` };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, runs.length) }, worker));
  for (const result of results) await writeFile(log, result.text, { flag: 'a' });
  // A step whose runs each wrote a part joins them (the section modules of every page type into one file).
  if (results.every((result) => result.code === 0) && step.join) await step.join(root);
  if (results.some((result) => result.unavailable)) return AGENT_UNAVAILABLE;
  // A run without an exit code (killed) failed too: it must not read as 0.
  const failed = results.find((result) => result.code !== 0);
  return failed ? failed.code || 1 : 0;
}
