import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import { siteXmp } from '../lib/image-seo.mjs';
import { renderWebp, withXmp, writeResponsiveWebp, xmpPacket } from '../lib/web-image.mjs';

// No cached file handles: on Windows an open handle blocks removing the files.
sharp.cache(false);
const source = () => sharp({ create: { width: 1000, height: 700, channels: 3, background: '#c86' } }).png().toBuffer();

test('the XMP packet: IPTC digital source type as its URI, creator, credit line and copyright, escaped', () => {
  const packet = xmpPacket({ sourceType: 'trainedAlgorithmicMedia', creator: 'Tapa & Co', copyright: '© 2026 Tapa & Co' });
  assert.match(packet, /^<\?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"\?>/);
  assert.match(packet, /Iptc4xmpExt:DigitalSourceType="http:\/\/cv.iptc.org\/newscodes\/digitalsourcetype\/trainedAlgorithmicMedia"/);
  assert.match(packet, /<dc:creator><rdf:Seq><rdf:li>Tapa &amp; Co<\/rdf:li><\/rdf:Seq><\/dc:creator>/);
  assert.match(packet, /photoshop:Credit="Tapa &amp; Co"/);
  assert.match(packet, /<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 Tapa &amp; Co<\/rdf:li><\/rdf:Alt><\/dc:rights>/);
  assert.doesNotMatch(xmpPacket({ creator: 'T', copyright: 'C' }), /DigitalSourceType/, 'no type without a record');
  assert.doesNotMatch(xmpPacket({ sourceType: 'bad value"', creator: 'T', copyright: 'C' }), /DigitalSourceType/);
});

test('a published file without a packet is byte for byte the plain encode; with one it carries the packet', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-xmp-'));
  try {
    const input = await source();
    const plain = await sharp(input).resize({ width: 480 }).webp({ quality: 80 }).toBuffer();
    await renderWebp(sharp, input, 480, join(root, 'a.webp'));
    assert.ok((await readFile(join(root, 'a.webp'))).equals(plain), 'no packet: as before');
    assert.equal((await sharp(join(root, 'a.webp')).metadata()).xmp, undefined);
    const packet = xmpPacket({ sourceType: 'trainedAlgorithmicMedia', creator: 'Tapa Works', copyright: '© 2026 Tapa Works' });
    await renderWebp(sharp, input, 480, join(root, 'b.webp'), { xmp: packet });
    const xmp = (await sharp(join(root, 'b.webp')).metadata()).xmp.toString();
    assert.match(xmp, /digitalsourcetype\/trainedAlgorithmicMedia/);
    assert.match(xmp, /Tapa Works/);
    // Every size of a photo, and a crop cut through withXmp, the same.
    await mkdir(join(root, 'public/media/photos'), { recursive: true });
    const web = await writeResponsiveWebp(sharp, input, { root, dir: 'media/photos', name: 'shirt', xmp: packet });
    for (const part of web.srcset.split(', ')) assert.match((await sharp(join(root, 'public', part.split(' ')[0].slice(1))).metadata()).xmp.toString(), /Tapa Works/);
    const crop = await withXmp(sharp(input).resize({ width: 300, height: 400, fit: 'cover' }).webp({ quality: 72 }), packet).toBuffer();
    assert.match((await sharp(crop).metadata()).xmp.toString(), /trainedAlgorithmicMedia/);
    assert.ok((await withXmp(sharp(input).resize({ width: 300 }).webp({ quality: 72 }), null).toBuffer()).equals(await sharp(input).resize({ width: 300 }).webp({ quality: 72 }).toBuffer()));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the site's packet only while site.json imageSeo is on and the site has a name", async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-xmp-site-'));
  try {
    await mkdir(join(root, 'src/data'), { recursive: true });
    await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Tapa Works', origin: 'https://tapaworks.test' }));
    assert.equal((await siteXmp(root))('trainedAlgorithmicMedia'), null, 'no site.json: off');
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: false }));
    assert.equal((await siteXmp(root))('trainedAlgorithmicMedia'), null);
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: true }));
    const packet = (await siteXmp(root, { year: 2026 }))('trainedAlgorithmicMedia');
    assert.match(packet, /<rdf:li xml:lang="x-default">© 2026 Tapa Works<\/rdf:li>/);
    assert.match(packet, /trainedAlgorithmicMedia/);
    await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({}));
    assert.equal((await siteXmp(root))('trainedAlgorithmicMedia'), null, 'no name yet: none');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the publishing paths, switched on: the owner's photo has a digital source type only where its record states one; an in-place re-encode carries its register's", async () => {
  const { importSiteMedia } = await import('../import-site-media.mjs');
  const { renderWebImages } = await import('../render-web-images.mjs');
  const project = await mkdtemp(join(tmpdir(), 'image-xmp-line-'));
  const root = await mkdtemp(join(tmpdir(), 'image-xmp-paths-'));
  try {
    const xmpOf = async (src) => (await sharp(await readFile(join(root, 'public', src.slice(1)))).metadata()).xmp?.toString();
    await mkdir(join(project, 'media'));
    await mkdir(join(root, 'src/data'), { recursive: true });
    await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Tapa Works', origin: 'https://tapaworks.test' }));
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: true }));
    for (const name of ['floor.png', 'made.png']) await sharp(await source()).toFile(join(project, 'media', name));
    await writeFile(join(project, 'media/media.json'), JSON.stringify({ schema_version: 'sf/media/v1', photos: [
      { file: 'floor.png', kind: 'factory', alt: 'A sewing floor.' },
      { file: 'made.png', kind: 'factory', alt: 'A cutting table.', digitalSourceType: 'trainedAlgorithmicMedia' },
    ] }));
    const { photos } = await importSiteMedia({ project, root });
    assert.match(await xmpOf(photos[0].src), /Tapa Works/);
    assert.doesNotMatch(await xmpOf(photos[0].src), /DigitalSourceType/, 'the owner’s own photo: no type is guessed');
    assert.equal('digitalSourceType' in photos[0], false);
    assert.match(await xmpOf(photos[1].src), /digitalsourcetype\/trainedAlgorithmicMedia/);
    assert.equal(photos[1].digitalSourceType, 'trainedAlgorithmicMedia');

    await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
    await mkdir(join(root, 'public/media/generated'), { recursive: true });
    await sharp(await source()).toFile(join(root, 'docs/research/images/masters/a.png'));
    await sharp(await source()).resize({ width: 480 }).webp().toFile(join(root, 'public/media/generated/a-480.webp'));
    await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: [{ id: 'a', master: 'docs/research/images/masters/a.png', origin: { digitalSourceType: 'trainedAlgorithmicMedia' }, web: { src: '/media/generated/a-480.webp', srcset: '/media/generated/a-480.webp 480w' } }] }));
    assert.equal(await renderWebImages({ root }), 1);
    assert.match(await xmpOf('/media/generated/a-480.webp'), /digitalsourcetype\/trainedAlgorithmicMedia/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(project, { recursive: true, force: true }); }
});
