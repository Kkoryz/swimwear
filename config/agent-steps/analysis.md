You are doing the reference analysis of this site's template (site:run step "analysis"), in this folder. Read AGENTS.md and `.claude/skills/seo-site-template/SKILL.md` (Stage 08, steps 3 and 4) first; they are the rules.

The competitor's pages are captured under `docs/research/reference-pages/<page type>/` (`raw/` holds the DOM, computed styles, fonts and assets of each viewport; `design-references/` the full-page shots at 1440, 768 and 390, attached to this message) and `docs/research/raw/` (font-lock.json, the site-wide capture). `site.json` names the competitor and its pages.

Write into `docs/research/analysis/`:
- `design-lock.json` (schema `seo-site-design-lock-v1`): the observed surface and text roles with their exact values and evidence (route, selector, observed value), the token mapping, and route invariants. Only observed computed values, never a taste judgment.
- `font-roles.json`: each type role (display, heading, body, UI) with the observed family, weights, sizes and line heights per viewport.
- `media.json` (schema `seo-site-media-v1`): the logo, hero photos and the product / process / material / lifestyle pools from the captured assets, each with its local path, size and a factual subject. Pools hold photographs only: a diagram, line drawing, colour or fabric swatch card, chart, screenshot, form or any image carrying text is not a product, material or process photo (our pages would show it out of context); leave it out and list it in `notes.md`. A hero photo whose baked-in gradient or empty space was made for a headline says so in its subject.
- `components.md` and `behaviors.md`: the competitor's module designs and observed interactions (menus, sticky header, accordions...).
- One `docs/research/components/<Unit>.spec.md` per visual unit the template renders (header, footer, hero, text, split media, grids, gallery, FAQ, CTA).

The exact fields are the ones `scripts/apply-reference-analysis.mjs` and `scripts/validate-template.mjs` read: read both before writing. A commercial or unknown-licence font is replaced by a similar open font (`substituteFor` in font-lock.json).

Rules: never invent a value you did not observe; if evidence is missing, say so in `docs/research/analysis/notes.md` and leave the field out rather than guess. Write only the files listed above: the section modules, the treatment (`src/styles/reference.css`, `src/data/template-variants.json`) and everything else are later steps', and site:run puts back any other file you change. Do not run `scripts/apply-reference-analysis.mjs` (the next step does); check instead that each JSON file parses and has the fields that script reads. Finish with one short paragraph: what you wrote and anything you could not observe.
