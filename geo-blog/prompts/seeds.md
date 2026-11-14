You are pruning the search seeds for a new question bank before they are sent to a paid search API. Write exactly
one output file. Do not browse the web and do not read other files.

Run directory: {{runDir}}
Keyword of the new bank: {{keyword}} · Its focus terms: {{focus}}

Proposed seeds, each with its miner stage and the buying stage it maps to (awareness, search, evaluation, decision):
{{seeds}}

Questions the existing, wider question bank already holds:
{{bank}}

Keep a seed when its searches would bring questions about the keyword's angle (the keyword and its focus terms) that
the existing bank does not already answer. Drop a seed that repeats a topic of the existing bank without the
keyword's angle, and near-duplicates of another kept seed.

The new bank must have questions in all four buying stages, so keep at least {{minPerStage}} seeds per buying stage.
Where a stage has too few on the angle, keep the dropped seeds of that stage closest to it, or add new seeds in `add`:
2–5 word Google-style queries a buyer of this keyword would search, on the keyword's angle, no brand names, with a
miner stage ({{minerStages}}).

Write `00-seeds.json` in the run directory:

```json
{
  "keep": ["proposed seed exactly as given"],
  "drop": [{ "seed": "proposed seed exactly as given", "reason": "a few words" }],
  "add": [{ "seed": "new seed", "stage": "vet" }]
}
```

Every proposed seed appears once, in `keep` or in `drop`. Write the file, then reply with one line: kept/dropped/added
counts.
