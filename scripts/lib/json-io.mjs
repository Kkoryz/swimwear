import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Reads a UTF-8 text file. With a fallback, a missing file returns the fallback; any other error (a directory, no
// permission) always throws, so a broken input never reads as "nothing there".
export async function readText(path, fallback) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

// JSON text, tolerating a byte-order mark (files written on Windows often carry one).
export const parseJson = (text) => JSON.parse(text.replace(/^﻿/, ''));

// Reads a UTF-8 JSON file. With a fallback, a missing file returns the fallback; a file that exists but does not
// parse always throws.
export async function readJson(path, fallback) {
  const text = await readText(path, fallback === undefined ? undefined : null);
  return text === null ? fallback : parseJson(text);
}

// Writes a JSON file the way every file of the pipeline is written (two-space indent, a closing newline), making its
// folder first.
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
