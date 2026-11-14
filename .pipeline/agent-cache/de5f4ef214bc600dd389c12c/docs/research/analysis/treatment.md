# Treatment: swimwearbali.com

The site:run step "treatment" (2026-11-14). It wrote `src/styles/reference.css` and `src/data/template-variants.json`
(`components`). Evidence comes from `design-lock.json`, `font-roles.json`, `components.md`, `behaviors.md`,
`section-modules.json`, `docs/research/components/*.spec.md` and the design references (1440/768/390) of home, about,
contact, manufacturer and solution. Contrast changes and template gaps are in `notes.md` ("Treatment: contrast
changes", "Template gaps").

## Tokens

| Set | Evidence |
|---|---|
| The design-lock tokens again in `:root:root` (surfaces, text, accent, sizes, radii, container, gutter, header height) | design-lock.json `tokens`. global.css's default `:root` follows the lock block and overrode it (notes.md, Template gaps) |
| `--text-muted: #5b6d80` | lock `#6e8296`, darkened for AA (notes.md) |
| `--accent-text: #1670a8`, `--text-eyebrow: #1670a8` | lock `supplementaryRoles.eyebrowText`: the competitor's coloured text on light surfaces |
| `--size-eyebrow 0.875rem`, `--tracking-eyebrow 1.4px`, `--size-lead 1.625rem` (0.875rem in the phone hero) | lock eyebrowSize, eyebrowTracking, leadSize (26px; 14px at 390) |
| `--size-card-heading 1.375rem` (1.5rem on phones) | font-roles subheading "01. Custom Designs" 22px / 24px at 390 |
| `--size-stat 2.5rem` | components.md home 9: big numbers 40px |
| `--section-space: clamp(3rem, 6vw, 5.4rem)` | components.md: sections pad in vw steps; 6vw = 86.4px (home MOQ band); the lock's 57.6px is one section's padding, while the template's token is the gap between two sections |
| `--grid-gap 1.75rem` (cards) | components.md home 7: 13.98px margins, ≈28px between cards |
| `--carousel-gap 1.25rem` | behaviors.md: testimonial slides 20px apart |

## Shell

- **Header**: `header: { layout: inline, topBar: false, dropdown: list, carets: true, ctaRoute: null }`. Bar
  `--surface-header` `#306180`, white text, no bottom border. Items Maison 500 16px with 13px 20px padding (12px sides
  from 1024 to 1279px, so six items and the logo fit). The white wordmark comes from `--logo-filter` (our logo is dark
  ink), 28px tall for the competitor's ≈272px-wide wordmark. The dropdown is white without shadow, with 16px items in
  `#306180`, and `#d3ebfd` behind the hovered or current item. The mobile drawer is on `#306180`. Evidence:
  Header.spec.md, components.md "Header", lock headerSurface, navCurrentSubItem.
- **Footer**: `footer: { layout: columns, phoneGroups: collapsed }`. The background is `--surface-footer` `#003049`. The
  brand column is centred, with a thin rule beside it from 1024px. The brand and column titles are uppercase
  (20px/4px tracking; 18px/0.3px). Links are 16/24, 12px apart. The legal lines are centred at 14/21, with no top rule.
  On phones the titles are letter-spaced and folded, with a › chevron that turns when open. Evidence: Footer.spec.md,
  behaviors.md "Footer toggles", the about/contact 390 and 768 references.

## Modules

| Module (page types) | Set | Competitor evidence |
|---|---|---|
| Hero `media-overlay` (home, solution) | Left copy. Eyebrow white with 0.9px tracking. Title line-height 1.1 (home: aqua `--accent`, weight 800). Lead in the body face, bold, 1.7 line-height. Aqua primary pill; cream secondary pill (`#f6f3ec`/`#111111`; solution: navy primary, white-outlined secondary). Height `clamp(560px, 62.5vw, 900px)` (solution `clamp(420px, 38vw, 560px)`), 150vw on phones. Left gradient overlay on desktop, even 0.55 below 1024px | Hero.spec.md home/solution; components.md home 1; font-roles display 88/96.8, 800, `#8fd6e1`; lead 26/44.2 700 |
| Hero `media-overlay` centred (about) | `--hero-align: center`, title 45px, even overlay 0.42, height `clamp(320px, 36vw, 518px)` (138vw on phones) | Hero.spec.md about; font-roles pageTitle 45px centred white |
| Hero `plain` (contact) | Centred title 44px, lead 17px, section headings 32px | Hero.spec.md contact; font-roles pageTitle 44px; contact 1440 reference |
| Hero `media-banner` (manufacturer) | Banner `clamp(220px, 36.5vw, 525px)`; title 36px, lead 16/24; section headings 32px weight 500 | Hero.spec.md manufacturer; font-roles "Built for Swimwear" 500 32px |
| Section headings | Line-height 1 (60/60, 32/32 on phones); 52px FAQ heading on home; left-aligned (`headingAlign: start`, kept) | font-roles heading; components.md "Recurring treatments" |
| Eyebrows | 600 weight, uppercase, `#1670a8` on light surfaces, white on navy and photos | font-roles ui eyebrow; Text.spec.md |
| Running text | 17/25.5 black (tokens). Paragraphs held to 70ch. Inline links in `--link`, underlined | font-roles body; about 1440 inline link |
| Buttons | Pills (999px): uppercase 14px 700, 48px tall, 36px side padding, aqua with `#1f5a7a` text. Light-section secondary: black-outlined. Manufacturer: black, 8px corners, title case, 16px 400, 12px 24px | Hero.spec.md buttons; CTA.spec.md; components.md manufacturer 2 |
| Text sections (intro, proof `band`) | Plain text on the page (the band panel's fill and padding removed); white and tint alternate by the template | components.md about 2, home 15, manufacturer 2-3/7/10-11 |
| Cards (`featureGrid: outlined`; home `outline-numbered`) | 1px black outline, 6px corners (the variant's 20px set back to `--radius-card`), 32px inset, no shadow. Number in the title's type, black. Titles 700 at 1.5 line-height | Grids.spec.md outlined cards; components.md home 7 |
| Numbered cards (solution `numbered`) | Numerals 28px 500 in `#1670a8` | components.md solution 3: "large blue numerals" |
| Split rows (`splitMedia: alternate`; `tinted` on beige) | Template surfaces; `panel` is the blush `#ffe5df`, square | SplitMedia.spec.md; lock bandBlush; components.md manufacturer 9 |
| Figures `tiles` (home) | Navy tiles (`#0b2a4a`) with 20px corners, white labels, aqua 40px figures; the template's round mark hidden | components.md home 9; Grids.spec.md figure tiles |
| Figures `trust-bar` (home) | Values 30px 700 aqua, uppercase 13px labels, a hairline over each column, left-aligned | components.md home 10; section-modules home 10 |
| Steps (solution `process: band`) | Navy band (template), numbers without a filled marker, 17px titles | components.md solution 5 |
| FAQ (`faq: two-column`, `faqFirst: closed`; solution `bars`) | Questions in the hero face at 700 15px in navy `#0b2a4a`. Hairline rows, 20px vertical padding, a navy + at the right. Solution bars rounded 6px | FAQ.spec.md; font-roles FAQ question; lock headingNavy |
| Closing band (`cta: image-band`; manufacturer `inline`) | Copy held to 40rem on the left, h2 at 1.4 line-height (60/84), white-outlined pills. Height `clamp(320px, 42vw, 614px)`. Left gradient overlay on desktop, even 0.55 below | CTA.spec.md home 17; components.md home 17 |
| Photo band (`band`) | Same left gradient (even 0.55 below 1024px) | section-modules home 14 band:left |
| Form (contact `form: media`) | Square black-outlined fields (tokens), full-width `#262626` SEND bar 15px, the photo with 10px corners | components.md contact 2; lock submitSurface, inputBorder |
| Contact channels (contact `cards`; solution `list`) | Cards 245px wide, `#979797` outline, 10px corners, 15px inset, 10px gaps, 74px icon without a disc. The name is a black bar (8px corners, white 20px 700). List rows are white with a `#979797` outline | Grids.spec.md channel cards; lock channelCardBorder/Radius; contact 1440 reference |
| Logos (`logos: marquee`) | Bare marks, no tile borders | behaviors.md logo marquee; components.md home 5 |
| Testimonials (`testimonials: carousel`) | White cards on the sage `#d6e2de` band, 20px apart | components.md home 18; lock bandMint |
| Gallery (home `grid`; solution `band`) | Template grid, 2px photo corners (token) | Gallery.spec.md |
| Blog (`blog.hub: plain / bordered`, `post: narrow`) | Not observed: the reference blog was not captured. Chosen as the competitor's nearest modules (the contact page's plain centred title, the home page's outlined cards) | none (not observed) |

## Template gaps

Listed in `notes.md` under "Template gaps":

- the global.css token cascade
- hero video
- per-instance section surfaces (blue and navy split bands, the navy figure band)
- the FAQ heading above two columns of questions
- the first-open FAQ per page type, and the bars' left marker
- heading alignment per page type
- full-bleed closing and photo bands
- the six-photo gallery row with its lightbox
- the number inline in card titles
- per-card tints and composite cards
- the channel list's navy first row
- channel cards two by two on phones
- the logo label beside the marquee
- footer folds on tablets, the Raleway footer titles, the monogram and social icons
- the manufacturer's italic sublines and centred button pairs
- the Maison font aliases
