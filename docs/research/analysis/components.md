# Reference module designs: swimwearbali.com

Source: the captures in `docs/research/reference-pages/<page type>/` (desktop-1440, tablet-768, mobile-390) and the
site-wide capture `docs/research/raw/`. Values are computed values (line numbers refer to the page type's
`raw/desktop-1440.json` unless another viewport is named). Colours are written as hex; their evidence is in
`design-lock.json`. The module names in brackets are the template modules that look closest; the binding choice per
section is the `modules` step's (`section-modules.json`), not this file's.

Site build: WordPress + Elementor (hello-elementor theme, ElementsKit and custom `kt-*` / `swb-*` widgets).
Breakpoint behaviour: the 768 capture uses the desktop type sizes (88px hero, 60px h2); the 390 capture switches to the
mobile sizes. Section padding is set in vw multiples (57.5938px = 4vw at 1440).

## Shared shell

### Header (all routes)
- Sticky (`position: fixed; top: 0` on desktop, tablet and mobile; Elementor `sticky_on` all three), height 79.16px at
  1440, 70.17px at 390. Outer shell `#003049`, inner bar `#306180` (padding 6px 0).
- Left: white wordmark `SWIMWEAR BALI` (PNG 1536×112). Right: seven top-level items (Order Samples, Start Here,
  Fabrics, Pricing & Guides, About, Catalogues, Contact Us); six carry a ▾ caret and a dropdown.
- Item type: Maison 500 16px/20px white, padding 13px 20px. The current page's item shows in a lighter tone (About on
  /about-us/, Contact Us with an underline bar on /contact-us/: screenshot evidence, the colour of the current item was
  not read).
- Dropdown: white panel (`ul.sub-menu`, width 156px, no shadow, radius 0), items Maison 400 16px/20px `#306180`; the
  current page's sub-item has `#d3ebfd` behind it.
- Tablet 768 and mobile 390: wordmark + hamburger (three white bars); the menu items are not shown.
- No CTA button in the header; no top bar.

### Footer (all routes)
- Background `#003049`, desktop height 603.77px, padding 28.8px 0.
- Desktop: a brand column (white SB monogram, `STAY CONNECTED` Raleway 600 20px/26px letter-spacing 4px, four round
  social icons — white 1px border, radius 50%, fill `#306180` — then Contact Us / WhatsApp / Email / Visit Us) separated
  by a thin vertical rule from four link columns: GET STARTED, FABRICS, OUR BRANDS, MORE INFORMATION (titles Raleway
  600 18px/23.4px, letter-spacing 0.3px, white; links Maison 400 16px/24px white, ~36px apart).
- Below, centred legal lines: "We manufacture swimwear for brands only…", the address, a bold underlined maps/phone
  line, the since-1993 line and the © line (Maison 400 14px/21px white).
- Mobile 390: everything centred; the four column titles become a toggle list (`a.elementor-toggle-title`, letter-spaced
  uppercase with a ▸ chevron at the right), folded by default; a horizontal rule above and below the list.
- Tablet 768: STAY CONNECTED + links left, social icons as white filled circles to the right, then the same toggle
  list as phones.

## Home `/` (18 sections, page height 11331px at 1440)

1. **Hero** — full-bleed photo (`swimwearbali_desktop_frontpage-scaled.webp` as section background, an mp4 also loads;
   the section's own colour `#5a5959`). The photo's left third carries a baked-in dark gradient. Content left-aligned at
   x≈101: eyebrow h1 (Maison Neue 600 14px uppercase, 0.9px tracking, white), headline h2 Maison Neue 800 88px/96.8px in
   `#8fd6e1` (38px/45.6px on phones), lead Maison 700 26px/44.2px white, two pill buttons (aqua `#8fd6e1` text `#1f5a7a`;
   cream `#f6f3ec` text `#111111`; Maison Neue 700 14px uppercase, height 48px, padding 0 36px, radius 999px), a small
   trust line at the bottom. Phones swap to a portrait photo (`mobilebannerswimwear.webp`). [hero:media-overlay]
2. **Intro split** on `#f4eee6`, padding 57.6px: left eyebrow (`#1670a8`, Maison 600 14px, 1.4px tracking, uppercase),
   h2 52px, paragraph 17px/25.5px, a small bold 12px note; right an embedded video (black box). [splitMedia:single]
3. **Digital patterns** — eyebrow + h2 + text left, video right; under the text a sampling-studio card (`#f4eee6`,
   radius 8px) with an h3 (Maison 700 26px) and a five-figure row (`section.kt-num`, values 37.33px, background
   `#f5eee7`). [splitMedia + stats:row]
4. **Fabric stocks** on `#dceaf5`: text column with a navy licence box (`#0b2a4a`, radius 8px, white text) and two pill
   buttons (black-outlined; navy-outlined); right column a tab set (pill tabs, 1px `#111111` border, active tab filled
   `#111111`) showing colour-swatch cards. [splitMedia:panel; the swatch cards are left out of the media pools]
5. **Logo marquee** on white: "A FEW BRANDS WE PRODUCE" label left, client logos moving in one row (track 5600px wide,
   `animation: 42s linear infinite marquee-scroll`). [owner:logos]
6. **Heading + lead** — eyebrow "HOW TO WORK WITH US", h2 60px left, a paragraph on the right. [intro/proof]
7. **Three outlined cards** — 1px solid black, radius 6px, padding 32.66px, 13.98px margin each (≈28px gutter),
   card title Maison 700 22px/33px, text below. [featureGrid:outlined / featureGrid:cards]
8. **CTA button + photo row** — a black pill button ("READ HOW TO GET STARTED", Maison Neue 700 15px uppercase, padding
   0 52px, height 46px), then six photos side by side in one row (`div.swb-gallery`, slots on `#ece9e3`, radius 2px,
   cursor zoom-in, opens a lightbox). [gallery:grid]
9. **MOQs** on `#0b2a4a`, padding 86.39px top: h2 60px white, text, and two rounded cards (radius 20px) with big numbers
   (40px) and small captions. [stats:tiles / splitMedia:panel]
10. **Timeline row** on `#0b2a4a`: four columns, values Maison 700 30px ("2-3 days", "1-3 weeks", …) over uppercase
   labels; a pill button. [process:timeline / stats:row]
11. **Pricing** on `#f4eee6`: h2 60px `#0b2a4a` + second line in `#6e8296` ("Lower as you grow."); a white price card
   (radius 6px 0 0 6px) with a photo; a navy panel "Every price includes" with a check list; small print list; then
   four example-price cards (photo + steel `#1e4670` / light `#dceaf5` / aqua bodies, radius 4px, prices Maison 50px).
   [splitMedia:panel + gallery:product-cards]
12. **Digital prints** on `#0b2a4a`: h2 white, body 16px/26px white, aqua button (radius 24px). [band:left]
13. **Branding** — two columns, the text (eyebrow, h2 60px, paragraph, h4 24px, black-outlined button) in the right
   one; the left column shows no image in the 1440 capture and no photo of it was captured (notes.md). [splitMedia:single]
14. **Sustainability band** — full-width background photo (turtle in a fishing net), white h2 60px, a five-item icon row
   (white tiles, radius 8px). [band:left + iconList:icons]
15. **Heading + paragraph** "Your Collection, Kept On Track". [intro/proof]
16. **FAQ** on `#f4eee6`: eyebrow, h2 52px, then two columns of `<details>` questions (summary Maison Neue 700
   15px/21px `#0b2a4a`, padding 20px 0, flex space-between with a marker at the right, hairline separators). All
   closed in the capture; an answer ends with an arrow link ("Start your swimwear brand →"). [faq:two-column]
17. **Closing CTA band** — full-width background photo (`contactfrontpagedesktop-scaled.webp`; phones
   `contactfrontpagemobile.webp`), white eyebrow, h2 Maison 700 60px/84px, a short paragraph and four white-outlined
   pill buttons (BOOK A CALL BACK, WHATSAPP, VISIT US, EMAIL US). [cta:image-band]
18. **Testimonials** on `#d6e2de`: centred h2 60px ("What Independent Labels Say"), a small underlined link, then a
   slider of quote cards (slides 403.33px wide, 20px apart, three in view, eight slides). [owner:testimonials]

## About `/about-us/` (2 sections)
1. **Photo hero** — full-width sewing-floor photo (`banner-about-us-scaled.webp`, 2560×933; phones
   `banner-about-us-mobile.webp`), centred H1 Maison 700 45px white on it. [hero:media-overlay]
2. **Text** — three paragraphs (Maison Book 17px/25.5px), one inline link `#08a4ec` underlined. [intro/proof]

## Contact `/contact-us/` (4 sections)
1. **Plain title** — centred H1 Maison 700 44px black, a centred lead below. [hero:plain]
2. **Photo + form** — two columns under their own h2s ("Have Questions?" / "Email Us"): left a photo with rounded
   corners, right a form (name + email side by side, message textarea, full-width dark submit `#262626`, white
   Montserrat 15px). Inputs: 1px solid black, radius 0, padding 6px 10px. [form:media]
3. **Channel cards** — four cards in a row (two by two on phones): 1px solid `#979797`, radius 10px, padding 14.69px,
   icon on top, a black pill label button, centred text. [contactChannels:cards]
4. Footer.

## Product / manufacturer `/swimwear-manufacturer/` (13 sections)
1. **Photo banner** — full-width photo (2560×933), no text on it; phones a portrait photo. [hero:media-banner]
2. **Title + text** — centred H1 Maison Neue 700 32px, text in a 950px column (Maison Book 16px/24px), two black
   buttons (radius 8px, padding 12px 24px, Maison Book 16px). [intro/proof + cta:inline]
3. **Centred heading + text** ("Built for Swimwear", Maison Neue 500 32px, italic subline). [intro/proof]
4. **Split: text + diagram** (handover form diagram, left out of the pools). [splitMedia:single]
5. **Split: video + text** (YouTube embed black box left). [splitMedia:single]
6. **Fabric chart image + text** (chart with text, left out of the pools). [figure]
7. **Text with link** — digital print. [intro/proof]
8. **MOQ text + line-drawing figure** (left out of the pools). [figure]
9. **Sampling split** — text column on `#ffe5df` left, process photo right, full-bleed. [splitMedia:tinted]
10. **Branding** text. [intro/proof]
11. **Trusted by brands** text + two black buttons. [intro/proof]
12. **Send your designs** heading, italic subline, text, two black buttons. [cta:inline]
13. Footer.

## Solution `/start-your-swimwear-brand/` (10 sections)
1. **Hero** — full-width photo with baked-in left gradient (`Hero-Banner11-scaled.webp`), eyebrow h1 "GETTING
   STARTED" (Maison 500 14px, 1.4px tracking), large white headline, two pill buttons (navy; white-outlined). Phones:
   portrait photo (`Hero-Banner12.webp`). [hero:media-overlay]
2. **Two panels** — a white bordered panel and a navy panel side by side on `#f4eee6`. [splitMedia:panel]
3. **Three numbered steps** — left heading + text + navy note box, right three steps numbered 01-03 (blue numerals)
   with pill buttons. [process:list / featureGrid:numbered]
4. **Photo strip** — three cropped photos in one full-width strip. [gallery:band]
5. **Six steps** on navy — six columns with number, title, text over a hairline. [process:timeline]
6. **Example handover** — a diagram image (left out of the pools) and two text columns. [figure]
7. **Selecting colours** on navy — two cards (beige; aqua), a fabric swatch pack bar. [featureGrid:boxed]
8. **Sustainable** split text. [splitMedia:single]
9. **FAQ** — centred h2, white bordered accordion rows with a ▸ marker, first open. [faq:accordion]
10. **Contact** — a beige panel with heading, text and four channel rows (navy first row, white others, arrow at the
    right). [contactChannels:list]

## Recurring treatments
- Buttons: pill (radius 999px) uppercase Maison Neue 700 14-15px on home; black 8px-radius title-case buttons on the
  manufacturer page; 24px-radius buttons in the home navy/photo bands.
- Eyebrows above headings: uppercase, 14px, 0.9-1.4px tracking, `#1670a8` on light surfaces, white on photos.
- Headings left-aligned on home and solution; centred on manufacturer, about, contact and the home testimonials.
- Cards: outlined 1px (black on home, `#979797` on contact), radius 6-10px, no shadow.
- Section rhythm: full-width colour bands alternate white / beige `#f4eee6` / navy `#0b2a4a` / blue `#dceaf5` /
  mint `#d6e2de`.
