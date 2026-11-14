# Authoring Integration

`seo-site-template` separates the visual system extracted from a reference site from the content supplied by Site Factory.

```text
reference URL ──capture/discover──▶ design-lock + font-lock + variants ─┐
                                                                         ├─▶ Astro build ─▶ audits
Site Factory 07 package ──import:site-factory──▶ authoring-pages.json ──┘
```

## Input

Store authored pages in `src/data/authoring-pages.json`. A page needs a stable `id`, route, metadata, and an ordered `blocks` array. Block data contains meaning and assets; it must not contain template-specific CSS instructions.

Pages that exist only to complete the site shell (home, about, contact before Site Factory authors them) go in `src/data/placeholder-pages.json` with `"status": "placeholder"`. The renderer marks them with a visible placeholder badge and `data-page-status="placeholder"`.

## Content contract (`seo-site-authoring-v1`)

`scripts/lib/authoring-contract.mjs` is the single validator used by the importer, the renderer (`src/lib/authoring.ts`) and `validate:template`. Unknown block types, missing fields and unsupported item counts fail the build.

```jsonc
{
  "id": "bra-manufacturer",
  "route": "/bra-manufacturer/",          // leading and trailing slash
  "pageType": "product_manufacturer",
  "status": "authored",                   // or "placeholder"
  "seo": { "title": "…", "description": "…", "canonical": "/bra-manufacturer/" },
  "jsonLd": [{ "@type": "BreadcrumbList", "…": "…" }],
  "hero": { "heading": "<the page H1>", "lead": ["optional"], "cta": { "label": "…", "href": "/contact/" } },
  "blocks": [ /* ordered */ ]
}
```

| Block | Required fields | Cardinality |
|---|---|---|
| `intro` | `heading`, `paragraphs[]` | – |
| `splitMedia` | `heading`, `paragraphs[]`, optional `media {src, alt}` | – |
| `featureGrid` | `items[] {heading, paragraphs[]}`, optional `span` | 2–4 items |
| `process` | `heading`, `steps[]` | 3–12 steps |
| `proof` | `heading`, `paragraphs[]` | – |
| `faq` | `heading`, `items[] {question, answer}` | 1–20 items |
| `cta` | `cta {label, href}`, `links[] {label, href}` | 0–24 links |

The hero is rendered from `page.hero` as the first `data-authoring-block`, so a page renders `blocks.length + 1` blocks. `canonical` is a route; it becomes absolute only when `site` is set in `astro.config.mjs` — the origin is never guessed.

## Site Factory importer

```bash
pnpm import:site-factory -- --package <authoring_package.json> --pages-plan <pages.json> [--only id,id]
```

It writes `src/data/authoring-pages.json`, `src/data/site-nav.json` (header and footer from `header_nav`/`footer_nav` of `pages.json`) and `docs/research/site-factory-import.json` (the block mapping per page, skipped pages, fields the template does not render).

Only `release_status: ready_for_template` pages are imported; `hold` pages are skipped and listed with their `hold_reasons`. Asking for a held page with `--only` fails.

Sections are mapped by **content shape**, never by industry vocabulary, and section order is kept:

| Shape | Block |
|---|---|
| first section | `intro` |
| ≥ 2 blank-line groups that each start with a line ending in `?` followed by an answer | `faq` (a group without a question or answer fails the import) |
| ≥ 3 lines that all start with `1.` / `1)` / `Step 1` | `process` |
| the non-FAQ section with the most numeric tokens (≥ 4) — quantities, days, prices, terms | `proof` |
| any other section with ≥ 120 words | `splitMedia` |
| consecutive other sections under 120 words | `featureGrid` of 2 or 3 equal cards (a run of 4 becomes 2 + 2; a lone one becomes `splitMedia`) |
| page `cta` plus `links` | final `cta` block with inline related links |

The importer copies text verbatim: it splits bodies on blank lines and FAQ groups on their first line, and never rewrites, shortens or adds copy. Links without a `cta` fail the import rather than being dropped. Editorial `notes` are reported as unplaced fields.

Structured fields (key figures, process steps, comparison table) come from Site Factory 07 as `sf/structured/v1` — see [SITE_FACTORY_STRUCTURED_DATA.md](SITE_FACTORY_STRUCTURED_DATA.md). Until 07 emits them, `--structured <overlay.json> --facts <facts.yaml>` supplies them; every key-figure value must be stated verbatim in the approved fact it cites.

## Rendering contract

1. Reuse the approved Header, Footer, fonts, colors, spacing scale, radii, and media treatment.
2. Map each authored block to a compatible Astro pattern by its content shape (`src/components/blocks/`).
3. Select compact, standard, or long density from actual copy and item counts (`density()` in `src/lib/authoring.ts`).
4. Preserve block order and meaning, but do not force the reference page's section count or page height.
5. Treat media as part of the composition. Set an explicit aspect ratio, crop policy, and focal position (`.media-box`).
6. Emit `data-authoring-page`, `data-authoring-block`, and `data-layout` on rendered boundaries.
7. Use `data-explicit-span` only when the authoring data intentionally requests a grid span.
8. Link only to built routes. `SmartLink` renders a planned-but-unbuilt route as text with `data-route-status="planned"`.

## Template treatments: `template-variants.json`

`src/data/template-variants.json` holds everything a reference run decides beyond the locked tokens:

- `axes` (optional): the template follows its reference by default. Only when the owner asks for a departure, record each changed composition axis (`gridGeometry`, `sectionGrouping`, `spacingRhythm`, `cardTreatment`, `ctaGrouping`, `decoration`) with a `source` description (what the reference does) and a `candidate` description (what this template does).
- `components`: the reference's treatment for each block, chosen from `TEMPLATE_VARIANTS` (`hero`: `plain` | `media-banner` | `media-overlay` | `media-split`; `intro`: `text` | `gallery`; `featureGrid`: `outlined` | `plain`; `splitMedia`: `alternate` | `media-start` | `media-end`; `proof`: `band` | `panel` | `panel-media` | `dark`; `faq`: `accordion` | `two-column` | `open-list`; `cta`: `band` | `inline` | `image-band` | `dark`).
- `components.media`: the hero image and the editorial pool used when a block carries no media, with an `origin` label (for example `reference-placeholder`). Reference photographs are placeholders only and must be replaced before publishing.

Locked invariants — font roles, surface palette, photography class, Header/Footer behaviour — stay in `design-lock.json`, `font-lock.json` and `global.css` tokens and are not variants.

### Media slots and reading flow

Site Factory copy is usually longer than the reference's body text and carries no media, so the template supplies both rhythm and pictures:

- Every block type has media slots chosen by variant: `intro: "gallery"` (a row of 4 product photos), `featureGridMedia: true` (a photo on each card), `splitMedia` (one process photo), `proof: "panel-media"` (a material photo), `cta: "image-band"` (a lifestyle photo band).
- `components.media.pools` groups photos by the reference's photography classes (`product`, `process`, `material`, `lifestyle`); `routePools` narrows a class for one route (for example bra photos on bra pages). `mediaAllocator` never repeats a photo within a page.
- `TextFlow` renders each body as a lead sentence plus short runs of whole sentences. It regroups verbatim sentences only; the audit compares copy with whitespace ignored.

## Reference run, end to end

```bash
node scripts/create-workspace.mjs <reference url> <workspace>
pnpm capture:reference -- <reference url>
pnpm capture:reference-pages -- <origin> home=/ manufacturer=/… wholesale=/… about=/… contact=/…
pnpm measure:reference-density -- <reference content page urls>
# analysis → docs/research/analysis/{design-lock,font-roles,media}.json, components.md, behaviors.md
pnpm apply:reference-analysis            # tokens → global.css, media pools → public/media/reference + variants
pnpm import:site-factory -- --package … --pages-plan … [--only …]
pnpm scaffold:placeholder-pages -- --pages-plan … home=<url> about=<url> contact=<url>
# judgement: src/styles/reference.css (the reference's treatments), template-variants.json variants
pnpm check && pnpm audit:navigation-shell -- <preview> --capture-all && pnpm audit:authoring-layout -- <preview>
```

Capture, density and pattern measurement first make the reference render what a visitor sees after scrolling (`scripts/lib/reveal.mjs`): `content-visibility: auto` sections are forced visible, lazy images in `data-lazy-src`/`data-src` load their real source, and one mouse move runs scripts that optimisers delay until the first interaction (carousels). Measurements wait for scroll handlers after returning to the top, so a header that turns fixed on scroll is measured in its top-of-page state.

`scaffold:placeholder-pages` measures each reference page's full-width sections (images, words, headings, forms, accordions, tables) and maps them by shape to `intro`/`proof`, `splitMedia`, `gallery`, `featureGrid`, `faq` and `cta`, in reference order, and sets `heroByPageType` from the reference hero (full-cover photo with text → `media-overlay`, painted band beside text → `media-split`, photo without text → `media-banner`, text only → `plain`). Logo strips and short figure rows are skipped because placeholder copy cannot stand in for third-party logos or numbers. Full-width text-over-photo bands currently map to `splitMedia`; there is no band block yet.

## Template core and workspaces

A workspace owns only its data (`src/data`, `docs/research`, `public`), its tokens (`src/styles/global.css`) and its treatments (`src/styles/reference.css`). Everything else is the template core (`scripts`, `config`, `src/components`, `src/lib`, `src/layouts`, `src/pages`, `src/styles/{template,patterns}.css`).

- `pnpm sync:template-core -- <workspace> ...` copies the core into a workspace and writes `template-core.json` (repository commit and a hash per core file). `create-workspace` writes it too.
- `validate:template` fails when a workspace's core file is changed, missing or unrecorded, so hand edits and stale copies surface instead of drifting.
- `reference.css` restyles shared components through the custom properties listed in `docs/research/CSS_HOOKS.md` (`pnpm list:css-hooks` regenerates it) and through the documented `data-variant`/`data-pattern` attributes, not through component-internal class nesting.
- Template-wide treatments in `template-variants.json` (`hero`, `intro`, `featureGrid`, `splitMedia`, `proof`, `faq`, `cta`, `heroByPageType`) must be one of the values in `TEMPLATE_VARIANTS` (`scripts/lib/authoring-contract.mjs`); `validate:template` rejects others.
- Page-builder markers (e.g. Elementor header/footer classes) live only in `scripts/lib/page-shell.mjs`; every capture and measurement scrolls with `scrollThroughPage` (`scripts/lib/reveal.mjs`).

## Site identity and images (stage 09)

- `pnpm import:brand-kit -- --project <site-factory projects/<line>>` brings stage 00's brand (logo, favicons, web manifest, share image) to the site root and writes `src/data/site-identity.json`; `pnpm build:brand-kit` is the fallback. The identity's origin sets Astro `site`, so canonicals are absolute.
- `pnpm plan:images -- --line "<product>"` plans the photo library: one set per product category (shared by its manufacturer and wholesale pages) and one site-wide set, sized from what the pages place (`scripts/lib/media-slots.mjs`, shared with the renderer) and capped per class (`config/image-briefs.json`). The reference template's analysed photos are attached as **style references only**: each entry gets the least-used photos of its class (those showing its product among equals), and the first one is the kind of scene it follows. Briefs say what a photo shows, never its setting or look. Classes in `placeholderKinds` (default `process`: the manufacturer's own factory, staff and process must be real photos) are not generated and stay image slots.
- `pnpm analyze:image-style` writes `docs/research/image-style.json`: per class (and site-wide for classes without their own photos) a written style profile from Codex looking at the reference photos (settings, background, colour, lighting, casting, pose, framing, what to avoid) and the measured colourfulness/brightness/contrast range of those photos. A class keeps its profile while its photos are unchanged.
- `pnpm generate:images` runs Codex's built-in image tool (`reference-style-imagegen` skill) once per image with the class's style profile in the prompt; it refuses to run without `image-style.json`. Each result is rejected (and retried on the next run) when its difference hash is within 10 bits of a reference photo or within 14 bits of another library photo; a result outside its class's measured range is marked `review: style-drift`. Accepted results are saved as a master (`docs/research/images/masters`) and as responsive WebP (`public/media/generated`) without metadata; that they are AI-generated (IPTC digital source type `trainedAlgorithmicMedia`) is recorded in the image register. `docs/research/image-plan.json` is the register: prompt, hashes, alt (English, at most 125 characters), similarity, style check, review state. Re-planning removes the web files of entries it no longer keeps.
- Variety: every photo gets its own garment colour and model (`garmentColours`, `casting` in `config/image-briefs.json`), photos staged in the same reference scene must differ, and no generated photo is staged in a factory. When the image model refuses a garment worn by a person (underwear), it retries with other wordings still on a model (retail catalogue, then an everyday layered outfit, without reference photos), then falls back to a varied flat lay. `pnpm check:image-diversity` embeds every photo with DINOv2 (small, quantised, CPU; cached in `~/.cache/seo-site-template/models`), sends look-alikes (cosine ≥ 0.80: what a photo shows, not its pixels) back with the next attributes and compares the library's Vendi Score per photo with the reference site's own photo library: a library less diverse than 0.9 × the reference is reported with its most redundant photos for the owner to judge from the contact sheet (a stage 11 notice, never a hold). `pnpm review:image-library` then has Codex review the whole set on one numbered contact sheet and sends look-alikes, repeated people, wrong colours and factory scenes back to generation.
- `pnpm approve:images -- --reviewer "<name>" --ids …` records a person's review in the register (reviewer, date, rights `owned`); an image needs alt text to be approved, and `--reject "<reason>"` sends it back to generation. Only approved images may ship (stage 11).
- `pnpm apply:image-library` replaces the reference-placeholder photos with the library (site-wide pools, per-route pools, a hero per route). Category cards linking to a product page show that page's photo. Placeholder classes always render as image slots, never as another class's photo.
- `pnpm import:site-media -- --project <site-factory projects/<line>>` brings the site's own photos (`media/media.json`, schema `sf/media/v1`: factory and team) into `public/media/site/` and `src/data/site-media.json`. They fill the placeholder classes (factory and team → `process`); product, hero, fabric and in-use photos come before the library's. Nothing on the site says how a photo was made (owner, 2026-10-24): the pre-launch handoff (`pnpm handoff [--real <owner photo file list>]`, `docs/research/handoff.json`) is the only record; it marks the factory, staff and client photos to replace with real ones, which the owner does before launch.
- Reference files: captured evidence stays under `docs/research/` (`reference-assets`, `navigation-assets`); reference photos used as development placeholders live in `public/media/reference/`, which `pnpm build:release` removes (the build fails if a page still uses one).

## Enquiry form (stage 09)

A blueprint slot with `fill: "site"` and `block: "form"` gets the form from `config/lead-form.json` (fields with names and autocomplete, consent linked to the privacy page, a honeypot field, `POST /api/leads` on the same origin). While its `status` is `not-connected` the form is disabled and has no action; stage 11 blocks release until it is connected and a real POST has been tested after deployment.

Corner chat: `src/data/site-runtime.json` `chat` (per site, never synced) configures the site's own chat window: `chatwoot` `{ baseUrl, inboxIdentifier }` (the site's Chatwoot API inbox), `whatsapp` `[{ label, number }]`, `email`, and optional `prefill` (naming the page with `{title}` and `{url}`), `greeting`, `replyTime`, `color` (default green `#15803d`, `"accent"` for the site accent) and `autoOpen` (seconds, default 8, 0 never). The window shows the team's one-line greeting, up to three quick replies sent with one tap (`quickReplies`, default "I would like a quote." and "Can I order samples first?", gone once the conversation starts), the conversation and a message box, with WhatsApp and email as small icons in its header; with Chatwoot the visitor's first message creates a contact and a conversation through Chatwoot's public client API (conversation attributes: page URL and title, referrer, UTM), replies are fetched every 4 s while open and every 30 s while closed (an unread dot on the bubble), the session is kept in the visitor's browser, and the visitor is asked for an email after the first message. Without Chatwoot, sending hands the message to WhatsApp or email; those links always carry what the visitor wrote (or the opening message naming the page). No third-party script is loaded and nothing is sent before the visitor sends a message. On a desktop the window opens by itself once per visit (not within a day of being closed); on a phone it stays a bubble and opens full screen when tapped. `pnpm setup:chat -- --channels <file>` writes the site's `chat` (`--off`: no chat); with `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID` and `CHATWOOT_API_TOKEN` in the environment it also finds or creates the site's API inbox ("<site name> website chat") and records its inboxIdentifier (the API token is never written). An unusable channel fails the build; no `chat` at all (undecided) or an invalid one holds release; `"chat": false` means no chat. Server setup: `docs/research/CHATWOOT_DEPLOY.zh-CN.md`.

A page's `knowledge` (the industry knowledge cards whose facts its sections were given: `card_id`, `title`, `sources[{url, title, publisher}]`) becomes one `sources` block before the closing CTA: a numbered "Sources" list, each url once. A source without a title or an http(s) url fails the import. Knowledge cards are industry statements, never company facts: they are not counted in `citedFacts` or checked against `--facts`.

## Operating many sites

The site registry (`deploy/registry/schema.sql`) is the single source of each site's operations: `pnpm site:config` reads the site's row by domain, finds or creates its Umami website and Chatwoot inbox, writes their ids back and generates `src/data/site-runtime.json`. Form and chat enquiries carry their site, page, referrer and UTM into one `leads` table (`deploy/registry/LEADS_API.zh-CN.md`). Every site runs the same GitHub release workflow (gates, release build, preflight, upload, switch `current`); a rollback takes seconds. Steps: `deploy/OPERATIONS.zh-CN.md`.

## Technical SEO (stage 10)

`scripts/lib/seo-head.mjs` serialises what search engines read, from the page, the site identity and the site plan; it never re-plans content:

- absolute canonicals on the https bare domain; placeholder pages `noindex, follow` and out of `sitemap.xml`; `robots.txt` open with the sitemap once the site has an identity;
- Open Graph and Twitter tags from the page's own title and description with the site's share image;
- WebSite and Organization on the home page; the site identity (stage 00) owns their name, URL and logo, also when the page's own JSON-LD carries them;
- one breadcrumb trail (navigation path through built pages) for both the visible breadcrumbs and the BreadcrumbList;
- JSON-LD with absolute URLs and `<` escaped.

`pnpm audit:seo` (part of `pnpm check`) checks the build and writes failures and warnings (warnings never fail; they go back to the copy owner). Failures: titles, descriptions, canonicals, robots, social tags, JSON-LD validity, Product and FAQPage required properties, JSON-LD links to unbuilt pages, organisation identity, breadcrumb parity, image alt and size, a lazy first image, orphans, the sitemap, robots.txt and the 404 page, one H1, the document language, placeholder text on indexable pages, and JSON-LD per type (`scripts/lib/schema-rules.mjs`: required properties, placeholders, breadcrumb positions). Warnings: recommended JSON-LD properties, retired rich result types, skipped heading levels, numeric headings, title and description lengths, empty or generic link text, duplicate titles and descriptions, links to placeholder pages, click depth over 3. Rules are ported from claude-seo (MIT). Header and footer menus show built pages only (a planned page appears only as the group of built ones). `pnpm build:nginx-config` writes the Nginx server config (one canonical host, trailing slashes, 404, cache lifetimes, compression, security headers, `/api/` proxy). Analytics: `src/data/site-runtime.json` `{ "analytics": { "provider": "umami", "scriptSrc": "…", "websiteId": "…" } }` adds the Umami script.

After the knowledge-base review (2026-09-25): the sitemap carries lastmod (the date a page's content last changed, recorded at import and output only while it matches); FAQPage markup stays but the audit warns it earns no rich result (Google, May 2026); the company is one `@id` entity that the page markup naming it points to; every footer shows the registry's email and WhatsApp.

## Launch preflight (stage 11)

`pnpm build:release` (which also records `docs/research/seo-snapshot.json`: title, description, canonical, robots, headings, JSON-LD types and hashes per page) then `pnpm preflight` writes `docs/research/launch-preflight.json`: `ready_for_deployment` or `blocked`, never "launched". Site Factory's holds come first, unchanged; then this gate's own: placeholder pages, competitor files or photos, image slots on indexable pages, unapproved AI images or images without alt, an unconnected form, a missing privacy page, missing analytics, an identity that is not stage 00's or has a working title or a temporary host, SEO audit failures, critical SEO drift from the accepted baseline (a removed page, added noindex, a moved canonical, removed JSON-LD, title or H1; `pnpm seo:snapshot -- --accept --by "<name>"` makes the reviewed snapshot the baseline), broken internal links, and an eager image above 350 KB. It also holds on every item of the owner's release sign-off (`docs/research/release-signoff.json`, schema `seo-site-release-signoff-v1`: what must be replaced or confirmed before launch, such as a founding year, certificates or a capabilities list; for a fact item it names the pages citing that fact), confirmed with `pnpm signoff -- --confirm <id> --by "<name>"`. After deployment it lists what must be checked on the live host: HTTPS, headers and redirects, a real form POST, Search Console and Bing verification with the sitemap, field Core Web Vitals and an indexing sample.

Preflight holds added by the knowledge-base review: a removed page needs a 301 or 410 in `src/data/redirects.json`; the Nginx config must serve `current` and no other domain; pages that nearly duplicate another of the owner's sites hold release (`pnpm check:cross-site`; not compared is a notice); a contact page with no way to reach anyone; an unregistered or retired site, or a paused one without its notice (pausing itself does not hold). After a release, a failed live check rolls back and IndexNow gets the changed URLs. See `deploy/OPERATIONS.zh-CN.md`.

## Pattern library and coverage

`scaffold:placeholder-pages` names every full-width section of the reference core pages with a pattern (`scripts/lib/pattern-map.mjs`) and renders it with a library block:

| Reference pattern | Library block |
|---|---|
| hero overlay / split / banner / plain (+ eyebrow, subtitle, second button) | `hero` variants |
| text, checklist, icon features | `intro`/`proof`, `iconList:checks`, `iconList:icons` |
| text + photo, two photos, tinted row, text over a wide image, video row, tabs | `splitMedia:single`/`dual`/`tinted`/`wide` (video and tab panels become a photo) |
| full-bleed photo band with copy | `band` |
| wide chart / infographic / illustration | `figure` |
| numbered cards, text columns, contact cards, photo cards | `featureGrid:numbered`/`columns`/`boxed`/`media` |
| equal tiles, wide/narrow mosaic | `gallery:grid`, `gallery:mosaic` |
| stats row, comparison table, logo strip, testimonials, enquiry form, FAQ, button row | `stats`, `table`, `logos`, `testimonials`, `form` (not connected), `faq`, `cta:inline` |
| social icons, heading-only rows, spacers | skipped with a reason |

Home, about and contact placeholders follow their reference page section by section (placeholder copy, logos, figures and quotes are marked, never invented). Authored page types take the split-row sequence and card/gallery patterns of their reference page (`pageTypes` in `template-variants.json`). Header and footer patterns are variants too: `header.layout` (`stacked`/`inline`), `topBar`, `dropdown` (`list`/`mega`), `carets`, `ctaRoute`; `footer.layout` (`columns` with titled navigation groups, `maxLinks`) or `minimal`.

`docs/research/pattern-inventory.json` lists every reference section with its pattern, decision and crop (`docs/research/pattern-sections/`). `validate:template` fails when a pattern has no decision or a reference page is covered below 80 % of its height. `pnpm compare:sections -- <preview url>` writes one sheet per placeholder page with each reference section beside the block built from it (`docs/design-references/section-comparisons/`).

## Competitor blueprints (since 2026-09-25)

Each site follows its own competitor: `competitorBlueprints` (scripts/lib/page-blueprints.mjs) turns the competitor page of each page type (pattern-inventory.json) into the slots of that page type — the competitor's section order and modules, our content purposes (config/page-blueprints.default.json) placed in the sections of their kind, purposes the competitor has no section for kept after the purposes that precede them in the default order, logos and testimonials as optional `fill: "owner"` slots (real data only), the closing CTA last. A person may leave competitor sections out in `docs/research/blueprint-choices.json` once they set `enabled: true` (off by default). The importer lays out a page whose every section names its slot in the blueprint's order, each block with its slot's module (`orderBySlots`).

## Photos by section topic

`scripts/lib/media-allocation.mjs` allocates the whole site's photos at once, for the renderer and the image plan alike. Each image position asks for a class about something: the product category its heading or card names (else the page's), with the heading as its topic. It takes only a photo of that category (the line's general photos only where no category is asked for; fabric photos may be general), the photo made for its topic first, then the one used least on the site; with none left it stays an image slot, never another product's photo. Factory photos follow the heading's words. The image plan runs the same allocation on an empty library: plain photos per category and class (`caps`), plus one photo per section or card topic (`topicCaps`). Cards for unbuilt pages carry no photo; galleries show built pages only (lib/gallery.mjs).

## Contrast gate

`audit:authoring-layout` measures every text run against the pixels painted behind it (colour, gradient or photo) at 1440 and 390 and fails below WCAG 2.2 AA (`low_contrast`). Dark and photo surfaces switch the text tokens to their inverse; a soft scrim sits behind copy on photos (`--text-scrim`, transparent for dark text on a light photo). A site treatment that paints such a surface light again resets the tokens with `inherit`.

## Blog (stages 09 and 12)

Posts (`src/data/blog-posts.json`, `seo-site-blog-post-v1`) and the blog's copy (`src/data/blog.json`) become pages: the hub `/blog/` with numbered pages (`/blog/page/2/`, each its own canonical) and `/blog/<slug>/` (BlogPosting and BreadcrumbList, sitemap lastmod = dateModified, og:type article). Layouts follow the competitor's blog (`components.blog`: hub header and card, post layout). `pnpm blog:draft` drafts one article from a buyer question no page answers (Site Factory's question map), `pnpm blog:publish` publishes reviewed packages from `content/blog-queue/approved` after the checks in `lib/blog-gates.mjs` (human review, links, figures from facts or a linked source, no near-copy), and `deploy/github/blog-publish.yml` runs it weekly and starts the release. Method and sources: `docs/research/BLOG_METHOD.md`.

## Visual density gate

A layout can pass every structural check and still read as a wall of text. Measure the reference pages once:

```bash
pnpm measure:reference-density -- <reference url> <reference url> …
```

This writes `docs/research/raw/reference-density.json` (`seo-site-reference-density-v2`): per page the words per 1000px of content height, the photo share, the structured share and the visual share (both together), and the longest text-only run, plus the allowed bands (text ≤ 1.15 × the densest reference page, visual share between 0.75 × the lowest and 1.35 × the highest, text-only run ≤ 1.2 × the longest). `audit:authoring-layout` measures every authored page at 1440 the same way and fails with `density_text_heavy`, `density_too_few_images`, `density_too_many_images` (both on the visual share) or `density_long_text_run`. Authoring mode requires the file; a v1 file counts as missing and is measured again.

What counts (owner 2026-11-10): photos are images, video and background photos; structured blocks are tables, embeds (iframes), charts (svg or canvas), card grids (three or more boxed text cards side by side) and our own flow charts, step cards, figures, tables and charts. Either kind breaks a text run. Words are the rendered text outside tables: a collapsed tab's or accordion's text does not count. `site.json` `densityPages` names the benchmark pages (any site's, by full URL: two competitors' content pages); without it the run measures the reference pages but the utility ones (contact). Page types measured on their own get their own band (`components.densityBands.pageTypes`, owner 2026-11-12): `site.json` `densityPageTypes` (`{ "home": "/" }`, a path or paths per page type), else the reference's home for the home page; every other page type is held to the benchmark. The competitor's full-width photo bands on a page type (`pageTypes.<type>.mediaModules` of type band) are that page type's floor: the visual budget never takes its pages below it, and the layout audit fails `signature_missing` when a page shows fewer.

## Layout invariants

- A shorter page should close naturally rather than reserve the reference page's empty height.
- A longer page should repeat compatible patterns without changing the design tokens.
- Sibling cards without an explicit span should remain equal width.
- `data-boundary-anchor="box"` is reserved for intentional full-bleed visual blocks; normal text sections are measured from visible content.
- Desktop and mobile must have one H1, no horizontal overflow, and no excessive boundary gap.

## Required validation

Set `"mode": "authoring"`, `routes` (every rendered route) and `representatives` in `site-template.json`, run the candidate site, then execute:

```bash
pnpm check
pnpm audit:navigation-shell -- http://127.0.0.1:4321 --capture-all
pnpm audit:authoring-layout -- http://127.0.0.1:4321
```

The authoring audit reads the same page files as the renderer and writes `docs/research/authoring-layout-audit.json`. Besides layout it fails on copy that is not rendered in `<main>` (`unplaced_copy`), internal links to unbuilt routes, a missing or wrong canonical, and a JSON-LD count that differs from the page data. A failed case blocks completion.

## Same content, different templates

The content contract is portable. Applying one Authoring JSON document to two extracted templates should retain the same information architecture and copy while producing each template's own typography, palette, media rhythm, shell, and component composition.
