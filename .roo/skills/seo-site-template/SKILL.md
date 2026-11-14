---
name: seo-site-template
description: "Turn one reference website into a reusable Astro template"
---

# SEO Site Template

Build an Astro template from one public HTTP(S) reference origin, then fill it with our own pages. Design and template follow the reference: its module designs, and each page type's section order and modules (a blueprint per competitor, `competitorBlueprints`). Never its content, copy, photos or fonts for publication. Our content purposes fill its sections; Site Factory 06 plans the pages on that blueprint and 07 writes the copy.

## How a site is run

Every site is built and rebuilt with `pnpm site:run` (scripts/site-run.mjs), never with hand-typed script arguments. Its inputs are fixed in the site's `site.json`: the reference pages, the Site Factory snapshot folder, the identity folder, the product line, the preview port and `images` (`"reference"`, the default: no photos are made, the pages show the reference's photos as development placeholders, which a release build removes; `"generate"`: the site's own library is made, at most 12 photos a run). A service business adds `"trade": "service"` (with `siteKind` and, optionally, `imageSubjects` by photo class): its photos become scenes of its own work, each page section's planned from that page's copy (the `photo-briefs` step), and its stand-in proof and placeholder purposes use the trade's words (`config/*.service.json`); without `trade` a site is built as a clothing manufacturer's. The run keeps the site's own local git repository (never pushed; a commit after every step that changed files, so a bad step is undone with git), skips steps whose inputs did not change, waits (exit 2) at the steps a person or an agent does, checks the copy (`docs/research/content-issues.md`, the list that goes back to Site Factory 07) and ends with the launch preflight, whose `docs/research/launch-checklist.md` groups every hold by who clears it: the owner, Site Factory or this pipeline. `--from <step>` reruns from a step; `--list` names the steps.

## Stage 08: template from the reference's module design

1. `node scripts/create-workspace.mjs <url> <destination>`.
2. `pnpm capture:reference <url>`, then `pnpm capture:reference-pages -- <origin> home=/ manufacturer=/… about=/… contact=/…` (one reference page per page type). Captured files are evidence under `docs/research/`, never under `public/`. A failed asset stops the step.
3. Analyse the captures into `docs/research/analysis/`. Read every section crop (`docs/research/pattern-sections/<pageType>/`) and name the template module that renders it in `section-modules.json` (`[{ pageType, index, module, why }]`, module from `SECTION_MODULES` in `scripts/lib/authoring-contract.mjs`; logos and testimonials as `owner:*`, decoration as `skip`): the capture's pattern is coarse, the named module is what the blueprint follows. A competitor module the vocabulary lacks is a template gap: add it to the library before building the site. Then write design-lock.json, font-roles.json, components.md, media.json (product/process/material/lifestyle pools) and behaviors.md, and one spec per visual unit in `docs/research/components/<unit>.spec.md` (validate:template requires them); the fields are the ones `scripts/apply-reference-analysis.mjs` and `scripts/validate-template.mjs` read. `pnpm apply:reference-analysis` writes the design-lock tokens into `global.css` and installs the reference photos as **development placeholders** in `public/media/reference/` (a release build removes them).
4. Fonts follow the reference. A commercial or unknown-licence face is replaced by a similar open font (`substituteFor` in font-lock.json); `validate:template` rejects other faces. Write `src/styles/reference.css` for the reference's component treatment, through the tokens and hooks in `docs/research/CSS_HOOKS.md`.
5. `pnpm scaffold:placeholder-pages -- --pages-plan <pages.json> [--blueprints <slot-manifest.json>] home=<ref url> about=<ref url> contact=<ref url> product_manufacturer=<ref url> …`. Each reference section is named as a pattern and mapped to the module library; Without `--blueprints`, each page type's blueprint follows the competitor page: its section order and modules, our content purposes (`config/page-blueprints.default.json`) in them, logos and testimonials as optional owner slots, the closing CTA last. `docs/research/blueprint-choices.json` (enabled: false by default) lets a person leave competitor sections out. Pages Site Factory has not authored (home, about, contact, hubs; never held pages) are built from the blueprints with marked placeholder copy (noindex). `docs/research/slot-manifest.json` goes to Site Factory 06/07: each page type's slots, order, modules and sizes (`docs/research/SLOT_MANIFEST.md`). `pnpm blueprint:competitor` rebuilds them from the existing inventory without capturing again.
6. Modules follow the reference faithfully (same fonts, palette, geometry, card treatment). No deliberate differences unless the owner asks. The site uses a shared Header, shared Footer and shared design tokens; every page type renders through `src/pages/[...slug].astro`. Static sections use `.astro`; add an island only for observed runtime behavior that needs client state.
7. `pnpm measure:reference-density -- <reference content page urls>`; the authoring audit fails pages denser in text, poorer or richer in images, or with longer text-only runs than the reference. Fix density with media slots and layout, never by editing copy.

## Stage 09: assembly and images

1. `pnpm import:brand-kit -- --project <site-factory projects/<line>>` (stage 00 brand: logo, favicons, manifest, share image, site name, domain).
2. Proof: `node scripts/scaffold-site-proof.mjs --facts <facts.yaml> --package <authoring_package.json> --pages-plan <pages.json>` writes stand-in `src/data/site-proof.json` (certificates, founding year and order terms from the facts; invented clients, people and cases from `config/demo-proof.json`) when the site has none, then `pnpm proof:signoff` lists it in the release sign-off. Owner slots (factory figures, certificates, client names, cases, testimonials with a portrait, history, order terms) render it; the owner replaces the values before launch.
3. `pnpm import:site-factory -- --package <authoring_package.json> --pages-plan <pages.json> --facts <facts.yaml> [--blueprints <slot-manifest.json>]`. Copy is copied verbatim; every section is placed exactly once; held pages are skipped with their reasons; every cited fact must be approved for public use; site-plan slots (child-page cards) and site slots (the enquiry form from `config/lead-form.json`) are filled here.
4. Images: `pnpm plan:images -- --line "<product>"` (later runs keep the plan's line; a different one needs `--change-line`, since it replans every general photo) → `pnpm analyze:image-style` → `pnpm generate:images` (Codex, style references only; near-copies, mirrored copies and near-duplicates are rejected; results outside the reference style range are marked `style-drift`) → review → `pnpm approve:images -- --reviewer "<name>" --ids …` → `pnpm apply:image-library`. Factory, staff and process photos are never generated (`placeholderKinds`): they stay image slots until real photos are supplied. Show the owner samples before generating a whole library.

## Stage 10: technical SEO, GEO and AEO

Serialised by `scripts/lib/seo-head.mjs` (validates, never re-plans content): absolute canonicals on the https bare domain, noindex on placeholder pages, sitemap of indexable pages, robots.txt, Open Graph, WebSite/Organization from the site identity, one breadcrumb trail for the page and its BreadcrumbList, escaped JSON-LD. `pnpm audit:seo` (part of `pnpm check`) checks the build; `pnpm build:nginx-config` writes the Nginx config.

## Stage 11: launch preflight

`pnpm build:release` (removes competitor placeholders; fails if a page still uses one), then `pnpm preflight`. It answers `ready_for_deployment` or `blocked`, never "launched"; Site Factory holds come first unchanged. It blocks on placeholder pages, competitor photos, image slots, unapproved AI images, an unconnected form or missing privacy page, missing analytics, a working-title identity, SEO audit failures, broken links and an over-budget LCP image.

## Content-adaptive layout

- Every repeatable block has an explicit cardinality policy; equal-card grids stay equal unless the content declares a span. Never inherit `:last-child`, `nth-child` or fixed-source-count spanning.
- Compact, standard or long-form variants come from the content's length bands.
- Adjacent sections share one boundary rhythm (`--authoring-max-boundary-gap`).
- Editorial media fill a declared media box with an intentional crop.
- Pages and blocks carry `data-authoring-page`, `data-authoring-block`, `data-layout` and `data-explicit-span` for the audits.
- Before accepting an integration, run short and long content canaries plus one representative product page through the same assembler; a successful build alone is not evidence that variable content composes.

## Evidence and gates

- Capture 1440, 768 and 390 full-page references; inspect DOM and computed styles without silent truncation.
- Never fabricate content, values, logos, numbers, testimonials, behaviour or validation results.
- `design-lock.json` (schema `seo-site-design-lock-v1`) records observed surface roles and their tokens; `validate:template` requires the tokens to match.

## Verification

```powershell
pnpm check
pnpm audit:navigation-shell <preview-url> --capture-all
node scripts/audit-authoring-layout.mjs <preview-url>
```

A run is complete only when these pass. Before launch: `pnpm build:release` and `pnpm preflight`.

## Completion

Record mode, routes and representatives in `site-template.json`. Report the output path, reference origin, built route and page-type counts, placeholder pages, font-lock status, image library state (generated / approved / slots), verification results and preflight holds. This is not the production zero-drift acceptance workflow.
