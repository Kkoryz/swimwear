import assert from 'node:assert/strict';
import test from 'node:test';

import { nginxConfig } from '../lib/nginx-config.mjs';

test('one canonical https host, trailing-slash directories, 404, caching, headers everywhere, same-origin API', () => {
  const { server, snippet } = nginxConfig({ host: 'knitpace.com', root: '/var/www/knitpace.com/dist' });
  assert.match(server, /server_name knitpace.com www.knitpace.com;\n    return 301 https:\/\/knitpace.com\$request_uri;/);
  assert.match(server, /server_name www.knitpace.com;[\s\S]*?return 301 https:\/\/knitpace.com\$request_uri;/);
  assert.match(server, /try_files \$uri \$uri\/ =404;/);
  assert.match(server, /error_page 404 \/404.html;/);
  assert.ok(server.includes('location ^~ /_astro/ {'), 'fingerprinted assets win over the file-type location');
  assert.match(server, /_astro\/ \{\n[^}]*immutable/);
  assert.match(server, /listen 443 ssl http2;/);
  assert.match(snippet, /Strict-Transport-Security "max-age=31536000" always;/);
  assert.equal((server.match(/include \/etc\/nginx\/snippets\/knitpace.com-headers.conf;/g) || []).length, 5, 'server level plus every location that adds headers');
  assert.match(server, /location \/api\/ \{\n        proxy_pass http:\/\/127.0.0.1:3001\/;/);
  assert.match(snippet, /Strict-Transport-Security/);
  assert.throws(() => nginxConfig({ host: 'https://x', root: '/' }), /not a host/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/var/www; include /etc/passwd' }), /absolute path/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: 'var/www' }), /absolute path/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/var/www', apiUpstream: 'http://127.0.0.1:3001/; }' }), /http\(s\) URL/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/var/www', apiUpstream: 'http://127.0.0.1:3001/' }), /trailing slash/);
  assert.match(nginxConfig({ host: 'knitpace.com', root: '/var/www', apiUpstream: 'https://api.internal:8443/leads' }).server, /proxy_pass https:\/\/api\.internal:8443\/leads\/;/);
});

test('moved and removed pages and the domains a site used before are answered by the server', async () => {
  const { nginxConfig } = await import('../lib/nginx-config.mjs');
  const { server } = nginxConfig({ host: 'knitpace.com', root: '/var/www/knitpace.com/current', redirects: [{ from: '/old-leggings/', to: '/leggings-manufacturer/' }, { from: '/gone/', status: 410 }], previousHosts: ['old-brand.com'] });
  assert.match(server, /location = \/old-leggings\/ \{ return 301 \/leggings-manufacturer\/; \}/);
  assert.match(server, /location = \/gone\/ \{ return 410; \}/);
  assert.match(server, /server_name old-brand\.com www\.old-brand\.com;\n[\s\S]*?return 301 https:\/\/knitpace\.com\$request_uri;/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/r', redirects: [{ from: 'old', to: '/new/' }] }), /must be a path/);
  assert.throws(() => nginxConfig({ host: 'knitpace.com', root: '/r', redirects: [{ from: '/old/', to: 'javascript:x' }] }), /path or an https URL/);
});

test('build:nginx-config serves the live release and removes configs for other domains', async () => {
  const { mkdir, mkdtemp, readdir, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { buildNginxConfig } = await import('../build-nginx-config.mjs');
  const root = await mkdtemp(join(tmpdir(), 'nginx-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'deploy/nginx'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'deploy/nginx/seamtide.com.conf'), 'old');
  await buildNginxConfig({ root });
  assert.deepEqual((await readdir(join(root, 'deploy/nginx'))).sort(), ['strandmill.com-headers.conf', 'strandmill.com.conf']);
  assert.match(await readFile(join(root, 'deploy/nginx/strandmill.com.conf'), 'utf8'), /root \/var\/www\/strandmill\.com\/current;/);
});
