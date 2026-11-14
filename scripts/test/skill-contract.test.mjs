import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skillUrl = new URL('../../.claude/skills/seo-site-template/SKILL.md', import.meta.url);

test('canonical skill: design and blueprint follow the competitor, our copy, stages 08 to 11', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  for (const required of [
    'competitorBlueprints',
    'blueprint-choices.json',
    'font-lock.json',
    'design-lock.json',
    'surface roles',
    'shared Header',
    'page type',
    'slot-manifest.json',
    'site-template.json',
    'import:site-factory',
    'placeholderKinds',
    'approve:images',
    'audit:seo',
    'build:release',
    'preflight',
    'pnpm check',
    '1440',
    '768',
    '390',
  ]) {
    assert.ok(skill.includes(required), `skill must mention ${required}`);
  }
  for (const banned of ['Next.js', 'next/font', 'src/app']) assert.ok(!skill.includes(banned), banned);
  // Owner decisions: no copied content, no forced differences, open-font substitutes are allowed.
  assert.doesNotMatch(skill, /source-backed titles/);
  assert.doesNotMatch(skill, /at least two allowed composition axes/);
  assert.doesNotMatch(skill, /visually similar values/);
});

test('canonical skill preserves Astro-first island boundaries', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.ok(/static sections use `.astro`/i.test(skill));
  assert.match(skill, /island.*observed runtime behavior/is);
  assert.match(skill, /never fabricate/is);
});

test('canonical skill requires content-adaptive authoring layout gates', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  for (const required of [
    'content-adaptive layout',
    'cardinality policy',
    'authoring-max-boundary-gap',
    'data-authoring-block',
    'audit-authoring-layout.mjs',
    'short and long content canaries',
  ]) assert.ok(skill.toLowerCase().includes(required.toLowerCase()), `skill must mention ${required}`);
  assert.match(skill, /Never inherit `:last-child`/);
});
