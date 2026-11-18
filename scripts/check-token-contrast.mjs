#!/usr/bin/env node

// The design tokens' colour pairs right after the design lock is applied (lib/token-contrast.mjs; site-run.mjs step
// apply-analysis): every surface token with each text, border and focus-ring token the template's components draw on
// it, below WCAG AA (4.5:1 text, 3:1 large text and non-text UI) fails here, each pair named, instead of at the audits
// after the build (four-site audit 2026-11-17). Writes docs/research/token-contrast.json.
// Usage: node scripts/check-token-contrast.mjs [workspace]

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { describePair, rootTokens, tokenContrast, tokenOrigins, tokenSheets } from './lib/token-contrast.mjs';

export async function checkTokenContrast(root = process.cwd()) {
  const sheets = await tokenSheets(root);
  const tokens = rootTokens(sheets);
  const origins = tokenOrigins(sheets);
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'), null);
  const secondaryInk = variants?.components?.secondaryInk === true;
  const pairs = tokenContrast(tokens, { secondaryInk });
  const failures = pairs.filter((pair) => pair.ok === false);
  // The site's parts on the secondary surface take --text-on-secondary only with the flag (template.css
  // body[data-secondary-ink]); a colour without the flag, or the flag without the colour, paints nothing of it.
  const problems = failures.map((pair) => describePair(pair, origins));
  if (secondaryInk && !tokens.has('--text-on-secondary')) problems.push('template-variants.json components.secondaryInk is set but no --text-on-secondary is defined (src/styles/global.css)');
  const report = { schemaVersion: 'seo-site-token-contrast-v1', secondaryInk, pairs, failures: problems };
  await writeJson(resolve(root, 'docs/research/token-contrast.json'), report);
  // A design-lock value is mended in docs/research/analysis/design-lock.json (or left out there, for the template to
  // pick a readable one); a treatment value in src/styles/reference.css.
  if (problems.length) throw new Error(`design tokens below WCAG AA (docs/research/token-contrast.json), each to mend where it is set (a design-lock value in docs/research/analysis/design-lock.json, or left out there for the template to pick one; a treatment value in src/styles/reference.css):\n- ${problems.join('\n- ')}`);
  return report;
}

runMain(import.meta.url, async () => {
  const [root = '.'] = cliArgs().positionals;
  const report = await checkTokenContrast(resolve(root));
  console.log(JSON.stringify({ pairs: report.pairs.length, unchecked: report.pairs.filter((pair) => pair.unchecked).map((pair) => `${pair.id}: ${pair.unchecked}`), failures: 0 }, null, 2));
});
