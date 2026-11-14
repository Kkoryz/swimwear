# Gallery

## Observed
- **Home photo row** (section 8, `div.swb-gallery`): six photos in one row across the full container at 1440, each in a
  slot on `#ece9e3` with radius 2px; mixed portrait (411×635, 446×635, 389×635) and landscape (798×635) files shown at a
  common height; `cursor: zoom-in`; click opens a lightbox (prev / next / close / counter: behaviors.md). At 768 and 390
  the row wraps into two columns (screenshots).
- **Solution photo strip**: one full-width image made of three close-cropped bikini photos side by side
  (`Frame-12726313792-1536x688.webp`), no gaps between the three panels, no radius.
- **Logo marquee** (home section 5): client logos in one moving row (owner:logos, not photos).

## Template mapping
- `gallery: "grid"` (home row) with `--radius-media: 2px`; `gallery: "band"` for the solution strip.
- Photos: `media.json` pools.lifestyle (the six home photos) and pools.product (the strip).
- Lightbox is a client-state behaviour: reproduce only if the template has the island.

## Not observed
Lightbox styling (not opened in the capture).
