# Site Factory 07 structured data (`sf/structured/v1`)

Request to Site Factory stage 07: next to `sections`, emit an optional `structured` object per page so the template can render the reference patterns that prose cannot fill — key-figure rows, process timelines and comparison tables. The template importer (`scripts/import-site-factory.mjs`) already reads it.

## Shape (per page in `authoring_package.json`)

```jsonc
"structured": {
  "key_figures_title": "optional heading",
  "key_figures": [                                  // 2–6 items
    { "value": "50 pieces per style per colour", "label": "minimum order quantity", "fact_id": "moq" }
  ],
  "process_title": "optional heading",
  "process_steps": [                                // 2–12 items, in order
    { "title": "optional short step name", "text": "One or two sentences.", "fact_ids": ["sample-time"] }
  ],
  "comparison": {                                   // optional
    "title": "optional heading",
    "columns": ["Topic", "Custom designs", "Ready-to-order"],   // 2–6 columns
    "rows": [["Minimum order", "…", "…"]],                      // 1–20 rows, one cell per column
    "fact_ids": ["moq"]
  }
}
```

## Rules the importer enforces

- `key_figures[].value` is a claim: it must appear **verbatim** (case and spacing aside) in the text of the cited fact, and that fact must be `approved_public: true`. Anything else fails the import.
- Every `fact_id` / `fact_ids` entry must exist in `facts.yaml`.
- `label`, `title`, `text`, column and cell strings are 07-authored copy, rendered verbatim like section bodies. They must follow the same claim rules as prose (no unsupported claims; hold the page instead).
- The importer never derives these fields from prose and never shortens or rewords them.

## Placement

- key figures → a `stats` row right after the intro section
- comparison → a `table` right before the proof (terms) section, or before the FAQ
- process steps → a `process` timeline after the first body section (split, cards or gallery), or before the FAQ

## Until 07 emits it

`--structured <file>` supplies the same object per `page_id` from an overlay file (`{ "schema_version": "sf/structured/v1", "origin": "…", "pages": { "<page_id>": { … } } }`), and `--facts <facts.yaml>` is required whenever structured data is present. The import report records `structured: "package"` or the overlay's `origin` per page, so prototype data can never be mistaken for 07 output.
