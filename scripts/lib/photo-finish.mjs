// The finish a generated photo is published with: half-strength colour transfer (Reinhard et al. 2001, in CIE Lab)
// toward the reference photos' mean and spread, then light luminance grain, which takes off the image model's clean,
// even look (prototyped on site10, owner 2026-10-28). The master stays as made; the web copies are made from the
// finished file. Charts and boards are published as made.

const STRENGTH = 0.5;
const GRAIN = 5;
const WHITE = [0.95047, 1, 1.08883];
const toLinear = (value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
const fInverse = (t) => (t > 6 / 29 ? t ** 3 : (108 / 841) * (t - 4 / 29));

export function toLab(red, green, blue) {
  const [r, g, b] = [toLinear(red), toLinear(green), toLinear(blue)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / WHITE[0];
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / WHITE[1];
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / WHITE[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function fromLab(lightness, a, b) {
  const y = (lightness + 16) / 116;
  const [x, yy, z] = [fInverse(y + a / 500) * WHITE[0], fInverse(y) * WHITE[1], fInverse(y - b / 200) * WHITE[2]];
  return [toSrgb(3.2406 * x - 1.5372 * yy - 0.4986 * z), toSrgb(-0.9689 * x + 1.8758 * yy + 0.0415 * z), toSrgb(0.0557 * x - 0.204 * yy + 1.057 * z)];
}

// Mean and spread of each Lab channel of an image (read small).
export async function labStats(sharp, path) {
  const data = await sharp(path).resize(256, 256, { fit: 'inside' }).removeAlpha().raw().toBuffer();
  const sums = [0, 0, 0];
  const squares = [0, 0, 0];
  for (let index = 0; index < data.length; index += 3) {
    const lab = toLab(data[index], data[index + 1], data[index + 2]);
    for (let channel = 0; channel < 3; channel += 1) { sums[channel] += lab[channel]; squares[channel] += lab[channel] ** 2; }
  }
  const count = data.length / 3;
  return sums.map((sum, channel) => ({ mean: sum / count, spread: Math.sqrt(Math.max(1e-6, squares[channel] / count - (sum / count) ** 2)) }));
}

// The average of the reference photos' stats: what a photo is moved toward.
export async function finishTarget(sharp, paths) {
  const all = await Promise.all(paths.map((path) => labStats(sharp, path)));
  return [0, 1, 2].map((channel) => ({ mean: all.reduce((sum, stats) => sum + stats[channel].mean, 0) / all.length, spread: all.reduce((sum, stats) => sum + stats[channel].spread, 0) / all.length }));
}

// A small seeded generator, so a photo finished again gets the same grain.
function random(seed) {
  let state = [...seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Writes the finished photo of source to target (PNG).
export async function finishPhoto(sharp, source, target, { toward, seed }) {
  const own = await labStats(sharp, source);
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const next = random(seed);
  const out = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 3) {
    const lab = toLab(data[index], data[index + 1], data[index + 2]);
    const moved = lab.map((value, channel) => value + STRENGTH * ((value - own[channel].mean) * (toward[channel].spread / own[channel].spread) + toward[channel].mean - value));
    const grain = (next() + next() + next() - 1.5) * GRAIN;
    const [red, green, blue] = fromLab(moved[0] + grain, moved[1], moved[2]);
    out[index] = red; out[index + 1] = green; out[index + 2] = blue;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toFile(target);
  return target;
}
