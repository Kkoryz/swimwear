# FAQ

## Observed
- **Home** (section 16 on `#f4eee6`, padding 57.59px): eyebrow, h2 Maison 700 52px/52px (32px at 390), then questions
  in two columns at 1440 (one column at 390). Each is a native `<details>` with `<summary class="swb-faq__q">`: Maison
  Neue 700 15px/21px `#0b2a4a`, padding 20px 0, flex `space-between` with a 16px gap and a marker at the right;
  hairline separators. All closed in the capture; answers end with an arrow link.
- **Solution**: centred h2 ("Commonly Asked Questions"), rows as white bordered bars on a beige band, a ▸ marker at the
  left of each question, the first row open with its answer.

## Template mapping
- Home: `faq: "two-column"`, `faqFirst: "closed"`; solution page type: `faq: "accordion"` (first open) or `bars`.
- `--heading-color: #0b2a4a` for the questions; band `--surface-secondary`.
- No script: native details/summary.

## Not observed
Open-answer typography on home (no item open in the capture); marker glyph as a value.
