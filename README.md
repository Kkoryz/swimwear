# SEO Website Template

[简体中文](README.zh-CN.md)

An Astro-first skill and project scaffold that turns one reference website into a reusable SEO site template.

It extracts the reference site's visual language—typography, colors, spacing, media treatment, Header, Footer, responsive behavior, and page patterns—then keeps those rules separate from authored content. The result can use different copy, section counts, page lengths, and routes without becoming a literal clone.

> Derived from [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) and rebuilt for Astro and structured SEO authoring.

## What it includes

- Astro static output with strict TypeScript
- Homepage-first canary workflow
- Header-driven Navigation Shell discovery
- Shared Header, Footer, fonts, and Design Tokens
- Page-type classification and Astro route generation
- Site Factory / structured Authoring integration
- Content-adaptive layouts for short and long pages
- Desktop and mobile navigation/layout audits
- Skill definitions for Codex, Claude Code, Cursor, Windsurf, Gemini, and other supported agents

## Requirements

- Node.js 24 or newer
- pnpm 11
- An AI coding agent with browser automation available

## Quick start

```bash
git clone https://github.com/Kkoryz/seo_website_template.git
cd seo_website_template
pnpm install

# Create an isolated Astro workspace for one reference site
node scripts/create-workspace.mjs https://example.com ../my-seo-site
cd ../my-seo-site
pnpm install
```

Open `my-seo-site` in your coding agent and run the bundled skill:

```text
$seo-site-template https://example.com /absolute/path/to/my-seo-site
```

Agents that use slash commands may expose the same skill as:

```text
/seo-site-template https://example.com /absolute/path/to/my-seo-site
```

## Workflow

1. Capture the reference homepage at desktop, tablet, and mobile widths.
2. Lock observed fonts, colors, spacing, media rules, Header, and Footer.
3. Build and approve a homepage canary.
4. Discover Header navigation and classify representative page types.
5. Build `/about`, one product/manufacturer page, and `/contact-us`.
6. Expand to the complete Navigation Shell.
7. Feed structured content through `src/data/authoring-pages.json` (for Site Factory, `pnpm import:site-factory` maps a stage-07 package by content shape; see [Authoring Integration](docs/research/AUTHORING_INTEGRATION.md)).
8. Run navigation, Authoring layout, type, and build gates.

## Last: GEO blog posts (`geo-blog/`)

The last module, a module of its own. A site run ends with its `geo-blogs` step (`scripts/geo-blogs.mjs`), which writes the site's profile (`docs/research/geo-site.json`) and runs `geo site` on it for three posts by default (`site.json` `geoBlog`: `dir`, `count`, `market`; or `GEO_BLOG_DIR`); the module picks the topics itself and the step only waits on it. After launch it runs on its own for more posts. [`geo-blog/`](geo-blog/README.md) takes one keyword through buyer questions, what ChatGPT, Claude, Gemini, Perplexity and Google AI Overview answer and cite, the cited pages, gaps and an outline to an article, then calls the site's `scripts/import-geo-article.mjs` (`pnpm blog:geo <run>`), which makes the article's pictures and builds it as a blog post held for review until `pnpm blog:publish`. The article contract is [Article Visuals](docs/research/ARTICLE_VISUALS.md). `geo-blog/` is a git subtree of the GEO repository and is updated with `git subtree pull --prefix=geo-blog <repo> master`.

## Authoring model

The content layer owns routes, SEO fields, copy, media references, links, item counts, and ordered block types. Astro owns component markup and the locked visual system.

Supported core block families include:

```text
hero · intro · featureGrid · splitMedia · process · proof · faq · cta
```

This separation allows one content package to be rendered through different extracted templates while retaining the same information architecture. See [Authoring Integration](docs/research/AUTHORING_INTEGRATION.md).

## Commands

```bash
pnpm capture:reference -- https://example.com
pnpm discover:navigation-shell -- https://example.com
pnpm audit:navigation-shell -- http://127.0.0.1:4321 --capture-all
pnpm import:site-factory -- --package authoring_package.json --pages-plan pages.json
pnpm audit:authoring-layout -- http://127.0.0.1:4321
pnpm check
```

`pnpm check` runs unit tests, validates the Astro template contract, performs `astro check`, and creates a production build.

## Sharing this project

This repository is private. Repository, ZIP, release, and template links work only for GitHub users who already have access.

Invite a recipient first:

1. Open the repository on GitHub.
2. Go to **Settings → Collaborators → Add people**.
3. Enter the recipient's GitHub username or email and send the invitation.
4. After the recipient accepts, share <https://github.com/Kkoryz/seo_website_template>.

The recipient can then clone it:

```bash
git clone https://github.com/Kkoryz/seo_website_template.git
```

You may also enable **Settings → General → Template repository**. Users who already have access can then click **Use this template** to create an unrelated copy under an account where they have permission to create repositories.

For a personal-account private repository, invited collaborators receive collaborator access, which includes write access. If recipients should have centrally managed or more granular permissions, host the repository in a GitHub organization and grant access through a team. If a recipient should not retain repository access, send a manually exported source archive instead and remove generated assets and local credentials first.

Do not send `node_modules`, `.astro`, `dist`, captured third-party assets, or generated client-site output. Share the repository and let each recipient generate their own site workspace.

## Scope

This module builds reusable static Astro presentation templates. Backend recreation, authenticated pages, checkout, and deployment are outside its scope.

## License

MIT. Original attribution is preserved in [LICENSE](LICENSE).
