# Split media (text beside a photo or video)

## Observed
- Home section 2 (on `#f4eee6`) and 3: text column left (eyebrow, h2, paragraph, small bold note), media column right
  (embedded video, black box at 16:9). Columns ≈618px each inside 1400px at 1440; stacked on phones (text first).
- Home section 3 adds a card under the text: `#f4eee6`, radius 8px, h3 Maison 700 26px, then a five-value figure row
  (`section.kt-num`, background `#f5eee7`, values 37.33px).
- Home section 4 (on `#dceaf5`): text left with a navy licence box (`#0b2a4a`, radius 8px, white text) and two pill
  buttons; tabbed swatch panel right.
- Home section 13: text in the right column, left column empty in the capture (notes.md).
- Manufacturer sampling row: full-bleed, text column on `#ffe5df` left, process photo right (half width, cover crop).
- Manufacturer sections 4-5: text beside a diagram (left out of pools) and a video beside text — the media side
  alternates (right, then left).
- Solution section 2: two panels side by side (white bordered; navy `#0b2a4a` with white text).
- No photo radius on split photos; no shadows.

## Template mapping
- `splitMedia: "alternate"` (manufacturer alternates sides); variants seen: `single`, `tinted` (blush text panel),
  `panel` (navy/white panels).
- Surfaces: `--surface-secondary`, `--surface-band-blue`, `--surface-band-blush`, `--surface-dark`.
- Photos from `media.json` pools (process for factory rows, product/lifestyle elsewhere).

## Not observed
The video players' poster frames are not reused (YouTube); split gap as a CSS value (Elementor column padding).
