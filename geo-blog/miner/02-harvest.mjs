// Step 2: for each seed, collect questions and pain points from Serper:
//   search (PAA + related searches), autocomplete, community search (Reddit/Quora titles + snippets),
//   plus (optional, config.expand.enabled) one extra level of PAA expansion.
// Input: <run>/seeds.json  Output: <run>/raw.json
import path from "node:path";
import { readJson, writeJson, runDir, makeSerper } from "./lib.mjs";

const dir = runDir();
const config = readJson(path.join(dir, "config.json"));
const seeds = readJson(path.join(dir, "seeds.json"));
const { serper, stats } = makeSerper(dir);
const loc = { gl: config.gl ?? "us", hl: config.hl ?? "en" };
// config.harvest (2026-10-10, site-factory's sf fetch-questions writes it): paa false = PAA rows not kept (they come on
// the same paid result page as the related searches, so nothing is saved but weak evidence); community "off" = no
// paid community search (the caller adds the threads found with Codex's web search). Absent: the old behaviour.
const keepPaa = config.harvest?.paa !== false;
const communitySearch = (config.harvest?.community ?? "serper") === "serper";
// serperSkip: seeds no Serper call is made for (a solution page's; their community threads are added by the caller)
const serperSkip = new Set(config.harvest?.serperSkip ?? []);
const include = new RegExp(config.expand?.include ?? ".", "i");
const exclude = new RegExp(config.expand?.exclude ?? "$^", "i");

const rows = [];
const add = (r) => rows.push(r);

async function harvestSearch(q, seed, depth) {
  const { data } = await serper("search", { q, ...loc });
  if (keepPaa) for (const p of data.peopleAlsoAsk ?? []) add({ type: "paa", text: p.question, seed, from: q, depth, url: p.link, snippet: p.snippet });
  for (const r of data.relatedSearches ?? []) add({ type: "related", text: r.query, seed, from: q, depth });
  return (data.peopleAlsoAsk ?? []).map((p) => p.question);
}

const expandQueue = new Map();
for (const s of seeds) {
  const seed = s.seed;
  if (serperSkip.has(seed)) { console.log(`seed skipped (no Serper call): ${seed}`); continue; }
  const paa = await harvestSearch(seed, seed, 1);
  paa.forEach((q) => expandQueue.set(q.toLowerCase().replace(/\?$/, ""), { q, seed }));

  // Autocomplete on long seeds mostly appends "reddit"/"2024"/"usa" to our own phrase: weak evidence, wasted credit.
  if (seed.trim().split(/\s+/).length <= (config.autocompleteMaxWords ?? 4)) {
    const ac = (await serper("autocomplete", { q: seed, ...loc })).data;
    for (const x of ac.suggestions ?? []) add({ type: "autocomplete", text: x.value, seed, from: seed, depth: 1 });
  }

  if (communitySearch) {
    const community = (await serper("search", { q: `${seed} (site:reddit.com OR site:quora.com)`, ...loc })).data;
    for (const o of community.organic ?? []) add({ type: "community", text: o.title, seed, from: seed, depth: 1, url: o.link, snippet: o.snippet });
  }
  console.log(`seed done: ${seed}`);
}

let expanded = 0, gated = 0;
const seedSet = new Set(seeds.map((s) => s.seed.toLowerCase()));
// PAA expansion is off by default: on activewear it cost 37% of credits, 24/70 calls kept nothing,
// and it was the only evidence for 1 of 70 clusters (mostly adds phrasing variants).
for (const { q, seed } of config.expand?.enabled ? expandQueue.values() : []) {
  if (seedSet.has(q.toLowerCase())) continue;
  if (!include.test(q) || exclude.test(q)) { gated++; continue; }
  await harvestSearch(q, seed, 2);
  expanded++;
}

writeJson(path.join(dir, "raw.json"), rows);
const byType = rows.reduce((a, r) => ((a[r.type] = (a[r.type] ?? 0) + 1), a), {});
console.log(JSON.stringify({ seeds: seeds.length, expanded, gated, rows: rows.length, byType, ...stats }, null, 1));
