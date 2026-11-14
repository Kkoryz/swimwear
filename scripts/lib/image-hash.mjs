// Look-alike detection for generated photos: a difference hash of each image and the bits two hashes differ in.

// 64-bit difference hash from a 9x8 greyscale thumbnail (raw pixel bytes, row by row).
export function differenceHash(pixels) {
  let bits = '';
  for (let row = 0; row < 8; row += 1) for (let column = 0; column < 8; column += 1) bits += pixels[row * 9 + column] > pixels[row * 9 + column + 1] ? '1' : '0';
  return bits;
}
export const hamming = (left, right) => [...left].reduce((count, bit, index) => count + (bit !== right[index] ? 1 : 0), 0);
