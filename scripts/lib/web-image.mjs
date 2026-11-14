// The published files of a photo, the same for every source (generated library, the site's own photos, the chat
// avatar): responsive WebP without metadata, at most WEB_WIDTHS wide, never enlarged; 960 wide is the main size.
import { resolve } from 'node:path';

export const WEB_WIDTHS = Object.freeze([480, 960, 1536]);
const MAIN_WIDTH = 960;
const WEBP_QUALITY = 80;

// The widths a source this wide is published at (a source narrower than the smallest is published at its own width).
export function webWidths(sourceWidth) {
  const fitting = WEB_WIDTHS.filter((width) => width <= sourceWidth);
  return fitting.length ? fitting : [sourceWidth];
}

// One published size of a source file.
export const renderWebp = (sharp, source, width, target) => sharp(source).resize({ width }).webp({ quality: WEBP_QUALITY }).toFile(target);

// Every published size of source as public/<dir>/<name>-<width>.webp: the main size's { src, srcset, width, height }.
export async function writeResponsiveWebp(sharp, source, { root, dir, name }) {
  const { width } = await sharp(source).metadata();
  const files = [];
  for (const size of webWidths(width)) {
    const src = `/${dir}/${name}-${size}.webp`;
    const info = await renderWebp(sharp, source, size, resolve(root, 'public', src.slice(1)));
    files.push({ src, width: info.width, height: info.height });
  }
  const main = files.find((file) => file.width === MAIN_WIDTH) ?? files.at(-1);
  return { src: main.src, srcset: files.map((file) => `${file.src} ${file.width}w`).join(', '), width: main.width, height: main.height };
}

// The chat agent's headshot: a 96-pixel square from the top of the master.
export const renderAvatar = (sharp, source, target) => sharp(source).resize(96, 96, { fit: 'cover', position: 'top' }).webp({ quality: 85 }).toFile(target);
