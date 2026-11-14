// What every script's command line shares: run only when started as the script (a test importing it runs nothing), an
// error is printed and exits 1, and options are parsed by node:util parseArgs.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// main may set process.exitCode itself. stack: print the whole stack of an error (long browser or Codex runs).
export function runMain(moduleUrl, main, { stack = false } = {}) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(moduleUrl)) return;
  Promise.resolve().then(main).catch((error) => { console.error((stack && error.stack) || error.message); process.exitCode = 1; });
}

// A command line the script cannot run with: the usage line, exit 1.
export function usage(text) {
  console.error(text);
  process.exitCode = 1;
}

// { values, positionals } of this run. A bare `--` (package-manager pass-through) is dropped. Not strict, like the
// parsers it replaced: an unknown option is ignored, a string option takes the next argument whatever it looks like,
// and one given without a value is undefined.
export function cliArgs(options = {}, args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: args.filter((arg) => arg !== '--'), options, allowPositionals: true, strict: false });
  for (const [name, option] of Object.entries(options)) if (option.type === 'string' && values[name] === true) delete values[name];
  return { values, positionals };
}

// A comma-separated list option (--only a,b), or null.
export const listOption = (value) => value?.split(',').map((item) => item.trim()).filter(Boolean) ?? null;
