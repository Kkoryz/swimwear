# ARTICLE_VISUALS — planned pictures and charts, and the GEO article module

How an upstream writer plans the pictures of a text, and how stage 08 makes them. One contract for every topic and
every site: nothing here names a product line, a site or a competitor; what is site-specific is read from the site
(its reference's measures, its photo style). Used today by the GEO article module (below); Site Factory's pages are to
plan their pictures the same way (proposal of 2026-10-30, in progress).

## 1. Visuals: what the writer plans

Each picture is planned with the text it illustrates, not filled in afterwards. A visual is one entry:

| field | for | meaning |
| --- | --- | --- |
| `id` | all | `V1`, `V2` ...: referenced from the text where the visual stands |
| `type` | all | `hero` (the article's featured image), `photo`, `chart` (drawn by the template), `table` (written in the text, not a picture) |
| `section` | all | the heading of the section it belongs to |
| `title` | all | the caption under the picture |
| `purpose` | all | what the reader learns from it |
| `content` | hero, photo | **one** moment with **one** main subject: only what is visible. Things compared may stand side by side in one shot. Never a collage, panels, a split screen or a sequence of steps: a sequence is a chart or several pictures |
| `setting` | hero, photo | where it is and what is happening, true to the paragraph it illustrates; every photo of a text has its own. The photo takes the setting's own light |
| `chart` | chart | the data (section 2) |
| `produce` | all | `generate` (photo), `draw` (chart), `table in text` |

Photo rules (the image prompt, `scripts/lib/image-prompt.mjs` `articleVisualPrompt`, and `config/image-briefs.json`):

- No words, numbers, labels, scales or legends in the image (an image model's lettering is not trusted): the caption
  carries them.
- No brand, price, quantity or lead time in what the picture claims.
- Making, inspection, sampling and materials are shown at the manufacturer's own work places; the product as worn or
  styled in the site's lifestyle settings. Workers are Chinese factory workers; models follow the casting in
  `config/image-briefs.json` (owner decisions 2026-10-29/30).

## 2. Charts the template draws

`src/components/blog/ArticleChart.astro`, validated by `scripts/lib/blog.mjs` `chartErrors`. Drawn in the site's
colours as HTML text: exact, readable, found by search.

| kind | items | example |
| --- | --- | --- |
| `bar` (2–8) | `{ "label", "value" }`, a number ≥ 0; optional `unit` (`USD` formats as dollars) | `{"kind":"bar","unit":"USD","items":[{"label":"Delivered inventory","value":5600},{"label":"Development","value":750}]}` |
| `timeline` (2–8) | `{ "label", "start", "end" }`, dates `YYYY-MM-DD`, end not before start | `{"kind":"timeline","items":[{"label":"First samples","start":"2026-07-01","end":"2026-07-15"}]}` |
| `steps` (3–7) | `{ "label", "detail"? }` | `{"kind":"steps","items":[{"label":"Brief","detail":"style, sizes, target price"},{"label":"Sample"},{"label":"Bulk"}]}` |

Labels at most five words. Every number and date a chart shows appears in the text as written (the writer's check).
A comparison of options is a table; a checklist is a list; neither is a chart.

### 2.1 Pages: what data is drawn how

On a page, the writer (Site Factory) says what a section's data is (`visuals[].data`: `{ "shape", "items" }`), never
how to draw it; stage 08 draws it by one rule per kind of data (`scripts/lib/visual-data.mjs` `chartOfData`):

| the data is | `shape` | drawn as | why |
| --- | --- | --- | --- |
| steps in order | `sequence` (3–7 `{label, detail?}`) | the site's process module after the section, in the competitor's process style (else numbered cards over a photo of the work) | a process is read step by step; the site already styles one |
| values compared by size | `amounts` (`{label, value, unit?}`) | bars | bar lengths compare sizes |
| periods with dates | `periods` (`{label, start, end}`) | a timeline | dates sit on a calendar |
| durations | `periods` (`{label, min, max, unit}`, 2+ in one unit) | durations on one time scale | how long each stage takes, side by side |
| specs: sizes, weights, minimums, ranges | `ranges` (`{label, min, max, unit}`) | not drawn: the numbers stay in the text (and the page's figures band) | a spec is read, not compared; a card repeating the text's numbers reads oddly |
| parts of a whole | `shares` (`{label, percent}`, adding to 100) | one share bar with its key | parts of 100 |
| options compared | `comparison` (`{options, rows}`) | a comparison table | rows of words read best as a table |

A split row whose section has a chart shows it in its photo's place (steps follow the row instead), and no photo is
made for that row; a row whose data is only specs keeps its photo. A photo the section asks for (`visuals[].type: photo`) is made for its own position (an
intent photo, section 1's rules); a text section that asks for one shows it beside its text as a split row, and the
density audit keeps the page within the competitor's share of photos.

## 3. How densely a text is illustrated

`scripts/measure-reference-article.mjs` (site-run step `article-rhythm`) measures three articles of the reference
blog (`site.json` `reference.article`, else the first its blog lists). The words per picture of the reference set the
target, never sparser than one picture in 400 words (the best-ranking competitor's buyer's guides) nor denser than one
in 150: `lib/geo-article.mjs` `pictureTarget`. It is written to `src/data/article-rhythm.json` (`wordsPerPicture`),
where the writer reads it. A section of 150 words or more wants `floor(words / target)` pictures, at least one; the
hero is not counted; charts count, about a third of the pictures.

The article text follows the reference only where it reads more easily (more line height, more room, shorter lines;
`rhythmVars`): the `--article-*` properties in the same file, read by `BlogPostView`.

## 4. The GEO article module

After stage 08, one article of the GEO research tool (`geo-blog-research`, `runs/<slug>`) becomes a blog post of the
site, in the site's own article layout.

```
node <08 repo>/scripts/import-geo-article.mjs <runs/slug>    # in the site's directory (pnpm blog:geo)
```

Input (read only): `06-article.md` (frontmatter `seo_title`, `seo_description`, `slug`; one H1; H2 sections with
paragraphs, H3, lists, Markdown tables and `![alt](visuals/<id>.png)` where each visual stands) and `06-visuals.json`
(`{ "visuals": [...] }`, section 1).

What it does:

1. Parses the article in the writer's order (`lib/geo-article.mjs`); the first paragraph opens the article, the hero is
   the featured image.
2. Makes each photo with Codex's image tool in the owner's and judge homes in turn, in the site's photo rendering,
   told what the article's other pictures show; judges it against its `content` (`config/agent-steps/image-fit.md`)
   and against the others (difference hash): a misfit or a look-alike is made once more. A visual is made again only
   when what the writer says about it, or the prompt's rules (`VISUAL_RULES`), change.
3. Draws each chart from its data.
4. Writes the post (status `review`: built, noindex, out of the sitemap and the hub; the preflight holds the release)
   to `src/data/blog-posts.json`, the package to `content/blog-queue/drafts/<slug>.json`, and its record (picture
   density, misfits, stand-ins, the blog checks) to `docs/research/geo-articles/<run>/record.json`.

The blog checks also warn when the title aims at the same search as another article of the site, or a section answers
a question another article already answers (`lib/blog-gates.mjs` `termOverlap`): different text does not keep two
articles from splitting one query. The writer picks topics around a keyword so that each article has its own main
question, and links to the article that already answers a related one.

A person reviews it, adds `review.by`/`review.at`, and publishes it with `pnpm blog:publish` (the checks of
`BLOG_METHOD.md` E2). Run it again after any edit of the article (`geo apply`): unchanged pictures are kept.
