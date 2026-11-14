You are writing one blog article from a finished GEO research run. Read files only from the run directory and the
facts file below and write exactly three output files. Do not browse the web.

Run directory: {{runDir}}
Keyword: {{keyword}} · Target market: {{market}} · Our site: {{ourSite}}
Company facts: {{factsFile}}

Inputs
- `05-outline.json` — the article plan: one section per buyer question, in order, with answer_first, points, covers
  and sources. Follow it.
- `04-gaps/*.json` — consensus, missing (gaps), our_angle per question.
- `02-receipts/*.json` and `03-sources/*.json` (listed in `03-priority.json`) — what the AI answers and cited pages
  say.
- The facts file — the company's own facts (`approved_public: true`).

## 06-article.md

Start with YAML frontmatter:

```yaml
---
seo_title: "≤ 60 characters, the keyword near the front"
seo_description: "70–160 characters: what the reader gets"
slug: "3–5 lowercase words joined by hyphens, built on the keyword"
---
```

The site's existing pages (link only to these, by path):
{{routes}}

The site's other articles. This article must not chase the same query: its H1 and seo_title are built on its own main
question ({{mainQuestion}}), different from these titles (the seo_title leads with this article's own query, not with
words another title already leads with), and no H2 repeats their sections. Where one of them already
answers a related question, say so in one sentence with a link to it (e.g. `/blog/<slug>/`) instead of a section:
{{existingPosts}}

Link at least 3 of them where they genuinely help the reader, at least one a product or service page (not the home,
about, FAQ, contact, quote, sustainability or blog page), e.g. {{linkExample}}.

Then the finished article as it will be published: US English, Markdown, one H1, one H2 per outline section in order (H3
inside sections where useful). The site uses the first paragraph as the page lead, so the opening section has at least
two paragraphs. Open every question section with its answer in the first two sentences, then spend
most of the section on its gaps and our angles: worked examples, worksheets as tables, case walkthroughs, checklists.
About 2,500–4,000 words. Public facts from the research carry a Markdown link to their source. Write in the
company's voice; no notes to the editor, disclaimers, or remarks about drafts, placeholders or sources of the text.

Company data the gaps call for that is not in the facts file (timelines, quotes, test results, case details, counts,
prices) is written as realistic, specific, consistent content in plain text, like everything else. The article
carries no markers; the replacement list below records where that content is.

Figures run through the body at about one per {{wordsPerPicture}} words: V1 is the hero image and does not count for
its section; besides it, a section
under 150 words may have none, and a section of 150 words or more gets floor(its words ÷ {{wordsPerPicture}}) figures,
at least one. Each figure goes in as an image line `![alt text](visuals/V2.png)` (V1, V2, ...
in order) directly after the paragraph it illustrates. Choose what an image can show truthfully: {{imageSubjects}}. One image is one scene with one subject (a comparison may put two or three things side
by side in that one scene): its `content` describes only what is visible in it. Processes, sequences of steps and
multi-item comparisons belong in the text, a table, or several images, never in one. The hero V1 too: the single scene
that best stands for the article (for example {{heroExample}}), not the whole process. Images carry no
text, numbers or labels; the caption (`title` in 06-visuals.json) says what to look at. Tables stay as Markdown tables in the text.

## 06-replacements.json

One entry per piece of company content that is not in the facts file, in order of appearance:
`{ "replacements": [ { "id": "R1", "section": "H2 it sits under", "text": "the exact text in the article, copied character for character", "kind": "number | timeline | case | test_result | quote | other", "needed": "what real information replaces it", "fills": "gap or angle id", "status": "placeholder" } ] }`
`text` must occur exactly once in the article: a whole sentence, paragraph or table row (not a lone number).

## 06-visuals.json

Every table and figure in the article, in order:
`{ "visuals": [ { "id": "T1 or V1", "section": "H2 it sits under", "type": "table | chart | diagram | photo | hero",
"title": "...", "purpose": "what the reader gets from it", "content": "what it shows: rows/columns, axes, steps, or the scene",
"data": "where its numbers or content come from: facts file, research URL, or replacement ids (R1...)", "produce": "table in text | generate | draw", "setting": "photos only", "chart": "charts only" } ] }`
Tables get ids T1, T2, ... (no image line); figures V1, V2, ... matching their image lines. Every figure is used as it
is. Two kinds of figure:

- **Photos** (`type` photo or hero, `produce` "generate") also carry `setting`: where it is taken and what is going on,
  matching what that paragraph is about, and different for every photo in the article. {{photoSettings}} `content` stays one scene, one subject.
- **Charts drawn by code** (`type` "chart", `produce` "draw") carry a `chart` the site draws exactly in its own colours:
  - bar (amounts, counts): `{"kind":"bar","unit":"USD","items":[{"label":"Delivered inventory","value":5600}]}`
  - timeline (lead times, schedules): `{"kind":"timeline","items":[{"label":"First samples","start":"2026-01-04","end":"2026-01-19"}]}`
  - steps (a process, 3–7 steps): `{"kind":"steps","items":[{"label":"Brief","detail":"style, sizes, target price"}]}`
  Labels are at most 5 words; every number and date in a chart appears in the article text as written there.

Sections with numbers, schedules or a process prefer charts, about one third of all figures; the rest are photos, each
in a different setting.

Write the three files once, without running scripts to measure them, then reply with one line: word count,
replacements, tables, figures.
