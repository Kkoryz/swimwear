// A source file's content as it bears on what runs or renders, for the content keys of site-run's steps
// (site-run.mjs inputsHash) and of the audits' pages (lib/page-keys.mjs): JavaScript and TypeScript as TypeScript's
// printer writes them without comments, CSS without comments and with its whitespace collapsed, an .astro component's
// frontmatter as a script (its markup as written). Owner 2026-11-17, site13's 40-minute run: a template commit that
// changed no behaviour ran the brand, the image library review, the style board and the design review again, because
// every step whose code imports a shared library counted the library's comments.
// A file that cannot be read this way (no TypeScript, a syntax error, another kind of file) counts by its bytes: a
// change is never hidden by a parse that failed.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { extname } from 'node:path';

const SCRIPT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
let typescript;
const loadTypescript = () => {
  if (typescript === undefined) {
    try { typescript = createRequire(import.meta.url)('typescript'); } catch { typescript = null; }
  }
  return typescript;
};

// A script without its comments and layout, or null where it cannot be parsed. The file's own extension decides how it
// is read (a .mjs file as JavaScript: `a < b > (c)` stays two comparisons); every import is kept as written
// (verbatimModuleSyntax: an import of a component the frontmatter only names in its markup is not dropped as unused).
export function printedScript(text, fileName = 'module.mjs') {
  const ts = loadTypescript();
  if (!ts) return null;
  try {
    const out = ts.transpileModule(text, { fileName, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, removeComments: true, verbatimModuleSyntax: true, isolatedModules: true, newLine: ts.NewLineKind.LineFeed } });
    return out.diagnostics?.length ? null : out.outputText;
  } catch {
    return null;
  }
}

// CSS without comments, each run of whitespace one space; strings are kept as written.
export function plainCss(text) {
  let out = '';
  let at = 0;
  let space = false;
  while (at < text.length) {
    const char = text[at];
    if (char === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      at = end < 0 ? text.length : end + 2;
      space = true;
      continue;
    }
    if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < text.length && text[end] !== char) end += text[end] === '\\' ? 2 : 1;
      if (space && out) out += ' ';
      space = false;
      out += text.slice(at, end + 1);
      at = end + 1;
      continue;
    }
    if (/\s/.test(char)) { space = true; at += 1; continue; }
    if (space && out) out += ' ';
    space = false;
    out += char;
    at += 1;
  }
  return out;
}

// An .astro component: its frontmatter as a TypeScript script, the rest as written; null where the frontmatter does
// not parse.
export function plainAstro(text) {
  const match = /^(﻿?\s*---\r?\n)([\s\S]*?)(\r?\n---)/.exec(text);
  if (!match) return text;
  const script = printedScript(match[2], 'frontmatter.ts');
  return script === null ? null : `---\n${script}\n---${text.slice(match[0].length)}`;
}

// The normalised text of a source file by its name, or null when it counts by its bytes.
export function normalisedSource(path, buffer) {
  const ext = extname(path).toLowerCase();
  if (!SCRIPT.has(ext) && ext !== '.css' && ext !== '.astro') return null;
  const text = buffer.toString('utf8');
  if (ext === '.css') return plainCss(text);
  if (ext === '.astro') return plainAstro(text);
  return printedScript(text, `module${ext}`);
}

// Digests of normalised sources by the sha256 of their bytes: the same file is printed once a process.
const digests = new Map();
// What a source file adds to a content key: its normalised text (tagged, so it never equals a file's bytes), else
// its bytes.
export function sourceDigest(path, buffer) {
  const raw = createHash('sha256').update(buffer).digest('hex');
  const known = digests.get(`${extname(path)}:${raw}`);
  if (known) return known;
  const text = normalisedSource(path, buffer);
  const digest = text === null ? `raw:${raw}` : `src:${createHash('sha256').update(text).digest('hex')}`;
  digests.set(`${extname(path)}:${raw}`, digest);
  return digest;
}
