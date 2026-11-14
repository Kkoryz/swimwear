# geo-question-miner

Part of geo-blog: `geo bank` runs these scripts when a keyword needs a question bank of its own. They also run on
their own, from this folder.

Build a GEO question bank for a B2B persona: the questions they ask Google / Reddit / Quora, and the prompts they would type into an AI assistant, each backed by evidence.

Needs: Node 20.11+, `SERPER_API_KEY`, `codex` CLI signed in to the judgment homes `.codex-judge` in the nearest folder above that has one (then `.codex-judge2` when its usage limit is hit; `SF_CODEX_HOMES`, a JSON list, overrides them; a caller's own `CODEX_HOME` wins; never `~/.codex`). No npm deps.

## Run

```bash
mkdir runs/<name>   # write runs/<name>/config.json (copy runs/sportswear-mfr/config.json)
node 01-research.mjs runs/<name>        # Codex + web search: competitors, Reddit/Quora -> seeds.json + llm-native.json (deep "expert" questions)
node 02-harvest.mjs runs/<name>         # Serper: PAA + related + autocomplete + Reddit/Quora per seed -> raw.json
node 03-synthesize.mjs runs/<name>      # Codex: filter to persona, merge both sources, cluster, write AI prompts -> geo-questions.json
node 04-report.mjs runs/<name>          # geo-questions.md + geo-questions.csv
node 05-verify-evidence.mjs runs/<name> # optional: check the URLs Codex cited in step 1 really exist
```

Review `seeds.json` after step 1 before spending Serper credits. Serper responses are cached in `runs/<name>/cache/`.

## Cost per category (measured)

- Serper: ~3 credits per seed (search, autocomplete for seeds <= 4 words, community search). 30 seeds ≈ 80–90 credits.
- Codex: 2 calls (research with web search, synthesis) from your Codex plan.

## Config

- `niche`, `persona` — drive every Codex judgment; say explicitly who is NOT the persona.
- `competitors` — optional domains to study; empty lets Codex find them.
- `community.sites` — sites for the per-seed community search.
- optional: `seedCount`, `clusterCount`, `autocompleteMaxWords` (default 4), `expand: { enabled, include, exclude }` (PAA recursion, off by default: measured 37% of credits for ~1 extra cluster).

## Output

- `priority`: number of independent demand sources (PAA/related/autocomplete/community): 3+ high, 2 medium, 1 low; `expert-only` = only the step-1 research proposed it (deep question, no demand evidence).
- `ai_prompts` are synthesized; `evidence` lines are verbatim source data (`expert` lines come from step 1).

## Known limits

- Reddit blocks direct reads (403): only titles + snippets.
- No search volume; priority is evidence breadth, not demand size.
- Codex global config may force another language; prompts pin English.
