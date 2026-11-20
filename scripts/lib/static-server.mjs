// A plain static server over a site's built folder (dist), for the audits and the design shots. The site is static
// output, so this serves what Nginx will, compressed as the generated Nginx config compresses it (lib/nginx-config.mjs
// GZIP: its types, its level and its least size; 2026-11-20, a lab LCP of MotelPilot's /blog/ measured over the
// stylesheet sent whole was 4.0s where the live server's gzip gives 2.6s); it runs in the caller's process (Astro's
// own preview is a background daemon that can outlive a step and keep the next one from starting).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { GZIP, gzipsType } from './nginx-config.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const compress = promisify(gzip);

// One response as Nginx gives it: a compressible type (gzip_vary: Vary on each), gzipped where the client takes gzip
// and the body is GZIP.minLength bytes or more.
async function send(request, response, status, type, body) {
  const headers = { 'content-type': type };
  if (gzipsType(type)) {
    headers.vary = 'Accept-Encoding';
    if (body.length >= GZIP.minLength && /\bgzip\b/i.test(request.headers['accept-encoding'] ?? '')) {
      body = await compress(body, { level: GZIP.level });
      headers['content-encoding'] = 'gzip';
    }
  }
  response.writeHead(status, headers);
  response.end(body);
}

// Serves dir on 127.0.0.1:port (0: any free port); resolves with { port, close } once listening, rejects when the port
// is taken.
export function serveStatic(dir, port) {
  const root = resolve(dir);
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
    let target = file;
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = join(target, 'index.html');
    const body = await readFile(target).catch(() => null);
    if (body) return send(request, response, 200, TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream', body);
    const missing = await readFile(join(root, '404.html')).catch(() => null);
    return send(request, response, 404, 'text/html; charset=utf-8', missing ?? Buffer.from('Not found'));
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(Number(port), '127.0.0.1', () => done({ port: server.address().port, close: () => new Promise((closed) => server.close(() => closed())) }));
  });
}
