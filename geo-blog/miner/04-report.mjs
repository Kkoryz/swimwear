// Step 4: render geo-questions.json as Markdown (review) and CSV (hand-off to content planning).
import fs from "node:fs";
import path from "node:path";
import { readJson, runDir, stagesOf } from "./lib.mjs";

const dir = runDir();
const config = readJson(path.join(dir, "config.json"));
const clusters = readJson(path.join(dir, "geo-questions.json"));
const STAGES = stagesOf(config);
const PRI = { high: 0, medium: 1, low: 2, "expert-only": 3 };
clusters.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || PRI[a.priority] - PRI[b.priority]);

const md = [`# GEO question bank — ${config.niche}`, "", `Persona: ${config.persona}`, "",
  `${clusters.length} clusters. \`ai_prompts\` are synthesized from the evidence; \`evidence\` lines are verbatim from Google/Reddit/Quora, except \`expert\` lines (questions from the AI web-research pass). Priority counts only demand sources; \`expert-only\` = no search/community evidence.`, ""];
for (const stage of STAGES) {
  const group = clusters.filter((c) => c.stage === stage);
  if (!group.length) continue;
  md.push(`## ${stage}`, "");
  for (const c of group) {
    md.push(`### ${c.canonical_question}  \`${c.priority}\``, "", `- **Pain point:** ${c.pain_point}`, `- **Evidence types:** ${c.evidence_types.join(", ")} (${c.evidence.length} lines)`, "- **AI prompts:**");
    c.ai_prompts.forEach((p) => md.push(`  - ${p}`));
    md.push("- **Evidence:**");
    c.evidence.slice(0, 8).forEach((e) => md.push(`  - ${e.text} _(${e.types.join(",")})_`));
    if (c.evidence.length > 8) md.push(`  - …+${c.evidence.length - 8} more`);
    md.push("");
  }
}
fs.writeFileSync(path.join(dir, "geo-questions.md"), md.join("\n"));

const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const rows = [["stage", "priority", "topic", "canonical_question", "pain_point", "ai_prompts", "evidence_types", "evidence_count", "evidence_sample"]];
for (const c of clusters) rows.push([c.stage, c.priority, c.topic, c.canonical_question, c.pain_point, c.ai_prompts.join(" || "), c.evidence_types.join(","), c.evidence.length, c.evidence.slice(0, 5).map((e) => e.text).join(" || ")]);
fs.writeFileSync(path.join(dir, "geo-questions.csv"), "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n"));
console.log(`wrote geo-questions.md and geo-questions.csv (${clusters.length} clusters)`);
