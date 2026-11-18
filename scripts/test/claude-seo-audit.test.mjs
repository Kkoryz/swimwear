// The claude-seo full audit (owner 2026-11-17: after the site is done, one claude-seo full audit by default; it is
// the only model audit): its folders, the issue list and its schema, the two checks before an item holds the launch,
// the step's reuse of an audit of the same build, and the preflight reading its findings; the three auditors at once
// and the merge of their findings (owner 2026-11-17: "可以 而且可以并行不是吗").
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

import { auditDirs, checkLocations, checkRecord, findingFile, findingRoute, findingsDoc, latestAudit, llmAuditOn, locationIn, locationsOverlap, median, mergeFindings, nextAuditDir, normalizeReply, problemSimilarity, readAuditors, releaseKey, sameFinding, validateFindings, withCorrectedOwners, withFoundLocations, auditHolds, healthScore } from '../lib/claude-seo-audit.mjs';
import { focusPages, pageSlug, serveAudit } from '../lib/claude-seo-measure.mjs';
import { claudeArgs } from '../lib/claude-exec.mjs';
import { runChecks, CHECKS } from '../preflight.mjs';

const finding = (id, severity, extra = {}) => ({ id, severity, section: 'content', url: '/', location: 'Brands we make for', problem: `${id} problem`, evidence: { kind: 'report', ref: 'measurements/pages/home.json' }, owner: '08', fix: `fix ${id}`, ...extra });

test('audit folders count up from the hand-run ones; an unfinished run of this pipeline is written again, a hand-run one never', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-seo-dirs-'));
  assert.equal(await nextAuditDir(root), 'seo-audit-1');
  for (const name of ['seo-audit', 'seo-audit-2', 'seo-audit-3', 'seo-audit-extra']) await mkdir(join(root, 'docs/research', name), { recursive: true });
  assert.deepEqual((await auditDirs(root)).map((dir) => [dir.n, dir.name]), [[1, 'seo-audit'], [2, 'seo-audit-2'], [3, 'seo-audit-3']]);
  assert.equal(await nextAuditDir(root), 'seo-audit-4', 'seo-audit-3 is a hand-run audit: never written over');
  await mkdir(join(root, 'docs/research/seo-audit-4'));
  await writeFile(join(root, 'docs/research/seo-audit-4/.audit-pending'), 'started');
  assert.equal(await nextAuditDir(root), 'seo-audit-4', 'the unfinished audit is done again in its folder');
  assert.equal(await latestAudit(root), null, 'no finished audit of this pipeline');
});

test('the issue list is checked against its schema and what the schema cannot say', async () => {
  const good = findingsDoc({ audit: 'docs/research/seo-audit-1', site: 'https://x.com', date: '2026-11-17', findings: [finding('H-1', 'high'), finding('C-M1', 'medium', { owner: 'sf', evidence: { kind: 'google-rules', doc: 'Creating helpful, reliable, people-first content', quote: 'Of these aspects, trust is most important.' } })] });
  assert.deepEqual(await validateFindings(good), []);
  assert.deepEqual((await validateFindings(findingsDoc({ audit: 'a', findings: good.findings, only: 'sf' }))).length, 0, 'findingsDoc keeps only the owner it names');
  assert.match((await validateFindings({ ...good, findings: [finding('H-1', 'severe')] })).join('\n'), /severity/);
  assert.match((await validateFindings({ ...good, findings: [{ ...finding('H-1', 'high'), owner: 'template' }] })).join('\n'), /owner/);
  assert.match((await validateFindings({ ...good, findings: [{ ...finding('H-1', 'high'), evidence: { kind: 'report' } }] })).join('\n'), /evidence/);
  assert.match((await validateFindings({ ...good, findings: [finding('H-1', 'high'), finding('H-1', 'low')] })).join('\n'), /used twice/);
  assert.match((await validateFindings({ ...good, findings: [finding('H-1', 'high', { evidence: { kind: 'google-rules', doc: 'd', quote: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen' } })] })).join('\n'), /16 words/);
  assert.match((await validateFindings({ ...good, only: 'sf', findings: [finding('H-1', 'high')] })).join('\n'), /owner 08 in a list of sf items/);
  const { required } = JSON.parse(await readFile(new URL('../../config/claude-seo-findings.schema.json', import.meta.url), 'utf8')).$defs.finding;
  assert.deepEqual(required, ['id', 'severity', 'url', 'location', 'problem', 'evidence', 'owner', 'fix'], 'the fields the owner asked for (2026-11-17)');
});

test('a location is looked for in the release build: markup or text, entities and curly quotes alike, fragments in order, nothing outside the audit folder', () => {
  const dir = resolve('/site', 'docs/research/seo-audit-1');
  assert.equal(findingFile(dir, '/'), resolve(dir, 'dist-release', 'index.html'));
  assert.equal(findingFile(dir, '/about-us/'), resolve(dir, 'dist-release', 'about-us', 'index.html'));
  assert.equal(findingFile(dir, 'https://x.com/about-us'), resolve(dir, 'dist-release', 'about-us', 'index.html'));
  assert.equal(findingFile(dir, '/robots.txt'), resolve(dir, 'dist-release', 'robots.txt'));
  assert.equal(findingFile(dir, 'server/x.com.conf'), resolve(dir, 'server', 'x.com.conf'));
  assert.equal(findingFile(dir, '/../../../site.json'), null);
  assert.equal(findingFile(dir, 'src/data/site.json'), null);
  const html = '<main><h2>Brands we make for</h2><p>Men&#39;s trunks &amp; briefs, made <em>around the clock</em> in Guangzhou.</p></main>';
  assert.ok(locationIn(html, '<h2>Brands we make for</h2>'));
  assert.ok(locationIn(html, 'Men’s trunks & briefs, made around the clock'));
  assert.ok(locationIn(html, '"Men\'s trunks … in Guangzhou."'));
  assert.ok(!locationIn(html, 'in Guangzhou … Men\'s trunks'), 'fragments in order');
  assert.ok(!locationIn(html, 'made in Vietnam'));
});

test('only critical and high items both checks confirm hold the launch; a wrong owner is corrected; the score never holds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-seo-check-'));
  const dir = join(root, 'docs/research/seo-audit-1');
  await mkdir(join(dir, 'dist-release/about-us'), { recursive: true });
  await writeFile(join(dir, 'dist-release/index.html'), '<main><h2>Brands we make for</h2></main>');
  await writeFile(join(dir, 'dist-release/about-us/index.html'), '<p>We keep our clients anonymous</p>');
  const findings = [
    finding('H-1', 'high', { pages: ['/about-us/'], location: 'We keep our clients anonymous' }),
    finding('H-2', 'high', { location: 'not on any page' }),
    finding('C-1', 'critical'),
    finding('H-3', 'high', { owner: 'sf' }),
    finding('M-1', 'medium', { location: 'not on any page' }),
  ];
  const located = await checkLocations(dir, findings);
  assert.deepEqual(Object.keys(located), ['H-1', 'H-2', 'C-1', 'H-3'], 'medium and low are not checked');
  assert.deepEqual(located['H-1'], { found: true, file: 'dist-release/about-us/index.html' }, 'found on one of its other pages');
  assert.equal(located['H-2'].found, false);
  const check = checkRecord(findings, located, { verdicts: [{ id: 'H-1', verdict: 'wrong_owner', owner: 'owner', note: 'a decision' }, { id: 'C-1', verdict: 'confirmed' }, { id: 'H-2', verdict: 'confirmed' }] });
  assert.deepEqual(check.holds, ['H-1', 'C-1'], 'H-2 is void (code), H-3 has no verdict');
  assert.match(check.items.find((item) => item.id === 'H-2').note, /void/);
  const corrected = withCorrectedOwners(findings, check);
  assert.equal(corrected.find((item) => item.id === 'H-1').owner, 'owner');
  assert.deepEqual(auditHolds({ findings: { findings: corrected }, check }).map((item) => item.id), ['H-1', 'C-1']);
  assert.equal(healthScore([{ name: 'Technical SEO', score: 80 }, { name: 'Content Quality', score: 40 }, { name: 'Images', score: null }]), Math.round((80 * 22 + 40 * 23) / 45));
});

test('two auditors\' findings merge only on the same page, an overlapping location and a problem alike; when unsure they stay two', () => {
  assert.deepEqual(['/about-us', '/about-us/', 'https://x.com/about-us?x=1', '/robots.txt', 'server/x.conf', '/'].map(findingRoute), ['/about-us/', '/about-us/', '/about-us/', '/robots.txt', 'server/x.conf', '/']);
  assert.ok(locationsOverlap('Trunks, Briefs and Board Shorts | Strandmill', '<title>Trunks, Briefs and Board Shorts | Strandmill</title>'), 'one lies whole in the other');
  assert.ok(locationsOverlap('we handle duties, customs and freight for you', 'Door to door: we handle duties, customs and freight'), 'they share 20 characters running');
  assert.ok(!locationsOverlap('we handle duties', 'we handle samples'), 'a short common start is not one passage');
  assert.ok(!locationsOverlap('', 'anything'));
  // site13's two audits of 2026-11-17: the same problem in other words, and two problems on one passage.
  assert.ok(problemSimilarity('title 73 字符，手机搜索结果里大概率被截断。', '标题长 73 字符，会在搜索结果中被截断，品牌名可能显示不全。') >= 0.3);
  assert.ok(problemSimilarity('首页手机端页面高 24,080 px、桌面 21,265 px，滚动成本高。', '按业主规则 5，首页主关键词应出现在首屏副标题。但首页 hero 只有 H1 和按钮，没有副标题') < 0.3);
  const title = finding('O-L1', 'low', { section: 'on-page', url: '/men/', location: 'Trunks, Briefs and Board Shorts | Strandmill', problem: 'title 73 字符，手机搜索结果里大概率被截断。' });
  const same = { ...title, id: 'L-1', url: 'https://strandmill.com/men', location: '<title>Trunks, Briefs and Board Shorts | Strandmill</title>', problem: '标题长 73 字符，会在搜索结果中被截断，品牌名可能显示不全。' };
  assert.ok(sameFinding(title, same) >= 0.3);
  assert.equal(sameFinding(title, { ...same, url: '/women/' }), null, 'another page');
  assert.equal(sameFinding(title, { ...same, location: 'Swim trunks for your brand' }), null, 'another passage');
  assert.equal(sameFinding(title, { ...same, problem: '首页手机端页面高 24,080 px，滚动成本高。' }), null, 'another problem on the same passage');
});

test('the merged list: one item per problem, reported_by its auditors, the highest severity, every page, new ids; each auditor\'s severity kept', () => {
  const h1 = finding('H-1', 'high', { pages: ['/about-us/'], problem: '首页列出 6 个具名客户品牌，与关于页的客户匿名说法矛盾' });
  const a1 = [h1, finding('M-1', 'medium', { url: '/faq/', location: 'Lead times', problem: '交期说法前后不一' })];
  const a2 = [{ ...h1, id: 'C-2', severity: 'medium', pages: ['/case-studies/'] }, { ...h1, id: 'C-3', severity: 'low' }];
  const a3 = [{ ...h1, id: 'X-9', severity: 'critical', url: '/about-us', pages: ['/'] }, finding('L-4', 'low', { url: '/faq/', location: 'Lead times', problem: 'FAQ 的 H2 层级跳级，缺少 H3' })];
  const merged = mergeFindings([{ auditor: 'a1', findings: a1 }, { auditor: 'a2', findings: a2 }, { auditor: 'a3', findings: a3 }]);
  assert.deepEqual(merged.findings.map((item) => [item.id, item.severity, item.reported_by]), [
    ['C-1', 'critical', ['a3']],
    ['H-1', 'high', ['a1', 'a2']],
    ['M-1', 'medium', ['a1']],
    ['L-1', 'low', ['a2']],
    ['L-2', 'low', ['a3']],
  ], 'by severity, then by how many reported it');
  // a2's second copy of the same problem stays apart (one auditor is never merged with itself); a3's is on another
  // page (/about-us/, not /); the two FAQ findings share a passage but not a problem.
  const top = merged.findings.find((item) => item.id === 'H-1');
  assert.deepEqual([top.location, top.pages, top.problem], [h1.location, ['/about-us/', '/case-studies/'], h1.problem], 'the most severe finding\'s text, every page');
  assert.deepEqual(merged.groups.find((group) => group.id === 'H-1').members, [{ auditor: 'a1', id: 'H-1', severity: 'high' }, { auditor: 'a2', id: 'C-2', severity: 'medium' }]);
  assert.deepEqual(merged.locations['H-1'], [h1.location]);
  assert.equal(new Set(merged.findings.map((item) => item.id)).size, merged.findings.length, 'ids unique');
  assert.deepEqual([median([80, 60, 70]), median([80, 61]), median([75]), median([null, 50, 90]), median([])], [70, 71, 75, 70, null]);
});

test('reported_by is in the schema; an issue list without it (one auditor, before 2026-11-17) reads as before', async () => {
  const old = findingsDoc({ audit: 'docs/research/seo-audit-4', site: 'https://x.com', date: '2026-11-17', findings: [finding('H-1', 'high')] });
  assert.deepEqual(await validateFindings(old), []);
  assert.deepEqual(await validateFindings({ ...old, findings: [finding('H-1', 'high', { reported_by: ['a1', 'a3'] })] }), []);
  assert.match((await validateFindings({ ...old, findings: [finding('H-1', 'high', { reported_by: [] })] })).join('\n'), /reported_by/);
  assert.match((await validateFindings({ ...old, findings: [finding('H-1', 'high', { reported_by: ['a1', 'a1'] })] })).join('\n'), /reported_by/);
  const auditors = await readAuditors();
  assert.deepEqual(auditors.map((auditor) => auditor.model), ['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'], 'two Opus and one other Claude model (owner 2026-11-17)');
  const dir = await mkdtemp(join(tmpdir(), 'claude-seo-auditors-'));
  await writeFile(join(dir, 'twice.json'), JSON.stringify({ auditors: [{ id: 'a1', model: 'm' }, { id: 'a1', model: 'm' }] }));
  await assert.rejects(readAuditors(join(dir, 'twice.json')), /unique/);
});

test('a merged item is located by any of its auditors\' locations, and then shows the one found', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-seo-alt-'));
  await mkdir(join(dir, 'dist-release'), { recursive: true });
  await writeFile(join(dir, 'dist-release/index.html'), '<main><h2>Brands we make for</h2></main>');
  const item = finding('H-1', 'high', { location: '<h2>Brands we make for our clients</h2>' });
  assert.equal((await checkLocations(dir, [item]))['H-1'].found, false);
  const located = await checkLocations(dir, [item], undefined, { 'H-1': [item.location, 'Brands we make for'] });
  assert.deepEqual(located['H-1'], { found: true, file: 'dist-release/index.html', location: 'Brands we make for' });
  assert.equal(withFoundLocations([item], located)[0].location, 'Brands we make for');
});

test('the audit server answers like the Nginx config: 301 to the slash, 404.html with status 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claude-seo-serve-'));
  await mkdir(join(dir, 'about-us'), { recursive: true });
  await writeFile(join(dir, 'index.html'), 'home');
  await writeFile(join(dir, 'about-us/index.html'), 'about');
  await writeFile(join(dir, '404.html'), 'missing page');
  const server = await serveAudit(dir);
  try {
    const moved = await fetch(`${server.origin}/about-us`, { redirect: 'manual' });
    assert.deepEqual([moved.status, moved.headers.get('location')], [301, '/about-us/']);
    assert.equal(await (await fetch(`${server.origin}/about-us/`)).text(), 'about');
    const missing = await fetch(`${server.origin}/nope/`);
    assert.deepEqual([missing.status, await missing.text()], [404, 'missing page']);
  } finally {
    await server.close();
  }
  const pages = [{ route: '/a/', pageType: 'service' }, { route: '/', pageType: 'home' }, { route: '/b/', pageType: 'service' }, { route: '/c/', pageType: 'about' }];
  assert.deepEqual(focusPages(pages, 3).map((page) => page.route), ['/', '/a/', '/c/'], 'home, then one page of each type, then the rest in order');
  assert.deepEqual([pageSlug('/'), pageSlug('/about-us/'), pageSlug('/404.html')], ['home', 'about-us', '404']);
});

test("the audit asks the site's judge with one tool more: curl to the local rules library", async () => {
  const { withRulesTool, rulesTool } = await import('../claude-seo-audit.mjs');
  let seen = null;
  await withRulesTool(async (run) => { seen = run.args; return { code: 0, stdout: '', stderr: '' }; }, 'http://127.0.0.1:9382/mcp')({ args: claudeArgs({ sandbox: 'read-only' }), prompt: 'p' });
  const tools = seen.slice(seen.indexOf('--allowedTools') + 1);
  assert.deepEqual(tools, ['Read', 'Glob', 'Grep', 'Bash(curl -s -m 60 -X POST http://127.0.0.1:9382/mcp:*)']);
  assert.equal(rulesTool('http://h/mcp'), 'Bash(curl -s -m 60 -X POST http://h/mcp:*)');
});

// lower: every score that much lower (another auditor's reading).
const reply = (findings, lower = 0) => ({
  business_type: 'B2B 制造商', not_covered: ['Search Console'],
  weighted: [['Technical SEO', 90], ['Content Quality', 60], ['On-Page SEO', 80], ['Schema / Structured Data', 80], ['Performance (CWV)', 85], ['AI Search Readiness', 70], ['Images', 80]].map(([name, score]) => ({ name, score: score - lower })),
  checklists: ['seo-technical', 'seo-content', 'seo-schema', 'seo-sitemap', 'seo-geo', 'seo-agentic', 'seo-sxo', 'seo-performance', 'seo-visual'].map((name) => ({ name, score: 80 - lower, verdict: '可以' })),
  sections: { content: { what_works: ['内容具体'] } },
  rule_differences: [{ topic: '字数', claude_seo: '服务页 800 词', rules_library: '《SEO Starter Guide》"no magical word count"', handling: '只作参考' }],
  findings,
});

async function seedSite(root) {
  for (const dir of ['dist/about-us', 'src/data', 'docs/research/seo-audit-3', 'claude-seo/skills/seo-audit', 'claude-seo/agents']) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<main><h1>Swimwear Made for Your Brand</h1><h2>Brands we make for</h2></main>');
  await writeFile(join(root, 'dist/about-us/index.html'), '<main><p>We keep our clients anonymous</p></main>');
  await writeFile(join(root, 'site.json'), JSON.stringify({ siteKind: 'a swimwear factory' }));
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Strandmill', origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'home', route: '/', pageType: 'home', status: 'authored', seo: { title: 'Home', description: 'd', canonical: '/' }, blocks: [] }, { id: 'about', route: '/about-us/', pageType: 'about', status: 'authored', seo: { title: 'About', description: 'd', canonical: '/about-us/' }, blocks: [] }]));
  await writeFile(join(root, 'docs/research/audit-waivers.json'), JSON.stringify({ waivers: [{ text: 'The factory runs two shifts', by: 'owner' }] }));
  await writeFile(join(root, 'docs/research/seo-audit-3/FULL-AUDIT-REPORT.md'), 'hand-run');
  await writeFile(join(root, 'claude-seo/skills/seo-audit/SKILL.md'), 'skill');
  for (const name of ['seo-technical', 'seo-content', 'seo-schema', 'seo-sitemap', 'seo-geo', 'seo-agentic', 'seo-sxo', 'seo-performance', 'seo-visual']) await writeFile(join(root, 'claude-seo/agents', `${name}.md`), name);
}

const answer = async ({ lastMessage }, json) => {
  await mkdir(dirname(lastMessage), { recursive: true });
  await writeFile(lastMessage, `\`\`\`json\n${JSON.stringify(json)}\n\`\`\``);
  return { code: 0, stderr: '' };
};
const measureStub = (measured = []) => async ({ dir, pages }) => { measured.push(pages.map((page) => page.route)); assert.ok(existsSync(join(dir, 'dist-release/index.html')), 'the build is copied before it is measured'); return { playwright: '1.62.1', focus: ['/', '/about-us/'] }; };
const probe = async () => ({ ok: true });
const clients = '首页列出 6 个具名客户品牌，与关于页"客户匿名"的说法矛盾';

test('three auditors at once on one set of measurements; their findings merged, the median score, one verification, and the preflight holds on what both checks confirm', async () => {
  const { claudeSeoAudit } = await import('../claude-seo-audit.mjs');
  const root = await mkdtemp(join(tmpdir(), 'claude-seo-run-'));
  await seedSite(root);
  const env = { CLAUDE_SEO_DIR: join(root, 'claude-seo') };
  const dir = join(root, 'docs/research/seo-audit-4');
  const byAuditor = {
    a1: reply([
      finding('H-1', 'high', { pages: ['/about-us/'], problem: clients }),
      finding('H-2', 'high', { location: 'a sentence the build does not have', problem: '首页承诺 24 小时发货' }),
      finding('C-M1', 'medium', { owner: 'sf', url: '/about-us/', location: 'We keep our clients anonymous', problem: '关于页说客户匿名' }),
      finding('O-M1', 'medium', { owner: 'owner', section: 'on-page', location: 'Swimwear Made for Your Brand', problem: '首页 H1 不含主关键词', fix: '业主规则：首页 H1 是品牌主张，不改' }),
    ]),
    a2: reply([finding('B-1', 'high', { problem: clients }), finding('B-M4', 'medium', { url: '/about-us/', location: 'We keep our clients anonymous', problem: '页面缺少团队照片' })], 10),
    // a3 rates the shared problem lower and alone reports a high one: it is checked like the others.
    a3: reply([finding('Z-1', 'medium', { problem: clients }), finding('Z-2', 'high', { location: 'Swimwear Made for Your Brand', problem: '首屏没有说明这是工厂，买家看不出能代工' })], 20),
  };
  const calls = [];
  let started = 0;
  let allStarted;
  const together = new Promise((done) => { allStarted = done; });
  const judge = async (options) => {
    const id = options.label.split(' ').at(-1);
    calls.push({ id, model: options.model, sandbox: options.sandbox, prompt: options.prompt, lastMessage: options.lastMessage });
    started += 1;
    if (started === 3) allStarted();
    // Each waits for the other two to start: run one after another, the three would never all start.
    const late = new Promise((_, fail) => setTimeout(() => fail(new Error('the auditors did not run at once')), 5000).unref());
    await Promise.race([together, late]);
    assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith('audit-reply')), [], 'no auditor can read another\'s reply in the audit folder');
    return answer(options, byAuditor[id]);
  };
  const verifyPrompts = [];
  const verifyJudge = (options) => { verifyPrompts.push(options.prompt); return answer(options, { verdicts: [{ id: 'H-1', verdict: 'confirmed', note: '首页列了品牌名' }, { id: 'H-3', verdict: 'confirmed', note: '首屏只有品牌主张' }] }); };
  const measured = [];
  const result = await claudeSeoAudit({ root, judge, verifyJudge, measure: measureStub(measured), probe, env, date: '2026-11-17' });
  assert.equal(result.dir, 'docs/research/seo-audit-4', 'after the hand-run seo-audit-3');
  for (const file of ['findings.json', 'findings_sf.json', 'findings-check.json', 'findings-merge.json', 'audit-data.json', 'FULL-AUDIT-REPORT.md', 'ACTION-PLAN.md', 'audit-reply-a1.md', 'audit-reply-a2.md', 'audit-reply-a3.md', 'server/strandmill.com.conf', 'server/strandmill.com-headers.conf', 'server/answers.md', 'method/SKILL.md', 'method/agents/seo-visual.md', 'dist-release/about-us/index.html']) assert.ok(existsSync(join(dir, file)), file);
  assert.ok(!existsSync(join(dir, '.audit-pending')));
  assert.deepEqual(measured, [['/', '/about-us/']], 'measured once for all three');
  // Three runs, read only, two Opus and one Sonnet, the same instructions.
  assert.deepEqual(calls.map((call) => [call.id, call.model, call.sandbox]).sort(), [['a1', 'claude-opus-5-5', 'read-only'], ['a2', 'claude-opus-5-5', 'read-only'], ['a3', 'claude-sonnet-5-5', 'read-only']]);
  assert.equal(new Set(calls.map((call) => call.prompt)).size, 1, 'every auditor is told the same');
  assert.ok(calls.every((call) => !call.lastMessage.startsWith(dir)), 'replies are written outside the audit folder while the auditors run');
  // The audit is told the site, the owner's rules and waivers, where everything is, and how to ask the rules library.
  const [{ prompt }] = calls;
  assert.ok(!prompt.includes('{{'), 'every value of the step is filled');
  assert.match(prompt, /The factory runs two shifts/);
  assert.match(prompt, /home page H1 is the brand's claim/);
  assert.match(prompt, /\| \/about-us\/ \| about \| docs\/research\/seo-audit-4\/dist-release\/about-us\/index\.html \|/);
  assert.match(prompt, /curl -s -m 60 -X POST http:\/\/127\.0\.0\.1:9382\/mcp -H "Content-Type: application\/json"/);
  assert.match(prompt, /google-search-current-2026-09-19/);

  // The merge: the shared problem once (three reporters, the highest severity), the rest as each auditor gave them.
  const list = JSON.parse(await readFile(join(dir, 'findings.json'), 'utf8'));
  assert.deepEqual(await validateFindings(list), []);
  assert.deepEqual(list.findings.map((item) => [item.id, item.severity, item.reported_by.join(',')]), [['H-1', 'high', 'a1,a2,a3'], ['H-2', 'high', 'a1'], ['H-3', 'high', 'a3'], ['M-1', 'medium', 'a1'], ['M-2', 'medium', 'a1'], ['M-3', 'medium', 'a2']]);
  const record = JSON.parse(await readFile(join(dir, 'findings-merge.json'), 'utf8'));
  assert.deepEqual(record.items[0].members, [{ auditor: 'a1', id: 'H-1', severity: 'high' }, { auditor: 'a2', id: 'B-1', severity: 'high' }, { auditor: 'a3', id: 'Z-1', severity: 'medium' }]);
  assert.deepEqual(record.auditors.map((auditor) => [auditor.id, auditor.status, auditor.health_score]), [['a1', 'done', 77], ['a2', 'done', 67], ['a3', 'done', 57]]);
  // One verification, of the merged items code found (the one-auditor H-3 too), without the votes or the score.
  assert.equal(verifyPrompts.length, 1);
  assert.match(verifyPrompts[0], /"id": "H-1"/);
  assert.match(verifyPrompts[0], /"id": "H-3"/);
  assert.ok(!verifyPrompts[0].includes('"H-2"') && !verifyPrompts[0].includes('reported_by') && !verifyPrompts[0].includes('"score"'));
  const sf = JSON.parse(await readFile(join(dir, 'findings_sf.json'), 'utf8'));
  assert.deepEqual([sf.only, sf.findings.map((item) => item.id), sf.findings[0].reported_by], ['sf', ['M-1'], ['a1']]);
  assert.deepEqual(await validateFindings(sf), []);
  const data = JSON.parse(await readFile(join(dir, 'audit-data.json'), 'utf8'));
  assert.deepEqual([data.summary.health_score, data.counts.auditors], [67, { planned: 3, done: 3 }], 'the median of 77, 67 and 57');
  const report = await readFile(join(dir, 'FULL-AUDIT-REPORT.md'), 'utf8');
  assert.match(report, /\*\*SEO Health Score 总分\*\* \| 100% \| 77 \| 67 \| 57 \| — \| \*\*67 \/ 100\*\*/);
  assert.match(report, /\| Technical SEO \| 22% \| 90 \| 80 \| 70 \| 80 \|/);
  assert.match(report, /\| seo-technical \| 80 \| 70 \| 60 \| 70 \|/);
  assert.match(report, /3 个审计员全部完成/);
  assert.match(report, /报出：a1、a2、a3（3 个完成的审计员中 3 个报出；各自严重度：a1 High、a2 High、a3 Medium，取最高）/);
  assert.match(report, /\| H-1 \| High \| 3：a1、a2、a3 \| a1 H-1（High）、a2 B-1（High）、a3 Z-1（Medium） \|/);
  assert.match(report, /H-2[\s\S]*作废/);
  assert.match(report, /没有覆盖的内容[\s\S]*Search Console/);
  assert.match(await readFile(join(dir, 'ACTION-PLAN.md'), 'utf8'), /阶段 1：拦截上线[\s\S]*H-1[\s\S]*a1、a2、a3/);
  assert.deepEqual(result.holds.map((item) => item.id), ['H-1', 'H-3'], 'an item only one auditor reported holds too when both checks confirm it');

  // The preflight: the audit of this build holds on H-1 and H-3, routed to the template; another build is not audited.
  const latest = await latestAudit(root);
  const checks = CHECKS.filter((check) => check.code.startsWith('claude_seo_audit'));
  const ctx = { pages: [], built: new Map(), claudeSeoAudit: { latest, release: latest.data.release } };
  const gate = runChecks(ctx, checks);
  assert.deepEqual(gate.holds.map((hold) => hold.code), ['claude_seo_audit_blocking:template', 'claude_seo_audit_blocking:template']);
  assert.deepEqual(gate.holds[0].items, ['/', '/about-us/']);
  assert.match(gate.holds[0].detail, /报出：a1、a2、a3/);
  assert.deepEqual(gate.notices.map((notice) => notice.code), ['claude_seo_audit_open']);
  assert.match(runChecks({ ...ctx, claudeSeoAudit: { latest, release: { key: 'other' } } }, checks).holds[0].detail, /audited another release build/);
  const rebuilt = runChecks({ ...ctx, claudeSeoAudit: { latest, release: { key: 'other', server: latest.data.release.server }, sources: latest.data.sources } }, checks);
  assert.equal(rebuilt.holds.filter((hold) => hold.code === 'claude_seo_audit_blocking:template').length, 2, 'a rebuild of the same sources with the same server config is the audited build');
  assert.match(runChecks({ ...ctx, claudeSeoAudit: { latest: null, release: null } }, checks).holds[0].detail, /no claude-seo audit/);
  assert.deepEqual(runChecks({ ...ctx, claudeSeoAudit: null }, checks).holds, [], 'off with llmAudit: false');

  // Unchanged build, config, instructions and auditors: the audit stands, nobody is asked; other auditors are another
  // audit (it goes on to ask the rules library, which here does not answer); a changed build is audited again.
  const again = await claudeSeoAudit({ root, judge: () => assert.fail('not asked'), verifyJudge, measure: measureStub(), probe, env });
  assert.equal(again.reused.dir, 'docs/research/seo-audit-4');
  assert.equal(JSON.parse(await readFile(join(dir, 'audit-data.json'), 'utf8')).rules.retrieved, true);
  // An audit made before its rules were seen retrieved does not stand (aloha 2026-11-18: its auditors read no rule).
  const stale = JSON.parse(await readFile(join(dir, 'audit-data.json'), 'utf8'));
  await writeFile(join(dir, 'audit-data.json'), JSON.stringify({ ...stale, rules: { name: stale.rules.name, snapshot: stale.rules.snapshot } }));
  const redo = await claudeSeoAudit({ root, judge: () => assert.fail('not asked'), verifyJudge, measure: measureStub(), probe: async () => ({ ok: false, detail: 'down' }), env });
  assert.equal(redo.failed, 'unavailable', 'audited again, so the rules library is asked');
  await writeFile(join(dir, 'audit-data.json'), JSON.stringify(stale));
  // The probe asks for rules, not for an answer: the MCP's error text in a result is no library.
  const { retrievedRules } = await import('../claude-seo-audit.mjs');
  const ragReply = (text) => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] } });
  assert.equal(retrievedRules(ragReply(JSON.stringify({ chunks: [{ content: 'Use rel=canonical' }] }))).ok, true);
  assert.equal(retrievedRules(`event: message
data: ${ragReply(JSON.stringify({ chunks: [{ content: 'x' }] }))}`).ok, true);
  assert.equal(retrievedRules(ragReply('[Errno -2] Name or service not known')).ok, false);
  assert.equal(retrievedRules(ragReply(JSON.stringify({ chunks: [] }))).ok, false);
  const fewer = join(root, 'auditors.json');
  await writeFile(fewer, JSON.stringify({ auditors: [{ id: 'a1', model: 'claude-opus-5-5' }] }));
  const other = await claudeSeoAudit({ root, judge: () => assert.fail('not asked'), verifyJudge, measure: measureStub(), probe: async () => ({ ok: false, detail: 'down' }), env, auditorsFile: fewer });
  assert.equal(other.failed, 'unavailable', 'one auditor instead of three: not the audit that stands');
  await writeFile(join(root, 'dist/index.html'), '<main><h1>Swimwear Made for Your Brand</h1><p>new</p></main>');
  assert.notEqual((await releaseKey(join(root, 'dist'), null)).dist, latest.data.release.dist);
  const waits = await claudeSeoAudit({ root, judge, verifyJudge, measure: measureStub(), probe: async () => ({ ok: false, detail: 'refused' }), env });
  assert.equal(waits.failed, 'unavailable', 'the rules library down: the step waits');
  await writeFile(join(root, 'site.json'), JSON.stringify({ llmAudit: false }));
  assert.deepEqual(await claudeSeoAudit({ root, judge, env }), { skipped: 'site.json llmAudit is false' });
  assert.equal(llmAuditOn({}), true, 'on by default (owner 2026-11-17)');
  assert.equal(llmAuditOn(null), false);
});

test('an auditor that fails or times out is left out and the report says how many finished; with none finished the step waits or fails as before', async () => {
  const { claudeSeoAudit } = await import('../claude-seo-audit.mjs');
  const root = await mkdtemp(join(tmpdir(), 'claude-seo-partial-'));
  await seedSite(root);
  const env = { CLAUDE_SEO_DIR: join(root, 'claude-seo') };
  const outcomes = {
    a1: (options) => answer(options, reply([finding('H-1', 'high', { problem: clients })])),
    a2: async () => ({ code: 1, stderr: 'timed out after 3600s' }),
    a3: async ({ lastMessage }) => { await mkdir(dirname(lastMessage), { recursive: true }); await writeFile(lastMessage, 'no JSON here'); return { code: 0, stderr: '' }; },
  };
  const judge = (options) => outcomes[options.label.split(' ').at(-1)](options);
  const verifyJudge = (options) => answer(options, { verdicts: [{ id: 'H-1', verdict: 'confirmed', note: '成立' }] });
  const result = await claudeSeoAudit({ root, judge, verifyJudge, measure: measureStub(), probe, env, date: '2026-11-17' });
  assert.deepEqual(result.data.counts.auditors, { planned: 3, done: 1 });
  assert.deepEqual(result.data.summary.auditors.map((auditor) => [auditor.id, auditor.status]), [['a1', 'done'], ['a2', 'audit'], ['a3', 'audit']]);
  assert.equal(result.data.summary.health_score, 77, 'the one finished score');
  assert.deepEqual(result.holds.map((item) => [item.id, item.reported_by]), [['H-1', ['a1']]]);
  const report = await readFile(join(root, result.dir, 'FULL-AUDIT-REPORT.md'), 'utf8');
  assert.match(report, /只有 1 \/ 3 个审计员完成/);
  assert.match(report, /a2（claude-opus-5-5）未完成：timed out/);
  assert.match(report, /\*\*SEO Health Score 总分\*\* \| 100% \| — \| \*\*77 \/ 100\*\*/, 'one finished: no column per auditor');

  // None finished: a limit or a sign-in waits; anything else fails, as the one audit did.
  await writeFile(join(root, 'dist/index.html'), '<main><h1>Swimwear Made for Your Brand</h1><p>changed</p></main>');
  const limited = await claudeSeoAudit({ root, judge: async () => ({ code: 1, stderr: 'usage limit reached (Claude)' }), verifyJudge, measure: measureStub(), probe, env });
  assert.equal(limited.failed, 'unavailable');
  assert.match(limited.detail, /a1 \(claude-opus-5-5\)[\s\S]*a3 \(claude-sonnet-5-5\)/);
  const broken = await claudeSeoAudit({ root, judge: outcomes.a3, verifyJudge, measure: measureStub(), probe, env });
  assert.deepEqual([broken.failed, /no JSON/.test(broken.detail)], ['audit', true]);
});

test('a reply without the categories and checklists the step asks for is refused', () => {
  assert.throws(() => normalizeReply({ weighted: [{ name: 'Vibes', score: 1 }], checklists: [], findings: [] }), /unknown weighted category/);
  const partial = reply([]);
  assert.throws(() => normalizeReply({ ...partial, checklists: partial.checklists.slice(1) }), /no seo-technical/);
  assert.throws(() => normalizeReply({ ...partial, findings: undefined }), /no findings list/);
  assert.equal(normalizeReply(partial).sections.technical.what_works.length, 0);
});
