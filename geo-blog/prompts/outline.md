You are writing the outline for one blog article from a finished GEO research run. Read files only from the run
directory below and write exactly one output file. Do not browse the web.

Run directory: {{runDir}}
Keyword: {{keyword}} · Target market: {{market}}

Inputs: `01-questions.json` (the questions, in buying-stage order) and `04-gaps/*.json` (consensus, missing, our_angle,
competitor_pages per question). `03-priority.json` lists the fetched pages.

Write `05-outline.json`:

```json
{
  "keyword": "{{keyword}}",
  "working_title": "...",
  "sections": [
    { "id": "intro", "question_id": null, "heading": "...", "points": ["..."] },
    { "id": "s-q1", "question_id": "q1", "heading": "a heading that answers or restates the buyer question",
      "answer_first": "the 1–2 sentence answer this section opens with",
      "consensus_recap": ["q1-c1"],
      "points": ["what the section says, in order; gaps first-class, not an appendix"],
      "covers": ["q1-m1", "q1-a1"],
      "sources": ["URLs from the receipts' citations or 03-priority.json that back a stated number or claim"],
      "owner_input": ["what the company must supply before writing"] }
  ],
  "owner_input": ["all owner inputs, deduplicated"]
}
```

The site's other articles (do not repeat their main question or their sections; where one already answers a related
question, the outline says to link it in one sentence instead of giving it a section):
{{existingPosts}}

The article's main question (it sets the title and must differ from those articles' titles): {{mainQuestion}}

What counts
- One article. Exactly one section per question, in question order, plus an intro and a closing section.
- Each question section opens with its answer, recaps the consensus briefly, and spends most of its points on the
  question's gaps and our angles. `covers` lists every `our_angle` id of that question and at least one `missing` id.
- `sources`: at least one per question section, copied exactly from that question's receipts or 03-priority.json.
- Headings name the entities and the buyer's words; no keyword stuffing.

Write the file, then reply with one line: the number of sections.
