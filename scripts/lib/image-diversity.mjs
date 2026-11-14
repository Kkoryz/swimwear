// Set-level checks of an image library from DINOv2 image embeddings (what a photo shows, not its pixels): pairs so
// alike a visitor would see the same shot, and the Vendi Score (the effective number of distinct photos; Friedman and
// Dieng, TMLR 2023). A pixel hash misses "same scene and pose, another garment colour"; DINOv2 is trained to ignore
// colour changes and tracks layout and pose. Calibrated on our libraries: the same photo with its colours shifted
// scores >= 0.83, different photos a median of 0.13; true look-alikes (the same flat lay, the same scene) 0.80 and up.

export const LOOK_ALIKE_COSINE = 0.8;
// A library must be at least this share as diverse (Vendi Score per photo) as the reference site's own photo library:
// a consistent style lowers the score, so the benchmark is the competitor's real set, not a fixed number. Measured
// shares of four competitor libraries range from 0.34 to 0.75.
export const REFERENCE_DIVERSITY_SHARE = 0.9;

export const cosine = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

export function normalise(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

// Eigenvalues of a small symmetric matrix (cyclic Jacobi rotations).
export function symmetricEigenvalues(matrix) {
  const size = matrix.length;
  const a = matrix.map((row) => [...row]);
  for (let sweep = 0; sweep < 100; sweep += 1) {
    let off = 0;
    for (let p = 0; p < size; p += 1) for (let q = p + 1; q < size; q += 1) off += a[p][q] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < size; p += 1) {
      for (let q = p + 1; q < size; q += 1) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < size; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < size; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return a.map((row, index) => row[index]);
}

// Vendi Score of unit embeddings: exp of the entropy of the eigenvalues of K/n, K the cosine similarity matrix.
export function vendiScore(vectors) {
  const n = vectors.length;
  if (!n) return 0;
  const kernel = vectors.map((left) => vectors.map((right) => cosine(left, right) / n));
  const entropy = symmetricEigenvalues(kernel).filter((value) => value > 1e-12).reduce((sum, value) => sum - value * Math.log(value), 0);
  return Math.exp(entropy);
}

// The photos adding least to the set's diversity (highest mean similarity to the others), most redundant first.
export function mostRedundant(photos) {
  return photos.map((photo) => ({ id: photo.id, redundancy: photos.filter((other) => other !== photo).reduce((sum, other) => sum + cosine(photo.vector, other.vector), 0) / Math.max(1, photos.length - 1) }))
    .sort((left, right) => right.redundancy - left.redundancy);
}

// Look-alike pairs among photos [{ id, vector }]: [{ keep, reject, cosine }] (the later photo is sent back).
export function lookAlikes(photos, threshold = LOOK_ALIKE_COSINE) {
  const pairs = [];
  const rejected = new Set();
  for (let later = 1; later < photos.length; later += 1) {
    for (let earlier = 0; earlier < later; earlier += 1) {
      if (rejected.has(photos[earlier].id)) continue;
      const similarity = cosine(photos[earlier].vector, photos[later].vector);
      if (similarity >= threshold) { pairs.push({ keep: photos[earlier].id, reject: photos[later].id, cosine: Number(similarity.toFixed(3)) }); rejected.add(photos[later].id); break; }
    }
  }
  return pairs;
}
