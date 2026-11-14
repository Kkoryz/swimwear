# Hero

Page-opening unit. The reference uses four designs by page type.

## Home `/` — photo with overlaid copy (hero:media-overlay)
- Full-bleed section with background photo `swimwearbali_desktop_frontpage-scaled.webp` (2560×1371); the photo's left
  third is darkened by a gradient baked into the file. Section colour behind it `#5a5959`.
- Copy block left, starting x≈101 at 1440, padding `0 86.39px 0 100.80px`:
  - eyebrow (the page's h1): Maison Neue 600 14px/14px, 0.9px tracking, uppercase, white;
  - headline h2: Maison Neue 800 **88px/96.8px** `#8fd6e1` at 1440 and 768; **38px/45.6px** at 390;
  - lead: Maison 700 26px/44.2px white (14px/22.4px at 390);
  - two pill buttons, height 48px, padding 0 36px, radius 999px, Maison Neue 700 14px uppercase 0.14px tracking:
    aqua `#8fd6e1` / text `#1f5a7a`, and cream `#f6f3ec` / text `#111111`;
  - a small trust line at the bottom of the hero.
- Phones: portrait photo `mobilebannerswimwear.webp` (1080×2043); copy stacked over it.

## Solution `/start-your-swimwear-brand/` — same design
- Photo `Hero-Banner11-scaled.webp` (2560×933, baked left gradient); eyebrow h1 "GETTING STARTED" Maison 500 14px,
  1.4px tracking, white; white headline; navy and white-outlined pill buttons. Phones: `Hero-Banner12.webp` (1080×1950).

## About `/about-us/` — photo with centred title (hero:media-overlay, centred)
- Full-width photo `banner-about-us-scaled.webp` (2560×933), shown ≈518px tall at 1440; H1 Maison 700 45px/45px white,
  centred over the middle. No lead, no buttons. Phones: `banner-about-us-mobile.webp` (720×1000).

## Manufacturer `/swimwear-manufacturer/` — bare photo banner, title below (hero:media-banner)
- Full-width photo (2560×933) with no text; under it a centred H1 Maison Neue 700 32px black, text in a 950px column and
  two black buttons (radius 8px). Phones: portrait `swimwear-manufacturer-mobile.webp` (720×1000).

## Contact `/contact-us/` — no photo (hero:plain)
- Centred H1 Maison 700 44px black, centred lead (Maison 17px) on white.

## Template mapping
- `--size-hero` (clamp of 38px…88px), `--accent` for the headline colour, `--hero-overlay`: the reference adds no CSS
  overlay (the gradient is in the photo file); `--hero-align` start on home/solution, centre on about.
- `media.json` hero list pairs each landscape photo with its portrait phone photo (same route).

## Not observed
The hero video's poster timing; the exact hero height at 1440 (screenshot ≈900px for home).
