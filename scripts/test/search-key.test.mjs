import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { cannibalHits, queryKeys, sameSearch, searchIndex, writtenForms } from '../lib/search-key.mjs';

test('one search however it is written: plural, possessive, case, hyphen, function words, word order', () => {
  assert.deepEqual(writtenForms('Vacation Rentals Cleaning Services'), ['vacation rental cleaning service']);
  assert.deepEqual(writtenForms('Airbnb co-hosts'), ['airbnb co host']);
  assert.deepEqual(writtenForms("women's jeans"), ['women jean']);
  assert.ok(sameSearch('best property managers for airbnb', 'Best Property Manager Airbnb'));
  assert.ok(sameSearch('wholesale womens jeans', "women's jeans wholesale"), 'the query key: any word order');
  assert.ok(!sameSearch('t shirt printing', 'tshirt printing'));
  assert.ok(!sameSearch('airbnb management', 'airbnb management fees'), 'equal only, never one held in another');
  // Without wordfreq every singular a word may have is kept: "movies" is movie or movy.
  assert.deepEqual(writtenForms('movies'), ['movy', 'movie']);
  assert.ok(sameSearch('vacation rental properties', 'vacation rental property'));
  assert.deepEqual(queryKeys('the of and'), ['and of the'], 'only function words: the words themselves');
});

test('the cannibalisation rule: a main search is taken by another route\'s primary or secondary', () => {
  const index = searchIndex([
    { route: '/a/', role: 'primary', query: 'airbnb co host service' },
    { route: '/a/', role: 'secondary', query: 'airbnb cohosting' },
    { route: '/b/', role: 'primary', query: 'airbnb management' },
  ]);
  assert.deepEqual(cannibalHits({ route: '/b/', query: 'Airbnb Co-Host Services' }, index).map((hit) => [hit.route, hit.role]), [['/a/', 'primary']]);
  assert.deepEqual(cannibalHits({ route: '/a/', query: 'airbnb co host service' }, index), [], 'its own route');
  assert.deepEqual(cannibalHits({ route: '/c/', query: 'airbnb cohosting' }, index).map((hit) => hit.role), ['secondary']);
  assert.deepEqual(cannibalHits({ route: '/c/', query: '' }, index), []);
});

// The port held to Site Factory's own functions (sitefactory.core.keyword_data.written_form, text.query_key): their
// answers recorded in search-key.sf.json (the Staylumen site's searches and edge cases), every run; and asked live
// when the code is at hand: SITE_FACTORY_CODE=<a Site Factory checkout> and a Python with its packages (wordfreq).
test('the port judges as Site Factory did: each recorded written form and query key is among ours', async () => {
  const { rows } = JSON.parse(await readFile(new URL('./search-key.sf.json', import.meta.url), 'utf8'));
  assert.ok(rows.length >= 50);
  for (const [phrase, form, key] of rows) {
    assert.ok(writtenForms(phrase).includes(form), `${phrase}: written form "${form}" not in ${JSON.stringify(writtenForms(phrase))}`);
    assert.ok(queryKeys(phrase).includes(key), `${phrase}: query key "${key}" not in ${JSON.stringify(queryKeys(phrase))}`);
  }
});
const SF = process.env.SITE_FACTORY_CODE;
test('the port judges as Site Factory does now, and its recorded answers are still its answers', { skip: !SF || !existsSync(join(SF ?? '', 'src/sitefactory/core/text.py')) ? 'SITE_FACTORY_CODE not set' : false }, async () => {
  const { rows } = JSON.parse(await readFile(new URL('./search-key.sf.json', import.meta.url), 'utf8'));
  const phrases = rows.map(([phrase]) => phrase);
  const script = 'import json,sys\nsys.path.insert(0,"src")\nfrom sitefactory.core.keyword_data import written_form\nfrom sitefactory.core.text import query_key\nprint(json.dumps([[" ".join(written_form(p))," ".join(sorted(query_key(p)))] for p in json.loads(sys.stdin.read())]))';
  const python = spawnSync(process.env.SITE_FACTORY_PYTHON ?? 'python', ['-c', script], { cwd: SF, input: JSON.stringify(phrases), encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout.trim().split('\n').pop());
  assert.deepEqual(theirs, rows.map(([, form, key]) => [form, key]), 'Site Factory changed: make search-key.sf.json again');
  phrases.forEach((phrase, index) => {
    const [form, key] = theirs[index];
    assert.ok(writtenForms(phrase).includes(form), `${phrase}: written form "${form}" not in ${JSON.stringify(writtenForms(phrase))}`);
    assert.ok(queryKeys(phrase).includes(key), `${phrase}: query key "${key}" not in ${JSON.stringify(queryKeys(phrase))}`);
  });
});
