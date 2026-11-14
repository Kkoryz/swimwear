// A plain static server over a site's built folder (dist), for the audits and the design shots. The site is static
// output, so this serves what Nginx will; it runs in the caller's process (Astro's own preview is a background daemon
// that can outlive a step and keep the next one from starting).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };

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
    try {
      const body = await readFile(target);
      response.writeHead(200, { 'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      const missing = await readFile(join(root, '404.html')).catch(() => null);
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(missing ?? 'Not found');
    }
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(Number(port), '127.0.0.1', () => done({ port: server.address().port, close: () => new Promise((closed) => server.close(() => closed())) }));
  });
}
