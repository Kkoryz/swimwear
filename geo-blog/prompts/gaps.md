You are doing the gap analysis for one buyer question of a GEO blog research run. Read files only from the run
directory below and write exactly one output file. Do not browse the web.

Run directory: {{runDir}}
Question id: {{qid}}

Inputs
- `01-questions.json` — find `{{qid}}`: the question, its buying stage and its real-question evidence.
- `02-receipts/{{qid}}-*.json` — what each AI surface answered ({{receipts}}). Read every `answer_text` in full and its
  `citations`.
- `03-priority.json` — priority cited pages. Read only entries whose `cited_by` includes `{{qid}}`; their text is in
  `03-sources/<id>.json` (`markdown`). Use them to see what the cited competitor pages say that the answers dropped.

Write `04-gaps/{{qid}}.json`:

```json
{
  "question_id": "{{qid}}",
  "consensus": [
    { "id": "{{qid}}-c1", "claim": "one sentence the answers agree on",
      "receipts": ["{{qid}}-chatgpt-r1.json"], "engines": ["chatgpt"],
      "source_urls": ["URL copied exactly from those receipts' citations"] }
  ],
  "missing": [
    { "id": "{{qid}}-m1", "point": "what no answer covers that a buyer at this stage needs",
      "type": "original_data | first_hand | analysis",
      "why_it_matters": "...",
      "evidence": "where the need shows: the question's evidence lines, a cited page the answers ignored, or engines contradicting each other",
      "fill_with": "what we would supply ourselves: our own data, process, photos, tests, prices, or our own analysis" }
  ],
  "our_angle": [
    { "id": "{{qid}}-a1", "what_we_add": "what our article gives", "fills": ["{{qid}}-m1"],
      "owner_input": "what we need from the company to write it, or null" }
  ],
  "competitor_pages": [
    { "url": "a priority page", "covers": ["{{qid}}-c1"], "unique": "what only this page says, or null" }
  ],
  "engine_notes": { "chatgpt": "one line: stance, standout claims, location bias" },
  "watched_sites": "where our site and watched sites appear for this question (see receipts' our_site / also_watch)"
}
```

What counts
- consensus: 4–8 claims. List every receipt that states the claim; a claim needs at least {{minReceipts}} receipts.
  `source_urls` must be copied exactly from those receipts' `citations[].url` (may be empty).
- missing: 3–6 gaps, each checked against every answer and the priority pages. A gap is information we can supply
  ourselves — original data, first-hand experience, or our own analysis. Something we could only fill by re-citing
  other pages is not a gap; leave it out. No generic filler such as "more detail".
- our_angle: 2–5 items, each filling at least one gap. Company facts are not needed yet; name them in `owner_input`.
- Answers that assumed a non-US buyer (browser location) are noted in engine_notes; the target market is {{market}}.

Write the file, then reply with one line: the counts of consensus, missing and our_angle.
