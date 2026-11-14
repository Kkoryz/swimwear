// The approved company facts (Site Factory facts.yaml and JSON fact lists): what a key figure or a blog article may
// state as the company's own.

import { resolve } from 'node:path';
import { parseJson, readJson, readText } from './json-io.mjs';

// Two things a fact can be. Approved: Site Factory releases it for the page's copy (approved_public), which is what its
// written sections, figures, steps and tables may cite (the copy is Site Factory's; borrowed claims in it go to the owner's
// pre-launch list, never rewritten here). Confirmed: approved and, where it says so, given by the owner or verified
// (verification_status user_provided or verified), as Site Factory's facts.yaml defines it: only a confirmed fact
// stands as the company's own data, the trust bar's figures. 07 marks borrowed and unverified facts approved_public too.
export const OWNER_CONFIRMED = Object.freeze(['user_provided', 'verified']);
export const factApproved = (fact) => fact.approved_public === true;
export const factConfirmed = (fact) => factApproved(fact) && (!fact.verification_status || OWNER_CONFIRMED.includes(fact.verification_status));
const factFlags = (fact) => ({ approved: factApproved(fact), confirmed: factConfirmed(fact) });

// Reads facts.yaml: a list of fact_id / text / verification_status / approved_public entries.
export function parseFacts(yaml) {
  // YAML in its JSON form is JSON (Site Factory's handoff writes facts.yaml so).
  if (yaml.trim().startsWith('{')) return factsFromFile('facts.json', yaml);
  const facts = new Map();
  for (const entry of yaml.split(/\n\s*-\s+fact_id:\s*/).slice(1)) {
    const id = entry.match(/^([^\s#]+)/)?.[1];
    const text = entry.match(/\btext:\s*"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\"/g, '"');
    const flags = factFlags({ verification_status: entry.match(/\bverification_status:\s*([\w-]+)/)?.[1], approved_public: /\bapproved_public:\s*true\b/.test(entry) });
    if (id && text) facts.set(id, { text, ...flags });
  }
  return facts;
}

// Facts from one file: facts.yaml, or a JSON fact list such as 03_product_lines capabilities.json ({ facts: [{ fact_id, text,
// approved_public }] }). Later files add to earlier ones.
export function factsFromFile(path, text) {
  if (!path.toLowerCase().endsWith('.json')) return parseFacts(text);
  const list = parseJson(text).facts || [];
  return new Map(list.filter((fact) => fact.fact_id && fact.text).map((fact) => [fact.fact_id, { text: fact.text, ...factFlags(fact) }]));
}

// The approved company facts the site was built with (the Site Factory inputs the importer recorded).
export async function companyFacts(root) {
  const record = await readJson(resolve(root, 'docs/research/site-factory-import.json'), null);
  const facts = new Map();
  for (const path of record?.inputs?.facts ?? []) for (const [id, fact] of factsFromFile(path, await readText(path))) facts.set(id, fact);
  return facts;
}
