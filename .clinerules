<!-- AUTO-GENERATED from AGENTS.md — do not edit directly.
     Run `bash scripts/sync-agent-rules.sh` to regenerate. -->

# SEO Site Template Agent Rules

## Purpose

This repository turns one reference URL into a reusable Astro template. Invoke `/seo-site-template <url> [destination]`.

## Stack

- Astro static output
- TypeScript strict mode
- Tailwind CSS v4
- React islands only for observed runtime behavior
- pnpm

## Hard rules

- Accept exactly one public HTTP(S) URL per MVP run.
- Extract real content, assets, computed CSS, responsive behavior, and interaction states before building.
- Never fabricate missing values or silently truncate extraction.
- Static sections use `.astro`; an island requires evidence of client-side state.
- Keep page content replaceable by later SEO site-building stages.
- A run is complete only when tests, template validation, `astro check`, and `astro build` pass.
- This MVP is not the production zero-drift acceptance workflow.

## Commands

- `pnpm dev`
- `pnpm test`
- `pnpm validate:template`
- `pnpm astro check`
- `pnpm astro build`
- `pnpm check`

After editing `AGENTS.md`, run `bash scripts/sync-agent-rules.sh`. After editing the canonical skill, run `node scripts/sync-skills.mjs`.
