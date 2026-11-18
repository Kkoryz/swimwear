// Checks a blog post must pass before it is published (docs/research/BLOG_METHOD.md, section E). Failures block;
// warnings are reported to the writer. Only what can be judged from the package, the site and the company facts is
// checked here; topic selection (search results, cannibalisation by query) happens before writing, and the main search
// is held once more against the site's searches when the caller passes them (the publish gate).

import { NEAR_DUPLICATE, minhash, similarity, shingles, textWords } from './content-fingerprint.mjs';
import { inlineLinks, plainText, postWords, sectionTexts, validatePost } from './blog.mjs';
import { cannibalHits, searchIndex } from './search-key.mjs';

const TITLE_MAX = 60;
const DESCRIPTION = [70, 160];
const LEAD_WORDS = 60;
const PARAGRAPH_WORDS = 150;
const THIN_WORDS = 300;

const words = (text) => plainText(text).split(/\s+/).filter(Boolean).length;

// Topic overlap with the site's other articles (cannibalisation, BLOG_METHOD.md B3): a title aiming at the same search
// (its words, function words aside, mostly shared) or a section answering a question another article already answers.
// Different text is no defence: two articles titled for one query split its ranking (owner 2026-10-30: two GEO
// articles, 0.01 alike in text, both "How to Choose a Swimwear Manufacturer ..." with two section questions shared).
export const TITLE_OVERLAP = 0.5;
// 0.6: "What steps should I follow to start and launch my own swimwear brand?" and "How do I start and launch my own
// swimwear brand?" share 4 of 6 terms.
export const QUESTION_OVERLAP = 0.6;
const FUNCTION_WORDS = new Set('a an and are as at be by can do does for from how i in into is it its my of on or our own should the to what when where which who why will with you your'.split(' '));
const termsOf = (text) => new Set((plainText(text).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => !FUNCTION_WORDS.has(word)));
export function termOverlap(left, right) {
  const [a, b] = [termsOf(left), termsOf(right)];
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.max(1, new Set([...a, ...b]).size);
}
// Figures a sentence states: digits with their unit-ish neighbours, compared as bare numbers.
const numbersIn = (text) => [...plainText(text).matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(',', '.'));

// facts: Map fact_id -> { text, approved } (the approved company facts); pages: the site's built pages.
// searches: the site's searches [{ route, role, query }] (lib/site-keywords.mjs: the pages' primaries and secondaries,
// the published articles' main searches), or null; cannibal: what a taken main search does (site.json
// blogPublish.cannibal, lib/prelaunch/config.mjs blogCannibalMode): "block" holds the article, "report" warns, "off".
export function blogGates(post, { facts = new Map(), pages = [], today = new Date(), searches = null, cannibal = 'block' } = {}) {
  const failures = [];
  const warnings = [];
  failures.push(...validatePost(post, post?.slug ?? 'post'));
  if (failures.length) return { failures, warnings };
  // The second cannibalisation check, before publishing (owner 2026-11-18; the first is the blog pick's, in Site
  // Factory): the article's main search (geo.keyword) is no page's primary or secondary and no published article's
  // main search, by the pick's own rule (lib/search-key.mjs cannibalHits).
  const keyword = post.geo?.keyword?.trim();
  if (searches && keyword && cannibal !== 'off') {
    for (const hit of cannibalHits({ route: `/blog/${post.slug}/`, query: keyword }, searchIndex(searches))) {
      (cannibal === 'block' ? failures : warnings).push(`main search "${keyword}" is taken: the same search as ${hit.route}'s ${hit.role} "${hit.query}" (cannibalisation)`);
    }
  } else if (searches && cannibal !== 'off') warnings.push('no main search recorded (geo.keyword): not held against the site\'s searches');
  if (post.status !== 'published') failures.push('status must be published');
  // The review: a GEO article's AI review (lib/blog-review.mjs, by "ai-review"), or a person's for an article written
  // by hand.
  if (!post.review?.by || !post.review?.at) failures.push('no review recorded (review.by, review.at): an article is published only after its review passed');
  // Our own claims the writer left as stand-ins (lib/blog-review.mjs applyReplacements): reported, not blocking (owner
  // 2026-11-18: an article with stand-ins is published; the package keeps its list for the real values later).
  const standIns = post.placeholders ?? [];
  if (standIns.length) warnings.push(`${standIns.length} placeholder(s) still the writer's stand-in for our own claim: ${standIns.map((item) => `${item.id} (${item.kind})`).join(', ')}`);
  if (post.seo.title.length > TITLE_MAX) failures.push(`title is ${post.seo.title.length} characters (at most ${TITLE_MAX})`);
  if (post.seo.description.length < DESCRIPTION[0] || post.seo.description.length > DESCRIPTION[1]) failures.push(`description is ${post.seo.description.length} characters (${DESCRIPTION[0]}–${DESCRIPTION[1]})`);
  if (/(^|-)(19|20)\d{2}(-|$)/.test(post.slug)) failures.push('slug contains a year (the URL must outlive updates)');
  if (Date.parse(post.datePublished) > today.getTime() || Date.parse(post.dateModified) > today.getTime()) failures.push('a date is in the future');
  const others = pages.filter((page) => page.route !== `/blog/${post.slug}/`);
  if (others.some((page) => page.seo?.title === post.seo.title)) failures.push('title is already used by another page');
  if (others.some((page) => page.seo?.description === post.seo.description)) failures.push('description is already used by another page');

  // Links: at least three in the text, one to a page that sells (not the blog), all to built pages.
  const built = new Set(pages.map((page) => page.route));
  const body = [...post.lead, ...post.sections.flatMap(sectionTexts)];
  const links = body.flatMap(inlineLinks);
  const internal = links.filter((link) => link.href.startsWith('/'));
  if (internal.length < 3) failures.push(`${internal.length} internal link(s) in the text (at least 3)`);
  if (!internal.some((link) => !link.href.startsWith('/blog/') && built.has(link.href))) failures.push('no link in the text to a product or solution page');
  for (const link of internal) if (!built.has(link.href)) failures.push(`link to a page that does not exist: ${link.href}`);
  for (const link of links) if (/^(click here|read more|here|this article)$/i.test(link.label.trim())) failures.push(`link text says nothing about its target: "${link.label}"`);

  // Figures: every number in the text is one the approved company facts state, or sits in a paragraph that links its
  // source. Nothing is invented. A GEO article's figures are checked while it is written (its numbers table, sources
  // and worked examples; owner 2026-11-16: not again before publishing).
  const factNumbers = new Set([...facts.values()].filter((fact) => fact.approved).flatMap((fact) => numbersIn(fact.text)));
  for (const paragraph of post.geo ? [] : body) {
    const sourced = inlineLinks(paragraph).some((link) => /^https?:\/\//.test(link.href));
    for (const number of numbersIn(paragraph)) if (!factNumbers.has(number) && !sourced) failures.push(`"${number}" in "${plainText(paragraph).slice(0, 70)}…" is neither a company fact nor linked to its source`);
  }

  // Author: the company, or a real person who agreed to be named (the reviewer confirms it).
  if (post.author.type === 'Person') warnings.push('a named author must be a real person who agreed to it (checked by the reviewer)');
  if (post.image && (post.image.width ?? 0) < 1200) failures.push('the featured image is narrower than 1200px');

  // Not a near-copy of another page.
  const own = minhash(shingles(textWords([post.title, ...body].map(plainText).join(' '))));
  for (const page of others) {
    const text = [page.hero?.heading, ...(page.hero?.lead ?? []), ...page.blocks.flatMap((block) => [block.heading, ...(block.paragraphs ?? [])])].filter(Boolean).map(plainText).join(' ');
    const score = own.length ? similarity(own, minhash(shingles(textWords(text)))) : 0;
    if (score >= NEAR_DUPLICATE) failures.push(`too similar to ${page.route} (${score.toFixed(2)})`);
  }

  // The site's other articles (published or in review): the same search in the title, or the same question answered.
  for (const page of others.filter((other) => other.pageType === 'blog_post')) {
    const title = Math.max(termOverlap(post.title, page.hero?.heading ?? ''), termOverlap(post.seo.title, page.seo?.title ?? ''));
    if (title >= TITLE_OVERLAP) warnings.push(`the title aims at the same search as ${page.route} ("${page.hero?.heading}"): give each article its own main question`);
    const answered = (page.blocks ?? []).filter((block) => block.type === 'prose').map((block) => block.heading);
    for (const section of post.sections) {
      const same = answered.find((heading) => termOverlap(section.heading, heading) >= QUESTION_OVERLAP);
      if (same) warnings.push(`"${section.heading}" is already answered by ${page.route} ("${same}"): link there instead of answering it again`);
    }
  }

  // Warnings: answer-first, paragraph length, thin content.
  if (words(post.lead.join(' ')) > LEAD_WORDS) warnings.push(`the opening answer is ${words(post.lead.join(' '))} words (aim for at most ${LEAD_WORDS})`);
  for (const section of post.sections) for (const paragraph of sectionTexts(section)) if (words(paragraph) > PARAGRAPH_WORDS) warnings.push(`a paragraph in "${section.heading}" is ${words(paragraph)} words`);
  if (postWords(post) < THIN_WORDS) warnings.push(`${postWords(post)} words: check the article answers the question fully`);
  if (!post.sources?.length) warnings.push('no sources listed');
  return { failures, warnings };
}
