// Content fingerprints of a built site, to compare the owner's sites with each other: Google's spam policies name
// "multiple websites with slight variations" (doorways) and scaled content spread over several sites. Each page's main
// text becomes a set of 5-word shingles, summarised by a 128-value MinHash; the share of equal values estimates the
// Jaccard similarity of two pages' shingle sets.

export const FINGERPRINT_SCHEMA = 'seo-site-content-fingerprint-v1';
export const SHINGLE_WORDS = 5;
const HASHES = 128;
// Pages this alike across two sites read as the same page with a few words changed.
export const NEAR_DUPLICATE = 0.5;

// The page's own text: <main> without scripts, styles, the breadcrumb and the template's chat window.
export function mainText(html) {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? html;
  return textWords(main
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' '));
}

// Words of a text in any script, lower case and space-separated; Chinese and Japanese characters count one each
// (they are not written with spaces).
export const textWords = (text) => text.normalize('NFKC').toLowerCase()
  .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' $& ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// FNV-1a, 32-bit.
const hash32 = (text) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
};

export function shingles(text, size = SHINGLE_WORDS) {
  const words = text.split(' ').filter(Boolean);
  const set = new Set();
  for (let index = 0; index + size <= words.length; index += 1) set.add(hash32(words.slice(index, index + size).join(' ')));
  return set;
}

// MinHash with 128 seeded permutations h_i(x) = (a_i * x + b_i) mod p over 32-bit shingle hashes.
const PRIME = 4294967311n;
const SEEDS = Array.from({ length: HASHES }, (_, index) => [BigInt(hash32(`a${index}`) | 1), BigInt(hash32(`b${index}`))]);
export function minhash(set) {
  if (!set.size) return [];
  const values = [...set].map(BigInt);
  return SEEDS.map(([a, b]) => {
    let min = PRIME;
    for (const value of values) { const permuted = (a * value + b) % PRIME; if (permuted < min) min = permuted; }
    return Number(min);
  });
}

export function similarity(left, right) {
  if (!left.length || !right.length) return 0;
  let equal = 0;
  for (let index = 0; index < HASHES; index += 1) if (left[index] === right[index]) equal += 1;
  return equal / HASHES;
}

// Near-duplicate pages between this site's fingerprint and others': [{ route, host, otherRoute, similarity }].
export function crossSiteDuplicates(own, others, threshold = NEAR_DUPLICATE) {
  const found = [];
  for (const other of others) {
    if (other.host === own.host) continue;
    for (const [route, page] of Object.entries(own.pages)) {
      let best = null;
      for (const [otherRoute, otherPage] of Object.entries(other.pages)) {
        const score = similarity(page.minhash, otherPage.minhash);
        if (score >= threshold && (!best || score > best.similarity)) best = { route, host: other.host, otherRoute, similarity: Number(score.toFixed(2)) };
      }
      if (best) found.push(best);
    }
  }
  return found;
}
