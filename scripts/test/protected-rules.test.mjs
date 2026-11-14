import assert from 'node:assert/strict';
import test from 'node:test';
import { protectedOverrides, siteLayoutNote } from '../lib/protected-rules.mjs';

test('a site rule that undoes a template layout decision is found; others are left', () => {
  // The hotel site's style-board repair: the competitor's fixed photo and top alignment, and a button pinned to a band's foot.
  const css = `
.block--split[data-variant="single"] .split__media { aspect-ratio: 1.27; }
@media (min-width: 900px) {
  main .block--split[data-variant="single"] .split[data-layout="split"] > .split__media-set { align-self: start; }
  .block--split[data-variant="single"] .split { grid-template-columns: minmax(0, 1fr) minmax(0, 462px); align-items: start; }
}
.block--cta[data-variant="image-band"] .cta__content > .button--primary { position: absolute; bottom: 0; }
.page-hero .button { position: relative; }
.split__copy { color: red; }`;
  assert.deepEqual(protectedOverrides(css).map((item) => item.property), ['aspect-ratio', 'align-self', 'align-items', 'position']);
  assert.deepEqual(protectedOverrides('.button { position: relative; }'), [], 'a button placed relative keeps its flow');
});

test('every review and repair hears the site\'s own layout rules (owner 2026-11-14: "从源头解决")', async () => {
  const { siteRules } = await import('../lib/protected-rules.mjs');
  const { readFile } = await import('node:fs/promises');
  const rules = siteRules({ headingAlign: 'start' });
  assert.match(rules, /^- every section heading starts on the content's left edge/);
  assert.match(rules, /\n- a split row's photo runs its copy's height/);
  assert.match(rules, /\n- a title and every heading are sized by the template to their own words/);
  assert.match(rules, /widths, heights, column counts and line lengths are not copied as fixed values/);
  assert.doesNotMatch(siteRules({}), /starts on the content's left edge/);
  assert.match(siteLayoutNote({}), /^the site's own layout rules, not to be copied from the competitor: neighbouring plain sections alternate white and tinted/);
  assert.match(siteLayoutNote({}), /; a split row's photo runs its copy's height/);
  // The review and both repairs are given them, and none is told to make our module look like the competitor's.
  for (const prompt of ['design-review', 'repair-design', 'repair-audits']) {
    const text = await readFile(new URL(`../../config/agent-steps/${prompt}.md`, import.meta.url), 'utf8');
    assert.match(text, /\{\{siteRules\}\}/, `${prompt} hears the site rules`);
    assert.doesNotMatch(text, /make our module look like the competitor's|development placeholders/, prompt);
  }
});

test("a repair's declarations that undo a template decision are taken out by code; the rest of the sheet stays", async () => {
  const { stripProtected } = await import('../lib/protected-rules.mjs');
  const { css, removed } = stripProtected('.a{color:red}\n@media (min-width:1024px){ .block .split__media { align-self: start; color: blue } }\n.cta .button { position: absolute; top: 0 }\n.split { align-items: start }\n.x .button{position:relative}\n');
  assert.deepEqual(removed.map((item) => item.property), ['align-self', 'position', 'align-items']);
  assert.equal(css, '.a{color:red}\n@media (min-width:1024px){ .block .split__media { color: blue } }\n.cta .button { top: 0 }\n\n.x .button{position:relative}\n');
  assert.deepEqual(stripProtected('.a{color:red}').removed, []);
});

test("the owner's waivers keep their answer when a review is written anew: a waived finding holds nothing", async () => {
  const { applyWaivers, judgeReviews, openFindings } = await import('../design-review.mjs');
  const findings = [{ block: 'split-1', review: 'home', severity: 'P0', issue: 'Photo is not top-aligned like the competitor' }, { block: 'cta', review: 'home', severity: 'P0', issue: 'Button colour' }];
  const waived = applyWaivers(findings, [{ block: 'split-1', issue: 'top-aligned', why: 'our split rows centre short copy', by: 'owner', at: '2026-11-12' }]);
  assert.match(waived[0].resolution, /^waived: our split rows centre short copy/);
  assert.equal(waived[1].resolution, undefined);
  assert.deepEqual(openFindings(waived).map((finding) => finding.block), ['cta']);
  const review = { shots: 's', rules: 'r', source: 'x', findings: [findings[0]] };
  const page = { key: 'home', pageType: 'home', route: '/', shots: 's', rules: 'r', source: 'x' };
  const judged = judgeReviews({ pages: [page] }, { home: review }, [{ block: 'split-1', why: 'w', by: 'o', at: 'd' }]);
  assert.equal(judged.findings[0].resolution?.startsWith('waived'), true);
});

test("a title's fitted size is the template's: a site rule setting it or the hero title's font size is taken out", async () => {
  const { stripProtected } = await import('../lib/protected-rules.mjs');
  const { css, removed } = stripProtected('main .page-hero__copy { --heading-fit: 4rem; --hero-copy-max: 56rem; }\nmain .post-header__title { --heading-fit: 4rem; font-size: 4rem; font-weight: 700 }\n.page-hero h1 { font-size: 72px; color: red }\n.feature-card h3 { font-size: 20px }\n');
  assert.deepEqual(removed.map((item) => item.property), ['--heading-fit', '--heading-fit', 'font-size', 'font-size']);
  assert.equal(css, 'main .page-hero__copy { --hero-copy-max: 56rem; }\nmain .post-header__title { font-weight: 700 }\n.page-hero h1 { color: red }\n.feature-card h3 { font-size: 20px }\n');
});

test("every input of a title's fit is the template's: a site rule raising its floor is taken out", async () => {
  const { stripProtected } = await import('../lib/protected-rules.mjs');
  const { css, removed } = stripProtected('@media (min-width: 1024px) { main .post-header__inner[data-heading-fit] { --fit-above: 2.8125rem; } .x { --fit-min-desktop: 40px; color: red } }');
  assert.deepEqual(removed.map((item) => item.property), ['--fit-above', '--fit-min-desktop']);
  assert.equal(css, '@media (min-width: 1024px) {  .x { color: red } }');
});

test("the trust bar's surface is the alternation's: a site rule colouring it is taken out, its items' styles stay (hotel-rm 2026-11-15)", async () => {
  const { stripProtected } = await import('../lib/protected-rules.mjs');
  const { css, removed } = stripProtected('main:is([data-page-type="general"], [data-page-type="contact"]) .trust-bar { background: var(--surface-primary); }\n.trust-bar__item { background: #fff }\n');
  assert.deepEqual(removed.map((item) => item.property), ['background']);
  assert.match(css, /\.trust-bar__item \{ background: #fff \}/);
  assert.doesNotMatch(css, /\.trust-bar \{ background/);
});

test("a plain section's background is the template's alternation: a site rule tinting one section is taken out, a band's or a card's stays", async () => {
  const { stripProtected, stylesPlainSection } = await import('../lib/protected-rules.mjs');
  assert.ok(stylesPlainSection('.block--gallery + .block--icon-list[data-variant="checks"]'), 'a section tinted by its neighbour');
  assert.ok(stylesPlainSection('main[data-page-type="about"] :is(.block--logos, .block--faq)'));
  assert.ok(!stylesPlainSection('main[data-page-type="home"] .block--cta[data-variant="dark"]'), 'a closing band carries its own surface');
  assert.ok(!stylesPlainSection('main .block--grid .feature-card'), 'a card inside the section');
  assert.ok(!stylesPlainSection('.post-article > .block--prose:nth-child(even)'), 'an article is not alternated');
  assert.ok(!stylesPlainSection('.block--prose .block--process'), 'a block inside another');
  const { css, removed } = stripProtected('main .block--grid[data-pattern="bullets"] { background: var(--surface-secondary); padding-block: 2rem }\n.block--cta { background: #111 }\n');
  assert.deepEqual(removed.map((item) => item.property), ['background']);
  assert.equal(css, 'main .block--grid[data-pattern="bullets"] { padding-block: 2rem }\n.block--cta { background: #111 }\n');
});

test('before every build the site sheet loses what undoes a template decision', async () => {
  const { stripSheet } = await import('../strip-protected.mjs');
  const { mkdtemp, mkdir, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'strip-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/reference.css'), '.page-hero__copy { --heading-fit: 4rem; color: red }');
  assert.deepEqual((await stripSheet(root)).map((item) => item.property), ['--heading-fit']);
  assert.equal(await readFile(join(root, 'src/styles/reference.css'), 'utf8'), '.page-hero__copy { color: red }');
  assert.deepEqual(await stripSheet(join(root, 'none')), []);
});

test("a legal page opens on a photo only where the site sets its own hero for it", async () => {
  const { heroPhoto } = await import('../lib/media-slots.mjs');
  const page = { route: '/privacy-policy/', pageType: 'privacy' };
  const media = { hero: { src: '/h.webp', alt: 'h' } };
  assert.equal(heroPhoto(page, { media }), null);
  assert.equal(heroPhoto(page, { media, heroByPageType: { privacy: 'media-overlay' } })?.src, '/h.webp');
});
