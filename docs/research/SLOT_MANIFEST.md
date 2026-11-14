# Slot manifest (stage 08 → Site Factory 06/07)

Stage 08 turns a competitor into a **module library** (how a card grid, a figure bar, a text/photo row, an FAQ or a closing band looks). The **page structure is ours** and does not depend on any competitor: the page blueprint defines, per page type, which slots a page has, in which order, who fills each slot and how much content it takes.

- **Owner of the blueprint: Site Factory 06.** It plans every page slot by slot (`project.yaml` → `slot_manifest`), so 07 can write before any template exists.
- **Stage 08 reads it** with `--blueprints <slot-manifest.json>` (importer and scaffold). Until Site Factory publishes one, `scripts/lib/page-blueprints.mjs` holds the same default blueprint.
- Each template workspace writes `docs/research/slot-manifest.json` (schema `seo-site-slot-manifest-v1`): the blueprint plus `module`, the design this template renders each slot with. `module` is for stage 08/09 only; 06/07 ignore it.

## Stages

| Stage | Owns |
|---|---|
| 05/06 | Site plan: pages, parents, navigation, link targets, anchors; the page blueprint (slots per page type) |
| 07 | Copy per slot (`sections[].slot`), `structured` data, claims checked against facts |
| 08 | Module library copied from the competitor's design (one module per slot type), locked tokens and open-licence fonts |
| 09 | Assembly: 07 copy into slots, site-plan slots (child-page cards), images (plan → real photo or generated → approved) |
| 10 | Technical SEO/GEO/AEO: JSON-LD, canonical, sitemap, breadcrumbs, link validation (no re-planning) |
| 11 | Launch preflight: holds, reference assets, placeholders, forms, noindex |
| 12 | After launch: indexing, query-to-page overlap at weeks 4 and 12, conversions |

## Slot fields

| Field | Meaning |
|---|---|
| `id` | Slot id; 07 writes it on each section as `slot` |
| `block` | Authoring block the slot renders as (`intro`, `splitMedia`, `featureGrid`, `proof`, `faq`, `gallery`, `stats`, `process`, `table`, `cta`, `form`) |
| `fill` | `copy` (07 writes it), `plan` (09 builds it from pages.json: child pages' labels and links, no new copy), `structured` (07 `structured` field), `site` (09 builds it from site-level inputs such as the form contract) |
| `purpose` | What the slot is for |
| `words` | `heading` and `body` word ranges for one section |
| `items` / `itemWords` | Item count range and per-item word ranges (cards: `title`, `text`; FAQ: `question`, `answer`) |
| `repeat` | How many consecutive sections the slot takes (text/photo rows) |
| `media` | Image kind and count the slot shows (supplied in stage 09) |
| `module` | This template's module for the slot, e.g. `featureGrid:outlined`, `splitMedia:single > wide` |

## How 07 fills copy slots

- One section per text slot (`intro`, `proof`, `splitMedia`; `repeat` sections for rows): `{ section_id, slot, heading, body }`.
- Card slots (`featureGrid`): one section per card with the same `slot`; 2–4 cards per grid, consecutive.
- FAQ slot: one section, body as question/answer pairs (question line ending with `?`, answer lines, blank line between pairs).
- CTA slot: one section; its heading and body become the closing band's title and text. The button and related links still come from `page.cta` and `page.links`.
- Contact `form` slot (`fill: "site"`): built by stage 09 from the form contract, not by 07. A `site` slot never takes a 07 section.
- `plan` slots link every child page: up to the slot's maximum as cards, the rest as plain links, so a hub links all its children.
- `structured` slots keep using `structured.key_figures`, `structured.process_steps`, `structured.comparison`.
- `plan` slots need nothing from 07.
- A section without `slot` is still accepted and mapped by content shape, so older packages keep working.

## Current blueprints

| Page type | Slots in order |
|---|---|
| home | intro (+4 product photos) · categories (plan) · key figures · capabilities (cards) · story (row) · process · solutions (plan) · quality (row) · faq · cta |
| about | story (1–2 rows) · key figures · values (cards) · process · faq · cta |
| contact | channels (cards) · form · faq |
| products / solutions / wholesale hub | intro · children (plan) · key figures · comparison · faq · cta |
| product_manufacturer | intro · key figures · details (2–5 rows) · options (cards) · comparison · terms · process · faq · cta |
| product_wholesale | intro · key figures · range (cards) · details (1–3 rows) · comparison · terms · process · faq · cta |
| solution | intro · key figures · scope (2–4 rows) · options (cards) · comparison · terms · process · faq · cta |
