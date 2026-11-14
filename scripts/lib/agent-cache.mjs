// Answers of the judgment steps kept by what they were asked (.pipeline/agent-cache/): the step's instructions, each
// run's filled prompt and the values it sets that the prompt does not show, the content of every image it was shown and of the files the instructions name (the step's
// `reads`). The same question is never asked twice: when a step's outputs are gone or stale but it would be asked
// exactly what it was asked before, its outputs are put back from the record instead of running the agent.
// The agent reads more than it is told to; the key covers what the instructions name, which is the contract.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fillPrompt } from './agent-step.mjs';
import { readJson, writeJson } from './json-io.mjs';

const content = async (path) => (existsSync(path) ? readFile(path) : Buffer.from('missing'));

// The key of everything an agent step is asked, or null when it cannot be known (no instructions file).
export async function agentKey(root, step, { inputsHash }) {
  const instructions = resolve(root, 'config/agent-steps', `${step.prompt}.md`);
  if (!existsSync(instructions)) return null;
  const text = await readFile(instructions, 'utf8');
  const hash = createHash('sha256').update(step.prompt).update(text);
  for (const run of step.runs ? await step.runs(root) : [{ values: {}, images: [] }]) {
    hash.update(fillPrompt(text, run.values));
    // A value the instructions do not show still goes into the answer (the review records the rules it was judged by).
    const unshown = Object.entries(run.values ?? {}).filter(([name]) => !text.includes(`{{${name}}}`)).sort(([left], [right]) => left.localeCompare(right));
    if (unshown.length) hash.update(JSON.stringify(unshown));
    for (const image of run.images ?? []) hash.update(await content(image));
  }
  hash.update(await inputsHash(root, step.reads ?? []));
  return hash.digest('hex').slice(0, 24);
}

const recordPath = (root, key) => resolve(root, '.pipeline/agent-cache', `${key}.json`);

// Puts a recorded answer's files back; returns the files restored, or null when there is no complete record.
export async function restoreAnswer(root, key) {
  const record = key ? await readJson(recordPath(root, key), null) : null;
  if (!record || !record.files.every((file) => existsSync(resolve(root, '.pipeline/agent-cache', key, file)))) return null;
  for (const file of record.files) {
    await mkdir(dirname(resolve(root, file)), { recursive: true });
    await copyFile(resolve(root, '.pipeline/agent-cache', key, file), resolve(root, file));
  }
  return record.files;
}

// Records the files an agent step wrote (its own outputs that changed) under the key of what it was asked.
export async function recordAnswer(root, key, step, files) {
  if (!key || !files.length) return;
  for (const file of files) {
    const target = resolve(root, '.pipeline/agent-cache', key, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, file), target);
  }
  await writeJson(recordPath(root, key), { step: step.id, prompt: step.prompt, key, at: new Date().toISOString(), files });
}
