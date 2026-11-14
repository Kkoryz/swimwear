# geo-blog

Keyword → five buyer questions → what ChatGPT, Claude, Gemini, Perplexity and Google AI Overview answer and cite →
competitor pages → gaps → outline → exit check → article → the site's blog. Design: [docs/design.md](docs/design.md).

It is the last module of the site flow: it runs after the site is live, not as a site-building stage. In the site
template it sits in `geo-blog/`.

`miner/` is geo-question-miner, which builds a question bank for a keyword that has none (Serper + Codex); `geo bank`
runs it. It also runs on its own: [miner/README.md](miner/README.md).

## Setup (once)

```bash
npm install
```

- Node 20.11+. Chrome is used from its normal install; Playwright downloads no browser.
- Sign in once in the tool's own Chrome profile (`.browser-profile/`, not committed): run any `ask`, and when it pauses,
  sign in to ChatGPT, Claude, Gemini and Perplexity (and Google) in the window it opened. Later runs reuse the sessions.
  Perplexity incognito has no stable selector: when `ask` pauses for it, turn it on from the account menu.
- A Firecrawl server for `fetch` (self-hosted with docker compose; `http://localhost:3002` by default).
- The `codex` CLI, signed in to two judgment homes: `.codex-judge` and `.codex-judge2`, found in the nearest folder
  above this one that holds a `.codex-judge` (so `D:/korey_seo/.codex-judge` both for `D:/korey_seo/geo-blog-research`
  and for `D:/korey_seo/seo_website_template/geo-blog`), or wherever `SF_CODEX_HOMES` says
  (`CODEX_HOME=<home> codex login` once each). The second takes over when the first hits its usage limit. Never the
  personal `~/.codex`: its instructions and skills leak into the answers.

Environment variables (secrets only in the environment, never in a file here):

| Variable | For | Default |
|---|---|---|
| `SERPER_API_KEY` | `bank` building a new question bank (miner 02-harvest) | required then |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | paid fallback for receipts the browser could not fill | required then |
| `SF_CODEX_HOMES` | the judgment homes, a JSON list of paths, e.g. `["D:/korey_seo/.codex-judge","D:/korey_seo/.codex-judge2"]` | `.codex-judge(2)` in the nearest folder above that has one |
| `FIRECRAWL_BASE_URL` | Firecrawl server | `http://localhost:3002` |
| `GEO_MINER_DIR` | the miner folder; new banks are built in its `runs/` | `miner/` |
| `GEO_BANK_REGISTRY` | the bank cache, keyword + market → bank file | `<miner_dir>/runs/geo-banks.json` |

Run from the template's `geo-blog/`, `miner/runs/` starts empty (it is not committed), so no cached bank is found and
`bank` would quote a new one: point `GEO_BANK_REGISTRY` (or `GEO_MINER_DIR`) at the machine's existing miner runs to
reuse them.

Each but the secrets also has a config key (`firecrawl_base_url`, `miner_dir`, `bank_registry`); a run's
`config.json` wins.

## Run

```bash
node bin/geo.mjs init runs/<slug>      # then edit runs/<slug>/config.json (keyword, market, question_bank, site_import…)
node bin/geo.mjs all runs/<slug>            # stops at a Serper quote when the keyword needs a question bank of its own
node bin/geo.mjs all runs/<slug> --approve  # after reviewing the seeds per stage and the quote
```

`all` runs bank → questions → ask → fetch → gaps → outline → check → write → site. Every step keeps what already exists,
so rerunning resumes; delete a file to redo it. Or step by step: `bank [--approve]`, `questions`,
`ask [--only chatgpt,claude]`, `fetch [--dry-run]`, `gaps`, `outline`, `check`, `write`, `site`, `apply`.

- **bank**: the configured bank is kept when it has questions in all four buying stages and on-keyword questions in
  `bank_min_stages` of them; else the cached bank for keyword + market; else the miner builds one. Before any Serper
  spend it prints the seeds per stage and a credit quote, and waits for `--approve`.
- **ask**: up to `ask_attempts` browser rounds; a reply under 400 characters with no citations counts as failed. What
  is still missing goes to DataForSEO (`via: "dataforseo"` in the receipt) until `api_fallback_budget_usd` is spent.
- **write** runs after a passing check: `06-article.md` plus `06-replacements.json` (company data that is not in the
  facts file is listed by its exact text; the article has no markers). Fill each entry's `real` and run `apply`.

Run data (`runs/*/`, `miner/runs/*`, Serper caches, receipts, fetched pages) stays local and is not committed.

## Articles for a site: `geo site`

The site build's last step calls one command with the site's profile:

```bash
node bin/geo.mjs site <site>/docs/research/geo-site.json [--count N]
```

The profile (`"schema": "geo-site/v1"`, written by the site build) has `site_dir`, `domain`, `brand_terms`, `keyword`
(the site's main keyword), `market`, `niche`, `persona`, `competitors`, `also_watch`, `facts_file`, `sitemap`, `posts`
(`<site_dir>/src/data/blog-posts.json`), `site_import`, `count` and `budget_usd_per_article`; optionally
`question_bank`.

1. The site's bank for the main keyword (`runs/<domain>/`): the profile's or the cached one, else the miner builds one
   from `niche` and `persona`.
2. The site's GEO articles are the posts the importer marked with `geo.run`. When there are `count` of them it ends.
3. A judge (`prompts/topics.md`) picks the missing topics from the bank questions no page, article or chosen topic
   answers and that have searched demand (PAA, related searches, autocomplete or Reddit/Quora; never `expert-only`):
   each a keyword, focus terms and a main question (`runs/<domain>/topics.json`).
4. Each topic runs `geo all` in `runs/<domain>-<topic>/`, unattended: a browser step that needs a person fails and
   DataForSEO fills it. The article's budget covers its share of the site bank (the first article), a bank built for
   its topic (auto-approved while it fits; `serper_usd_per_credit`, default 0.001) and DataForSEO.
5. A summary lists every article with its run, status, cost and the reason of a stop.

Exit codes, for `geo site` and every step: 0 done (`count` GEO articles on the site, in review); 2 stopped for the
owner (a quote or a spent budget over the limits, a missing profile field); 1 failed. Rerunning resumes: finished
topics are skipped, unfinished ones go on.

## The site (stage 08)

`site` hands the finished run to the site's own importer, and that is the whole interface:

```json
"site_import": { "cwd": "<site folder>", "command": ["node", "scripts/import-geo-article.mjs", "{runDir}"] }
```

`{runDir}` becomes the run's absolute path. The importer and its rules stay in the site template (seo_website_template):
`scripts/import-geo-article.mjs` reads the run's article and replacements, makes the visuals by
`docs/research/ARTICLE_VISUALS.md`, and builds the blog page for review. This repository does not copy or change them.
`site_dir` (or `site_import.cwd`) and `site_sitemap` let the outline and the article check see the site's existing
pages and posts, so a new article links to them and does not overlap them.

## Config

`config.example.json`: `runs` repeats each engine (default 1), `engines`, `prompt_suffix`, `consensus_min_share`,
`our_site` / `also_watch` (domain + brand terms checked in every answer), `competitors`, `question_bank` or a
hand-picked `questions` list, `focus_terms` and `main_question` (the bank question a judge matches to it is always
picked), `bank_min_stages` (default 3), `ask_attempts` (default 3), `api_fallback_budget_usd` (default 0.5),
`api_models` (per-engine API model overrides), `facts_file`, `site_import`, `site_dir`, `site_sitemap`.

A trade other than a manufacturer's names its own wording; the defaults are a manufacturer's, so the apparel sites
are unchanged. `stages`: the miner stages its questions are sorted into, in order, each mapped onto a buying stage
(`{"start":"awareness","find":"search","vet":"evaluation","fees":"evaluation","contract":"decision","handover":"decision"}`
for a service; all four buying stages must appear). `trade_examples`: `later_stage_topics` and `off_persona` for the
miner's research and synthesis, `image_subjects`, `hero`, `photo_settings` and `link` for the article prompt. A site
profile carries both (the site build's `site.json` `geoBlog.stages` and `geoBlog.tradeExamples`).

## Test

```bash
npm test
```
