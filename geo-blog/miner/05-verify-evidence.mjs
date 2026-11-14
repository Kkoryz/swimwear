// Step 5 (optional): check that LLM-cited evidence URLs exist and contain the quoted text.
// Non-Reddit: fetch page and look for the quote. Reddit (403 on direct reads): look the thread id up via Serper.
import path from "node:path";
import { readJson, writeJson, runDir, makeSerper } from "./lib.mjs";
const dir = runDir();
const clusters = readJson(path.join(dir, "llm-native.json"));
const { serper, stats } = makeSerper(dir);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
const norm = (s) => s.toLowerCase().replace(/&[a-z#0-9]+;/g, " ").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const results = [];
for (const c of clusters) for (const e of c.evidence) {
  let status = "unknown", detail = "";
  try {
    const u = new URL(e.url);
    if (u.hostname.endsWith("reddit.com")) {
      const id = u.pathname.match(/comments\/([a-z0-9]+)/i)?.[1];
      if (!id) { status = "no_thread_id"; }
      else {
        const { data } = await serper("search", { q: `site:reddit.com ${id}`, gl: "us" });
        const hit = (data.organic ?? []).find((o) => o.link.includes(id));
        status = hit ? "exists" : "not_found";
        detail = hit?.title ?? "";
      }
    } else {
      const res = await fetch(e.url, { headers: { "User-Agent": UA }, redirect: "follow" });
      if (!res.ok) status = `http_${res.status}`;
      else {
        const words = norm(e.quote).split(" ").slice(0, 8).join(" ");
        status = norm(await res.text()).includes(words) ? "quote_found" : "page_ok_quote_missing";
      }
    }
  } catch (err) { status = "error"; detail = String(err.message).slice(0, 80); }
  results.push({ url: e.url, quote: e.quote, status, detail });
}
writeJson(path.join(dir, "llm-native-verify.json"), results);
const tally = results.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
console.log(JSON.stringify({ total: results.length, tally, ...stats }));
