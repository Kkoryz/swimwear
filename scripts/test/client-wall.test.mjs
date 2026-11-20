import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { proofProblems, readProof } from '../lib/proof-consistency.mjs';
import { clientWallOn, proofBlock, proofSignoffItems, withClientWall } from '../lib/site-proof.mjs';
import { shownProof } from '../proof-signoff.mjs';
import { inputDigests, steps } from '../site-run.mjs';

// Owner 2026-11-20: "客户名单是指logo墙？这个可以做的开关关闭但是保留一键打开的选项": the client wall is off unless
// site.json says clientWall: true; its names stay in site-proof.json.
const proof = {
  standIn: true,
  headings: { clients: 'Brands we make for' },
  clients: [{ name: 'Northline', note: 'Swimwear, Canada' }, { name: 'Maré Studio', note: 'Swimwear, Portugal' }],
  testimonials: [{ quote: 'Q', author: 'Ana', role: 'Founder' }],
  certifications: [{ name: 'OEKO-TEX Standard 100', issuer: 'OEKO-TEX' }],
};

test('the client wall is off unless site.json says clientWall: true', () => {
  for (const site of [null, {}, { clientWall: false }, { clientWall: 'true' }, { clientWall: 1 }]) assert.equal(clientWallOn(site), false, JSON.stringify(site));
  assert.equal(clientWallOn({ clientWall: true }), true);
});

test('off, the proof the pages are built from has no clients and no logos block; on, it is the file as it is', () => {
  const off = withClientWall(proof, {});
  assert.deepEqual(off.clients, []);
  assert.deepEqual({ ...off, clients: proof.clients }, proof, 'only the clients go');
  assert.equal(proof.clients.length, 2, 'the file\'s data is kept');
  assert.equal(proofBlock('logos', off), null);
  assert.equal(proofBlock('certifications', off)?.type, 'certifications');
  const on = withClientWall(proof, { clientWall: true });
  assert.equal(on, proof, 'on: the same proof, unchanged');
  assert.deepEqual(proofBlock('logos', on)?.items.map((item) => item.name), ['Northline', 'Maré Studio']);
  assert.equal(withClientWall(null, {}), null);
});

test('off, no sign-off item for the client names (no page shows them); on, there is one', () => {
  const pagesWith = (wall) => [{ route: '/', blocks: [proofBlock('logos', wall), proofBlock('certifications', wall)].filter(Boolean) }];
  const ids = (site) => { const wall = withClientWall(proof, site); return proofSignoffItems(shownProof(wall, pagesWith(wall))).map((item) => item.id); };
  assert.ok(!ids({}).includes('proof-clients'));
  assert.ok(ids({ clientWall: true }).includes('proof-clients'));
});

test('the proof checks read the switch: off, the copy keeping clients private finds no named client; on, it does', async () => {
  const root = await mkdtemp(join(tmpdir(), 'client-wall-'));
  try {
    await mkdir(join(root, 'src/data'), { recursive: true });
    await writeFile(join(root, 'src/data/site-proof.json'), JSON.stringify(proof));
    const pages = [{ route: '/case-studies/', blocks: [{ type: 'intro', heading: 'Recent orders', paragraphs: ['Three recent projects, with client names kept private.'] }] }];
    const issues = async (site) => {
      if (site) await writeFile(join(root, 'site.json'), JSON.stringify(site));
      const read = await readProof(root);
      return proofProblems({ ...read, pages }).map((item) => item.detail);
    };
    assert.deepEqual(await issues(null), [], 'no site.json: off');
    assert.deepEqual(await issues({ clientWall: false }), []);
    const on = await issues({ clientWall: true });
    assert.equal(on.length, 1);
    assert.match(on[0], /keeps the clients' names private.*Northline/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the switch alone sends the steps that read it to run again: patterns, import and data-checks', async () => {
  const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'brand', line: 'activewear', port: 4999 };
  const reading = steps(site).filter((step) => step.inputs?.includes('site.json#clientWall')).map((step) => step.id);
  assert.deepEqual(reading, ['patterns', 'import', 'data-checks']);
  const root = await mkdtemp(join(tmpdir(), 'client-wall-run-'));
  try {
    const digest = async (settings) => { await writeFile(join(root, 'site.json'), JSON.stringify(settings)); return (await inputDigests(root, ['site.json#clientWall']))[0]; };
    const off = await digest({ ...site });
    assert.equal(await digest({ ...site, port: 5000 }), off, 'another setting runs nothing again');
    assert.notEqual(await digest({ ...site, clientWall: true }), off);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
