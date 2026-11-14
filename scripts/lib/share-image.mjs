// The share image (og:image) of a brand kit the site makes for itself (make-wordmark.mjs, build-brand-kit.mjs): the
// logo centred on the site's page colour, at the size social networks show. Every page names it (the SEO audit fails a
// page without one), as it does a supplied kit's og-image.png.

export const SHARE_SIZE = Object.freeze({ width: 1200, height: 630 });

export async function writeShareImage(sharp, { logo, background, path }) {
  const fitted = await sharp(logo).resize({ width: 720, height: 220, fit: 'inside' }).png().toBuffer();
  await sharp({ create: { ...SHARE_SIZE, channels: 4, background } }).composite([{ input: fitted, gravity: 'centre' }]).png().toFile(path);
  return { ...SHARE_SIZE };
}
