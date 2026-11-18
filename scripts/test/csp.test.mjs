import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { contentSecurityPolicy, pageSources, policyHashes, scriptHash, snippetPolicy, unallowedScripts } from '../lib/csp.mjs';
import { nginxConfig } from '../lib/nginx-config.mjs';

const tracking = "\n  (() => { document.body.dataset.ready = ''; })();\n";
const page = `<html><head><script is:inline defer src="https://stats.knitpace.com/script.js" data-website-id="w1"></script>
<script type="application/ld+json">{"@type":"Organization"}</script></head><body>
<script>${tracking}</script><script type="module">var e=1;</script><script type="module" src="/_astro/Chat.js"></script>
<div data-chat data-base-url="https://chat.knitpace.com" data-inbox="x"></div><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe></body></html>`;

test('the policy allows what the pages load: own files, the analytics host, inline scripts by hash, no unsafe-inline scripts', () => {
  const sources = pageSources([page, page]);
  assert.deepEqual(sources.inline, [scriptHash(tracking), scriptHash('var e=1;')].sort(), 'one hash per distinct script; JSON-LD is data');
  assert.deepEqual(sources.scriptOrigins, ['https://stats.knitpace.com']);
  assert.deepEqual(sources.connectOrigins, ['https://chat.knitpace.com', 'https://stats.knitpace.com']);
  assert.deepEqual(sources.frameOrigins, ['https://www.youtube-nocookie.com']);
  const policy = contentSecurityPolicy(sources);
  const scriptSrc = policy.split('; ').find((part) => part.startsWith('script-src '));
  assert.ok(!scriptSrc.includes('unsafe-inline'));
  assert.match(scriptSrc, /^script-src 'self' https:\/\/stats\.knitpace\.com 'sha256-/);
  assert.match(policy, /style-src 'self' 'unsafe-inline'/, 'style attributes need it');
  assert.match(policy, /frame-ancestors 'self'; upgrade-insecure-requests$/);
  assert.match(policy, /object-src 'none'/);
  assert.deepEqual([...policyHashes(policy)].sort(), sources.inline);
  assert.deepEqual(unallowedScripts(policy, [page]), []);
  assert.deepEqual(unallowedScripts(policy, ['<script>changed()</script>']), [scriptHash('changed()')]);
});

test('a page without frames or outside forms closes them; inline handlers are counted', () => {
  const sources = pageSources(['<button onclick="go()">Go</button><form action="/api/leads"></form>']);
  assert.equal(sources.handlers, 1);
  const policy = contentSecurityPolicy(sources);
  assert.match(policy, /frame-src 'none'/);
  assert.match(policy, /form-action 'self';/);
  assert.match(contentSecurityPolicy(pageSources(['<form action="https://lists.knitpace.com/subscription/form"></form>'])), /form-action 'self' https:\/\/lists\.knitpace\.com;/);
});

test('the Nginx headers snippet sends the policy with HSTS, Referrer-Policy, Permissions-Policy and nosniff', () => {
  const csp = contentSecurityPolicy(pageSources([page]));
  const { snippet } = nginxConfig({ host: 'knitpace.com', root: '/var/www/knitpace.com/current', csp });
  assert.equal(snippetPolicy(snippet), csp);
  for (const header of ['Strict-Transport-Security "max-age=31536000"', 'X-Content-Type-Options "nosniff"', 'Referrer-Policy', 'Permissions-Policy "camera=()', 'X-Frame-Options']) assert.ok(snippet.includes(`add_header ${header}`), header);
  assert.match(snippetPolicy(nginxConfig({ host: 'knitpace.com', root: '/r' }).snippet), /^default-src 'self';/, 'a policy even without a build');
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/r', csp: 'default-src "x"' }), /double quotes/);
});

test('build:nginx-config makes the policy from the build in dist', async () => {
  const { buildNginxConfig } = await import('../build-nginx-config.mjs');
  const root = await mkdtemp(join(tmpdir(), 'csp-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'dist/about'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ origin: 'https://knitpace.com' }));
  await writeFile(join(root, 'dist/index.html'), page);
  await writeFile(join(root, 'dist/about/index.html'), '<script>about()</script>');
  const { sources } = await buildNginxConfig({ root });
  assert.equal(sources.inline.length, 3);
  const policy = snippetPolicy(await readFile(join(root, 'deploy/nginx/knitpace.com-headers.conf'), 'utf8'));
  assert.deepEqual(unallowedScripts(policy, [page, '<script>about()</script>']), []);
});
