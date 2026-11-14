# Text (intro / prose sections)

Heading + running text sections.

## Observed
- Home: left-aligned. Eyebrow (Maison 600 14px/14px, 1.4px tracking, uppercase, `#1670a8` on light, white on navy),
  h2 Maison 700 60px/60px (52px on some sections; 32px/32px at 390), paragraphs Maison 400 17px/25.5px black,
  margin-bottom 14.4px. Container max-width 1400px, content starts at x=20 at 1440 (23.39px side padding at 390).
- Home "heading + lead" rows (section 6): h2 left, paragraph in the right column.
- Manufacturer and about: centred headings (Maison Neue 500/700 32px), text in a 950px column, Maison Book 400
  16px/24px (manufacturer) or 17px/25.5px (about); italic sublines under some headings.
- Inline links `#08a4ec`, underlined (about line 121860).
- Navy text bands (home section 12): h2 and body white on `#0b2a4a`, body 16px/26px.
- Section padding 57.59px top/bottom at 1440 on most home sections (28.8px, 43.19px, 86.39px elsewhere).

## Template mapping
- `--size-display`, `--size-body: 1.0625rem`, `--line-body: 1.5`, `--text-primary`, `--link`, `--text-eyebrow`,
  `--size-eyebrow`, `--tracking-eyebrow`, `--section-space`, `--container-max`.
- `headingAlign`: home and solution `start`; manufacturer, about, contact centred (per-page-type evidence).

## Not observed
Paragraph max measure as a CSS value (text columns are set by Elementor column widths, e.g. 618px and 602px at 1440).
