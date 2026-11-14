import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const writeJson = (p, d) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
};

// The stages questions are sorted into, in order: a manufacturer's by default, else the run's own (config.stages, a
// stage -> buying stage map written by geo-blog for a site in another trade).
export const stagesOf = (config) => (config.stages ? Object.keys(config.stages) : ["start", "find", "vet", "develop", "fabric", "produce", "ship"]);

export function runDir() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, "config.json"))) {
    console.error("usage: node <script> runs/<name>   (needs runs/<name>/config.json)");
    process.exit(1);
  }
  return dir;
}

// Serper call with on-disk cache, so re-runs never spend credits twice.
export function makeSerper(dir) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY not set");
  const cacheDir = path.join(dir, "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const stats = { calls: 0, cached: 0, credits: 0 };
  async function serper(endpoint, body) {
    const hash = crypto.createHash("sha256").update(endpoint + JSON.stringify(body)).digest("hex").slice(0, 24);
    const file = path.join(cacheDir, `${hash}.json`);
    if (fs.existsSync(file)) { stats.cached++; return readJson(file); }
    const res = await fetch(`https://google.serper.dev/${endpoint}`, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.message) throw new Error(`serper ${endpoint} failed: ${res.status} ${data.message ?? ""}`);
    stats.calls++;
    stats.credits += data.credits ?? 0;
    writeJson(file, { endpoint, body, data });
    return { endpoint, body, data };
  }
  return { serper, stats };
}
