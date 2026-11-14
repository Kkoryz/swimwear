import { BUYING_STAGES, MINER_STAGE_MAP } from './config.mjs';

// geo-question-miner stages -> buying stages: the default, or the run's own (config.stages).
export { MINER_STAGE_MAP };
const PRIORITY = { high: 3, medium: 2, low: 1 };

// Stems of the keyword's words ("swimwear manufacturer" -> swimwea, manufac): a question naming them is about the
// keyword, not just about the niche.
const stems = (keyword) => (keyword || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2).map((w) => w.slice(0, 7));
// A stem matches at the start of a word; a short stem (a whole word, "pack") only as the whole word, not "packaging".
const matches = (text, s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${s.length < 7 ? 's?\\b' : ''}`).test(text.toLowerCase());
const relevance = (q, keywordStems) => keywordStems.filter((s) => matches(q.canonical_question, s)).length;
const score = (q, keywordStems) => relevance(q, keywordStems) * 1500 + (PRIORITY[q.priority] ?? 0) * 1000 + (q.evidence?.length ?? 0) * 10 + (q.evidence_types?.length ?? 0);
// Words nearly every question of the bank names ("swimwear") say nothing about fit to the keyword.
const distinctive = (keywordStems, bank) => keywordStems.filter((s) => bank.filter((q) => matches(q.canonical_question, s)).length <= bank.length / 2);

// The main question exactly as it stands in the bank it was chosen from (the site bank, under `geo site`), when the
// run's own bank has no question asking it: the run adds it, so the article still answers its main question.
export function mainFromSource(bank, mainQuestion, source, stages = MINER_STAGE_MAP) {
  if (!mainQuestion || bank.some((q) => q.canonical_question === mainQuestion)) return null;
  const q = (source ?? []).find((s) => s.canonical_question === mainQuestion);
  return q && stages[q.stage] ? q : null;
}

// Best cluster per buying stage, then the next best overall until `count` questions; clusters that name the
// keyword's words (and the run's focus terms, the angle that sets it apart) rank first. Questions an existing article
// of the site already answers (`skip`) are left out. `must` (the article's main question) takes its stage's place.
// `names` (canonical questions) picks by hand instead.
export function pickQuestions(bank, { count = 5, names = null, keyword = '', focus = [], skip = () => false, must = null, stages = MINER_STAGE_MAP } = {}) {
  const candidates = bank
    .filter((q) => stages[q.stage])
    .filter((q) => names?.includes(q.canonical_question) || !skip(q.canonical_question))
    .map((q) => ({ ...q, buying_stage: stages[q.stage] }));
  let picked;
  if (names) {
    picked = names.map((n) => {
      const q = candidates.find((c) => c.canonical_question === n);
      if (!q) throw new Error(`question not in bank: ${n}`);
      return q;
    });
  } else {
    const keywordStems = distinctive([...stems(keyword), ...focus.flatMap((f) => stems(f))], candidates);
    const ranked = [...candidates].sort((a, b) => score(b, keywordStems) - score(a, keywordStems));
    // A stage is filled by a question on the keyword when one exists; otherwise by its best question.
    const main = must && candidates.find((q) => q.canonical_question === must);
    picked = BUYING_STAGES.map((s) => (main?.buying_stage === s ? main : null) ?? ranked.find((q) => q.buying_stage === s && relevance(q, keywordStems) > 0) ?? ranked.find((q) => q.buying_stage === s)).filter(Boolean);
    for (const q of ranked) if (picked.length < count && !picked.includes(q)) picked.push(q);
  }
  const order = (q) => BUYING_STAGES.indexOf(q.buying_stage);
  return picked
    .sort((a, b) => order(a) - order(b))
    .map((q, i) => ({
      id: `q${i + 1}`,
      buying_stage: q.buying_stage,
      miner_stage: q.stage,
      priority: q.priority,
      question: q.canonical_question,
      pain_point: q.pain_point,
      evidence: (q.evidence || []).slice(0, 8),
    }));
}

// Whether a question is about the keyword or one of the focus terms: it names every word of one of them (5-letter
// stems, so "printing" also finds "printed" and "prints"; a shorter word, "tech", only as the whole word).
const STEM = 5;
const phraseStems = (phrase) => (phrase || '').toLowerCase().split(/\W+/).filter((w) => w.length > 2).map((w) => w.slice(0, STEM));
const namesStem = (text, s) => new RegExp(`\\b${s}${s.length < STEM ? 's?\\b' : ''}`).test(text.toLowerCase());
export const onKeyword = (text, keyword, focus = []) => [keyword, ...focus].some((p) => { const s = phraseStems(p); return s.length > 0 && s.every((x) => namesStem(text, x)); });

// Buying stages in which the bank has at least one question on the keyword or a focus term.
export function stageCoverage(bank, { keyword, focus = [], stages = MINER_STAGE_MAP }) {
  return BUYING_STAGES.filter((s) => bank.some((q) => stages[q.stage] === s && onKeyword(q.canonical_question, keyword, focus)));
}
