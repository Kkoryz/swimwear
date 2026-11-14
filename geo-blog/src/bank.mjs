import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BUYING_STAGES, OwnerNeeded } from './config.mjs';
import { MINER_STAGE_MAP, stageCoverage } from './questions.mjs';
import { judge } from './judge.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const readBank = (file) => { const data = readJson(file); return Array.isArray(data) ? data : data.questions; };
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const bankKey = (config) => `${config.keyword.toLowerCase().trim()}|${config.market ?? ''}`;

// Serper credits a seed list costs in 02-harvest: a search per seed, autocomplete for short seeds, a community search.
export function harvestCredits(seeds, minerConfig) {
  const skip = new Set(minerConfig.harvest?.serperSkip ?? []);
  const community = (minerConfig.harvest?.community ?? 'serper') === 'serper';
  const maxWords = minerConfig.autocompleteMaxWords ?? 4;
  return seeds.filter((s) => !skip.has(s.seed))
    .reduce((n, s) => n + 1 + (s.seed.trim().split(/\s+/).length <= maxWords ? 1 : 0) + (community ? 1 : 0), 0);
}

// Every buying stage needs questions in the bank, or the picker cannot fill it and the exit check fails.
export const stagesPresent = (bank, stages = MINER_STAGE_MAP) => BUYING_STAGES.filter((s) => bank.some((q) => stages[q.stage] === s));
const MIN_SEEDS_PER_STAGE = 2;
export const seedsByStage = (seeds, stages = MINER_STAGE_MAP) => BUYING_STAGES.map((s) => `${s} ${seeds.filter((x) => stages[x.stage] === s).length}`).join(', ');

// The judge's kept and added seeds, topped up from the dropped ones (in proposal order) until every buying stage has
// MIN_SEEDS_PER_STAGE. Stages that still have none are returned as missing.
export function balanceSeeds(proposed, { keep = [], add = [] }, stages = MINER_STAGE_MAP) {
  const kept = new Set(keep);
  const seeds = [...proposed.filter((s) => kept.has(s.seed)), ...add.filter((s) => s?.seed && stages[s.stage] && !kept.has(s.seed))];
  const restored = [];
  for (const stage of BUYING_STAGES) {
    const inStage = (x) => stages[x.stage] === stage;
    for (const s of proposed.filter((x) => inStage(x) && !seeds.includes(x))) {
      if (seeds.filter(inStage).length >= MIN_SEEDS_PER_STAGE) break;
      seeds.push(s);
      restored.push(s.seed);
    }
  }
  return { seeds, restored, missing: BUYING_STAGES.filter((stage) => !seeds.some((x) => stages[x.stage] === stage)) };
}

// The run's question bank: kept when it covers the keyword (and has questions in all four stages); else the bank cached
// for this keyword and market; else geo-question-miner builds one (01-research, seeds the current bank already covers
// dropped by a judge but at least two per stage, a Serper quote that waits for --approve, then 02–04). The chosen bank
// is written into config.json.
export async function ensureBank(config, { approve = false, log = console.log, runMiner = runMinerStep } = {}) {
  const focus = config.focus_terms ?? [];
  const stageMap = config.stages ?? MINER_STAGE_MAP;
  const covered = (file) => stageCoverage(readBank(file), { keyword: config.keyword, focus, stages: stageMap });
  const complete = (file) => stagesPresent(readBank(file), stageMap).length === BUYING_STAGES.length;
  if (config.question_bank && existsSync(config.question_bank)) {
    const stages = covered(config.question_bank);
    if (stages.length >= config.bank_min_stages && complete(config.question_bank)) return log(`question bank covers ${stages.join(', ')}: kept`);
    log(`question bank covers ${stages.length}/4 stages for "${config.keyword}" (${stages.join(', ') || 'none'})`);
  }
  const registryFile = config.bank_registry ?? join(config.miner_dir, 'runs', 'geo-banks.json');
  const registry = existsSync(registryFile) ? readJson(registryFile) : {};
  const cached = registry[bankKey(config)] && resolve(config.miner_dir, registry[bankKey(config)]);
  if (cached && existsSync(cached) && complete(cached)) {
    useBank(config, cached);
    return log(`question bank for "${bankKey(config)}" reused: ${cached} (covers ${covered(cached).join(', ') || 'none'})`);
  }

  const dir = join(config.miner_dir, 'runs', `geo-${slug(config.keyword)}`);
  const minerConfigFile = join(dir, 'config.json');
  if (!existsSync(minerConfigFile)) {
    const baseFile = config.question_bank && join(dirname(config.question_bank), 'config.json');
    const fromBase = Boolean(baseFile && existsSync(baseFile));
    const base = fromBase ? readJson(baseFile) : freshMinerConfig(config);
    const next = {
      ...base,
      niche: fromBase ? `${config.keyword}${focus.length ? ` (${focus.join(', ')})` : ''}, as part of: ${base.niche}` : base.niche,
      community: { ...base.community, queries: [config.keyword, ...focus] },
      expand: { ...base.expand, enabled: false },
    };
    // serperSkip names the base bank's own seeds.
    if (next.harvest) { next.harvest = { ...next.harvest }; delete next.harvest.serperSkip; }
    mkdirSync(dir, { recursive: true });
    writeFileSync(minerConfigFile, JSON.stringify(next, null, 2));
  }
  const minerConfig = readJson(minerConfigFile);
  // Seeds the current bank already covers, and seeds off the keyword's angle, are dropped before any Serper spend.
  const pruned = join(config.runDir, '00-seeds.json');
  if (!existsSync(join(dir, 'seeds.codex.json'))) {
    rmSync(pruned, { force: true });
    await runMiner(config, '01-research.mjs', dir);
    copyFileSync(join(dir, 'seeds.json'), join(dir, 'seeds.codex.json'));
  }
  const proposed = readJson(join(dir, 'seeds.codex.json'));
  if (!existsSync(pruned)) {
    const bank = config.question_bank && existsSync(config.question_bank) ? readBank(config.question_bank) : [];
    await judge(config, 'seeds', {
      runDir: config.runDir,
      keyword: config.keyword,
      focus: focus.join(', ') || '(none)',
      seeds: proposed.map((s) => `- ${s.seed} [${s.stage}: ${stageMap[s.stage] ?? 'other'}]`).join('\n'),
      minerStages: Object.keys(stageMap).join(', '),
      bank: bank.map((q) => `- ${q.canonical_question}`).join('\n') || '(none)',
      minPerStage: MIN_SEEDS_PER_STAGE,
    }, pruned, 'seeds');
  }
  const { seeds, restored, missing } = balanceSeeds(proposed, readJson(pruned), stageMap);
  if (missing.length) throw new Error(`question bank: no seed for ${missing.join(', ')}, not even among the dropped ones; delete ${pruned} and ${join(dir, 'seeds.codex.json')} to research again`);
  const dropped = (readJson(pruned).drop ?? []).filter((d) => !restored.includes(d.seed));
  if (!existsSync(join(dir, 'raw.json'))) {
    writeFileSync(join(dir, 'seeds.json'), JSON.stringify(seeds, null, 2));
    log(`new question bank for "${config.keyword}": ${seeds.length} seeds (${join(dir, 'seeds.json')})`);
    log(`  seeds by stage: ${seedsByStage(seeds, stageMap)}`);
    if (restored.length) log(`  restored so every stage has ${MIN_SEEDS_PER_STAGE}: ${restored.join(', ')}`);
    log(`  ${dropped.length} dropped:`);
    dropped.forEach((d) => log(`  - ${d.seed}: ${d.reason}`));
    const credits = harvestCredits(seeds, minerConfig);
    const usd = credits * config.serper_usd_per_credit;
    const quote = `Serper quote ~${credits} credits (~$${usd.toFixed(3)}) for ${seeds.length} seeds`;
    if (!approve && usd > (config.bank_auto_approve_usd ?? 0)) throw new OwnerNeeded(`question bank: ${quote}; review the seeds, then run again with --approve`);
    log(`  ${quote}: ${approve ? 'approved' : `under the $${config.bank_auto_approve_usd} auto-approve limit`}`);
    await runMiner(config, '02-harvest.mjs', dir);
    writeFileSync(join(config.runDir, '00-bank-cost.json'), JSON.stringify({ bank: dir.replaceAll('\\', '/'), credits, usd }, null, 2));
  }
  if (!existsSync(join(dir, 'geo-questions.json'))) await runMiner(config, '03-synthesize.mjs', dir);
  await runMiner(config, '04-report.mjs', dir);
  const file = join(dir, 'geo-questions.json');
  const present = stagesPresent(readBank(file), stageMap);
  if (present.length < BUYING_STAGES.length) throw new Error(`question bank ${file} has no question for ${BUYING_STAGES.filter((s) => !present.includes(s)).join(', ')}; the exit check needs all four stages`);
  writeFileSync(registryFile, JSON.stringify({ ...registry, [bankKey(config)]: file.replaceAll('\\', '/') }, null, 2));
  useBank(config, file);
  const stages = covered(file);
  log(`question bank built: ${file} (on-keyword questions in ${stages.join(', ') || 'none'})`);
  if (stages.length < config.bank_min_stages) log(`⚠ on-keyword questions in ${stages.length}/4 stages; the picker fills the rest with each stage's best question`);
}

// A miner config for a site that has no bank to start from: who the questions are for, and a trade's own stages and
// examples (else the miner's defaults), come from the run's config.
function freshMinerConfig(config) {
  if (!config.niche || !config.persona) throw new OwnerNeeded('question bank: no bank to start from; set niche and persona so the miner can build one');
  const [, gl = 'us', hl = 'en'] = (config.market ?? '').toLowerCase().match(/^(\w\w)\s*\((\w\w)\)/) ?? [];
  const { later_stage_topics, off_persona } = config.trade_examples ?? {};
  const trade = { ...(config.stages && config.stages !== MINER_STAGE_MAP ? { stages: config.stages } : {}), ...(later_stage_topics ? { later_stage_topics } : {}), ...(off_persona ? { off_persona } : {}) };
  return { niche: config.niche, persona: config.persona, competitors: config.competitors ?? [], community: { sites: ['reddit.com', 'quora.com'], pages: 2 }, gl, hl, expand: { enabled: false }, ...trade };
}

function useBank(config, file) {
  const configFile = join(config.runDir, 'config.json');
  const raw = readJson(configFile);
  raw.question_bank = file.replaceAll('\\', '/');
  writeFileSync(configFile, JSON.stringify(raw, null, 2));
  config.question_bank = raw.question_bank;
}

// One geo-question-miner script; its Codex calls use the judgment homes (the miner's codex.mjs).
function runMinerStep(config, script, dir) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [script, dir], { cwd: config.miner_dir, stdio: 'inherit' });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`geo-question-miner ${script} exited ${code}`))));
  });
}
