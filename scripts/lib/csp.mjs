// The Content-Security-Policy a built site is served with (four-site audit 2026-11-17, Fable's plan T3; claude-seo
// seo-technical: security headers): made from the release build, so it allows exactly what the pages load. Scripts:
// the site's own files, the origins of the external scripts the pages load (Umami), and each inline script by its
// SHA-256 hash, never 'unsafe-inline'. Styles keep 'unsafe-inline': the pages carry style attributes, which hashes
// cannot allow without 'unsafe-hashes'. Requests (fetch, beacons) go to the site itself, the analytics host and the
// live chat's API; frames and form posts only where a page has them. JSON-LD blocks are data, not scripts: CSP does
// not apply to them.

import { createHash } from 'node:crypto';

// Script types a browser runs (an empty type is JavaScript); JSON-LD and other data blocks are not run.
const RUNS = /^(|text\/javascript|application\/javascript|module)$/i;
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((value) => value !== undefined) ?? null;
const originOf = (url) => { try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) ? parsed.origin : null; } catch { return null; } };

// The CSP hash source of one inline script's text, exactly as the page carries it.
export const scriptHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// What the pages load: { inline: [hash sources], scriptOrigins, connectOrigins, frameOrigins, formOrigins, handlers }.
// handlers: inline event handler attributes (onclick=), which a hash-based policy blocks.
export function pageSources(htmls) {
  const inline = new Set();
  const scripts = new Set();
  const connect = new Set();
  const frames = new Set();
  const forms = new Set();
  let handlers = 0;
  for (const html of htmls) {
    for (const [, open, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!RUNS.test((attribute(open, 'type') ?? '').trim())) continue;
      const src = attribute(open, 'src');
      if (src) {
        const origin = originOf(src);
        if (origin) { scripts.add(origin); connect.add(origin); }
        // Umami may send its events to another host than the one serving its script.
        const host = originOf(attribute(open, 'data-host-url') ?? '');
        if (host) connect.add(host);
      } else if (body.trim()) inline.add(scriptHash(body));
    }
    for (const [tag] of html.matchAll(/<iframe\b[^>]*>/gi)) { const origin = originOf(attribute(tag, 'src') ?? ''); if (origin) frames.add(origin); }
    for (const [tag] of html.matchAll(/<form\b[^>]*>/gi)) { const origin = originOf(attribute(tag, 'action') ?? ''); if (origin) forms.add(origin); }
    // The live chat's API (ChatLauncher.astro data-base-url): its client calls it with fetch.
    for (const [tag] of html.matchAll(/<[^>]+\sdata-base-url\s*=[^>]*>/gi)) { const origin = originOf(attribute(tag, 'data-base-url') ?? ''); if (origin) connect.add(origin); }
    handlers += (html.match(/<[a-z][^>]*\son[a-z]+\s*=/gi) ?? []).length;
  }
  const sorted = (set) => [...set].sort();
  return { inline: sorted(inline), scriptOrigins: sorted(scripts), connectOrigins: sorted(connect), frameOrigins: sorted(frames), formOrigins: sorted(forms), handlers };
}

// The policy for those sources, as one header value. Nothing in it may contain a quote or a semicolon of its own.
export function contentSecurityPolicy(sources) {
  const list = (...items) => items.flat().filter(Boolean).join(' ');
  const directives = [
    ['default-src', "'self'"],
    ['script-src', list("'self'", sources.scriptOrigins, sources.inline)],
    ['style-src', "'self' 'unsafe-inline'"],
    ['img-src', "'self' data:"],
    ['font-src', "'self' data:"],
    ['connect-src', list("'self'", sources.connectOrigins)],
    ['frame-src', sources.frameOrigins.length ? list(sources.frameOrigins) : "'none'"],
    ['form-action', list("'self'", sources.formOrigins)],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    // The same rule as X-Frame-Options SAMEORIGIN, for browsers that read only CSP.
    ['frame-ancestors', "'self'"],
    ['upgrade-insecure-requests', ''],
  ];
  const value = directives.map(([name, sourceList]) => (sourceList ? `${name} ${sourceList}` : name)).join('; ');
  if (/"/.test(value)) throw new Error('a CSP source contains a double quote');
  return value;
}

// The inline script hashes a policy allows ('sha256-...' sources of its script-src).
export function policyHashes(policy) {
  const scriptSrc = String(policy ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src ')) ?? '';
  return new Set(scriptSrc.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []);
}

// The policy a generated headers snippet sets (deploy/nginx/<host>-headers.conf), or null.
export const snippetPolicy = (snippet) => String(snippet ?? '').match(/add_header Content-Security-Policy "([^"]*)"/)?.[1] ?? null;

// Inline scripts of the pages the policy does not allow: [hash].
export const unallowedScripts = (policy, htmls) => { const allowed = policyHashes(policy); return pageSources(htmls).inline.filter((hash) => !allowed.has(hash)); };
