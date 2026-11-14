# BLOG_METHOD — Evidence-based blog methodology for B2B apparel manufacturer sites

Status: research deliverable, 2026-09-25. Read-only on all sources. For an automated pipeline that writes, publishes and maintains blog articles after a site launches.
Audience of the sites: apparel brand founders, Amazon/DTC sellers, teams/clubs/schools — buyers, not consumers.

---

## 0. How to read this document

### 0.1 Source path shorthand

| Prefix | Absolute location |
|---|---|
| `G/` | `D:/korey_seo/google-search-knowledge/markdown/current/` (Google Search Central, retrieved 2026-09-19, current) |
| `GH/` | `D:/korey_seo/google-search-knowledge/markdown/historical/` |
| `ahrefs/` | `D:/korey_seo/seo-industry-knowledge/markdown/ahrefs/ahrefs.com/` |
| `backlinko/` | `D:/korey_seo/seo-industry-knowledge/markdown/backlinko/backlinko.com/` |
| `moz/` | `D:/korey_seo/seo-industry-knowledge/markdown/moz/moz.com/` |
| `semrush/` | `D:/korey_seo/seo-industry-knowledge/markdown/semrush/www.semrush.com/` |
| `sej/` | `D:/korey_seo/seo-industry-knowledge/markdown/sej/www.searchenginejournal.com/` |
| `yoast/` | `D:/korey_seo/seo-industry-knowledge/markdown/yoast/yoast.com/` |
| `sf/` | `D:/korey_seo/seo-industry-knowledge/markdown/screamingfrog/www.screamingfrog.co.uk/` |
| `bing/` | `D:/korey_seo/seo-industry-knowledge/markdown/bing/blogs.bing.com/` |
| `GQ` | `D:/korey_seo/geo-question-miner/runs/sportswear-mfr/geo-questions.json` + handoff `D:/korey_seo/handoffs/2026-09-25-geo-question-miner-handoff.md` |
| `SF07` | `D:/korey_seo/site-factory-clean-int/docs/methodology/stage-rules/07-authoring.md` (existing Site Factory authoring rules, for alignment only) |

Year in parentheses = the source's `published` year from its frontmatter. Industry sources are `validity: unreviewed` vendor content; Google docs are the official current state.

### 0.2 Evidence tags

- **[G]** Google official current documentation. **[B]** Bing official.
- **[2+]** two or more agreeing independent sources (paths listed).
- **[1]** single source (or several articles from one vendor). Use with caution.
- **[H]** our own default/heuristic; no KB source gives this number. Must be calibrated.
- **[C-n]** there is a documented conflict; see section H.

### 0.3 Facts that changed since common SEO advice (read first)

1. **FAQ rich results no longer exist in Google Search.** Deprecated 2026-05-08, documentation removed 2026-06-15 (`G/search__updates.md`; `sej/google-drops-faq-rich-results-from-search__574429.md`). HowTo rich results were removed in 2023 (`G/search__updates.md`; `sej/google-completely-removes-how-to-rich-results__496479.md`). The GEO-miner handoff (§6.2 stage 10) says FAQPage schema is on by default in the template. That default brings no Google benefit, so a decision is needed (see H).
2. **Google does not use llms.txt, "chunking", or special schema for AI features.** Clarified in `G/search__docs__fundamentals__ai-optimization-guide.md` (llms.txt note added 2026-06-15 per `G/search__updates.md`). Ahrefs measured schema causally: no AI-citation lift (`ahrefs/blog__schema-ai-citations.md`, 2026).
3. **Creating a page for every query variant or fan-out query is scaled content abuse.** Google says so explicitly in `G/search__docs__fundamentals__ai-optimization-guide.md` and `G/search__docs__essentials__spam-policies.md`. This is the main legal constraint on an automated blog.
4. **Changing dates without substantive change is named as a search-engine-first warning sign.** See `G/search__docs__fundamentals__creating-helpful-content.md`. Moz measured +66% traffic for about 2 months from date-only changes (`moz/blog__case-study-can-you-fake-blog-post-freshness.md`, 2015). The gate must forbid it anyway.
5. **Top-10 ranking is no longer a reliable proxy for AI Overview citation.** 76.1% of AIO citations came from the top 10 in 2025 (`ahrefs/blog__search-rankings-ai-citations.md`). Only 37.9% did in 2026 (`ahrefs/blog__ai-overview-citations-top-10.md`), attributed to wider query fan-out.
6. **Google does not use IndexNow.** No Google doc mentions it; `moz/blog__fundamentals-of-crawling-whiteboard-friday.md` (2023) says Google does not use the API. IndexNow covers Bing/Copilot, Yandex and other participants (`bing/webmaster__october-2021__IndexNow-Instantly-Index-your-web-content-in-Search-Engines.md`).

---

## A. Strategy

### A1. What the blog is for on a manufacturer site

The blog captures **buyer-question demand that product/solution pages cannot satisfy**, then hands readers to commercial pages and the RFQ form. It also supplies passages AI answer engines can cite.

It does **not** target category head terms. Examples: "custom sportswear manufacturer", "private label activewear manufacturer", "low MOQ jersey factory". Those SERPs are dominated by commercial pages, and the blog would cannibalise our own solution pages.

- Blog posts rank for informational and commercial-investigation queries. Transactional queries return commercial pages. [2+] `semrush/blog__blog-seo.md` (2020, mod 2026); `ahrefs/blog__blog-seo.md` (2021); `ahrefs/blog__search-intent.md` (2023); `backlinko/hub__seo__search-intent.md` (2019).
- Manufacturer example: "how much do clothing manufacturers charge" is informational and blog-suitable. [1] `backlinko/seo-for-manufacturers.md` (2024).
- AIO triggering is concentrated in question-form, long, informational queries. It is growing in commercial queries and in manufacturing. [2+]
  - `ahrefs/blog__ai-overview-triggers.md` (2025): 57.9% of question queries trigger AIO; 3.2% of shopping queries do.
  - `semrush/blog__semrush-ai-overviews-study.md` (2025).
  - `semrush/blog__manufacturing-seo-ai-search.md` (2026): AIO-covered search volume in manufacturing rose from 38% to 57%.
  - Consequence: the buyer-question topics in `GQ` sit where AI answers are most active. Citability (section G) is part of the goal, not an extra.

### A2. Governing principles (apply to every step)

| # | Principle | Evidence |
|---|---|---|
| P1 | **People-first, non-commodity content.** Each article must add something a generic summary or an LLM could not produce: factory data, process photos, real tolerances, lead-time and MOQ policy, worked examples. | [G] `G/search__docs__fundamentals__creating-helpful-content.md`; [G] `G/search__docs__fundamentals__ai-optimization-guide.md` (commodity vs non-commodity examples); [2+] `ahrefs/blog__how-to-stand-out-from-ai-content.md` (2024), `backlinko/information-gain.md` (2024) |
| P2 | **Company facts come only from the company fact sheet.** Every other factual claim cites a primary external source. No fabricated statistics. | [G] `creating-helpful-content` (clear sourcing; easily verified factual errors); [2+] `backlinko/google-e-e-a-t.md`, `semrush/blog__ai-generated-content-guide.md` (2024), `sej/fact-checking-get-your-facts-right__463789.md` (2022); aligns with SF07 B1 (`no_unsupported_company_claim`) |
| P3 | **Quality is judged site-wide.** Unhelpful pages can hold back the whole site, so publish fewer, better posts. | [G] `G/search__docs__appearance__ranking-systems-guide.md` (helpful-content system merged into core in March 2024); [G] `G/search__docs__appearance__core-updates.md` (removing unhelpful content can help the rest) |
| P4 | **Stay inside the site's primary purpose.** Write only about topics the existing buyer audience needs: sourcing, development, fabric, production, QC, shipping, compliance, commercial models. | [G] `creating-helpful-content` (warning signs: many unrelated topics, trend-chasing, entering a niche without expertise); [2+] `ahrefs/blog__topical-authority.md` (2026), `backlinko/topical-authority.md` (2026) [C-8] |
| P5 | **One intent, one URL.** Never create a page per keyword variant or AI fan-out query. | [G] `ai-optimization-guide`; [G] `G/search__docs__essentials__spam-policies.md` (scaled content abuse, doorway abuse) |
| P6 | **Automation discloses and is human-reviewed.** Say how content was made where a reader would reasonably ask. A human signs off before publishing. | [G] `creating-helpful-content` (Who/How/Why); [G] `G/search__docs__fundamentals__using-gen-ai-content.md`; [2+] `sej/google-says-ai-generated-content-should-be-human-reviewed__553486.md` (2025), `semrush/blog__does-ai-content-rank-in-search-data-study.md` (2026) |

### A3. Topic sourcing: the buyer-question library is a signal, not a fact source

`GQ` holds 60 clusters across 7 buying stages (start, find, vet, develop, fabric, produce, ship). Priority is high 32, medium 7, low 8, expert-only 13.

The handoff defines its trust levels:
- `evidence[].text` with types paa/related/autocomplete/community is **observed** data.
- `canonical_question`, `pain_point` and `ai_prompts` are **model-synthesised**.
- `priority` counts independent demand-source types. **It is not search volume.**

Rules for the pipeline:
- Use `GQ` clusters as **topic seeds and outline questions**. Validate every candidate with a live SERP (B2) and a traffic-potential estimate (B1). A cluster's `priority` never substitutes for demand measurement. [GQ handoff §3, §5]
- `ai_prompts` supply reader context (budget, quantity, deadline, team order, Amazon seller). They are **never** a fact source. [GQ handoff §3]
- `expert-only` clusters (e.g. "MOQ allocation rules", "pre-production sample approval") have no observed search demand. They are candidates only if they meet the zero-volume exception B1.4.

**Indicative ownership map** [H — this is a proposal. Each row must still pass the B2 SERP check.]

| GQ cluster type | Default owner | Why |
|---|---|---|
| Category + manufacturer/OEM/private-label/custom/wholesale ("custom teamwear sourcing", "startup-friendly low-MOQ factories") | **Commercial/solution page.** The blog links to it and does not target it. | SERP is commercial (B2.1) |
| Decision guides ("OEM vs ODM vs private label", "domestic vs overseas", "full-package vs separate suppliers", "sublimation vs screen print vs embroidery", "recycled vs virgin polyester") | **Blog** (comparison/decision post) linking to the relevant solution page | Commercial-investigation intent; BoFu formats (B1.6) |
| Process/how-to ("sample development workflow", "factory-ready tech packs", "fit validation and grading", "inspection plans and AQL", "manufacturer outreach") | **Blog** (guide/checklist) | Informational; first-hand process evidence possible |
| Cost/money ("manufacturing costs", "startup budget", "landed cost", "payment terms") | **Blog**, but only with company-fact price bands or clearly sourced external ranges | Needs facts (P2); high AIO activity |
| Compliance/shipping ("children's sportswear compliance", "apparel labeling", "customs documentation", "shipping terms") | **Blog**, requires primary regulatory sources and human expert review | Safety/legal-adjacent; Google weighs E-E-A-T more for safety/financial topics [G] `creating-helpful-content` (YMYL) |
| Company-specific answers ("can I combine styles to meet MOQ?", "who owns my patterns?") | **Solution-page FAQ / key facts**, not a stand-alone post, unless the SERP shows blog demand | Answer is a company policy (fact sheet), not a topic |

### A4. Funnel mix

Prioritise **bottom-of-funnel and pain-point topics**: comparisons, evaluation checklists, cost guides, case studies. Keep some top-of-funnel for topical coverage. [C-5]
- BoFu evidence is thin. [1] Grow & Convert, one client, reported via `sej/bottom-of-funnel-keywords-seo__489814.md` (2023): 4.78% vs 0.19% conversion rate. Supporting sources: `moz/blog__bofu-content.md` (2024), `ahrefs/blog__b2b-content-marketing.md` (2023).
- Counter-view: Moz (`moz/blog__blog-topic-clusters.md`, 2025) warns against BoFu-only.
- Default [H]: roughly 60% BoFu/decision, 40% process/education topics per quarter.

### A5. What "high-traffic" realistically means here

- B2B volumes are structurally low. Do not use volume as a kill criterion. Use **traffic potential** (the traffic the current #1 page earns across all its keywords) and **business potential**.
  - [2+] `semrush/blog__b2b-seo.md` (2020); `yoast/b2b-seo.md` (2017); `backlinko/seo-for-manufacturers.md` (2024): a 30-searches/month manufacturing term had a $13.34 CPC.
  - [1] Ahrefs (vendor) for the traffic-potential method: `ahrefs/blog__seo-content-strategy.md` (2022).
- The KB contains **no apparel-manufacturer or B2B-manufacturer blog study**. Every numeric threshold for this niche must be calibrated on our own Search Console data.

---

## B. Per-step rules with sources

### B1. Topic selection and keyword research

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B1.1 | Score every candidate on **business potential (0–3)**, **traffic potential**, and **ranking potential**. Reject any candidate with business potential 0–1. Scale: 3 = our service is the natural solution; 0 = cannot mention it. | [2+] | `ahrefs/blog__brew-framework.md` (2025); `ahrefs/blog__seo-content-strategy.md` (2022); `moz/blog__blog-topic-clusters.md` (2025) (pillar topic must map to the product and link naturally to product pages) |
| B1.2 | Estimate value from **traffic potential of the SERP**, not single-keyword volume. Keywords sharing a parent topic go to **one** page. | [1] vendor; Google-consistent | `ahrefs/blog__seo-content-strategy.md`; `ahrefs/blog__long-tail-keywords.md` (2021); [G] `ai-optimization-guide` (AI understands synonyms; no need to cover every variant) |
| B1.3 | New sites start with **low-difficulty** long-tail/question keywords. KD filters are examples, not rules: Ahrefs examples are KD ≤ 20 with TP ≥ 500, and KD < 10. | [2+] | `ahrefs/blog__blog-post-ideas.md` (2024); `ahrefs/blog__low-competition-keywords.md` (2021); `moz/blog__blog-topic-clusters.md` (2025); `yoast/b2b-seo.md` (2017) |
| B1.4 | **Zero/low-volume exception:** accept only if the topic is independent (its own parent topic) **and** has clear business intent. | [2+] [C-6] | `ahrefs/blog__zero-volume-keywords.md` (2022); `backlinko/seo-for-manufacturers.md` (2024); `moz/blog__blog-topic-clusters.md` (2025) |
| B1.5 | Take seeds from buyer questions (GQ, sales team, RFQ emails), industry terminology, and competitor content gaps. CPC is only a secondary signal: a high CPC on a service we don't sell is irrelevant. | [2+] | `ahrefs/blog__b2b-seo-strategy.md` (2022); `semrush/blog__b2b-seo.md` (2020); `backlinko/topic-clusters.md` (2024); `yoast/b2b-seo.md` |
| B1.6 | Tag each topic with **persona** (founder / Amazon-DTC seller / team buyer) and **funnel stage**. Prefer BoFu formats: comparison, alternatives, evaluation checklist, cost guide, case study. | [2+] | `ahrefs/blog__b2b-content-marketing.md` (2023); `moz/learn__seo__b2b-seo-strategy.md`; `moz/blog__bofu-content.md` (2024); `moz/blog__overlooked-bofu-formats.md` (2025) |
| B1.7 | **Capability check:** if the SERP demands something we cannot supply (lab tests, a calculator, many products tested), drop or re-angle the topic. | [2+] | `ahrefs/blog__seo-content-strategy.md`; `backlinko/programmatic-seo.md` (2025); [G] `ai-optimization-guide` (first-hand perspective) |
| B1.8 | Check whether the current AI answer (AIO / ChatGPT / Perplexity) is thin or weakly sourced; that is an opportunity. | [1] | `semrush/blog__blog-seo.md` (2026 revision) |

### B2. Search-intent validation (blog vs commercial page)

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B2.1 | Fetch the live top 10 for the target market. Label each result by **type** (blog/guide, product, category, landing, tool, forum, video), **format** and **angle** (the "3Cs"). If commercial types dominate, **do not write a blog post**. Route the keyword to the commercial page, or reject it. | [2+] | `ahrefs/blog__search-intent.md` (2023); `semrush/blog__search-intent.md` (2022); `backlinko/hub__seo__search-intent.md` (2019); `yoast/search-intent.md` (2025); `ahrefs/blog__blog-seo.md` (2021) |
| B2.2 | **Mixed SERP:** take the dominant share. If commercial and informational are mixed, a buying guide or comparison post can work, but it must link to the commercial page. | [2+] | `moz/blog__understanding-fulfilling-search-intent.md` (2020); `yoast/search-intent.md` (2025); `ahrefs/blog__keyword-difficulty.md` |
| B2.3 | Match the **dominant format** (how-to, list, comparison, definition). With no clear winner, follow the top 2–3 results. | [2+] | `ahrefs/blog__blog-seo.md`; `semrush/blog__blog-seo.md` |
| B2.4 | Re-check intent every quarter and on any traffic drop. **Intent shift** (e.g. SERP flips from guides to product pages) means a format change or retirement, not just an update. | [2+] | `ahrefs/blog__search-intent-shift.md` (2024); `semrush/blog__blog-seo.md` (2026 revision) |
| — | Threshold for "dominant": **none in the KB**. [H] Default: blog/guide types hold ≥ 5 of the top 10 → blog; ≤ 2 → commercial; 3–4 → comparison/guide with a strong commercial link, human review. | [H] | — |

### B3. Cannibalisation (blog vs blog, blog vs commercial)

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B3.1 | Before creating a topic, check a **keyword→URL map covering all existing URLs, including commercial pages**. Same primary query and same intent as an existing URL → update that URL, don't create a new one. | [2+] | `yoast/keyword-cannibalization.md` (2025); `backlinko/keyword-cannibalization.md` (2024); `moz/blog__keyword-cannibalization.md` (2025); `sej/ai-workflow-content-cannibalization__543352.md` (2025) |
| B3.2 | It is **real cannibalisation** only when all hold: same query, same intent, Search Console impressions for both, and swapping or both-underperforming rankings. A how-to guide plus a conversion page sharing a term is **not** cannibalisation. | [2+] [C-3] | `sej/ask-an-seo-how-do-i-identify-cannibalization-problems-consolidate-without-loss-of-visibility__553881.md` (2026); `ahrefs/blog__keyword-cannibalization.md` (2021); Mueller via `sej/google-answers-seo-question-about-keyword-cannibalization__556472.md` (2025) |
| B3.3 | **Fix order:** (1) same intent → merge, 301, update internal links, drop the old URL from the sitemap; (2) overlapping but different intent → sharpen the intent difference; (3) correct anchors. Do not use noindex. Use canonical only for near-duplicates. | [2+] [C-4] | `ahrefs/blog__keyword-cannibalization.md`; `backlinko/keyword-cannibalization.md` (+466% clicks after a merge, 2024); [G] `G/search__docs__crawling-indexing__consolidate-duplicate-urls.md` |
| B3.4 | **Anchor routing:** transactional wording ("custom team jersey manufacturer") links to the commercial page. Informational wording links to posts. One exact anchor never points to two different URLs. | [2+] | `sej/ask-an-seo-how-do-i-identify-cannibalization-problems-consolidate-without-loss-of-visibility__553881.md`; `backlinko/keyword-cannibalization.md`; `moz/blog__keyword-cannibalization.md` |
| B3.5 | **Reserved-term list:** category + manufacturer/OEM/ODM/private label/wholesale/custom/factory/supplier may never be a blog post's primary keyword. They may appear only as anchors to commercial pages. | [H] derived from B2.1 + B3.4 | — |
| B3.6 | Embedding-similarity pre-check against every existing URL (title + H1 + intro). SEJ gives cosine ≥ 0.9 (0.85 as an alternative) as the overlap flag. | [1] + [H] | `sej/find-keyword-cannibalization-using-openai-text-embeddings-examples__520274.md` (2024: 0.9, suggests 0.85 and calibrating on a sample). Site Factory already holds pages at text similarity ≥ 0.6 as near-copies (SF07 C1). |

### B4. Clustering into hubs

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B4.1 | **Hub-and-spoke:** the hub links to every spoke; every spoke links back to the hub; spokes interlink where relevant; cross-cluster links stay limited. | [2+] | `ahrefs/blog__topic-clusters.md` (2022); `ahrefs/blog__content-hub.md` (2020); `semrush/blog__pillar-page.md` (2020); `moz/blog__b2b-pillar-pages.md` (2021); `yoast/content-clusters.md` (2024) |
| B4.2 | **No fixed spoke count.** Group keywords by SERP overlap; one group = one page; every spoke must have its own intent. | [2+] | `ahrefs/blog__topic-clusters.md` (no min/max; cases of 8, 40+, 700+ pages); `moz/blog__optimize-seo-content-with-keyword-clustering.md` (2021). SERP-overlap threshold: **none in the KB** [H]: ≥ 3 shared top-10 URLs = same page. |
| B4.3 | The pillar topic must be neither too broad nor too narrow, and must connect to our offer. | [2+] | `moz/blog__b2b-pillar-pages.md` (2021); `moz/blog__blog-topic-clusters.md` (2025) |
| B4.4 | **Which page is the hub** is contested [C-1]. Three models: long guide; navigation page (intro + list); category/product page. **Recommendation for manufacturer sites:** the blog **category page** is the cluster hub (template D2) with unique intro copy. The **commercial solution page** is the money page every spoke links to. A long "ultimate guide" pillar is optional, only where the SERP shows a guide. | [H] over [C-1] | Long guide: `backlinko/pillar-pages.md` (2024), `semrush/blog__pillar-page.md`. Hub/category: `sej/pillar-pages-per-category__464479.md` (2022), `yoast/taxonomy-seo-categories-tags.md` (2022). Informational cornerstone: `yoast/cornerstone-article-content-type.md` (2019) |
| B4.5 | Suggested initial hubs, following GQ stages: *Starting & sourcing*, *Development & sampling*, *Fabrics & performance*, *Production & quality*, *Shipping, costs & compliance*. | [H] from GQ | GQ stage field |
| B4.6 | Google has never endorsed "topic clusters" as a ranking concept. Justify clusters by navigation and internal linking, not by "topical authority" claims. | [2+] [C-8] | `ahrefs/blog__topic-clusters.md` (notes Google's silence); `sej/google-on-topical-authority-dont-worry-about-it__501209.md` (2023) |

### B5. Content brief (inputs the writer receives)

Rules (full field list is in section C):
- B5.1 The brief states the **primary query as the main question to answer**, not a keyword to repeat. [2+] `moz/blog__how-to-write-seo-content-brief.md` (2021); `ahrefs/blog__content-briefs.md` (2023); `semrush/blog__content-brief.md` (2023).
- B5.2 It states intent, format and angle from the SERP; persona; goal and CTA; funnel stage. [2+] same sources plus `backlinko/content-briefs.md` (2024).
- B5.3 It lists sub-questions from PAA, related searches, "also rank for", and competitor gaps, plus the GQ cluster evidence. [2+] `ahrefs/blog__content-briefs.md`; `ahrefs/blog__blog-post-outline.md` (2022); `backlinko/content-briefs.md`.
- B5.4 It lists competitor URLs, each with "why it ranks / what it misses". [2+] `backlinko/content-briefs.md`; `moz/blog__how-to-write-seo-content-brief.md`; `semrush/blog__seo-content-brief.md` (2023).
- B5.5 It names the **differentiation assets**: fact-sheet IDs, photos, process data, expert. Nothing outside the fact sheet or asset library. [2+] `ahrefs/blog__content-briefs.md` (make it unique); `backlinko/content-briefs.md` (original research, interview internal experts).
- B5.6 **Internal-link targets come from a whitelist of real URLs.** AI will invent URLs otherwise. [2+] `ahrefs/blog__content-briefs.md`; `ahrefs/blog__my-complete-ai-content-process-for-ahrefs.md` (2025).
- B5.7 No "keyword N times" instructions. No word-count target; give a SERP-derived reference range only. [2+] `moz/blog__how-to-write-seo-content-brief.md`; [G] `seo-starter-guide.md`; `ahrefs/blog__seo-content-score-study.md` (2025): content-tool scores correlate only weakly with rankings.

### B6. Outline (answer-first, question headings)

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B6.1 | **Answer-first (BLUF):** the first 1–2 sentences under the H1 answer the title question. The first sentence under every H2 answers that heading. | [2+] | `semrush/blog__how-to-write-a-blog-post.md` (2021, mod 2025); `semrush/blog__blog-seo.md` (2026 revision); `yoast/inverted-pyramid.md` (2025); `yoast/seo-friendly-blog-post.md` (2026); `backlinko/write-a-blog-post.md` (2019, mod 2026) |
| B6.2 | Use **question headings** taken from PAA / question keywords / GQ `canonical_question`. Primary questions become H2s; follow-ups become H3s. Not every H2 needs to be a question [C-7]. | [2+] | `semrush/blog__blog-seo.md` (question map); `yoast/seo-friendly-blog-post.md`; `ahrefs/blog__blog-post-outline.md`. Over-optimisation warning: `backlinko/generative-engine-optimization-geo.md` (2026). [H] ≤ 50% of H2s as questions. |
| B6.3 | Exactly one H1. H2 for main sections, H3 nested; skipped levels are a warning only. | [2+]; Google neutral | `semrush/blog__heading-tags.md` (2025); `ahrefs/blog__h1-tag.md` (2021); [G] `seo-starter-guide.md` (heading order doesn't matter to Search; helps screen readers) |
| B6.4 | Cover every subtopic most top-ranking pages cover (without copying their headings). Add **at least one section beyond the obvious**, built on our own evidence. | [G]+[2+] | [G] `creating-helpful-content` (complete *and* beyond the obvious); `ahrefs/blog__blog-seo.md` (common subheadings); SF07 2026-09-24 note (topics most ranking pages cover are required; headings are never copied) |
| B6.5 | Each H2 section reads on its own: name the subject entity in its first sentence, no "as mentioned above". Stay on one page; **do not split into micro-pages**. | [2+] with [G] limit [C-6] | `semrush/blog__llm-optimization.md` (2026); `ahrefs/blog__seo-chunk-optimization.md` (2025); `yoast/llm-seo-optimization-techniques-including-llms-txt.md` (2026); [G] `ai-optimization-guide` (no need to chunk) |
| B6.6 | No fixed heading count. | [G] | `seo-starter-guide.md` |

### B7. Writing

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B7.1 | **At least one verifiable first-hand element per article**: factory/process photo, sampling or test record, measured spec, anonymised case. It must come from the fact sheet or asset library. | [G]+[2+] | [G] `creating-helpful-content` (first-hand expertise); [G] `G/search__docs__specialty__ecommerce__write-high-quality-reviews.md` (visual evidence, quantitative measurements, benefits and drawbacks); [G] `ai-optimization-guide`; `semrush/blog__eeat.md` (2024); `ahrefs/blog__how-to-stand-out-from-ai-content.md` |
| B7.2 | **Non-commodity:** no restating the SERP consensus. Mark the information-gain points in the draft. Backlinko targets 10–40% new information; unproven as a Google metric [C-13]. | [G]+[1] | [G] `ai-optimization-guide`; `backlinko/information-gain.md`; `ahrefs/blog__information-gain.md` (2026, "unconfirmed") |
| B7.3 | **Every number, percentage, price, year or named-entity claim** carries either a `fact_id` (company) or an external primary source (URL + publisher + year). Unsourced → removed. | [2+] | `backlinko/google-e-e-a-t.md`; `semrush/blog__seo-writing.md`; `sej/fact-checking-get-your-facts-right__463789.md`; `semrush/blog__ai-generated-content-guide.md`; `yoast/integrating-human-insight-ai-generated-content.md` (2025); SF07 B1 |
| B7.4 | Company claims (MOQ, lead times, capacity, certifications, payment terms, locations, clients) must match fact-sheet entries exactly. The writer may not paraphrase a number. | [H] aligned with SF07 A3/B1 | SF07 |
| B7.5 | Stale statistics (> 2 years) are refreshed or removed. | [1] | `semrush/blog__blog-seo.md` (refresh stats older than two years) |
| B7.6 | **Readability:** ≤ 25% of sentences > 20 words; paragraphs > 150 words warn, > 200 fail; passive voice ≤ 10%; plain language. Flesch score is diagnostic only. | [1] numbers (Yoast) [C-7] | `yoast/the-sentence-length-check.md` (2020); `yoast/paragraph-length-check.md` (2024); `semrush/blog__blog-seo.md`; `ahrefs/blog__flesch-reading-ease.md` (2021): near-zero correlation with rank |
| B7.7 | **Intro:** the answer or thesis in sentences 1–2; hook/context after; intro ≤ ~12 sentences. | [2+] [C-9] | `semrush/blog__how-to-write-a-blog-post.md`; `backlinko/write-a-blog-post.md` (5–12 sentence intros); `ahrefs/blog__how-to-format-a-blog-post.md` (2023); `yoast/seo-friendly-introduction.md` (2024) |
| B7.8 | Use tables for comparisons/specs (≥ 3 parallel items); numbered lists for steps; visuals where they teach something (no decorative stock). | [2+] | `semrush/blog__blog-seo.md` (visual test; stock teaches nothing); `backlinko/content-briefs.md`; `yoast/5-tips-improve-readability-blog-post.md` (2022); [B] AI Performance post `bing/webmaster__February-2026__Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview.md` |
| B7.9 | **Headline honesty:** descriptive, not exaggerated or shocking; the body must deliver what the headline promises. | [G]+[2+] | [G] `creating-helpful-content`; [G] `G/search__docs__appearance__google-discover.md`; `ahrefs/blog__how-to-write-a-headline.md` (2021); `sej/googles-updated-raters-guidelines-target-fake-eeat-content__546042.md` (2025) |
| B7.10 | Use buyer terminology (tech pack, GSM, AQL, FOB/DDP, PP sample) and define each term in one sentence at first use. | [1]+[H] | `yoast/b2b-seo.md` (2017); SF07 "KB approved" item 3 |
| B7.11 | Keyword use: natural. No density targets. Keyword stuffing is a spam-policy violation. | [G] | `seo-starter-guide.md`; `spam-policies.md` |

### B8. Content length (evidence summary)

- **Google, in three current docs:** there is no preferred word count, no magic minimum or maximum, no ideal page length. Writing to a word count is listed as a warning sign. [G] `creating-helpful-content`; `seo-starter-guide.md`; `ai-optimization-guide`.
- **Industry numbers conflict** [C-1b]:
  - `ahrefs/blog__blog-post-length.md` (2020): traffic correlation peaks around 2,000 words.
  - `semrush/blog__how-long-should-a-blog-post-be.md` (2022): 1,500–2,500 words.
  - `backlinko/search-engine-ranking.md` (2016): 1,447-word average.
  - `moz/blog__blog-post-length-frequency.md` (2017): #1 results range from 500 to 15,000 words; the average is meaningless.
  - `yoast/blog-post-word-count-seo.md` (2025): 300-word minimum as a thin-content floor.
  - AI citation: 53.4% of AIO-cited pages have < 1,000 words; Spearman 0.04 between length and citation. [1] `ahrefs/blog__short-vs-long-content-in-ai-overviews.md` (2025).
- **Rule B8.1:** no target. The brief carries the median body length of the current top results as a *reference* only. Existing Site Factory practice: `target_body_words` = SERP median, with a note at < 70% (SF07).
- **Rule B8.2:** < 300 words of body = thin-content warning (not a pass/fail on length). [2+] ahrefs 2020, yoast 2025.

### B9. AI-assisted production

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B9.1 | AI may draft. A **named human reviewer** checks facts, voice and experience before publishing. Record who, when and what changed (internal log). | [2+] | `sej/google-says-ai-generated-content-should-be-human-reviewed__553486.md` (Illyes, 2025); `sej/google-on-ai-content-and-e-e-a-t__489608.md` (2023); `yoast/integrating-human-insight-ai-generated-content.md`; `semrush/blog__does-ai-content-rank-in-search-data-study.md` (2026: 87% of teams human-led) |
| B9.2 | Evidence on ranking is mixed; treat AI text as neutral at best [C-3a]. `ahrefs/blog__ai-generated-content-does-not-hurt-your-google-rankings.md` (2025, 600k pages): correlation 0.011. `semrush/blog__does-google-penalize-ai-content.md` (2024): 57% vs 58% in top 10. `semrush/blog__does-ai-content-rank-in-search-data-study.md` (2026, 42k): #1 results are human-written 80.5% of the time vs ~10% AI. | [2+] | as listed |
| B9.3 | Do not optimise for AI-detector scores; gate on quality. | [2+] | `semrush/blog__does-google-penalize-ai-content.md`; `ahrefs/blog__how-do-ai-content-detectors-work.md` |
| B9.4 | Disclose automation where a reader would reasonably ask "how was this made". A "human reviewed" label alone is not a trust signal. | [G] [C-12] | [G] `creating-helpful-content`; [G] `using-gen-ai-content`; `sej/google-says-ai-generated-content-should-be-human-reviewed__553486.md` |
| B9.5 | AI-generated images: allowed as illustrations/diagrams, **never presented as factory or product photos**. Add IPTC `DigitalSourceType = TrainedAlgorithmicMedia`. | [G]+[2+] | [G] `using-gen-ai-content` (IPTC for Merchant Center); `sej/googles-updated-raters-guidelines-target-fake-eeat-content__546042.md` (fake photos are deceptive) |
| B9.6 | Titles, meta descriptions, alt text and structured data are held to the same accuracy standard as body text. | [G] | `using-gen-ai-content` |

### B10. Authorship and E-E-A-T

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B10.1 | Every article has a visible byline that links to an author page or the About page. The site has an About page with verifiable company details. | [G]+[2+] | [G] `creating-helpful-content` (Google strongly encourages accurate bylines); `yoast/experience-in-e-e-a-t.md` (2023); `ahrefs/blog__eeat-audit.md` (2026) |
| B10.2 | **Byline choice:** use a real person (founder, merchandiser, technical/QC lead) **only** if they exist in the fact sheet and consented. Otherwise use the Organization. Never invent authors, AI avatars or credentials. | [2+] [C-4] | [G] `G/search__docs__appearance__structured-data__article.md` (author may be Person or Organization); `moz/blog__do-author-names-matter.md` (2023, e.g. company staff bylines); `sej/googles-updated-raters-guidelines-target-fake-eeat-content__546042.md` (fake E-E-A-T) |
| B10.3 | Person author pages show real role, years, specialism and `sameAs` (e.g. LinkedIn). | [2+] | `yoast/author-publisher-entities-seo.md` (2024); `ahrefs/blog__eeat-audit.md`; [G] Article + ProfilePage docs |
| B10.4 | "Reviewed by / fact-checked by" only with a real review record. Moz's advice to credit a non-writing expert as author is **prohibited** here. | [2+] [C-11] | `ahrefs/blog__eeat-seo.md` (2023); `semrush/blog__eeat.md`; `backlinko/google-e-e-a-t.md` |
| B10.5 | Expectation management: bylines are for reader trust; Google says they are not a ranking factor. | [2+] | `sej/google-author-bylines-not-a-ranking-factor__505218.md` (2024); `sej/google-explains-author-page-importance__370996.md` (2020); `sej/google-confirms-you-cant-add-eeat-to-your-web-pages__543177.md` (2025); `moz/blog__do-author-names-matter.md` (2023: original research was more common in the top 3 than bylines) |

### B11. On-page elements

| ID | Element | Rule | Tag | Sources |
|---|---|---|---|---|
| B11.1 | `<title>` | Unique per page, descriptive, no boilerplate, no stuffing. Short brand suffix at the end, separated by `|` or `-`. | [G] | `G/search__docs__appearance__title-link.md`; `seo-starter-guide.md` |
| B11.2 | Title length | Soft target 50–60 characters / ≤ 600 px. Warn above 60 (SF07 note threshold). Google sets no limit and truncates by device. | [2+] [C-14] | `ahrefs/blog__title-tags-study.md` (2021: > 600 px titles rewritten 46.12%); `semrush/blog__title-tag.md` (2022); `backlinko/title-tags.md` (2025); [G] title-link |
| B11.3 | Keyword placement | Primary topic in the first half of the title; use a natural variant if more readable. | [2+] | `ahrefs/blog__title-tag-seo.md` (2023); `ahrefs/blog__blog-seo.md`; `backlinko/title-tags.md` |
| B11.4 | Title vs H1 | Same topic and intent; wording may differ. The H1 is the first, most prominent heading. `og:title` = title minus brand. | [G]+[2+] | [G] title-link (uses `<h1>`, `og:title` as sources); `ahrefs/blog__title-tag-seo.md`; `sej/google-now-uses-open-graph-title-tag-ogtitle-for-title-links__525382.md` (2024) |
| B11.5 | Year in title | Only for genuinely time-bound topics, and it must equal the `dateModified` year. Obsolete years get rewritten by Google. | [G]+[1] | [G] title-link ("obsolete title" case); `sej/google-on-the-seo-impact-of-dates-in-title-tags__437397.md` (2022) |
| B11.6 | Meta description | Unique, hand-written summary, not a keyword list. 120–155 characters, core value in the first 120. Expect ~60–70% rewrites; still write it. | [G]+[2+] [C-15] | [G] `G/search__docs__appearance__snippet.md`; `ahrefs/blog__meta-description-study.md` (2020: 62.78% rewritten); `backlinko/hub__seo__meta-descriptions.md` (2020); `yoast/shorter-meta-descriptions.md` (2018). SF07 D1 derives meta from the authored text and runs it through the claims check. |
| B11.7 | URL slug | `/blog/<short-keyword-slug>/`: lowercase, hyphens, no dates/years, no list counts, no IDs, evergreen. Keywords in URLs barely affect ranking; the reason is readability and breadcrumbs. | [G]+[2+] | [G] `G/search__docs__crawling-indexing__url-structure.md`; [G] `seo-starter-guide.md` (group topics in directories; keywords in URL "hardly any effect"); `ahrefs/blog__blog-seo.md` (evergreen URL); `backlinko/hub__content__blog-seo.md` (subfolder, not subdomain); `backlinko/hub__seo__url-slug.md` (2024) |
| B11.8 | Slugs are permanent | Never change a published slug except by 301 during merge/prune. | [G] | `G/search__docs__crawling-indexing__301-redirects.md`; `site-move-with-url-changes.md` |
| B11.9 | Intro | States the topic, answers the intent, contains the primary topic phrase. | [2+] | `yoast/seo-friendly-introduction.md` (2024); `semrush/blog__seo-blog-post.md` (2023); `yoast/should-i-write-longer-meta-descriptions-our-research-results.md` (2018: snippet often taken from the first paragraph) |
| B11.10 | Images: alt | Every `<img>` has alt. Informative images get a specific description; decorative images get `alt=""`. No keyword stuffing. | [G]+[2+] | [G] `G/search__docs__appearance__google-images.md`; [G] `seo-starter-guide.md`; `ahrefs/blog__alt-text.md`; `yoast/image-seo-alt-tag-and-title-tag-optimization.md` (2021) |
| B11.11 | Images: files | Descriptive hyphenated filenames (not `IMG_0023.jpg`); `<img>`, not CSS backgrounds; placed next to related text; `<figcaption>` for informative images. | [G] (captions single-source) | [G] google-images; [G] seo-starter-guide; `ahrefs/blog__image-seo.md` |
| B11.12 | Hero / social image | ≥ 1200 px wide, > 300k px, 16:9; `max-image-preview:large`; not a logo. JSON-LD `image` in 16:9, 4:3 and 1:1, each ≥ 50k px. | [G] | `google-discover.md`; `structured-data__article.md`; `robots-meta-tag.md` |
| B11.13 | Lazy-loading | Never lazy-load above-the-fold/LCP images; lazy-load the rest natively. | [G] | `G/search__docs__crawling-indexing__javascript__lazy-loading.md` |
| B11.14 | Original imagery | Prefer original factory/fabric/sample photos; stock only as filler. No KB experiment proves a ranking effect; the rationale is P1/B7.1. | [2+] direction only | `yoast/using-images-in-your-blog-post.md` (2021); `semrush/blog__blog-seo.md`; [G] `ai-optimization-guide` |

### B12. Internal linking

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B12.1 | **≥ 1 contextual in-body link to a commercial page** (solution/product/RFQ), with an intent-matched anchor (B3.4). | [2+] | `ahrefs/blog__prioritize-internal-linking.md` (2022: link from authoritative content to revenue pages); `semrush/blog__internal-links.md` (2023, mod 2026) |
| B12.2 | **≥ 1 link to the article's hub.** The hub links back; spokes in the same cluster interlink. | [2+] | `yoast/internal-linking-for-seo-why-and-how.md` (2025); `semrush/blog__internal-links.md`; `ahrefs/blog__topic-clusters.md` |
| B12.3 | **Contextual link count:** Ahrefs says 3–5; Backlinko says 5–10 out and 5–10 in [C-16]. Default: **3–8 contextual links**, scaling with length; navigation links don't count. Google: no magic number. | [1]/[1] + [H] | `ahrefs/blog__internal-links-for-seo.md` (2023, mod 2026); `backlinko/hub__content__blog-seo.md` (2019); [G] `seo-starter-guide.md` |
| B12.4 | **On publish day, add links to the new post from ≥ 1 (target 2–3) topically related older posts**, preferring older posts that have links and traffic. The hub page lists it. | [2+] | `yoast/internal-links-to-new-posts.md` (2021, mod 2026); `backlinko/hub__seo__internal-links.md`; `backlinko/hub__content__blog-seo.md`; `ahrefs/blog__internal-links-for-seo.md` |
| B12.5 | **No orphan pages:** every post has ≥ 1 crawlable `<a href>` inbound from another page. The sitemap does not count. | [G]+[2+] | [G] `G/search__docs__crawling-indexing__links-crawlable.md`; `ahrefs/blog__orphan-pages.md` (2022); `backlinko/orphan-pages.md` (2024) |
| B12.6 | **Anchors:** descriptive, concise, natural. Generic anchors ("click here", "read more") are banned. Vary anchors to the same target: [H] ≤ 50% exact match. Internal links are never nofollow. | [G]+[2+] [C-17] | [G] links-crawlable; [G] seo-starter-guide; `ahrefs/blog__internal-links-for-seo.md`; `yoast/the-context-of-internal-links.md` |
| B12.7 | **Related-posts** widget: a supplement, not a replacement for contextual links. The A/B test showed a positive but small effect. | [1] | `ahrefs/blog__related-posts-seo.md` (2024); boilerplate discounting: `sej/does-location-of-internal-links-matter__435341.md` (2022) |

### B13. External citations

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B13.1 | Link each external statistic or regulatory claim to its **primary source**: regulator, standards body, original study. No secondary aggregator. | [G]+[2+] | [G] `creating-helpful-content` (clear sourcing); [G] `seo-starter-guide.md` (links add context; trust what you link); `backlinko/google-e-e-a-t.md`; `semrush/blog__blog-seo.md` (chain of attribution for AI) |
| B13.2 | Default external links carry no rel. Use `sponsored` for paid links, `ugc` for user content, `nofollow` only for sources we don't trust. | [G] | `G/search__docs__crawling-indexing__qualify-outbound-links.md`; `links-crawlable.md` |
| B13.3 | Visible **Sources** list at the end with publisher, title, year and accessed date. Every link returns 2xx/3xx at publish. | [2+] (list format is convention) | [G] `creating-helpful-content`; link integrity mirrors claude-blog Gate 5 (`D:/korey_seo/claude-blog/skills/blog/references/blog-delivery-contract.md`, tooling, not KB evidence) |

### B14. Structured data

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B14.1 | One JSON-LD `BlogPosting` per article (Article/BlogPosting/NewsArticle are equivalent to Google; no property is required). Include `headline` (= H1), `image` (3 ratios), `datePublished`, `dateModified` (ISO 8601 with timezone), `author`, `publisher`, `mainEntityOfPage`. | [G] | `G/search__docs__appearance__structured-data__article.md`; `publication-dates.md` |
| B14.2 | `author`: Person or Organization with the correct `@type`. `name` is only the name (no "By", job title or company). `url`/`sameAs` points to the author page (Person) or the homepage (Organization). One entry per author. | [G]+[1] | [G] Article doc; `sej/google-recommends-adding-author-url-in-article-schema__415790.md` (2021) |
| B14.3 | `publisher` = the site-wide Organization entity (same name/url everywhere). | [G] example only [1] | Article doc |
| B14.4 | Person author pages use `ProfilePage` with `mainEntity` Person; the name matches the article's author. | [G] | `G/search__docs__appearance__structured-data__profile-page.md`; Article doc |
| B14.5 | `BreadcrumbList` reflecting the typical user path: Home › Blog › Hub › Article. | [G]+[2+] | `G/search__docs__appearance__structured-data__breadcrumb.md`; `yoast/breadcrumbs-seo.md` (2023); `sej/breadcrumbs-seo__255007.md` (2024) |
| B14.6 | Markup must describe visible content only. | [G] | `G/search__docs__appearance__structured-data__sd-policies.md`; `ai-features.md` |
| B14.7 | **FAQPage: not a default.** The Google rich result is gone. Ahrefs measured no AI lift. A visible FAQ section for readers is fine. If FAQPage is emitted anyway, every Q/A must be visible. [C-2] | [G]+[2+] | `G/search__updates.md` (2026-05-08, 2026-06-15); `sej/google-drops-faq-rich-results-from-search__574429.md` (2026); `ahrefs/blog__schema-ai-citations.md` (2026); [G] `ai-optimization-guide` |
| B14.8 | **No HowTo.** | [G] | `G/search__updates.md`; `sej/google-completely-removes-how-to-rich-results__496479.md` |
| B14.9 | Derive schema and meta **by code** from the authored article, never by the writer. | [H] aligned with SF07 D1 | SF07 |

### B15. Dates and freshness

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B15.1 | Show a labelled visible "Published <date>" and, after a substantive update, "Updated <date>". They must equal the JSON-LD dates. No future dates; keep other dates on the page to a minimum. | [G] | `G/search__docs__appearance__publication-dates.md` |
| B15.2 | Change `dateModified`, the visible Updated date and sitemap `lastmod` **only** on substantive change: main content, structured data or links. Copyright/typo changes don't count. `datePublished` never changes. | [G]+[B]+[2+] | [G] `creating-helpful-content`; [G] `G/search__docs__crawling-indexing__sitemaps__build-sitemap.md`; [B] `bing/webmaster__february-2023__The-Importance-of-Setting-the-lastmod-Tag-in-Your-Sitemap.md`; `yoast/relabel-old-content-as-new.md` (2022) |
| B15.3 | Google trusts `lastmod` only if it is consistently accurate. Illyes describes it as binary (trusted or not). Never stamp build time on all URLs. | [G]+[1] | [G] build-sitemap; `sej/googles-gary-illyes-lastmod-signal-is-binary__519239.md` (2024); [B] `bing/webmaster__July-2025__Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search.md` |

### B16. Indexing new posts

| ID | Rule | Tag | Sources |
|---|---|---|---|
| B16.1 | XML sitemap with every indexable post, hub and blog index. Accurate ISO 8601 `lastmod`. No `changefreq`/`priority` (ignored by Google and Bing). Referenced in robots.txt; submitted in Search Console and Bing Webmaster Tools. | [G]+[B] | [G] build-sitemap; [G] `sitemaps__overview.md`; [G] `ask-google-to-recrawl.md`; [B] July-2025 sitemaps post |
| B16.2 | On publish, substantive update or deletion, ping **IndexNow** for changed URLs only (content-hash diff). Key file at root. This is a supplement for Bing/Copilot and other participants; Google does not use it. | [B]+[2+] | `bing/webmaster__october-2021__IndexNow-…md`; `bing/webmaster__September-2024__IndexNow-When-and-How-Websites-Should-Notify-Search-Engines.md`; `bing/webmaster__january-2022__IndexNow-Announcing-Sharing-of-Submitted-URLs.md`; `moz/blog__fundamentals-of-crawling-whiteboard-friday.md` (2023) |
| B16.3 | The new post is linked, crawlably, from page 1 of the blog index, its hub, and ≥ 1 older post on publish day. | [G]+[2+] | [G] links-crawlable; [G] `pagination-and-incremental-page-loading.md`; B12.4 sources |
| B16.4 | RSS/Atom feed of recent posts (may also be submitted as a sitemap; it does not replace the XML sitemap). | [G] [1] | build-sitemap |
| B16.5 | Manual "Request indexing" only for important URLs. Expect days to weeks; indexing is not guaranteed. | [G] | `ask-google-to-recrawl.md`; `ai-features.md` |
| B16.6 | Crawl budget is irrelevant at this scale (the guide targets 1M+ pages, or 10k+ pages changing daily). Don't noindex or robots-block to "save budget". | [G] | `G/crawling__docs__crawl-budget.md` |

---

## C. Article package contract (what the upstream writer/planner must deliver)

One package per article. Fields marked **code** are derived by the pipeline, not written by the model (SF07 A1/A3/D1 pattern).

| Field | Type | Req | Validation / rule | Basis |
|---|---|---|---|---|
| `article_id` | string | yes | stable, never reused | — |
| `status` | enum draft/approved/published/updated/merged/retired | yes | lifecycle (F) | — |
| `cluster_id` / `hub_url` | string | yes | hub exists; article listed on it | B4, B12.2 |
| `gq_refs[]` | GQ topic ids | opt | signal only; never a fact source | A3 |
| `primary_query` | string | yes | not in reserved commercial-term list | B3.5 |
| `secondary_queries[]` | string | opt | same SERP group | B1.2, B4.2 |
| `intent` / `format` / `angle` | enum + text | yes | from `serp_snapshot` | B2.1–B2.3 |
| `serp_snapshot` | {date, market, results[{url,type,format}], dominant_type, blog_share, aio_present} | yes | ≤ 30 days old at approval [H] | B2 |
| `scores` | {business 0–3, traffic_potential, ranking_potential} | yes | business ≥ 2 | B1.1 |
| `cannibalization_check` | {nearest_urls[{url,sim,intent_same}], decision: new/update/differentiate/reject} | yes | decision = new | B3 |
| `persona` / `funnel_stage` | enum | yes | founder / amazon_dtc / team_buyer | B1.6 |
| `goal` / `cta` | {type: rfq/contact/solution_page, target_url, placement[]} | yes | target in URL whitelist | B5.2, D |
| `competitors[]` | {url, why_ranks, gap} | yes | ≥ 3 | B5.4 |
| `reference_body_words` | int | code | SERP median; reference only | B8 |
| `slug` | string | yes | `^[a-z0-9]+(-[a-z0-9]+)*$`, no year, unique, immutable | B11.7–8 |
| `title_tag` | string | yes | unique; ≤ 60 chars warn; year rule | B11.1–5 |
| `h1` | string | yes | topic = title topic; unique site-wide | B11.4, SF07 E1 |
| `meta_description` | string | code (from text) | unique; 120–155; claims-checked | B11.6, SF07 B2/D1 |
| `answer_summary` | 40–60 words | yes | directly answers `primary_query`; becomes the intro's first paragraph | B6.1, G2 |
| `key_takeaways[]` | 3–5 bullets | opt | only restates body claims; no new facts | D3 |
| `sections[]` | {id, heading, is_question, answer_first_sentence, body_md, fact_ids[], source_ids[], asset_ids[]} | yes | first sentence answers the heading; ids resolve | B6, B7.3 |
| `first_hand_evidence[]` | {kind: photo/test/measurement/case/process, asset_id or fact_id} | yes ≥ 1 | resolves in asset library/fact sheet | B7.1 |
| `information_gain[]` | text pointers to what is new vs SERP | yes ≥ 1 | reviewer confirms | B7.2 |
| `facts_used[]` | fact_ids from `facts.yaml` | yes | every company claim maps to one | P2, B7.4 |
| `sources[]` | {id, url, publisher, title, year, accessed, supports_claim} | cond. | required for every external claim; URL 2xx | B7.3, B13 |
| `images[]` | {asset_id, filename, alt, caption, role: hero/inline/diagram, origin: photo/ai/diagram, w, h, iptc_source_type} | yes | alt rules; AI origin ⇒ IPTC and not presented as a photo | B11.10–14, B9.5 |
| `internal_links[]` | {target_url, anchor, section_id, kind: commercial/hub/post} | yes | ≥ 1 commercial, ≥ 1 hub, 3–8 contextual, whitelist, anchor rules | B12 |
| `inbound_link_requests[]` | {source_url, anchor, insert_after_section} | yes ≥ 1 | from older posts, applied on publish | B12.4 |
| `faq[]` | {q, a} | opt | visible; no FAQPage schema by default | B14.7 |
| `author` | {type: Person/Organization, id} | yes | Person only if in fact sheet with consent | B10.2 |
| `reviewer` | {person_id, date, scope} | cond. | only with a real review record | B10.4 |
| `ai_assistance` | {used: bool, disclosure_text?} | yes | disclosure where readers would expect it | B9.4 |
| `human_signoff` | {name, date, changes_summary} | yes | internal record, not a page label | B9.1 |
| `date_published` / `date_modified` | ISO 8601 + tz | code | equal to visible dates; modified only on substantive diff | B15 |
| `change_log[]` | {date, type: minor/substantive/rewrite/merge, diff_ratio} | code | drives `dateModified` | B15.2, F |
| `schema` | JSON-LD | code | BlogPosting + BreadcrumbList (+ ProfilePage on author page) | B14 |
| `quality_report` | {claims_check, similarity_max, readability, gate_results} | code | all HARD gates pass | E |
| `review_interval_days` | int | code | from SERP freshness or default | F4 |

---

## D. Blog page templates

### D1. Blog index (`/blog/`)

| Element | Level | Evidence |
|---|---|---|
| Unique intro (what the blog covers, for whom) + links to every hub | Required | [2+] categories/archives are landing pages that need real copy: `yoast/taxonomy-seo-categories-tags.md` (2022), `sej/category-tag-pages-seo__199598.md` (2017) |
| Latest posts, newest first, crawlable `<a href>` cards (title, date, 1-line summary, hub label) | Required | [G] links-crawlable; pagination doc |
| **Numbered pagination with real URLs** (`/blog/page/2/`). "Load more"/infinite scroll only as progressive enhancement over those URLs. No `#` page numbers. | Required | [G] `pagination-and-incremental-page-loading.md` (Googlebot follows `href` and doesn't click buttons); [G] `lazy-loading.md`; `yoast/pagination-infinite-scrolling.md`; `semrush/blog__pagination-seo.md` (2024) |
| Page ≥ 2: self-canonical, indexable, links to next and to page 1; same title allowed (or "– Page n") | Required | [G] pagination doc; `ahrefs/blog__rel-prev-next-pagination.md` (2020); `yoast/pagination-seo-best-practices.md` (2018) [C-18] |
| `rel=prev/next` | Optional (Google ignores it; other engines may use it) | [G] pagination doc; `yoast/google-doesnt-use-rel-prev-next-for-pagination.md` (2019) |
| Posts per page | Convention: 10–24 [H]; numbered pagination keeps click depth low | `yoast/blog-seo-blog-categories.md` (2019) |
| Featured/pinned posts (e.g. top BoFu guides) | Optional, convention | [1] `sej/category-tag-pages-seo__199598.md` |
| Breadcrumb + `BreadcrumbList` | Required | B14.5 |
| CTA band to RFQ / solutions | Recommended, conversion convention (no SEO evidence) | `yoast/call-to-action.md` (2022) |

### D2. Hub = category page (`/blog/<hub>/`)

| Element | Level | Evidence |
|---|---|---|
| Indexable; **unique intro (buyer-question-oriented)**; H1 = hub topic | Required | [2+] `yoast/taxonomy-seo-categories-tags.md`; `sej/category-tag-pages-seo__199598.md` (add copy or noindex) [C-19] |
| Curated "start here" order of spokes (not just reverse-chronological) + full list | Recommended | hub-and-spoke B4.1 sources |
| Prominent link to the matching **commercial solution page** | Required | B12.1 sources; B4.4 |
| Pagination rules as D1 | Required | as D1 |
| Category names distinct from tag names; each post has one primary category | Required | `yoast/blog-seo-blog-categories.md`; `yoast/help__how-to-select-a-primary-category.md` |

### D3. Tags, author archives, date archives

| Element | Rule | Evidence |
|---|---|---|
| Tag archives | **Off by default.** If enabled: ≥ 3 posts per tag, otherwise noindex or not generated. | [2+] `yoast/why-you-should-stop-using-tags.md` (2021); `yoast/blog-seo-blog-categories.md`; `backlinko/hub__content__blog-seo.md` (noindex tag/category unless they get traffic) [C-19] |
| Author archive | Single-author or Organization-byline site: **no `/author/` archive** (redirect or noindex). Keep an author profile page / About page as the byline target. | [2+] `yoast/help__disable-enable-author-archives.md`; `yoast/help__yoast-seo-settings-author-archives.md`; [G] Article doc |
| Author profile page (Person bylines) | Bio, role, experience, `sameAs`, list of posts, `ProfilePage` markup | [G] profile-page doc; B10.3 |
| Date archives | None | [1] `yoast/archive-seo.md` (2016) |

### D4. Article page

| Element | Level | Evidence strength | Sources |
|---|---|---|---|
| Breadcrumb (visible) + `BreadcrumbList` | Required | [G]+[2+] | B14.5; note: Google stopped showing breadcrumbs on mobile results in 2025 (`sej/google-drops-breadcrumbs-from-mobile-search-results__538091.md`); still useful for users and links |
| H1 = article headline | Required | [G] | title-link |
| Byline linked to author page/About | Required | [G] (trust, not ranking) | B10 |
| Visible Published + (when substantive) Updated date | Required | [G] | B15.1 |
| Answer-first intro (first paragraph = `answer_summary`) | Required | [2+] | B6.1 |
| Key takeaways box (3–5 bullets restating the body) | Recommended | convention, [1] Yoast | `yoast/seo-friendly-blog-post.md`; `yoast/how-to-write-an-effective-summary-for-your-content.md` (2025) |
| Table of contents with jump links (posts with ≥ 4 H2s [H]) | Recommended | UX [2+]. The sitelinks claim is [1] (Ahrefs) and not supported by Google docs. Jump targets must be visible, not collapsed, and must not strip `#` on load. | `ahrefs/blog__blog-seo.md`; `ahrefs/blog__how-to-format-a-blog-post.md`; `semrush/blog__how-to-format-a-blog-post.md` (2022); [G] `snippet.md`, `sitelinks.md` |
| Reading time | Optional | [1], no SEO evidence | `yoast/features__estimated-reading-time.md` |
| Body: sections, tables, figures with captions, original photos | Required | B6–B7, B11 | — |
| In-body contextual link(s) to the solution page near the relevant section | Required | [2+] | B12.1 |
| Mid-article soft CTA (inline box to the matching solution/RFQ) | Recommended | convention; placement untested | `semrush/blog__how-to-format-a-blog-post.md`; `yoast/call-to-action.md` |
| End-of-article CTA block (RFQ with the fields buyers need: quantity, deadline, sampling, destination, Incoterm) | Required | convention; field list from GQ handoff §6.3 | GQ handoff |
| Author box (who, why qualified) | Recommended | [2+] (trust) | `ahrefs/blog__how-to-format-a-blog-post.md`; `semrush/blog__blog-seo.md` |
| Sources / references list | Required when external claims exist | [G] (clear sourcing) | B13 |
| Related posts (same hub first) | Recommended | [1] measured small positive | `ahrefs/blog__related-posts-seo.md` |
| Visible FAQ section | Optional (reader value only; no FAQPage by default) | [G] | B14.7 |
| Newsletter signup | Optional, inline/small banner only | [G] | `G/search__docs__appearance__avoid-intrusive-interstitials.md` |
| Full-screen interstitial / popup on entry | **Prohibited** | [G] | avoid-intrusive-interstitials |
| Comments | Off by default for B2B static sites; if on, `rel="ugc"` and moderation | [G] | `qualify-outbound-links.md`; `seo-starter-guide.md` |
| Social share buttons | Optional, no SEO effect | [1] | `sej/ranking-factors__social-signals-rankinng-factor.md` (2022) |
| JSON-LD BlogPosting (+ ProfilePage on author page) | Required | [G] | B14 |
| `og:*`, `max-image-preview:large`, self-canonical | Required | [G] | B11.12 |

---

## E. Automated quality gates for auto-publishing

**HARD** = blocks publish. **SOFT** = warning plus human review queue. The gates reuse existing Site Factory mechanisms where they already exist: majority-vote claims check, `fact_id` whitelist, near-duplicate hold at 0.6 (SF07).

### E1. Topic gates (before writing)

| # | Gate | Type | Basis |
|---|---|---|---|
| T1 | Business potential ≥ 2 | HARD | B1.1 |
| T2 | SERP classification: blog/guide share ≥ 5/10 (3–4 → human review) | HARD/SOFT [H thresholds] | B2.1 |
| T3 | Primary query not in the reserved commercial-term list | HARD | B3.5 |
| T4 | Cannibalisation pre-check: no existing URL (commercial pages included) with the same primary query and same intent; embedding similarity < 0.85 [H/1], else decision = update/differentiate | HARD | B3.1, B3.6 |
| T5 | Topic within the site's topic whitelist (hub list) | HARD | P4 |
| T6 | Capability check: SERP demands only evidence we can supply (fact sheet / assets) | HARD | B1.7 |
| T7 | Not a variant or fan-out duplicate of a planned or published topic | HARD | P5 |

### E2. Content gates (per article)

| # | Gate | Type | Basis |
|---|---|---|---|
| C1 | Contract complete (section C required fields; ids resolve) | HARD | C |
| C2 | Every number/percent/price/year/company claim maps to a `fact_id` or a `source_id`; claims check passes (majority vote) | HARD | P2, B7.3, SF07 B1 |
| C3 | Company claims match the fact sheet verbatim | HARD | B7.4 |
| C4 | ≥ 1 first-hand evidence item and ≥ 1 information-gain item, confirmed by reviewer | HARD | B7.1, B7.2 |
| C5 | Near-copy: text similarity to any site page < 0.6 (SF07) and to each top-10 SERP page < 0.6 [H] | HARD | P5, SF07 C1 |
| C6 | Author is Organization or a consented fact-sheet person; "reviewed by" only with a record; no invented credentials | HARD | B10.2, B10.4 |
| C7 | Human sign-off recorded | HARD | B9.1 |
| C8 | All external source URLs return 2xx/3xx; sources are primary | HARD (reachability) / SOFT (primacy) | B13 |
| C9 | AI-origin images carry IPTC TrainedAlgorithmicMedia and are not captioned or presented as photos | HARD | B9.5 |
| C10 | Answer-first: intro paragraph and each H2's first sentence answer the heading (LLM judge) | SOFT | B6.1 |
| C11 | Headline promise is delivered by the body; ≤ 1 superlative; no clickbait (LLM judge) | SOFT | B7.9 |
| C12 | Readability: long sentences ≤ 25%; paragraphs ≤ 150 words (200 = fail→SOFT); passive ≤ 10% | SOFT | B7.6 |
| C13 | Body < 300 words → thin warning; < 70% of SERP median → note | SOFT | B8 |
| C14 | Keyword-stuffing detector (abnormal phrase repetition) | SOFT | B7.11 |
| C15 | Question H2s ≤ 50%; each H2 section self-contained (no leading pronoun) | SOFT [H] | B6.2, B6.5 |

### E3. On-page / technical gates (on the built HTML in `dist/`)

| # | Gate | Type | Basis |
|---|---|---|---|
| O1 | Exactly one `<h1>`, first heading; JSON-LD `headline` = H1 | HARD | B6.3, B14.1 |
| O2 | `<title>` present and unique site-wide; > 60 chars → warn; title/H1 unique (SF07 E1) | HARD (unique) / SOFT (length) | B11.1–2 |
| O3 | Meta description present, unique, 70–160 chars hard band, 120–155 soft band; not a comma list | HARD/SOFT | B11.6 |
| O4 | Slug regex; no year; no change to a published slug without a redirect record | HARD | B11.7–8 |
| O5 | Every `<img>` has alt; informative images non-empty; filename not `IMG_|DSC_|image\d`; no LCP lazy-load; hero ≥ 1200 px 16:9; `max-image-preview:large` | HARD | B11.10–13 |
| O6 | Internal links: ≥ 1 commercial, ≥ 1 hub, 3–8 contextual; all 200; whitelisted; no nofollow; no banned generic anchors; exact-match share to one target ≤ 50% | HARD (existence, 200, nofollow) / SOFT (counts, anchors) | B12 |
| O7 | Inbound: hub lists the post, blog index page 1 links it, ≥ 1 older post links it (applied in the same deploy) | HARD | B12.4–5, B16.3 |
| O8 | JSON-LD parses; BlogPosting fields present; author/publisher types correct; `author.name` has no "By"/title; BreadcrumbList ≥ 2 items; no HowTo; FAQPage only if every Q/A is visible | HARD | B14 |
| O9 | Visible Published date = `datePublished`; visible Updated = `dateModified`; neither in the future; `dateModified ≥ datePublished` | HARD | B15.1 |
| O10 | Date-only change blocked: `dateModified` changed ⇒ body/links/schema diff above threshold [H: ≥ 5% of body tokens or ≥ 1 new/changed section] | HARD | B15.2 |
| O11 | Indexable: 200, self-canonical, no noindex/nosnippet/`data-nosnippet` on body, in sitemap with `lastmod` = `dateModified` | HARD | B16.1, G1 |
| O12 | robots.txt does not block Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot | HARD | G6 |
| O13 | Body text present in raw server HTML (static build) | HARD | G6 |
| O14 | No full-screen interstitial; newsletter inline only | HARD | D4 |
| O15 | Pagination/hub pages: unique URLs, self-canonical, indexable, `<a href>` to next and page 1; no `#` paging; tag pages absent or ≥ 3 posts | HARD | D1–D3 |

### E4. Batch / cadence gates

| # | Gate | Type | Basis |
|---|---|---|---|
| K1 | Posts per week ≤ the configured cap (F1) | HARD | F1 |
| K2 | Pairwise similarity within the batch below thresholds; no two posts share a primary query | HARD | P5, B3 |
| K3 | Share of posts with empty `first_hand_evidence` = 0 | HARD | B7.1 |
| K4 | No publishing during a confirmed core update and until 7 days after completion (refreshes too) | SOFT [1] | `ahrefs/blog__analyze-sudden-traffic-drop.md` (2025); [G] `core-updates.md` (compare a full week after completion) |

### E5. Post-publish checks

| # | Check | Window | Basis |
|---|---|---|---|
| P1 | URL Inspection / GSC index status; alert if not indexed | day 14–28 | [G] `ask-google-to-recrawl.md` |
| P2 | IndexNow ping accepted (HTTP 200/202) | on deploy | B16.2 |
| P3 | AI-referral 404s monitored; frequent hallucinated URLs 301 to the best match | monthly | [1] `ahrefs/blog__how-often-do-ai-assistants-hallucinate-links.md` (2025) |

**Explicitly NOT gates:** word-count minimum/maximum, keyword density, Flesch score, AI-detector score, llms.txt presence, FAQPage schema, fixed chunk size, question-variant coverage, reading time, social buttons.

---

## F. Cadence and the refresh loop

### F1. Publishing cadence

- There is **no evidence-based optimal frequency.** Consistency and quality matter more than volume.
  - [2+] `moz/blog__blog-post-length-frequency.md` (2017); `semrush/blog__content-calendar.md` (2023); `ahrefs/blog__content-calendar.md` (2021).
  - Moz's non-scientific experiment (`moz/blog__publishing-volume-experiment.md`, 2015): halving output cost only −5.6% unique pageviews; doubling added about 3%.
  - Survey figures (`ahrefs/blog__blogging-statistics.md` 2023; `backlinko/blogging-stats.md` 2024; `sej/most-effective-publishing-frequency__265979.md` 2018) are correlational context, not rules.
- Google: mass-producing content on many topics, or adding content to look fresh, is a warning sign that does not help. Scaled production without added value is spam. [G] `creating-helpful-content`; `spam-policies.md`.
- **Default [H]:** at launch, 2–4 posts/month, capped by review capacity (every post needs a human sign-off and ≥ 1 first-hand asset). Raise the cap only if (a) ≥ 80% of posts older than 90 days are indexed and (b) no gate-C4 failures were waived. Build clusters one hub at a time: hub + 4–8 spokes before the next hub.
- The calendar mixes new posts and refreshes. Ahrefs republishes about a quarter of its posts (`ahrefs/blog__blog-seo.md`); 71% of bloggers update old posts (`backlinko/blogging-stats.md`). [2+]

### F2. Measurement

| Metric | Source | Note |
|---|---|---|
| Clicks, impressions, CTR, position, page×query | GSC (store beyond 16 months via API) | [G] `debugging-search-traffic-drops.md` |
| AI features | GSC Web type already includes AIO/AI Mode. The Generative AI performance report (global since 2026-08-31) shows impressions only; don't add it to Web totals. | [G] `ai-features.md`; `GH/search__blog__2026__06__gen-ai-performance-reports.md`; `sej/google-admits-search-console-reporting-for-ai-search-is-inadequate__589236.md` (2026) |
| Bing AI citations, cited pages, grounding queries | Bing Webmaster Tools AI Performance | [B] `bing/webmaster__February-2026__…AI-Performance…md` |
| Organic sessions, engagement, RFQ submits, assisted conversions, AI referrers (chatgpt.com, perplexity.ai …; undercounted) | GA4 / Umami | [G] `google-analytics-search-console.md`; `ahrefs/blog__content-audit.md` (2023); `semrush/blog__content-audit.md` (2024); `ahrefs/blog__generative-engines-are-breaking-web-analytics.md` (2025) |
| Prompt panel: 20–30 prompts from GQ `ai_prompts`, run repeatedly, report mention/citation frequency, not "AI rank" | Manual/API | [2+] `backlinko/llm-prompt-tracking.md` (2026); `backlinko/llm-sources.md` (2025); SparkToro via `sej/ai-recommendations-change-with-nearly-every-query-sparktoro__566242.md` (2026: < 1% identical lists); GQ handoff §6.2 stage 12 |

### F3. Judging windows

- Exclude posts < 45 days old from decay maths. [1] `sf/blog__data-driven-content-pruning.md` (2026): 30–45 days.
- Early read at 90 days. Verdict at **~6 months**.
  - [2+] `ahrefs/blog__content-audit.md`: pages < 6 months may just need time.
  - `ahrefs/blog__how-long-does-it-take-to-rank-in-google-and-how-old-are-top-ranking-pages.md` (2025): only 1.74% of new pages reach the top 10 within a year.
- After any change, first read at 4–8 weeks; final at ~3 months. Site-level recovery can take months. [G] `core-updates.md`; [G] `debugging-search-traffic-drops.md`; `moz/blog__what-to-do-with-old-blog-posts.md` (2018).

### F4. Decay triage (weekly; posts ≥ 180 days)

1. **Diagnose the curve first.** [G]+[2+] `debugging-search-traffic-drops.md`; `ahrefs/blog__content-decay.md` (2026).
   - Impressions and clicks falling together → ranking or demand problem.
   - Flat impressions with falling CTR → snippet/title issue or SERP-feature (AIO) click loss. Run a title/meta test; **do not rewrite**.
2. **Small drop** (e.g. position 2→4): do nothing. **Large drop** (e.g. 4→29): deep assessment. [G] `core-updates.md`.
3. **Refresh trigger [1]+[H]:** last 90 days vs the same period last year, clicks ≥ 20% below peak, seasonality excluded. Source: `ahrefs/blog__evergreen-content.md` (2023), which also triggers on statistics being superseded or on falling out of the AIO.
4. **Causes to check** [2+]: freshness/QDF (`ranking-systems-guide.md`); competitors; intent shift (`ahrefs/blog__search-intent-shift.md`); demand (Trends); our own recent edit (roll back; [1] `ahrefs/blog__content-decay.md`).
5. **Review interval** = median "last updated" age of the top 10 for that query [1] (`ahrefs/blog__evergreen-content.md`). Fallback [H]: hubs and BoFu posts 6 months (cornerstone staleness flag at 6 months, `yoast/cornerstone-content-stale-content-filter.md`); others 12 months. Backlinko suggests auditing every post 1–2× per year (`backlinko/hub__content__evergreen.md`).

### F5. Refresh rules

- Keep the URL. [2+] `moz/blog__why-google-rewards-re-publishing-whiteboard-friday.md` (2015); `backlinko/hub__seo__content-audits.md` (2019); `sej/change-article-dates-seo__381114.md` (2020).
- A substantive refresh replaces outdated data/examples, adds missing sub-questions (new PAA, GQ, Bing grounding queries), removes obsolete sections, and re-checks intent. [2+] `semrush/blog__blog-seo.md`; `ahrefs/blog__republishing-content.md` (2025); `ahrefs/blog__evergreen-content.md`.
- Only then update `dateModified`, the visible Updated date and `lastmod`, and ping IndexNow. `datePublished` is never touched. [G] B15.
- If a new subtopic would dilute the page, create a new post and interlink instead. [1] `sej/ask-an-seo-is-it-better-to-refresh-content-or-create-new-pages__553877.md` (2025).
- Keep every version; roll back when the drop follows our own edit.

### F6. Prune / merge / redirect matrix

| Condition | Action | Sources |
|---|---|---|
| Meets goals, or < 6 months old | Keep | `ahrefs/blog__content-audit.md`; `semrush/blog__content-audit.md` |
| Demand and business value remain, content stale | Refresh in place | `ahrefs/blog__content-decay.md`; `moz/blog__content-audit.md` |
| ≥ 2 own URLs, same intent, splitting impressions, neither in top 10 | Merge the best content into the stronger URL; 301 the weaker; update links; drop it from the sitemap | [2+] `ahrefs/blog__keyword-cannibalization.md`; `backlinko/keyword-cannibalization.md`; `moz/blog__keyword-cannibalization.md`; `bing/webmaster__December-2025__Does-Duplicate-Content-Hurt-SEO-and-AI-Search-Visibility.md` |
| Off-strategy but has links or traffic | 301 to the most relevant page (never the homepage) | [G] `site-move-with-url-changes.md`; `yoast/update-or-delete-old-content-on-your-site.md` (2025) |
| 12 months: 0 clicks, 0 RFQ/assists, 0 backlinks, not on a sales path, no relevant target | Delete (404/410), clean links; **human approval required** | [2+] `moz/blog__content-audit.md`; `semrush/blog__content-pruning.md` (2024); `ahrefs/blog__taught-agent-to-refresh-data-content.md` (2026: a human gates publishing) |
| Useful to users (e.g. sales enablement) but not for search | Keep, optionally noindex | `moz/blog__pruning-your-ecommerce-site.md` (2016) |

- Deleting is a **last resort**. Pruning helps only when the content was unhelpful. Deleting to look fresh, or for crawl budget on a small site, has no support. [G] `core-updates.md`; [G] `creating-helpful-content`; `sej/google-explains-content-pruning__371252.md` (2020) [C-20].
- Low volume ≠ low value in B2B: don't prune on impressions alone. [2+] `ahrefs/blog__content-pruning.md` (2024); Mueller via `sej/google-right-way-to-remove-content__361004.md` (2020).
- 404 vs 410: Google treats all 4xx except 429 the same; choose by meaning. [G] `G/crawling__docs__troubleshooting__http-status-codes.md` [C-21].
- Keep redirects ≥ 1 year (a redirect register). [G] `site-move-with-url-changes.md`.
- Execute prunes in batches; observe 1–2 months between batches. [2+] `ahrefs/blog__content-pruning.md`; `sf/blog__data-driven-content-pruning.md`.

### F7. Audit cadence

- Weekly automated monitoring; monthly review; quarterly intent re-check (B2.4); **full content audit at least yearly**. Small sites prune 1–2× per year. [2+] `ahrefs/blog__seo-tracking.md` (2024); `moz/blog__conduct-multiple-content-audits.md` (2021); `semrush/blog__why-is-a-content-audit-useful.md` (2025); `semrush/blog__content-pruning.md` (2024).
- Small B2B sites audit all posts, not an 80/20 sample.

---

## G. GEO / AEO specifics

Google's position: optimising for AI features **is SEO**. No extra technical requirements, no special files or markup. [G] `ai-optimization-guide.md`; `ai-features.md`. Bing publishes GEO-specific guidance that is compatible with this: single-topic URLs, facts stated plainly, key information early, consistent entities (`sej/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions__568442.md`, 2026). Rules:

| ID | Rule | Tag | Sources |
|---|---|---|---|
| G1 | **Eligibility:** indexed, snippet allowed (no `nosnippet`, `data-nosnippet` on answers, or tiny `max-snippet`), and the site not opted out of generative AI features in Search Console. On Bing, avoid `NOARCHIVE`/`NOCACHE` on content meant to be cited. | [G]+[1 Bing] | `ai-features.md`; `ai-optimization-guide.md`; `sej/google-search-console-ai-reports-rolled-out-worldwide__587836.md` (2026); `sej/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions__568442.md` |
| G2 | **Answer passages:** a 40–60-word direct answer under the H1 and at the top of each H2; the subject entity named in the first sentence. The length is borrowed from featured-snippet studies, not AI-citation studies; Google sets no length. | [2+] length [C-6] | `moz/blog__what-we-learned-analyzing-featured-snippets.md` (2017); `semrush/blog__featured-snippets.md`; `backlinko/hub__seo__featured-snippets.md` (2025); `yoast/featured-snippet-answer-box.md` (2019); `ahrefs/blog__short-vs-long-content-in-ai-overviews.md` (2025); [G] `featured-snippets.md` |
| G3 | **Non-commodity evidence** is the main citation lever: factory data, specs, policies, cases (P1). | [G]+[2+] | `ai-optimization-guide.md`; `ahrefs/blog__llm-citations.md` (2025); `semrush/blog__answer-engine-optimization.md` (2025) |
| G4 | **Statistics in text** (not only inside images), each with source and year. The "+30–40% visibility" figure comes from a lab simulation (Princeton GEO paper, cited by several vendors); do not use it as a KPI. | [2+] | `backlinko/generative-engine-optimization-geo.md` (2026); `semrush/blog__answer-engine-optimization.md`; `ahrefs/blog__llm-optimization.md`; [B] AI Performance post |
| G5 | **Tables/lists only where the content is tabular** (MOQ tiers, fabric comparisons, decoration methods). A controlled experiment found structure effects on "cited or not" not significant. | [B]+[1 experiment] | [B] Feb-2026 post; `sej/ai-citation-test-finds-source-order-matters-less-than-it-looks__589806.md` (2026) |
| G6 | **Access:** body in server HTML (Astro static satisfies this; many AI crawlers don't render JS). Allow search/retrieval bots: Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot. Training bots (GPTBot, ClaudeBot, Google-Extended) are a business decision. Google-Extended does not affect Search/AIO but controls Gemini training and Gemini Apps/Vertex grounding. | [G]+[2+] | `G/crawling__docs__crawlers-fetchers__google-common-crawlers.md`; `ahrefs/blog__llm-visibility.md` (2025); `semrush/blog__llm-optimization.md` (2026) |
| G7 | **Freshness honestly:** visible dates plus real updates. AI assistants cite content that is on average 25.7% "fresher" than organic results; AIO does not show the same effect. Never fake dates (B15). | [1]+[G] [C-22] | `ahrefs/blog__do-ai-assistants-prefer-to-cite-fresh-content.md` (2025, 17M citations); [G] `creating-helpful-content` |
| G8 | **Entity consistency:** one spelling for company, product lines, processes; Organization `sameAs`; facts stated directly. | [2+]+[B] | `sej/bing-adds-geo-to-official-guidelines-expands-ai-abuse-definitions__568442.md`; `ahrefs/blog__llm-visibility.md`; `semrush/blog__ai-search-trust-signals.md` (2025) |
| G9 | **No page per fan-out query**; answer related sub-questions inside the one page (fan-out fodder = H2/H3 sections). | [G] [C-23] | `ai-optimization-guide.md`; `moz/blog__google-geo-guidelines.md` (2026) |
| G10 | **llms.txt:** optional, never a gate. | [G]+[2+] | `ai-optimization-guide.md`; `ahrefs/blog__llmstxt-study.md` (2026: 97% of 137k llms.txt files got zero visits in May 2026); `semrush/blog__llms-txt.md` (2025) |
| G11 | **Schema is not a GEO lever.** Keep BlogPosting for correctness and consistency. The difference-in-differences test on 1,885 pages gave AIO −4.6% and AI Mode/ChatGPT ≈ +2% (not significant). | [G]+[1 causal] | `ahrefs/blog__schema-ai-citations.md` (2026); [G] `ai-features.md` |
| G12 | **Expect volatility.** No AIO keyword kept identical citations for a month; the average URL stays 3.87 days; AIO and AI Mode citations overlap 13.7%. Measure frequency over repeated runs. | [2+] | `semrush/blog__url-volatility-ai-overviews.md` (2024); `ahrefs/blog__ai-overviews-vs-ai-mode.md` (2025); `sej/ai-recommendations-change-with-nearly-every-query-sparktoro__566242.md` (2026) |
| G13 | **Clicks:** AIO lowers #1 CTR by 58% (Ahrefs 2026). Semrush saw no drop; Google calls AIO clicks higher quality. KPIs = impressions + citations + RFQs, not clicks alone. | [C-24] | `ahrefs/blog__ai-overviews-reduce-clicks-update.md` (2026); `semrush/blog__ai-overviews-study.md`; [G] `ai-features.md` |
| G14 | **Off-site (outside the blog pipeline, for marketing):** brand web mentions correlate with AIO visibility at 0.664 vs 0.218 for backlinks; YouTube mentions ≈ 0.737. Manufacturers should earn listings and mentions on B2B directories/platforms. Google says inauthentic mentions don't help. | [2+] correlational | `ahrefs/blog__ai-overview-brand-correlation.md` (2025); `ahrefs/blog__ai-brand-visibility-correlations.md` (2025); `semrush/blog__manufacturing-seo-ai-search.md` (2026); [G] `ai-optimization-guide.md` |
| G15 | **Use Bing grounding queries** (AI Performance report) as fan-out evidence for new H2s in refreshes. | [B] [1] | Feb-2026 Bing post |

---

## H. Conflict register and open decisions

| ID | Topic | Positions | Resolution used here |
|---|---|---|---|
| C-1 | Pillar form | Long guide (Backlinko, Semrush, Moz 2025) vs nav hub (Moz B2B 2021) vs category/product page (SEJ 2022) vs informational cornerstone (Yoast 2019) | Category page = hub; solution page = money page; long guide only if the SERP wants it (B4.4) |
| C-1b | Length | 300 / 1,000–1,500 / 1,447 / 1,500–2,500 / 2,100–2,400 / 2,350+ vs Google "no preferred count" | No target; SERP median as reference; < 300 warning (B8) |
| C-2 | FAQ schema | GEO vendors still recommend; Google removed the rich result (2026-05); Ahrefs: no AI lift | Not default. **Owner decision needed:** the template/handoff currently enables FAQPage by default (GQ handoff §6.2 stage 10) |
| C-3 | Is overlap cannibalisation? | Vendors: fix it; Mueller: several pages on one SERP isn't a problem | Only the B3.2 definition counts |
| C-3a | AI content ranking | 0.011 correlation (Ahrefs) / parity (Semrush 2024) / 80.5% of #1 human (Semrush 2026) | Human-led, reviewed; neutral assumption |
| C-4 | Canonical to fix cannibalisation | Moz/Backlinko yes; Ahrefs + Google docs no (duplicates only) | Merge + 301; canonical for near-duplicates only |
| C-4b | Person vs company byline | Google/Yoast/Ahrefs favour people; Google schema allows Organization; QRG bans fakes | Organization default; consented real person when available |
| C-5 | Funnel priority | SEJ: BoFu first; Moz 2025: full funnel | ~60/40 BoFu/education [H] |
| C-6 | Chunking / answer length | Vendors: chunk, 40–60 words; Google: no need to chunk, no fixed snippet length | Self-contained H2 sections in one page; 40–60 words is a SOFT target only |
| C-7 | Paragraph length / question headings | Backlinko 1–2 sentences vs Yoast > 2 sentences, < 150 words; all-question H2s = over-optimisation | Yoast bands as SOFT; ≤ 50% question H2s [H] |
| C-8 | Topical authority | Ahrefs/Backlinko real signal vs Mueller "don't worry" | Justify clusters by UX/links, not an authority score |
| C-9 | Intro style | BLUF (Semrush/Yoast) vs PAS/PPP hooks (Ahrefs/Backlinko) | Answer in sentences 1–2, hook after |
| C-11 | Credit a non-writing expert as author (Moz) | vs QRG fake-E-E-A-T | Prohibited |
| C-12 | AI disclosure | Ahrefs: not required; Google: consider it where expected | Disclose where readers would reasonably ask |
| C-13 | Information-gain ratio | Backlinko 10–40% vs Ahrefs "unconfirmed" | Qualitative gate (≥ 1 item), no ratio |
| C-14 | Title length | Google none; 50–60 chars, ≤ 550–600 px (vendors) | ≤ 60 SOFT |
| C-15 | Meta length / value | 105–160 across vendors; Semrush "not very important" | Write it; 120–155 SOFT |
| C-16 | Internal link count | Ahrefs 3–5 vs Backlinko 5–10 in and out | 3–8 contextual [H] |
| C-17 | Exact-match anchors | Semrush/Backlinko OK vs Ahrefs/Yoast vary | ≤ 50% exact to one target [H] |
| C-18 | Noindex paginated pages | Old Moz (2007/2014) yes vs Yoast/Ahrefs/Semrush/SF + Google current docs: index, self-canonical | Index, self-canonical |
| C-19 | Category/tag indexation | Backlinko noindex both; Yoast: categories are landing pages, drop tags | Index categories with unique copy; tags off |
| C-20 | Pruning | Vendor case studies with gains vs Google "deleting to look fresh won't help; last resort" | Prune only unhelpful, zero-value pages, human-approved |
| C-21 | 404 vs 410 | Yoast 410 faster vs Google all 4xx equal | By meaning |
| C-22 | Freshness in AI | AirOps/Semrush strong vs Ahrefs: AIO age ≈ organic | Real updates only |
| C-23 | Separate docs per use case (Semrush LLM) | vs Google scaled-content warning | Follow Google |
| C-24 | AIO clicks | −58% (Ahrefs) vs neutral (Semrush) vs higher quality (Google) | KPI = impressions + citations + RFQs |

**Owner decisions still open:**
1. FAQPage default in the template (C-2).
2. Person bylines: which staff can be named, with consent, in the fact sheet.
3. Training-bot policy (GPTBot/ClaudeBot/Google-Extended).
4. Cadence cap for launch (F1 default 2–4/month).
5. Whether GQ `ai_prompts` become the fixed AI-visibility prompt panel (GQ handoff §7.5).

**KB gaps (do not fabricate around these):**
- No apparel or B2B-manufacturer blog study.
- No numeric SERP-overlap or "blog-dominant" threshold.
- No evidence for reading time, TOC or CTA-placement effects on SEO.
- No Google doc on IndexNow.
- B2B BoFu conversion data comes from one agency and one client.
- Most AI-citation studies are vendor correlational analyses. The only causal tests are Ahrefs' schema test and one arXiv experiment.
- Every **[H]** threshold above must be calibrated on our own GSC/Bing data after launch.
