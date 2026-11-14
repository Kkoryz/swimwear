import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

// Codex homes the runs use. A caller that sets CODEX_HOME (Site Factory) keeps its own; else SF_CODEX_HOMES (a JSON
// list); else .codex-judge and .codex-judge2 in the nearest folder above this one that holds a .codex-judge, in order.
// Never the personal ~/.codex (its instructions and skills leak into the answers).
const personal = path.resolve(os.homedir(), ".codex").toLowerCase();
function homesBase() {
  for (let dir = path.resolve(import.meta.dirname, ".."); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".codex-judge"))) return dir;
    if (path.dirname(dir) === dir) return path.resolve(import.meta.dirname, "..", "..");
  }
}
const HOMES = process.env.CODEX_HOME && path.resolve(process.env.CODEX_HOME).toLowerCase() !== personal
  ? [process.env.CODEX_HOME]
  : (process.env.SF_CODEX_HOMES ? JSON.parse(process.env.SF_CODEX_HOMES) : [".codex-judge", ".codex-judge2"].map((name) => path.join(homesBase(), name)))
    .filter((home) => path.resolve(home).toLowerCase() !== personal && fs.existsSync(path.join(home, "auth.json")));
const usageLimit = (text) => /hit your usage limit|usage limit reached|rate limit exceeded|429 Too Many Requests/i.test(text ?? "");

// Run `codex exec` non-interactively: prompt via stdin, JSON-schema-constrained final answer, read-only sandbox.
// A home whose usage limit is reached hands the run to the next one.
export function codexJson({ prompt, schema, label, search = false }) {
  if (!HOMES.length) throw new Error("no Codex judgment home signed in (.codex-judge / .codex-judge2 in a folder above, or SF_CODEX_HOMES): CODEX_HOME=<home> codex login");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "geo-codex-"));
  const schemaFile = path.join(tmp, "schema.json");
  const outFile = path.join(tmp, "out.json");
  fs.writeFileSync(schemaFile, JSON.stringify(schema));
  let r;
  for (const home of HOMES) {
    console.log(`[codex] ${label}: sending ${prompt.length} chars (${path.basename(home)})...`);
    r = spawnSync(
      "codex",
      [...(search ? ["--search"] : []), "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", tmp, "--output-schema", schemaFile, "-o", outFile, "-"],
      { input: prompt, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CODEX_HOME: home } },
    );
    if (r.status === 0 || !usageLimit(`${r.stderr}\n${r.stdout}`)) break;
    console.log(`[codex] ${label}: usage limit on ${path.basename(home)}`);
  }
  if (r.status !== 0 || !fs.existsSync(outFile)) {
    throw new Error(`codex failed (${label}) status=${r.status}\n${(r.stderr || "").slice(-2000)}`);
  }
  const text = fs.readFileSync(outFile, "utf8");
  try { return JSON.parse(text); }
  catch { throw new Error(`codex returned non-JSON (${label}):\n${text.slice(0, 1000)}`); }
}
