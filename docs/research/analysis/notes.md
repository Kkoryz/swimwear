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

## Treatment: contrast changes (src/styles/reference.css)

Where a competitor colour fails WCAG AA on our surfaces it was darkened by the least amount that passes, keeping its
hue; where the competitor relies on a dark area baked into its photo, the treatment adds the overlay token instead.

- `--text-muted` `#6e8296` (3.97:1 on white) → `#5b6d80` (5.3:1 on white, 4.6:1 on the beige `#f4eee6`).
- Inline links: `#08a4ec` (2.4:1) is `#0673a5` in the token block (apply step); on the blush split panel (`#ffe5df`)
  `#05709f` (4.6:1), since `#0673a5` is 4.4:1 there.
- Eyebrow `#1670a8` passes on white (5.4:1) and beige (4.65:1) and is kept; on the blush panel it is `#146aa0` (4.9:1;
  `#1670a8` is 4.47:1 there).
- The aqua `#8fd6e1` stays a fill (buttons, the home hero title over the photo, figures on navy). Where the template
  shows the accent as text on a light surface (numbers, icons, arrows: `--accent-text`) the competitor's light-surface
  blue `#1670a8` is used. On dark and photo surfaces eyebrows and links turn white, as the competitor's do on navy.
- Aqua buttons keep the competitor's `#1f5a7a` text (4.59:1 on `#8fd6e1`).
- Hero photos: the competitor's home and solution heroes carry a dark gradient baked into the photo files, and the
  about hero none. Our photos will not have it. The treatment sets `--hero-overlay` to the following:
  - Desktop (1024px and up), copy on the left: `linear-gradient(to right, 0.6 → 0.55 to 2rem past the copy's 46rem column,
    0.32 by 12rem past it, 0 by 30rem past it)`. The 0.55 under the copy keeps the aqua 88px title at 3:1 over a white
    patch. The audit's 0.35 point is reached about 15% of the width past the text (at 1440px: 0.32 at 948px, with the
    copy ending at 756px).
  - Tablets and phones (copy across the photo): an even `rgb(0 0 0 / 0.55)`, the least alpha that keeps the 14px
    white eyebrow at 4.5:1 over a white patch.
  - About (a centred white 45px title): an even `rgb(0 0 0 / 0.42)` (3:1 over white).
  - The closing photo band (`--cta-overlay`) and the photo band (`--band-overlay`) use the same left gradient on
    desktop (copy held to 40rem) and an even 0.55 below 1024px.
- Manufacturer title: the competitor sets its H1 at 32px, the same as its section headings. The template keeps a page
  title a step above the section headings, so the title is 36px over 32px headings.

## Template gaps

Designs of the competitor that the template cannot express through its hooks and variants (left as the nearest
module; nothing faked in CSS):

- **Token cascade (global.css)**: the starter's default `:root` block follows the design-lock block and resets
  `--surface-*`, `--text-*`, `--accent*`, sizes, radii and spacing to the starter's values, so the locked values never
  apply. `apply-reference-analysis.mjs` is meant to remove those tokens from the default block ("First run") and did
  not. The treatment sets them again in `:root:root`.
- **Hero video** (home): the competitor plays an mp4 behind its hero; the template shows the still.
- **Section surfaces per instance** (home): the competitor's split rows sit on three different bands (beige `#f4eee6`,
  light blue `#dceaf5`, navy `#0b2a4a`), and its MOQ figure tiles and digital-print row sit on navy bands. The template
  has one tinted surface, and protects plain sections' backgrounds (`template_rule_overridden`). The figure tiles are
  navy cards on the page's surface instead.
- **FAQ two-column** (home): the competitor puts the eyebrow and heading above two columns of questions; the template's
  two-column variant sets the heading beside one column of questions.
- **FAQ first answer per page type**: `faqFirst` is site-wide. The home FAQ starts closed, while the solution FAQ opens
  its first answer; the site uses `open` (design review: the about FAQ showed three closed questions and no answer).
  The solution bars' ▸ marker sits at the left of the question; the template's mark sits at the right.
- **Heading alignment per page type**: the competitor centres its headings on the manufacturer, about and contact
  pages, and sets them on the left on home and solution. `headingAlign` is site-wide (`start`), and the site rules keep
  every section heading on the left edge. Only the about and contact page titles are centred (`--hero-align`).
- **Closing photo band width**: the competitor's closing band (home 17) and photo bands run full-bleed; the template's
  `image-band` CTA sits inside the container.
- **Gallery row of six** (home 8): six photos of mixed shapes at one height in one row, with a lightbox. The template's
  gallery grid takes 3 or 4 columns and has no lightbox.
- **Numbered card title** (home 7): the number sits inline in the bold title ("01. Custom Designs"); the template's
  `outline-numbered` sets the number on its own row (styled here in the title's type).
- **Per-card tints and composite cards** (solution 2, 7; home 9, 11): white beside navy panels, cream beside aqua
  cards, a wide card under the grid, price cards with coloured bodies. No per-item tint or full-width card row exists.
- **Channel list with a navy first row** (solution 10): the list's rows are all one style.
- **Contact channel cards on phones**: the competitor keeps them two by two at 390px; the template's cards go one per
  row under 600px.
- **Logo label beside the marquee** (home 5): "A few brands we produce" sits left of the moving row; the template sets
  a heading above it.
- **Footer**: the competitor folds the link groups on tablets (768px) as well as phones (the template folds at 767px
  and below). Its column titles are Raleway, which is no type role, so the fonts step does not install it (they use
  `--font-ui`). The brand monogram and the round social icons have no slot.
- **Manufacturer details**: the italic sublines under headings and the centred button pairs under the text.
- **Fonts**: see "Font substitution" above (`Maison` and `Maison Book` are not keys of the substitute table).
- **Process band button centred** (`action_detached`, desktop: /swimwear-embroidery/ intro-1-steps and
  splitMedia-3-steps, /swimwear-consulting/ faq-steps, /development/ splitMedia-1-steps,
  /swimwear-packaging-custom-brand-labels/ proof-1-steps and splitMedia-1-steps, /swimwear-launch-services/
  overview-steps): patterns.css centres `.process__cta` under steps whose text is set from the left, so the button
  stands away from the text it ends on any site using the band with its button. The treatment sets it under the first
  step of the last row (reference.css); the template's default would do better to follow `headingAlign` and the last
  row's start.
- **Home hero title weight** (`/`, hero, design-gate P2): the title is already set at 800 (reference.css), the heaviest
  weight `fonts.css` declares for DM Sans; a heavier title than the shots show needs the fonts step (a heavier instance
  or face), not the treatment.
- **Card rows already shared** (`/`, featureGrid-2, design-gate P2): the template already gives each card the row's
  tracks (patterns.css `.feature-grid > .feature-card` subgrid over `--card-rows`, 3 for numbered cards), which is the
  rule the finding asks for; a card text still starting a line lower needs looking into in the template, and a second
  copy of the rule in reference.css would only hold the card apart from the template's own.
- **Phone hero portrait** (`/swimwear-consulting/`, hero mobile, design-gate P2): `phoneHeroes` is written by
  `apply-reference-analysis.mjs` only when the heroes have phone sources, and this library's heroes have none (no portrait
  twin to show). (The copy now sits in the lower part of the phone frame: reference.css, design-gate repair.)
- **Contact hours on one line** (`/contact-us/`, channels): the cards now share the content width, which gives the time
  room; keeping "9:00-18:00" together needs a non-breaking dash in the copy or a hook on the hours value alone.
- **Testimonial parts level across the row** (`/`, owner-testimonials, design-gate P2): the testimonials are the
  carousel variant, whose `.track__items` is a flex row, so a card cannot take shared row tracks (subgrid) from it.
  Levelling the rule and attribution across the cards needs the template to give the testimonial cards row tracks of
  their own (as feature cards have through `--card-rows`); setting grid rows and spans on the items is the template's,
  and pinning the attribution by hand would hold one part apart from its card.
- **Testimonial parts level across the row, again** (`/`, owner-testimonials, design-polish repair P2): the asked subgrid
  (`grid-template-rows` on the track, `grid-row: span 2` on each card) sets a grid's rows and an item's span, which are
  the template's, on a carousel track that is a flex row. Still the template's to give the cards shared row tracks.

## Asked against the site rules

Findings of scope "site" not repaired as asked, because the asked fix breaks one of the site's layout rules (the part
the rules allow was repaired):

- `/swimwear-consulting/` m8 and `/swimwear-accessories/` featureGrid-1 (and process-1): the step and point titles were
  to be set "one step above the body size" / "at least the item text's size". Titles and headings are sized by the
  template to their own words; no rule sets their font-size. Repaired: weight 700, numbered accent numerals, check
  markers.
- `/custom-swimwear-printing/` splitMedia-1 (mobile): an `aspect-ratio: 4 / 3` for the wide row's photo on phones is a
  frame shape copied from the competitor; the template sets frame ratios from the photos (treatment practice, Photos).
- `/` owner-testimonials and `/swimwear-accessories/` owner-testimonials: `grid-template-columns: repeat(auto-fit, ...)`
  / `repeat(3, 1fr)` sets a grid's columns, which are the template's. Repaired instead through the carousel: when every
  card is in view the cards share the row (`.track[data-fits] .track__item { flex-grow: 1 }`).
- `/faq/`, `/terms-and-conditions/`, `/privacy-policy/` related: `grid-template-columns: repeat(auto-fill, minmax(18rem,
  24rem))` sets the related grid's columns and a fixed card width. Repaired instead: a lone related link is as wide as
  its own label (`width: fit-content` on a one-link list).

Design-gate repair (2026-11-14):

- `/swimwear-consulting/` m8 (desktop, P2): the list steps' titles (`.point-list__title`) "one step above the body
  size" is a font-size on a heading; titles and headings are sized by the template, no rule sets their font-size. (Its
  weight 700 and accent numerals stay.)
- `/blog/` table-1 (desktop, P1), the part that asks "a step-up size" for each card's topic: the topic is the card's
  `h3` (`.table-card__title`), a heading the template sizes. Repaired: light cards in the 1px outline with the card
  radius, black text, muted labels, light row rules, the topic in bold.
- `/about-us/` hero (mobile, P2) and `/blog/` hero (desktop, P2): an `object-position` on the about hero image and a
  `--hero-focal` for the blog hub move a photo's crop by hand. Treatment practice (Photos): every cut photo is centred
  on its subject by the template, and the treatment sets no `object-position` or `--*-focal`. Where the judged focal
  point misses the subject, that is the template's (art direction).
- `/custom-swimwear-printing/` splitMedia-1 (mobile, P2), again: `aspect-ratio: 4 / 3` for the wide row's photo on
  phones is a frame shape copied from the competitor; the template sets frame ratios from the photos.
- `/watersports-apparel-manufacturer/` overview (desktop, P2): the running text already holds to `max-width: 70ch`
  (reference.css, every `.block p`), the value the finding's fix and treatment practice ask for, and the layout audit
  (`long_measure`, measured in the paragraph's own ch) passes it. The reviewer counted letters: DM Sans's "0" (the
  `ch` unit) is wide, so 70ch holds about 95 average letters. Bringing the column to 70 letters would set the measure
  near 52ch, well under the practice's "about 70ch"; left at 70ch.

Design-polish repair (2026-11-14):

- `/swimwear-consulting/` m8 (desktop, P2), raised again: "one step above body size" for the list steps' titles is a
  font-size on a heading (`.point-list__title`, an `h3`); headings are sized by the template, no rule sets their size.
- `/about-us/` hero (mobile, P2), raised again: an `object-position` on the about hero image moves the crop by hand;
  every cut photo is centred on its subject by the template (treatment practice, Photos).
- `/custom-swimwear-printing/` splitMedia-1 (mobile, P2), raised again: `aspect-ratio: 4 / 3` on the wide row's photo is
  a frame shape copied from the competitor; the template sets frame ratios from the photos.
- `/contact-us/` faq and overview, `/watersports-apparel-manufacturer/` overview (desktop, P2): the answers, intro and
  closing text already hold to `max-width: 70ch` (every `.block p`), the value each fix asks for; the audit's
  `long_measure` passes them. The reviewer counts letters, and DM Sans's wide "0" puts about 90 letters in 70ch; a
  narrower measure would fall well under the practice's "about 70ch". Left at 70ch.
- `/swimwear-accessories/` m6 (desktop, P2), the part that asks the table to take the full content width: the table is
  held to 70ch of text beside its label columns (`.table-block__scroll`, treatment practice, Measure). Repaired: the row
  labels keep to one line on desktops.
