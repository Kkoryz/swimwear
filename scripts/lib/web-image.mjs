// The published files of a photo, the same for every source (generated library, the site's own photos, the chat
// avatar): responsive WebP, at most WEB_WIDTHS wide, never enlarged; 960 wide is the main size. The source's own
// metadata never goes along. While site.json imageSeo is on, each file carries the site's XMP (xmpPacket: the IPTC
// digital source type its record states, the creator, credit line and copyright notice; lib/image-seo.mjs siteXmp),
// the IPTC photo metadata Google Images reads from the file (developers.google.com/search/docs/appearance/
// structured-data/image-license-metadata); switched off, the files have no metadata, byte for byte as before.
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const WEB_WIDTHS = Object.freeze([480, 960, 1536]);
// A hero photo's sizes (site13 blind audit M4: sizes="100vw" chose the 1536 file on a DPR 3 phone, the non-home heroes'
// LCP 3 to 4.5 s on slow mobile): up to the phone breakpoint (the phone crops' max-width: 767px) the slot is declared
// PHONE_HERO_SLOT px, so a DPR 1 phone takes the 480 file and a DPR 2 or 3 phone the 960 (320 x 3 = 960); wider, the
// layout's own sizes.
export const PHONE_HERO_SLOT = 320;
export const heroSizes = (wide = '100vw') => `(max-width: 767px) ${PHONE_HERO_SLOT}px, ${wide}`;
const MAIN_WIDTH = 960;
const WEBP_QUALITY = 80;

// The widths a source this wide is published at (a source narrower than the smallest is published at its own width).
export function webWidths(sourceWidth) {
  const fitting = WEB_WIDTHS.filter((width) => width <= sourceWidth);
  return fitting.length ? fitting : [sourceWidth];
}

// What a published file may weigh (four-site audit 2026-11-17: the sites' 1536px heroes were 300-400 KB at quality 80):
// the stage 10 SEO audit fails an image fetched at once over 200 KB and warns a content photo over it
// (lib/seo-site-checks.mjs image_weight). A file over it is encoded again a quality step lower, then (unless keepWidth)
// a little narrower (the four sites' detailed photos stayed 195-265 KB at 1536px even at quality 56, and 95-150 KB at
// 1280px and quality 72); one still over is written at the last step and the audit names it.
export const WEB_IMAGE_MAX_BYTES = 200 * 1024;
const WEBP_QUALITIES = Object.freeze([WEBP_QUALITY, 72, 64, 56]);
const WIDTH_STEPS = Object.freeze([1, 0.875, 0.75]);
// Past the steps, a file still over the budget is made narrower again, an eighth at a time, at the last quality, down
// to the smallest published width: a published file is within the budget, its srcset naming the width it came out at
// (site12 claude-seo audit 2026-11-17, I-1: 1536-wide photos of 400-525 KB, published before the budget; their re-render
// in place kept the width at any weight).
const NARROWER = 0.875;

// The XMP packet of a published photo (IPTC Photo Metadata in XMP): Iptc4xmpExt:DigitalSourceType as the IPTC term's
// URI (trainedAlgorithmicMedia: http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia; none when no
// record states one), dc:creator (Creator), photoshop:Credit (Credit Line), dc:rights (Copyright Notice).
const xmlText = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function xmpPacket({ sourceType = null, creator, credit = creator, copyright }) {
  const type = /^[a-z][A-Za-z]+$/.test(sourceType ?? '') ? ` Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/${sourceType}"` : '';
  return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"'
    + `${type} photoshop:Credit="${xmlText(credit)}">`
    + `<dc:creator><rdf:Seq><rdf:li>${xmlText(creator)}</rdf:li></rdf:Seq></dc:creator>`
    + `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(copyright)}</rdf:li></rdf:Alt></dc:rights>`
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="r"?>';
}
// A sharp pipeline with the packet in its output, or as it is without one.
export const withXmp = (image, xmp) => (xmp ? image.withXmp(xmp) : image);

// One published size of a source file: { width, height, size, quality }. keepWidth: the size the page already names
// (render-web-images.mjs re-renders files in place), kept while a quality step brings it within the budget; else the
// file comes out narrower and the caller names its new width.
// xmp: the XMP packet the file carries (xmpPacket), or null for none.
export async function renderWebp(sharp, source, width, target, { keepWidth = false, xmp = null } = {}) {
  const encode = async (wide, quality) => ({ ...(await withXmp(sharp(source).resize({ width: wide }).webp({ quality }), xmp).toBuffer({ resolveWithObject: true })), quality });
  const within = (file) => file.data.length <= WEB_IMAGE_MAX_BYTES;
  let encoded = null;
  search: for (const step of keepWidth ? [1] : WIDTH_STEPS) {
    for (const quality of WEBP_QUALITIES) {
      encoded = await encode(Math.round(width * step), quality);
      if (within(encoded)) break search;
    }
  }
  for (let wide = Math.round(encoded.info.width * NARROWER); !within(encoded) && wide >= WEB_WIDTHS[0]; wide = Math.round(wide * NARROWER)) encoded = await encode(wide, WEBP_QUALITIES.at(-1));
  await writeFile(target, encoded.data);
  return { width: encoded.info.width, height: encoded.info.height, size: encoded.data.length, quality: encoded.quality };
}

// Every published size of source as public/<dir>/<name>-<width>.webp: the main size's { src, srcset, width, height }.
export async function writeResponsiveWebp(sharp, source, { root, dir, name, xmp = null }) {
  const { width } = await sharp(source).metadata();
  const files = [];
  for (const size of webWidths(width)) {
    const src = `/${dir}/${name}-${size}.webp`;
    const info = await renderWebp(sharp, source, size, resolve(root, 'public', src.slice(1)), { xmp });
    files.push({ src, size, width: info.width, height: info.height });
  }
  const main = files.find((file) => file.size === MAIN_WIDTH) ?? files.at(-1);
  return { src: main.src, srcset: files.map((file) => `${file.src} ${file.width}w`).join(', '), width: main.width, height: main.height };
}

// A WebP file's width from its header (lossy VP8, lossless VP8L, extended VP8X), or null.
export function webpWidth(file) {
  const head = Buffer.alloc(30);
  const handle = openSync(file, 'r');
  try { readSync(handle, head, 0, 30, 0); } finally { closeSync(handle); }
  if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = head.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') return head.readUInt16LE(26) & 0x3fff;
  if (chunk === 'VP8L') return (head.readUInt32LE(21) & 0x3fff) + 1;
  if (chunk === 'VP8X') return head.readUIntLE(24, 3) + 1;
  return null;
}

// The srcset of a photo published by writeResponsiveWebp, read back from its files where its record keeps one size
// only (a blog post's image: the widest, for its share image): every WEB_WIDTHS file of its name beside it in public/
// (<dir>/<name>-<width>.webp), each at the width it came out at; null where src is no such file or it has no other size.
// 2026-11-20: MotelPilot's /blog/ cards loaded the 1536px file on a phone where the 960 one was built.
export function publishedSrcset(src, { publicDir = resolve('public') } = {}) {
  const match = /^(\/.+-)(\d+)\.webp$/.exec(String(src ?? ''));
  if (!match) return null;
  const files = WEB_WIDTHS.map((size) => `${match[1]}${size}.webp`).filter((path) => existsSync(resolve(publicDir, path.slice(1))));
  if (files.length < 2 || !files.includes(src)) return null;
  const sized = files.map((path) => [path, webpWidth(resolve(publicDir, path.slice(1)))]);
  if (sized.some(([, width]) => !width)) return null;
  return sized.map(([path, width]) => `${path} ${width}w`).join(', ');
}
// A photo's srcset: its record's own, else its built sizes read back (publishedSrcset); undefined without either, so a
// photo whose sizes were not built names its one file only.
export const photoSrcset = (image, options) => image?.srcset || publishedSrcset(image?.src, options) || undefined;

// The chat agent's headshot: a 96-pixel square from the top of the master. No XMP with any switch: an interface icon,
// not a content photo (no ImageObject, not in the image sitemap); what made it is recorded beside its master.
export const renderAvatar = (sharp, source, target) => sharp(source).resize(96, 96, { fit: 'cover', position: 'top' }).webp({ quality: 85 }).toFile(target);
