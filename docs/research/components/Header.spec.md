# Header

Shared site header (all routes). Reference: swimwearbali.com, `header#masthead`.

## Observed
| | desktop-1440 | tablet-768 | mobile-390 |
|---|---|---|---|
| Position | fixed, top 0 (sticky on scroll) | fixed, top 0 | fixed, top 0 |
| Height | 79.16px | (screenshot ≈58px) | 70.17px |
| Background | inner bar `#306180` over shell `#003049` | `#306180` | `#306180` |
| Logo | white wordmark PNG (1536×112) left, ≈272px wide | wordmark left, smaller | wordmark left |
| Navigation | 7 items right-aligned, 6 with ▾ caret and dropdown | hamburger | hamburger (three white bars) right |

- Items: Maison 500 16px/20px, white, padding 13px 20px (`a#sm-…`, home line 43364). Font → DM Sans (notes.md).
- Dropdown: `ul.sub-menu`, white, width 156px, radius 0, no box-shadow; items Maison 400 16px/20px `#306180`; the
  current page's sub-item on `#d3ebfd`.
- Current top-level item: lighter text (About on /about-us/), underline bar on /contact-us/ (screenshots; values not
  read).
- No header CTA button, no top bar, no search, no language switch.

## Template mapping
- `--surface-header: #306180` (design-lock supplementaryRoles.headerSurface); `--logo-filter: none` (logo is already white).
- `--header-height: 79.1563px`; `--dropdown-bg: #ffffff`; `--shadow-dropdown: none` (observed `box-shadow: none`).
- template-variants `header`: `{ ctaRoute: null, dropdown: "list", carets: true, topBar: false }` (layout inline).
- Sticky: CSS only (behaviors.md).

## Not observed
Hover colours, open-dropdown state, mobile drawer layout.
