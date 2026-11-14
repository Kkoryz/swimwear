# Footer

Shared site footer (all routes). Reference: `footer#colophon`.

## Observed
- Background `#003049` (`footer#colophon > div > div > section:nth-of-type(1)`, home line 348517), padding 28.8px 0;
  desktop height 603.77px.
- Desktop 1440: brand column at left (white SB monogram 80×73, `STAY CONNECTED` Raleway 600 20px/26px, letter-spacing
  4px, white; four round social icons 1px white border, radius 50%, `#306180` fill; links Contact Us, WhatsApp, Email,
  Visit Us), a thin vertical rule, then four link columns: GET STARTED (5 links), FABRICS (3), OUR BRANDS (2), MORE
  INFORMATION (6). Column titles Raleway 600 18px/23.4px, 0.3px tracking, white, uppercase text; links Maison 400
  16px/24px white.
- Legal block centred under the columns: brand-only statement, address, underlined bold map/phone line, since-1993
  line, © line (Maison 400 14px/21px white).
- Tablet 768: STAY CONNECTED + four links left, social icons as white discs to the right; then the four column titles as
  a toggle list with ▸ chevrons; legal lines left-aligned.
- Mobile 390: centred monogram, STAY CONNECTED, links, social discs; a hairline; the toggle list (GET STARTED, FABRICS,
  OUR BRANDS, MORE INFO) folded; legal lines centred.

## Template mapping
- `--surface-footer: #003049`; text `--text-inverse: #ffffff`.
- template-variants `footer`: `{ layout: "columns", phoneGroups: "collapsed" }`.
- Column titles' face is Raleway (open); links and legal text Maison (→ DM Sans).

## Not observed
Link hover colour; toggle open state.
