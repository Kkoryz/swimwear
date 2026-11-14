# CTA (closing call to action)

## Observed
- **Home closing band** (section 17): full-width background photo (`contactfrontpagedesktop-scaled.webp`, 2560×1091;
  phones `contactfrontpagemobile.webp`, 1080×1953) whose darker left half carries the copy: white eyebrow, h2 Maison 700
  60px/84px white ("Launch Your Swimwear Label"), a short paragraph, and four white-outlined pill buttons (1px solid
  white, radius 999px) in a row. Section padding 0 (the photo sets the height).
- **Home inline CTA** (section 8): one black pill button (`#000000`, white Maison Neue 700 15px uppercase, 0.15px
  tracking, height 46px, padding 0 52px, radius 999px).
- **Manufacturer**: pairs of black buttons (radius 8px, padding 12px 24px, Maison Book 16px white), centred under text;
  the page closes with "Send Your Designs" + two buttons on white.
- **Solution closing panel**: a beige panel with heading "Contact Us", text and four channel rows (first row navy
  with white text, others white with a border and an arrow at the right).
- **Contact form** (contact page): inputs 1px solid black, radius 0; submit full width `#262626`, white text.

## Template mapping
- Home: `cta: "image-band"` with the photo from pools.lifestyle (the CTA band photos), `--cta-overlay`: the reference
  uses no CSS overlay (the dark area is in the photo).
- Manufacturer: `cta: "inline"` with dark buttons.
- Buttons: `--radius-button: 999px` (home), `--accent` aqua and `#000000` dark fills; `--button-secondary-bg: #f6f3ec`,
  `--button-secondary-text: #111111`.

## Not observed
Button hover states; the solution panel's exact colours (screenshot only).
