# Reference analysis notes: swimwearbali.com

Written by the analysis step (2026-11-14). What could not be observed, what was left out and why, and one pipeline
issue for the fonts step.

## Font substitution: action needed before the fonts step

- The reference serves the commercial **Maison Neue** under three @font-face names: `Maison Neue`, `Maison` and
  `Maison Book` (files `MaisonNeue-Medium1.ttf`, `fonnts.com-Maison_Neue_Book.ttf`, `FontsFree-Net-Maison-Neue-Bold.ttf`;
  home capture `fonts` list, desktop lines 433174-433250).
- `docs/research/raw/font-lock.json` (written by the capture step) gives roles `display` and `hero` the family
  `Maison Neue`, and `body`, `subheading`, `navigation` the family `Maison`. It records no `substituteFor`.
- `scripts/lib/font-licenses.mjs` SUBSTITUTES maps `maison neue` to **DM Sans**, but `Maison` and `Maison Book` are not
  keys of the table (`substituteFor()` matches the key or the key followed by a space). As it stands the fonts step
  would ask Google Fonts for a family called "Maison" and fail.
- The fix belongs to a file this step may not write: either `font-lock.json`'s `body`, `subheading` and `navigation`
  roles get `"substituteFor": "Maison Neue"` (`fontPlan` then resolves them through the table to DM Sans), or
  SUBSTITUTES gets `maison` (and `maison book`) → DM Sans. The open substitute for every Maison role is **DM Sans**
  (sans-serif); `font-roles.json` records the observed weights 300, 400, 500, 600, 700, 800, which DM Sans covers.
- `font-lock.json`'s `body` role (Maison 600 14px/14px) and `hero` role (Maison Neue 600 14px/14px) are the hero
  eyebrow and nav-size runs, not running text: the observed running text is Maison 400 17px/25.5px
  (`font-roles.json` roles.body). Raleway 600 is the footer headings' face (open, Google Fonts).

## For the treatment step (observed facts with a consequence)

- The accent `#8fd6e1` is a fill colour in the reference (buttons, the hero headline on a dark photo). As text on the
  white or beige surfaces it would be unreadable; the reference's coloured text on light surfaces is the eyebrow
  `#1670a8` and the navy `#0b2a4a` (`supplementaryRoles.eyebrowText`, `headingNavy`).
- The link colour `#08a4ec` is below 4.5:1 on white; `apply-reference-analysis.mjs` darkens it in the token block
  (`readableLink`) and notes why.
- Navy `#0b2a4a` (content bands, `--surface-dark`) and the footer's `#003049` (`--surface-footer`) are two different
  observed navies; the header bar is `#306180` (`--surface-header`).

## Values not observed (left out)

- Hover, focus and open states: nav item and button hover colours, the open dropdown, the mobile menu drawer, slider
  arrows' styling and autoplay timing. Only the closed states were captured.
- Inner pages at tablet-768 and mobile-390: type sizes were read for the home page only (`font-roles.json`
  `notObserved`). The inner pages' phone layouts are described from the screenshots.
- The contact photo's corner radius (it shows rounded corners in the screenshot; no value read).
- The colour of the current-page item in the header (lighter on /about-us/, with an underline bar on /contact-us/ in
  the screenshots).
- `--grid-gap`: no single gap. Observed: ≈28px between the home outlined cards (13.98px margins), 20px between
  testimonial slides. The template default is left in place.
- `--size-hero` / `--size-display` in between 390 and 1440: the reference switches sizes at its breakpoint (768 still
  uses the desktop 88px / 60px); the clamp tokens interpolate between the two observed ends (design-lock tokenMapping).
- Home section 13 (branding): the 1440 capture shows no image in its left column and no photo of it is among the
  captured assets.
- Home example-price cards: four cards; the DOM has three `<img>` sources for them (`examplepriceswim1.jpg`,
  `exampleppricesswim4.jpg`, `examplepricesswim2.jpg`, desktop lines 245436, 250743, 260252) and only the first two were
  captured as files. The third card ("Retro High-Cut One-Piece") shows no `<img>` in the capture.
- No **material** photos: the reference shows fabric only as swatch cards and charts (below). `media.json` has no
  `material` pool.
- Only one **process** photo (manufacturer, worker hanging a swimsuit). The about page's sewing-floor photo is used as
  the about hero (with its phone version) rather than duplicated in the process pool.

## Images left out of the media pools

Not product, process, material or lifestyle photographs (or carrying text), so our pages would show them out of context:

| File | Page | What it is |
|---|---|---|
| `reference-assets/f2804fe8be8b3d120ec7.png` (vitapng, 1536×1166) | home | Colour swatch card: zig-zag fabric swatches with code and colour names printed on them |
| `reference-assets/a3d8223f78de3abdbf61.png` (sumatrapng, 1536×1398) | home | Colour swatch card with "Sumatra Rec" / "Sumatra" titles and printed names |
| `reference-pages/manufacturer/reference-assets/82eb3a65b6b033bb4527.jpg` (fabricsamplingswimwear) | manufacturer | Fabric chart: two swatch grids with fabric composition text |
| `reference-pages/manufacturer/reference-assets/84bb4f4a3fe7417d6134.webp` (handovertomockup) | manufacturer | Diagram: customer handover form and mock-up sheet with arrows and labels |
| `reference-pages/solution/reference-assets/38b5be013034ef2eafab.webp` (swimwear-handover) | solution | Diagram: "Typical customer handover" / "Free mock-up sent back" sheet with text, drawings and swatches |
| `reference-pages/manufacturer/reference-assets/44cb25317a3bfb2b9b8b.jpg` (MOQ-Custom-Designs) | manufacturer | Coloured line drawings of bikini tops/bottoms and one-pieces with "x40" labels |
| `reference-assets/f8d80306973e4cfeca0d.jpg` (Frame-1272631859, 2560×736) | home | Photo of a sea turtle tangled in fishing net under water (sustainability band background): a photograph, but not of product, process, material or lifestyle |
| `reference-assets/c6b01eb929355836cf69.jpg` and the manufacturer YouTube thumbnails (`4d084f…`, `3a6ec8…`, `b6c50a…`) | home, manufacturer | Video poster frames from YouTube embeds |
| `reference-assets/dc5c92970ce597e1081b.png`, `8e315b18b0e700c1ab38.png`, `38c0017268fd4d8dfebe.png`, `a43297cf69e389222bdd.png`, `79a8b2b80c55403a7a33.png` | home | Client brand logos (marquee): owner logo slots, not photos |
| `contact/reference-assets/091128f139555798d171.png`, `1c8758e2e7a4f0ab3489.png`, `f8e47f35c1f5df8e1d45.png`, `c345b014c4a099c6e46d.png` | contact | Channel icons (calendar, handshake, map pin, WhatsApp) |
| `reference-assets/3e60fb8d5168b0cd2668.png`, `7c24c74d100757617cee.png` | all | Divider line images |
| `reference-assets/4a8409efd7913226057c.jpg`, `manufacturer/reference-assets/2bf34bb3b8c45e83ec1f.jpg` | home, manufacturer | YouTube channel avatars |
| `*.gif`, `e3b0c44298fc1c149afb.bin` | all | Tracking pixels / empty responses |
| `8345f9aeb6d32419a24f.mp4`, `13225ce97e973b0e6149.mp4` | home | Videos (not stills) |

## Hero photos with space made for a headline

- Home desktop `24fca058…webp` and solution desktop `5de26ce4…webp`: the left third is darkened by a gradient baked into
  the file, under the reference's headline. Said so in their `media.json` subjects.
- About `921805b7…webp`: the reference lays its centred white H1 over the middle of the photo (no gradient in the file).
- Manufacturer `8e60c41e…webp`: shown with no text on it (title below the banner).
