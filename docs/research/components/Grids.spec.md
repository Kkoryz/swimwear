# Grids (feature cards, figures, steps, channel cards)

## Observed
- **Outlined cards** (home section 7, three across at 1440, stacked at 390): 1px solid `#000000`, radius 6px, padding
  32.66px, margin 13.98px (≈28px between cards), no shadow, white background. Title Maison 700 22px/33px (24px/36px at
  390), text Maison 17px.
- **Figure tiles** (home section 9 on navy): two rounded tiles, radius 20px, a big number (Maison 40px), a small caption
  and a line of terms; a wide third tile ("Restock Fast, Keep Selling").
- **Timeline row** (home section 10 on navy): four columns, value Maison 700 30px white over an uppercase label.
- **Five-figure row** (home section 3, `section.kt-num`): values 37.33px.
- **Example price cards** (home section 11): four cards, photo on top, coloured body (`#1e4670`, `#dceaf5`, aqua
  `#8fd6e1`, `#0b2a4a`), radius 4px, price Maison 50px.
- **Numbered steps** (solution): 01-03 with large blue numerals and pill buttons; six steps 01-06 in columns on navy
  over a hairline.
- **Contact channel cards**: four across (two by two at 390), 1px solid `#979797`, radius 10px, padding 14.69px, icon
  on top, black pill label, centred text.
- **Icon row** (home section 14): five white tiles, radius 8px, icon + label, over the photo band.

## Template mapping
- `featureGrid: "outlined"`, `--radius-card: 6px`, `--border-color: #000000`, `--shadow-card: none`.
- `--channel-card-border: 1px solid #979797`, `--channel-card-radius: 10px`, `contactChannels: cards`.
- Equal cards stay equal (cardinality policy); the reference's wide third MOQ tile is a content span, not a nth-child rule.

## Not observed
Hover states of cards; a single grid gap value (see notes.md).
