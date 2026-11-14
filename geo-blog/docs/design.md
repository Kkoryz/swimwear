# GEO blog research — design

One keyword in, one research pack out: five real buyer questions, what five AI surfaces answer and cite, the
competitor pages behind them, the gaps, and an outline. Writing starts only when the exit check passes.

## Steps and files (per run directory `runs/<slug>/`)

| Step | Command | Writes |
|---|---|---|
| 0 bank | `geo bank [--approve]` | `config.question_bank` — a bank covering the keyword (reused, cached or built by the miner (`miner/`) after a Serper quote) |
| 1 questions | `geo questions` | `01-questions.json` — 5 questions covering the 4 buying stages, each with verbatim evidence |
| 2 ask | `geo ask` | `02-receipts/<qid>-<engine>-r<n>.json` — full answer, cited URLs, our-site check |
| 3 fetch | `geo fetch` | `03-priority.json`, `03-sources/<id>.json` — priority cited pages via local Firecrawl |
| 4 gaps | `geo gaps` | `04-gaps/<qid>.json` — consensus / missing / our_angle (Codex judge) |
| 5 outline | `geo outline` | `05-outline.json`, `05-outline.md` (Codex judge) |
| exit | `geo check` | pass/fail list; exit code 1 on any failure |

`geo all` runs them in order and stops at the first failure. Every step skips work whose output already exists, so a
run can be resumed.

## Decisions

- **Questions** come from an existing GEO question bank (`geo-question-miner` `geo-questions.json`): miner stages map to
  the four buying stages; the highest-priority, best-evidenced cluster per stage is picked, the fifth slot goes to the
  next best. `config.questions` can name them by hand instead. The bank question a judge matches to `main_question`
  always takes its stage's slot (word overlap misses "which printing method" vs "sublimation, digital or screen").
- **Question bank** per keyword: when fewer than `bank_min_stages` buying stages have a question naming the keyword or
  a focus term (or the bank lacks any question for a stage, which the exit check would fail), the bank cached for
  keyword + market is used, or geo-question-miner builds one: 01-research, a judge drops seeds the wider bank already
  covers or that are off the keyword's angle (it may add seeds), the code tops every buying stage up to two seeds from
  the dropped ones (no seed for a stage = error before any quote), the per-stage counts and a Serper quote (~3 credits
  a seed) wait for `--approve`, then 02–04; a built bank without all four stages is an error. Its Codex calls use the judge homes, `.codex-judge2` when the first is used up.
- **Asking** drives the owner's own logged-in Chrome profile with Playwright (`.browser-profile/`, signed in once by the
  owner). Every AI engine gets `<question> Search the web and cite your sources.` in its no-memory mode
  (ChatGPT temporary chat, Claude incognito, Gemini temporary chat, Perplexity incognito); Google AI Overview gets the
  bare question. A CAPTCHA or login wall pauses the run until the owner clears it; the code never solves one.
- **Fallback**: failed receipts get `ask_attempts` browser rounds; what is still missing (or unavailable, e.g.
  Perplexity's free limit) is asked through DataForSEO — LLM Responses with web search and the same suffix for the
  AI engines, the Google SERP AI Overview for google_aio — until `api_fallback_budget_usd` (0.5) is spent, then `ask`
  stops with the spend. Such receipts say `via: "dataforseo"` and the API model (answers and citations differ from
  the web apps); browser receipts say `via: "browser"`.
- **Runs per engine** are configurable (`runs`, default 1). Repeats matter (answers and AI Overview citations change
  from run to run), so consensus/gap thresholds are expressed as shares of runs.
- **Fetching** keeps only pages worth comparing: cited in 2+ receipts, cited by AI Overview, or on a competitor domain;
  never video, government tariff tables, PDFs or marketplace listings.
- **Gaps** follow Google's helpful-content and AI-features guidance: a gap is information the answers and cited pages
  lack and that we can supply ourselves (original data, first-hand experience, analysis). A gap that could only be
  filled by re-citing other pages is not a gap. Company facts are a writing-stage input; a gap may name the owner
  input it needs.
- **Outline**: one article, one section per question (separate pages per question would be scaled content).
- **Exit check** is code, not judgment: questions ↔ receipts ↔ gaps ↔ outline must line up; every section must cover at
  least one gap (no consensus-only sections) and carry at least one verifiable source.

## Not in scope

Writing the article, Search Console metrics, AI Mode, Google top-10 pass (later), repeated runs across days (set
`runs` and run again).
