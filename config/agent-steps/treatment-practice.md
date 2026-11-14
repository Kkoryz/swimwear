# Treatment practice

What the treatment and its repairs follow, besides the competitor's own design. The design review flags a departure
from it; the layout audit measures some of it.

- **Text over a photo.** Contrast comes from the overlay token over the whole photo (`--hero-overlay`,
  `--cta-overlay`). Never a box, panel, card, border or shadow behind the text, never a radial spot of its own (the
  template's soft shade right behind the copy, `--text-scrim`, is part of the template), and never a gradient that ends
  in a visible edge. The layout audit and the design review judge it by the same numbers:
  - Text on one side (desktop): a `linear-gradient` from the text's side, under the text only as dark as contrast
    needs (the audit: 4.5:1, 3:1 for large text), down to an alpha of 0.35 or less by about 15% of the photo's width
    past the end of the text, and clear toward the far edge. An overlay whose lightest part is darker than 0.35 greys
    the whole photo: the audit fails it (`heavy_overlay`), and the review flags it.
  - Text across the photo (a centred band, phones): an even overlay at the least alpha that passes contrast, no more.
    A photo greyed by that least overlay is accepted; when the competitor shows the text below the photo on phones
    instead, that needs a layout the template does not have (a template finding, not a darker or lighter overlay).
  - A repair for one judge keeps the other: making an overlay lighter for the review stops where contrast still
    passes; making it darker for contrast stays in the text's region.
- **Contrast.** Every text and link meets WCAG AA (4.5:1, large text 3:1). A competitor colour that fails is darkened
  or lightened by the least amount that passes, keeping its hue.
- **Measure.** Running text is held to a column of about 70ch (`max-width` on the text column, in ch: the audit's
  `long_measure` measures lines in the paragraph's own ch and flags wider than 80ch), at every width; headings may run
  wider. A narrowed column sits where its section's heading sits: centred (`margin-inline: auto`) under a centred
  heading, so no wide empty band opens beside it.
- **Spacing.** Section padding, gaps and card insets follow the competitor's measured values (design-lock, components
  specs); a card's inner padding does not squeeze its text into a narrow column. The blank space between two sections
  stays within `--authoring-max-boundary-gap` at every width (the audit's `boundary_gap`): a heading that needs more
  room above it gets it from its section's own padding, not from padding added on top.
- **Nothing the competitor does not have.** No added panels, borders, shadows, rounded corners or background tints.
- **Photos.** A frame shows most of its photo (the template sets frame ratios from the photos; do not force one back).
  The audit's `heavy_crop` fails a photo shown under 60% of itself. A hero or banner on phones keeps the height its
  photo fills, never a wide photo stretched into a tall frame: the template gives phones a crop of a hero photo too
  wide for the competitor's phone hero, at the competitor's phone ratio (or the competitor's own portrait photos when
  there are some), and the frame follows it. A phone hero still too shallow after that is a template matter
  (`art-direction`), not the treatment's. Every cut photo is centred on its subject by the template (a judged point,
  set as the image's object-position): do not set `object-position` or a `--*-focal` for photos.
- **What the treatment cannot do.** A behaviour the template has as a variant (the "Template variants" of
  CSS_HOOKS.md) is set there, never approximated in reference.css (a scroll row without controls, a duplicated list that
  moves). A design that needs a behaviour the template does not have (a carousel, a different photo per breakpoint, a
  new layout) is not faked in CSS either: it is listed as a template gap in `docs/research/analysis/notes.md` and
  collected for the template (scripts/collect-template-gaps.mjs).
