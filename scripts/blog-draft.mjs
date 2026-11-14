#!/usr/bin/env node

// Drafts one blog article for review (docs/research/BLOG_METHOD.md). The topic is a buyer question no page of the site
// answers (Site Factory's question map, projects/<line>/artifacts/05_faq_questions/questions.json: page_id null). The brief gives
// the writer the question, the buyers' own wording, the approved company facts and the site's pages it may link to;
// Codex writes a seo-site-blog-post-v1 package into content/blog-queue/drafts. Nothing is published from here: a person
// reviews and edits the draft, adds review.by and review.at, and moves it to content/blog-queue/approved (blog:publish).
// Usage: node scripts/blog-draft.mjs --questions <questions.json> [--cluster <cluster_id>]

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { blogGates } from './lib/blog-gates.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { companyFacts } from './lib/facts.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

const PRIORITY = ['high', 'medium', 'low', 'expert-only'];
const slugOf = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 8).join('-');

// The next question to write about: the one asked, else the highest-priority unanswered one not drafted or published.
export function nextQuestion(map, taken, clusterId = null) {
  const open = map.questions.filter((question) => question.page_id == null);
  if (clusterId) return open.find((question) => question.cluster_id === clusterId) ?? null;
  return open.filter((question) => !taken.has(question.cluster_id)).sort((left, right) => PRIORITY.indexOf(left.priority) - PRIORITY.indexOf(right.priority))[0] ?? null;
}

export function draftPrompt({ question, facts, pages, siteName, file }) {
  const links = pages.filter((page) => page.status === 'authored' && !page.pageType.startsWith('blog_')).map((page) => `- ${page.route} — ${page.hero.heading}`);
  return [
    'OUTPUT LANGUAGE: English. Write every field in English.',
    `You are writing one blog article for ${siteName}, a clothing manufacturer. Readers are buyers (brand founders, Amazon/DTC sellers, teams), not consumers.`,
    `The buyer question: "${question.canonical_question}"`,
    `Why they ask: ${question.pain_point}`,
    `How buyers word it (observed searches and posts; wording only, not facts): ${question.evidence.slice(0, 12).map((text) => `"${text}"`).join('; ')}`,
    `Situations they ask from: ${question.ai_prompts.join(' | ')}`,
    'Company facts you may state (quote them faithfully; state nothing else about the company):',
    ...[...facts.entries()].filter(([, fact]) => fact.approved).map(([id, fact]) => `- [${id}] ${fact.text}`),
    'Pages of the site you may link to (use only these routes):',
    ...links,
    'Rules:',
    '- Answer the question in the first one or two sentences of the lead (at most 60 words). Every section opens with a sentence that answers its heading.',
    '- 4 to 7 sections; some headings may be questions. Use a list or a table only where the content is a list or a comparison.',
    '- Link 3 to 5 times inside paragraphs with [label](/route/), at least once to a product or solution page; the label says what the page is.',
    '- Numbers: only the company facts above, or a figure from a public source you are sure of, with the source linked in the same paragraph as [label](https://...). Never invent a number, a client, a certificate or a quote. When unsure, say it qualitatively.',
    '- Give first-hand detail only from the facts above (how this factory works); do not claim experience the facts do not state.',
    '- Author: the company (no named person). No year in the slug. Title at most 60 characters; description 70 to 160 characters.',
    '- sources: only pages you actually cite; takeaways: 3 short points the article makes.',
    `Save the article as JSON to ${file} with exactly these fields: {"slug","status":"published","category","seo":{"title","description"},"title","lead":[..],"author":{"type":"Organization"},"takeaways":[..],"sections":[{"heading","paragraphs":[..],"list"?:{"items":[..]},"table"?:{"columns":[..],"rows":[[..]]}}],"sources":[{"title","url","publisher"?}],"cta":{"heading","text","label","href":"/contact/"},"question":"${question.cluster_id}"}.`,
    'Reply with only the file path when done.',
  ].join('\n');
}

export async function draftArticle({ root = process.cwd(), questionsPath, clusterId = null, run = runJudge }) {
  const map = await readJson(resolve(questionsPath));
  const queue = resolve(root, 'content/blog-queue');
  await mkdir(resolve(queue, 'drafts'), { recursive: true });
  const posts = await readJson(resolve(root, 'src/data/blog-posts.json'), []);
  const drafted = await readJson(resolve(queue, 'drafted.json'), {});
  const taken = new Set([...Object.keys(drafted), ...posts.map((post) => post.question).filter(Boolean)]);
  const question = nextQuestion(map, taken, clusterId);
  if (!question) return { question: null };
  const pages = await loadSitePages(root);
  const facts = await companyFacts(root);
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const slug = slugOf(question.canonical_question);
  const file = `content/blog-queue/drafts/${slug}.json`;
  const result = await run({ root, prompt: draftPrompt({ question, facts, pages, siteName: identity?.siteName ?? 'the company', file }), lastMessage: resolve(queue, 'drafts', `${slug}.reply.txt`) });
  if (result.code !== 0) throw new Error(`Codex could not draft the article: ${result.stderr.trim().slice(-300)}`);
  const post = JSON.parse(await readFile(resolve(root, file), 'utf8'));
  // Dates are set when it is published; the checks run now so the reviewer sees what to fix.
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const { failures, warnings } = blogGates({ ...post, datePublished: stamp, dateModified: stamp, review: { by: '(review pending)', at: stamp } }, { facts, pages: pages.filter((page) => page.status !== 'placeholder') });
  await writeJson(resolve(queue, 'drafts', `${slug}.checks.json`), { failures, warnings });
  await writeJson(resolve(queue, 'drafted.json'), { ...drafted, [question.cluster_id]: file });
  return { question: question.cluster_id, file, failures, warnings };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ questions: { type: 'string' }, cluster: { type: 'string' } });
  if (!values.questions) return usage('Usage: node scripts/blog-draft.mjs --questions <questions.json> [--cluster <cluster_id>]');
  const result = await draftArticle({ questionsPath: values.questions, clusterId: values.cluster ?? null });
  if (!result.question) console.log('no unanswered question left to draft');
  else console.log(`${result.question}: draft ${result.file} (${result.failures.length} check failure(s), ${result.warnings.length} warning(s); review it, add review.by/at, move it to content/blog-queue/approved)`);
});
