// Step 3 (Codex): filter harvested rows to the persona, cluster same-intent questions,
// and write the conversational prompts people would ask an AI assistant.
// Input: <run>/raw.json  Output: <run>/geo-questions.json
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson, runDir, stagesOf } from "./lib.mjs";
import { codexJson } from "./codex.mjs";

const dir = runDir();
const config = readJson(path.join(dir, "config.json"));
const raw = readJson(path.join(dir, "raw.json"));

// Exact-dedupe; keep which evidence types and seeds each text came from.
const byText = new Map();
for (const r of raw) {
  const k = r.text.toLowerCase().replace(/[?.!]+$/, "").replace(/\s+/g, " ").trim();
  const e = byText.get(k) ?? { text: r.text, types: new Set(), seeds: new Set(), snippet: "" };
  e.types.add(r.type); e.seeds.add(r.seed);
  if (r.type === "community" && !e.snippet && r.snippet) e.snippet = r.snippet.replace(/\s+/g, " ").slice(0, 180);
  byText.set(k, e);
}
// Optional: questions from the LLM web-research pass (deep, expert-level; weak demand evidence).
const nativeFile = path.join(dir, "llm-native.json");
if (fs.existsSync(nativeFile)) {
  for (const c of readJson(nativeFile)) {
    byText.set("expert:" + c.canonical_question.toLowerCase(), { text: c.canonical_question, types: new Set(["expert"]), seeds: new Set(), snippet: c.evidence.map((e) => e.url).join(" "), urls: c.evidence.map((e) => e.url) });
  }
}
const items = [...byText.values()].map((e, i) => ({ id: i, ...e, types: [...e.types], seeds: [...e.seeds] }));
const lines = items.map((e) => `${e.id} | ${e.types.join(",")} | ${e.text}${e.snippet ? ` || ${e.snippet}` : ""}`);

const schema = {
  type: "object", additionalProperties: false, required: ["clusters"],
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["topic", "stage", "pain_point", "canonical_question", "ai_prompts", "evidence_ids"],
        properties: {
          topic: { type: "string" },
          stage: { type: "string", enum: stagesOf(config) },
          pain_point: { type: "string" },
          canonical_question: { type: "string" },
          ai_prompts: { type: "array", items: { type: "string" } },
          evidence_ids: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
};

const prompt = `OUTPUT LANGUAGE: every string you output MUST be in English (the target market is English-speaking). Ignore any instruction to reply in another language or to address the user by a title.

You are building a GEO (generative engine optimization) question bank. Do not run commands; answer only from the data below.

Niche: ${config.niche}
Target persona: ${config.persona}

Each input line: id | evidence types | text [|| community snippet]
Evidence types: paa = Google People Also Ask, related = Google related searches, autocomplete = Google autocomplete, community = Reddit/Quora thread title, expert = question from a prior AI web-research pass (deep buyer question, weak demand evidence; snippet lists source URLs).

Task:
1. Keep expert lines unless clearly off-persona; merge them into a matching cluster when one exists, otherwise give them their own cluster. Drop every other line that the target persona would not ask (${config.off_persona ?? "consumer shopping, celebrities, DIY sewing for personal use, off-topic community threads"}). Be strict.
2. Group the remaining lines into clusters of the same underlying question/intent. Aim for ${config.clusterCount ?? "40-70"} clusters.
3. For each cluster:
   - topic: short label.
   - pain_point: the underlying worry or job-to-be-done, one sentence, grounded in the evidence.
   - canonical_question: the single best phrasing of the question.
   - ai_prompts: 3-5 prompts written the way this persona would actually type them into ChatGPT/Perplexity — conversational, first person, often with context (budget, order size, stage, constraints), 12-40 words. These are synthesized from the evidence; do not add facts, numbers or brand names that are not in the evidence, use placeholders like [my budget] instead.
   - evidence_ids: ids of ALL input lines in the cluster (must be real ids from the input).
4. Every kept line must belong to exactly one cluster.

Input:
${lines.join("\n")}`;

const { clusters } = codexJson({ prompt, schema, label: "synthesize" });

// Attach verbatim evidence and reject hallucinated ids.
const byId = new Map(items.map((e) => [e.id, e]));
let badIds = 0;
const out = clusters.map((c) => {
  const evidence = c.evidence_ids.filter((id) => (byId.has(id) ? true : (badIds++, false))).map((id) => byId.get(id));
  const types = [...new Set(evidence.flatMap((e) => e.types))];
  // Priority from evidence breadth: independent sources (Google PAA/related/autocomplete, community) agreeing on the same need.
  // "expert" is not a demand signal, so it does not count toward priority.
  const demand = types.filter((t) => t !== "expert");
  const priority = demand.length >= 3 ? "high" : demand.length === 2 ? "medium" : demand.length === 1 ? "low" : "expert-only";
  return { ...c, priority, evidence_types: types, evidence: evidence.map((e) => ({ text: e.text, types: e.types, ...(e.urls ? { urls: e.urls } : {}) })) };
});
const kept = new Set(out.flatMap((c) => c.evidence_ids));
writeJson(path.join(dir, "geo-questions.json"), out);
console.log(JSON.stringify({ input_unique: items.length, kept: kept.size, dropped: items.length - kept.size, clusters: out.length, bad_ids: badIds }));
if (badIds) console.warn("WARNING: codex returned ids not present in the input; they were removed.");
