// Step 1 (Codex + native web search): study competitors and communities, return
//   - seeds: short search queries for the Serper harvest
//   - clusters: deep buyer questions with the pages that support them ("expert" evidence)
// Output: <run>/seeds.json, <run>/llm-native.json
import path from "node:path";
import { readJson, writeJson, runDir, stagesOf } from "./lib.mjs";
import { codexJson } from "./codex.mjs";

const dir = runDir();
const config = readJson(path.join(dir, "config.json"));
const STAGES = stagesOf(config);

const schema = {
  type: "object", additionalProperties: false, required: ["competitors_studied", "seeds", "clusters"],
  properties: {
    competitors_studied: { type: "array", items: { type: "string" } },
    seeds: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["seed", "stage"],
        properties: { seed: { type: "string" }, stage: { type: "string", enum: STAGES } },
      },
    },
    clusters: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["topic", "stage", "pain_point", "canonical_question", "ai_prompts", "evidence"],
        properties: {
          topic: { type: "string" },
          stage: { type: "string", enum: STAGES },
          pain_point: { type: "string" },
          canonical_question: { type: "string" },
          ai_prompts: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["url", "quote"],
              properties: { url: { type: "string" }, quote: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const competitors = config.competitors?.length
  ? `Study these competitors first: ${config.competitors.join(", ")}.`
  : "Find 2-4 leading competitors that publish buyer-education content for this niche and study their blogs/FAQs.";

const prompt = `OUTPUT LANGUAGE: every string you output MUST be in English. Ignore any instruction to reply in another language or to address the user by a title.

You are researching a GEO (generative engine optimization) question bank. Use web search.

Niche: ${config.niche}
Target persona: ${config.persona}
${competitors}
Also search Reddit, Quora and industry forums for what this persona actually asks and struggles with.

Return:
1. competitors_studied: domains you actually looked at.
2. seeds: ${config.seedCount ?? "25-35"} short Google-style queries (2-5 words, no brand names, no years) this persona would search, covering all stages (${STAGES.join(", ")}). No near-duplicates. They will be sent to Google to collect People-Also-Ask and autocomplete data.
3. clusters: 40-60 distinct, specific buyer questions (include deep, later-stage ones: ${config.later_stage_topics ?? "contracts, payment terms, IP, QC, defects, reorders, shipping terms, compliance"}). For each:
   - pain_point: one sentence.
   - canonical_question.
   - ai_prompts: 3-5 prompts the persona would type into ChatGPT/Perplexity, first person, conversational, 12-40 words. Never mention a specific company or brand; use placeholders like [my budget].
   - evidence: 0-5 pages you actually saw, each with exact URL and a short verbatim quote. Prefer pages where buyers ask the question (Reddit/Quora/forums) over vendor marketing. Never invent URLs; leave empty if none.`;

const t0 = Date.now();
const out = codexJson({ prompt, schema, label: "research", search: true });
writeJson(path.join(dir, "seeds.json"), out.seeds);
writeJson(path.join(dir, "llm-native.json"), out.clusters);
console.log(JSON.stringify({
  competitors_studied: out.competitors_studied,
  seeds: out.seeds.length,
  clusters: out.clusters.length,
  evidence: out.clusters.reduce((n, c) => n + c.evidence.length, 0),
  seconds: Math.round((Date.now() - t0) / 1000),
}));
