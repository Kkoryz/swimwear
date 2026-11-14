import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodex } from './codex-exec.mjs';
import { ARTICLE_EXAMPLES } from './config.mjs';
import { siteRoutes, wordsPerPicture } from './article-check.mjs';
import { ownSlug, postsForPrompt, sitePosts } from './site-posts.mjs';

// The site's other articles and this one's main question, for the outline and the writer.
const siteContext = (config) => ({
  existingPosts: postsForPrompt(sitePosts(config, { excludeSlug: ownSlug(config) })),
  mainQuestion: config.main_question ?? '(choose one from the questions and the focus terms: ' + (config.focus_terms ?? []).join(', ') + ')',
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fill = (template, vars) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
export const prompt = (name, vars) => fill(readFileSync(join(ROOT, 'prompts', `${name}.md`), 'utf8'), vars);

// The trade's examples in the article prompt: the run's trade_examples over the manufacturer's defaults.
export function articleExamples(config) {
  const own = { ...ARTICLE_EXAMPLES, ...config.trade_examples };
  return { imageSubjects: own.image_subjects, heroExample: own.hero, photoSettings: own.photo_settings, linkExample: own.link };
}

// One Codex judge run (the judge homes next to this repo); the agent writes `output` itself.
export async function judge(config, name, vars, output, label, { timeoutMs = 12 * 60 * 1000 } = {}) {
  const lastMessage = join(config.runDir, '.judge', `${label}.txt`);
  mkdirSync(dirname(lastMessage), { recursive: true });
  let code, stderr;
  // A model at capacity is a passing state: wait and ask again, a few times.
  for (let attempt = 1; ; attempt++) {
    ({ code, stderr } = await runCodex({
      root: ROOT,
      prompt: prompt(name, vars),
      lastMessage,
      judge: true,
      lean: true,
      tokenLog: join(config.runDir, '.judge', 'tokens.jsonl'),
      label,
      timeoutMs,
    }));
    if (code === 0 || attempt > 3 || !/at capacity|overloaded|temporarily unavailable|try again later/i.test(stderr)) break;
    console.log(`${label}: model busy, retrying in 60s (${attempt}/3)`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  if (code !== 0) throw new Error(`${label}: codex exited ${code}: ${stderr.slice(-500)}`);
  if (!existsSync(output)) throw new Error(`${label}: codex did not write ${relative(config.runDir, output)}`);
  stripBom(output);
  if (output.endsWith('.json')) JSON.parse(readFileSync(output, 'utf8'));
}

// Files the agent writes through PowerShell can start with a byte-order mark, which JSON.parse rejects.
function stripBom(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) writeFileSync(file, text.slice(1));
}

// The run's keyword in the article's frontmatter: the site importer marks the post with it (post.geo.keyword).
export function stampKeyword(file, keyword) {
  const text = readFileSync(file, 'utf8');
  if (!/^---\r?\n/.test(text) || /^keyword:/m.test(text.split(/\r?\n---/)[0])) return;
  writeFileSync(file, text.replace(/^---\r?\n/, `---\nkeyword: ${JSON.stringify(keyword)}\n`));
}

// A Markdown table whose header row has no separator line under it gets one (the site's parser needs it); no rewrite.
export function fixTables(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const row = (l) => /^\s*\|.*\|\s*\r?$/.test(l ?? '');
  const separator = (l) => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\r?$/.test(l ?? '');
  const out = [];
  lines.forEach((l, i) => {
    out.push(l);
    if (row(l) && !row(lines[i - 1]) && !separator(l) && !separator(lines[i + 1])) {
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').length;
      out.push(`|${' --- |'.repeat(cells)}${l.endsWith('\r') ? '\r' : ''}`);
    }
  });
  if (out.length !== lines.length) writeFileSync(file, out.join('\n'));
}

// Step 6: the article and its replacement list (company data written as placeholders the owner swaps before launch).
export async function writeArticle(config, { log = console.log } = {}) {
  const article = join(config.runDir, '06-article.md');
  if (existsSync(article)) { stampKeyword(article, config.keyword); return log('06-article.md exists, kept'); }
  await judge(config, 'write', {
    runDir: config.runDir,
    keyword: config.keyword,
    market: config.market,
    ourSite: config.our_site?.domain ?? '(none)',
    factsFile: config.facts_file ?? '(none: every company detail is a placeholder)',
    routes: siteRoutes(config).map((r) => `- ${r}`).join('\n') || '(none)',
    wordsPerPicture: wordsPerPicture(config),
    ...articleExamples(config),
    ...siteContext(config),
  }, article, 'write', { timeoutMs: 25 * 60 * 1000 });
  for (const f of ['06-replacements.json', '06-visuals.json']) {
    if (!existsSync(join(config.runDir, f))) throw new Error(`write: codex did not write ${f}`);
    stripBom(join(config.runDir, f));
  }
  stripBom(article);
  stampKeyword(article, config.keyword);
  fixTables(article);
  log('✓ 06-article.md, 06-replacements.json, 06-visuals.json');
}

// Step 4: one judge run per question, side by side. Existing gap files are kept.
export async function writeGaps(config, { log = console.log } = {}) {
  const questions = JSON.parse(readFileSync(join(config.runDir, '01-questions.json'), 'utf8')).questions;
  mkdirSync(join(config.runDir, '04-gaps'), { recursive: true });
  const receiptsDir = join(config.runDir, '02-receipts');
  await Promise.all(questions.map(async (q) => {
    const output = join(config.runDir, '04-gaps', `${q.id}.json`);
    if (existsSync(output)) return;
    const receipts = readdirSync(receiptsDir)
      .filter((f) => f.startsWith(`${q.id}-`) && f.endsWith('.json'))
      .filter((f) => JSON.parse(readFileSync(join(receiptsDir, f), 'utf8')).status !== 'unavailable');
    const minReceipts = Math.max(2, Math.ceil(config.consensus_min_share * receipts.length));
    await judge(config, 'gaps', { runDir: config.runDir, qid: q.id, receipts: receipts.join(', '), minReceipts, market: config.market }, output, `gaps-${q.id}`);
    log(`✓ 04-gaps/${q.id}.json`);
  }));
}

// Step 5: the outline from the gap files, plus a readable markdown copy.
export async function writeOutline(config, { log = console.log } = {}) {
  const output = join(config.runDir, '05-outline.json');
  if (!existsSync(output)) await judge(config, 'outline', { runDir: config.runDir, keyword: config.keyword, market: config.market, ...siteContext(config) }, output, 'outline');
  const outline = JSON.parse(readFileSync(output, 'utf8'));
  const md = [`# ${outline.working_title}`, ''];
  for (const s of outline.sections) {
    md.push(`## ${s.heading}`, '');
    if (s.answer_first) md.push(`**Answer first:** ${s.answer_first}`, '');
    for (const p of s.points ?? []) md.push(`- ${p}`);
    if (s.covers?.length) md.push('', `_covers: ${s.covers.join(', ')}_`);
    if (s.owner_input?.length) md.push('', ...s.owner_input.map((o) => `⚠ owner input: ${o}`));
    md.push('');
  }
  writeFileSync(join(config.runDir, '05-outline.md'), md.join('\n'));
  log(`✓ 05-outline.json (${outline.sections.length} sections)`);
}
