import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyReferenceAnalysis } from '../apply-reference-analysis.mjs';
import { checkTokenContrast } from '../check-token-contrast.mjs';
import { describePair, parseColour, readableTokens, resolveValue, rootTokens, tokenContrast } from '../lib/token-contrast.mjs';
import { tintStyle } from '../lib/section-surfaces.mjs';

const TEMPLATE_DEFAULTS = ':root {\n  --surface-primary: #ffffff;\n  --surface-secondary: #f6f3ed;\n  --surface-dark: #171717;\n  --text-primary: #171717;\n  --text-inverse: #ffffff;\n  --text-muted: #5f5f5f;\n  --border-color: #e5e5e5;\n  --accent: #235347;\n  --accent-contrast: #ffffff;\n}\n';
// Staylumen's design lock (four-site audit 2026-11-17): a black page, a light grey secondary surface, white text, and
// no dark text for the grey; its --text-inverse is set white here so only the grey's pair is wrong.
const STAYLUMEN = { '--surface-primary': 'rgb(0, 0, 0)', '--surface-secondary': 'rgb(213, 213, 213)', '--surface-dark': 'rgb(0, 0, 0)', '--text-primary': 'rgb(255, 255, 255)', '--text-inverse': 'rgb(255, 255, 255)', '--border-color': 'rgba(255, 255, 255, 0.5)', '--accent': 'rgb(255, 255, 255)', '--accent-contrast': 'rgb(0, 0, 0)' };
const pairOf = (pairs, id) => pairs.find((pair) => pair.id === id);

test('colours and root tokens are read as the cascade has them: :root:root over a later :root, nothing inside @media', () => {
  assert.deepEqual(parseColour('#abc'), [170, 187, 204, 1]);
  assert.deepEqual(parseColour('rgb(213 213 213 / 0.5)'), [213, 213, 213, 0.5]);
  assert.deepEqual(parseColour('rgba(16, 43, 82, 0.4)'), [16, 43, 82, 0.4]);
  assert.equal(parseColour('linear-gradient(red, blue)'), null);
  const tokens = rootTokens([':root:root { --text-primary: #fff; } @media (max-width: 767px) { :root { --surface-primary: red; } }', ':root { --text-primary: #000; --surface-primary: #111; } html { --gutter: 1rem; }']);
  assert.equal(tokens.get('--text-primary'), '#fff');
  assert.equal(tokens.get('--surface-primary'), '#111');
  assert.equal(tokens.get('--gutter'), '1rem');
  assert.equal(resolveValue('var(--link, var(--accent-text, var(--text-primary)))', tokens), '#fff');
  assert.equal(resolveValue('var(--missing)', tokens), null);
});

test('Staylumen\'s white text on its light grey fails, named, and the template picks the palette\'s dark ink for that surface', () => {
  const tokens = new Map([...rootTokens([TEMPLATE_DEFAULTS]), ...Object.entries(STAYLUMEN)]);
  const before = tokenContrast(tokens);
  const grey = pairOf(before, 'text-on-secondary');
  assert.equal(grey.ok, false);
  assert.equal(grey.ratio, 1.47);
  assert.match(describePair(grey), /^--text-primary rgb\(255, 255, 255\) on --surface-secondary rgb\(213, 213, 213\): 1\.47:1, needs 4\.5:1 \(text: running text in tinted sections/);
  const { tokens: derived, secondaryInk } = readableTokens(tokens, new Set(Object.keys(STAYLUMEN)));
  assert.equal(secondaryInk, true);
  assert.equal(derived['--text-on-secondary'].value, 'rgb(0, 0, 0)');
  assert.match(derived['--text-on-secondary'].note, /^\/\* Derived .*1\.47:1 on the rgb\(213, 213, 213\) secondary surface/);
  // The template's #5f5f5f muted grey does not read on a black page: the reference left it out, so one is picked.
  assert.ok(derived['--text-muted']);
  for (const [name, { value }] of Object.entries(derived)) tokens.set(name, value);
  const after = tokenContrast(tokens, { secondaryInk });
  assert.deepEqual(after.filter((pair) => pair.ok === false), []);
  assert.equal(pairOf(after, 'text-on-secondary').text, '--text-on-secondary');
});

test('a main pair the reference set that does not read is mended too (claude-seo over the reference, owner 2026-11-17): the button\'s label on the accent', () => {
  const lock = { '--surface-primary': 'rgb(234, 232, 226)', '--surface-secondary': 'rgb(255, 255, 255)', '--text-primary': 'rgb(16, 43, 82)', '--accent': 'rgb(227, 82, 5)', '--accent-contrast': 'rgb(215, 210, 203)' };
  const tokens = new Map([...rootTokens([TEMPLATE_DEFAULTS]), ...Object.entries(lock)]);
  const { tokens: derived } = readableTokens(tokens, new Set(Object.keys(lock)));
  // RateHarbor's case: the reference's own 2.55:1-like label becomes the palette's colour that reads best on the accent.
  assert.ok(derived['--accent-contrast']);
  // The accent as small text is a secondary voice: a darker shade of the same orange.
  assert.ok(derived['--accent-text']);
  for (const [name, { value }] of Object.entries(derived)) tokens.set(name, value);
  const failing = tokenContrast(tokens).filter((pair) => pair.ok === false);
  assert.deepEqual(failing.map((pair) => pair.id), []);
  // Undefined by the reference, the button's label is picked from the palette.
  const open = new Map([...tokens, ['--accent-contrast', '#ffffff']]);
  assert.equal(readableTokens(open, new Set(Object.keys(lock).filter((name) => name !== '--accent-contrast'))).tokens['--accent-contrast'].value, 'rgb(0, 0, 0)');
});

test('a form field\'s border and the focus ring are held to 3:1 (non-text UI), the template\'s pale border replaced where the reference set none', () => {
  const tokens = rootTokens([TEMPLATE_DEFAULTS]);
  const border = pairOf(tokenContrast(tokens), 'control-border');
  assert.equal(border.minimum, 3);
  assert.equal(border.ok, false);
  const { tokens: derived } = readableTokens(tokens);
  tokens.set('--input-border', derived['--input-border'].value);
  assert.equal(pairOf(tokenContrast(tokens), 'control-border').ok, true);
  assert.equal(pairOf(tokenContrast(new Map([...tokens, ['--focus-ring', 'currentColor']])), 'focus').unchecked, 'currentColor: it takes the colour of the text it rings');
});

async function workspace(lockTokens, treatment = '') {
  const root = await mkdtemp(join(tmpdir(), 'token-contrast-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  await writeFile(join(root, 'src/styles/global.css'), `@import "tailwindcss";\r\n@import "./template.css";\r\n@import "./reference.css";\r\n\r\n${TEMPLATE_DEFAULTS.replace(/\n/g, '\r\n')}`);
  await writeFile(join(root, 'src/styles/template.css'), ':root { --text-ink: var(--text-primary); }');
  await writeFile(join(root, 'src/styles/reference.css'), treatment);
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { hero: 'media-overlay' } }));
  await writeFile(join(root, 'docs/research/analysis/design-lock.json'), JSON.stringify({ tokens: lockTokens }));
  return root;
}

test('applying the design lock derives the missing ink and sets the flag the template reads; the check then passes, and fails named on a lock that cannot read', async () => {
  const root = await workspace(STAYLUMEN);
  // The template's own defaults, before: only its pale field border is below 3:1.
  await assert.rejects(checkTokenContrast(root), /- --input-border #e5e5e5 on --surface-primary #ffffff \(set in src\/styles\/global\.css\): 1\.26:1, needs 3:1/);
  const result = await applyReferenceAnalysis({ root, designLockPath: join(root, 'docs/research/analysis/design-lock.json') });
  assert.ok(result.derived.includes('--text-on-secondary'));
  const variants = JSON.parse(await readFile(join(root, 'src/data/template-variants.json'), 'utf8'));
  assert.equal(variants.components.secondaryInk, true);
  const css = await readFile(join(root, 'src/styles/global.css'), 'utf8');
  assert.equal((css.match(/--surface-secondary:/g) ?? []).length, 1, 'the template default is gone, CRLF and all');
  const report = await checkTokenContrast(root);
  assert.deepEqual(report.failures, []);
  assert.equal(report.secondaryInk, true);
  // Staylumen's real lock called its dark text --text-inverse: black on its black dark surface, mended to read there.
  const wrong = await workspace({ ...STAYLUMEN, '--text-inverse': 'rgb(0, 0, 0)' });
  await applyReferenceAnalysis({ root: wrong, designLockPath: join(wrong, 'docs/research/analysis/design-lock.json') });
  assert.deepEqual((await checkTokenContrast(wrong)).failures, []);
  // A treatment's own root token that does not read (RateHarbor's 2.26:1 field border) is mended too, in a rule that
  // outranks the treatment's :root:root.
  const treated = await workspace(STAYLUMEN, ':root:root { --input-border: rgba(255, 255, 255, 0.1); }');
  await applyReferenceAnalysis({ root: treated, designLockPath: join(treated, 'docs/research/analysis/design-lock.json') });
  assert.deepEqual((await checkTokenContrast(treated)).failures, []);
  assert.match(await readFile(join(treated, 'src/styles/global.css'), 'utf8'), /:root:root:root \{\n  \/\* Derived[^\n]*\n  --input-border:/);
});

test('a treatment rule painting the secondary surface another colour gains the ink that reads on it, once, and only on a site whose secondary parts take their own ink', async () => {
  const { inkLocalSurfaces } = await import('../lib/token-contrast.mjs');
  const tokens = new Map([...Object.entries(STAYLUMEN), ['--text-on-secondary', 'rgb(0, 0, 0)']]);
  // Staylumen's sheet: its cards and bands set black where the grey's white text did not read.
  const css = ':root:root { --surface-secondary: rgb(213 213 213); }\n.block--cta { --surface-secondary: rgb(0 0 0); --radius-card: 0px }\n@media (max-width: 767px) { .block--table { --surface-secondary: var(--surface-primary); } }\n.block--intro { --secondary-ink: #fff; --surface-secondary: #000; }';
  const { css: inked, added } = inkLocalSurfaces(css, tokens);
  assert.deepEqual(added.map((item) => `${item.selector} ${item.ink}`), ['.block--cta rgb(255, 255, 255)', '.block--table rgb(255, 255, 255)']);
  assert.match(inked, /\.block--cta \{ --surface-secondary: rgb\(0 0 0\); --radius-card: 0px; --secondary-ink: rgb\(255, 255, 255\); --secondary-muted: rgb\([^)]+\); --secondary-link: rgb\(255, 255, 255\); --secondary-accent: rgb\(255, 255, 255\); \}/);
  assert.match(inked, /^:root:root \{ --surface-secondary: rgb\(213 213 213\); \}/, 'the page\'s own surface is the template\'s to ink');
  assert.equal(inkLocalSurfaces(inked, tokens).added.length, 0);
  // Before each build: only with the flag.
  const { inkSheet } = await import('../strip-protected.mjs');
  const root = await workspace(STAYLUMEN, '.block--cta { --surface-secondary: rgb(0 0 0); }');
  assert.deepEqual(await inkSheet(root), []);
  await applyReferenceAnalysis({ root, designLockPath: join(root, 'docs/research/analysis/design-lock.json') });
  assert.equal((await inkSheet(root)).length, 1);
  assert.match(await readFile(join(root, 'src/styles/reference.css'), 'utf8'), /--secondary-ink: rgb\(255, 255, 255\)/);
});

test('every part the stylesheets paint with the secondary surface takes its own ink with the flag, and a tinted section\'s parts take the page\'s back', async () => {
  const sheets = await Promise.all(['template.css', 'patterns.css'].map((name) => readFile(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8')));
  const template = sheets[0];
  // The selector list of the flagged rule whose first part is `first`, without :not() parts; and the rule's body.
  const rule = (first) => {
    const prefix = ':where(body[data-secondary-ink]) :where(';
    const at = template.indexOf(`${prefix}${first}`);
    assert.ok(at > 0, `template.css has the flagged rule starting ${first}`);
    let depth = 0;
    let end = at + prefix.length - 1;
    for (; end < template.length; end += 1) { if (template[end] === '(') depth += 1; if (template[end] === ')') { depth -= 1; if (depth === 0) break; } }
    const items = [];
    let current = '';
    depth = 0;
    for (const char of template.slice(at + prefix.length, end)) { if (char === '(') depth += 1; if (char === ')') depth -= 1; if (char === ',' && depth === 0) { items.push(current.trim()); current = ''; } else current += char; }
    items.push(current.trim());
    return { selectors: new Set(items.map((item) => item.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\s+/g, ' ').trim())), body: template.slice(end, template.indexOf('}', end)) };
  };
  const secondary = rule('.page-hero:not(');
  // A photo's box (no text on it), the sticky first column (a table header listed already), and the paper layout's
  // margin (its article is on the page's surface) are not text surfaces.
  const exempt = new Set(['.media-box', '.prose__table th:first-child', 'main[data-post-layout="paper"]']);
  const painted = sheets.flatMap((css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*background(?:-color)?:\s*var\(--surface-secondary\)/g)].flatMap((match) => match[1].replace(/@media[^{]*$/, '').split(',').map((selector) => selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\s+/g, ' ').trim())));
  assert.ok(painted.length > 20);
  assert.deepEqual(painted.filter((selector) => !secondary.selectors.has(selector) && !exempt.has(selector)), []);
  for (const token of ['--text-primary: var(--secondary-ink, var(--text-on-secondary))', '--text-muted: var(--secondary-muted, var(--muted-on-secondary))', '--link: var(--secondary-link, var(--text-on-secondary))']) assert.ok(secondary.body.includes(token), token);
  // The cards on the page's surface keep the page's colours wherever they sit (Staylumen's wordmark logos and FAQ cards
  // in a tinted section were black on black without), listed before the secondary parts so a tinted FAQ bar wins.
  const primary = rule('[data-variant="outlined"]');
  for (const selector of ['.faq__item', '.logos__item[data-wordmark]', '.pricing-card', '.post-card']) assert.ok(primary.selectors.has(selector), selector);
  assert.ok(primary.body.includes('--text-primary: var(--text-ink)'));
  assert.ok(template.indexOf(':where(body[data-secondary-ink]) :where([data-variant="outlined"]') < template.indexOf(':where(body[data-secondary-ink]) :where(.page-hero:not('));
  // The tinted alternation: only with the flag, at zero specificity, the band's own text in the ink and its parts back
  // on the page's colours.
  assert.doesNotMatch(tintStyle(new Set(['a'])), /text-on-secondary/);
  const tinted = tintStyle(new Set(['a']), { secondaryInk: true });
  assert.match(tinted, /:where\(main \[data-block-id="a"\]\) \{ color: var\(--text-on-secondary\); --text-primary: var\(--text-on-secondary\);/);
  assert.match(tinted, /--secondary-ink: var\(--text-ink\);/);
});
