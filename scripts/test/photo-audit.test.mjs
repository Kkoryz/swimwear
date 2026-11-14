import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { signatureMissing, subjectRepeat } from '../lib/photo-audit.mjs';
import { signatureFloor } from '../lib/media-slots.mjs';
import { auditAuthoringLayout } from '../audit-authoring-layout.mjs';
import subjects from '../../config/photo-subjects.json' with { type: 'json' };

test("signature_missing: a page with fewer full-width photo bands than its page type's floor", () => {
  const floors = { '/': 2, '/a/': 1, '/contact/': 0 };
  const results = [
    { route: '/', viewport: 'desktop', fullWidthPhotos: 1 },
    { route: '/', viewport: 'mobile', fullWidthPhotos: 0 },
    { route: '/a/', viewport: 'desktop', fullWidthPhotos: 1 },
    { route: '/contact/', viewport: 'desktop', fullWidthPhotos: 0 },
    { route: '/old/', viewport: 'desktop' },
  ];
  assert.deepEqual(signatureMissing(results, (route) => floors[route] ?? 3), [{ route: '/', viewport: 'desktop', issue: 'signature_missing', expected: 2, actual: 1 }]);
  // The floor is the page type's bands on a page that takes walls; a contact page takes none.
  const components = { densityBands: {}, pageTypes: { home: { mediaModules: [{ at: 0, type: 'band' }, { at: 0.6, type: 'band' }] }, contact: { mediaModules: [{ at: 0.5, type: 'band' }] } } };
  assert.equal(signatureFloor({ pageType: 'home' }, components), 2);
  assert.equal(signatureFloor({ pageType: 'contact' }, components), 0);
  assert.equal(signatureFloor({ pageType: 'about' }, components), 0);
});

test('image_subject_repeat: one subject named in too many of the site\'s photos, each photo once', () => {
  const photo = (src, alt) => ({ src, alt });
  const plain = Array.from({ length: 8 }, (_, index) => photo(`/p${index}.webp`, 'A housekeeper folds towels in a laundry room.'));
  const screens = [photo('/s1.webp', 'A manager at a laptop in a back office.'), photo('/s2.webp', 'Charts on a monitor beside a front desk.'), photo('/s2.webp', 'the same photo on another page')];
  const [found] = subjectRepeat([...plain, ...screens]);
  assert.deepEqual([found.issue, found.group, found.count, found.total, found.share], ['image_subject_repeat', 'screens', 2, 10, 0.2]);
  assert.deepEqual(subjectRepeat([...plain, ...plain.map((item, index) => photo(`/q${index}.webp`, item.alt)), ...screens]), [], 'two in eighteen is under the share');
  assert.deepEqual(subjectRepeat(screens), [], 'too few photos to judge');
  assert.deepEqual(subjectRepeat([...plain, photo('/x.webp', 'A screened porch outside room 12.'), photo('/y.webp', 'A guest checks in.')]), [], 'a whole word only: "screened" is not a screen');
  assert.ok(subjects.maxShare > 0 && subjects.groups.screens.includes('laptop'));
});

test('the layout audit fails a page missing its bands and reports a subject in too many photos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'photo-audit-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  const page = (route) => ({ id: route, route, pageType: 'solution', status: 'placeholder', seo: { title: 'T', description: 'D', canonical: route }, jsonLd: [], hero: { heading: 'H' }, blocks: [] });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page('/a/'), page('/b/')]));
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { pageTypes: { solution: { mediaModules: [{ at: 0.5, type: 'band' }] } } } }));
  await writeFile(join(root, 'site-template.json'), JSON.stringify({ mode: 'test' }));
  for (const route of ['a', 'b']) { await mkdir(join(root, 'dist', route), { recursive: true }); await writeFile(join(root, 'dist', route, 'index.html'), `<html><body><main>${route}</main></body></html>`); }
  const laptops = Array.from({ length: 12 }, (_, index) => ({ src: `/l${index}.webp`, alt: index < 4 ? 'A laptop on a desk.' : 'A motel at dusk.' }));
  const measure = async (definition, viewport) => ({ route: definition.route, viewport: viewport.id, status: 200, expectedBlocks: 1, blockCount: 1, expectedJsonLd: 0, jsonLdCount: 0, expectedCanonical: null, pageId: definition.id, brandVisible: true, h1Count: 1, horizontalOverflow: false, unplacedCopy: [], unresolvedLinks: [], maxGap: 100, boundaryGaps: [], grids: [], mediaSlots: [], fullWidthPhotos: definition.route === '/a/' ? 1 : 0, photos: laptops, density: null, lowContrast: [], textOverlaps: [], visual: { blocks: [], colours: [], photos: [] } });
  await assert.rejects(auditAuthoringLayout({ baseUrl: 'http://x.test/', rootDir: root, measure, fresh: true }), /failed with 1 issue/);
  const report = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.deepEqual(report.failures, [{ route: '/b/', viewport: 'desktop', issue: 'signature_missing', expected: 1, actual: 0 }]);
  assert.deepEqual(report.warnings.filter((warning) => warning.issue === 'image_subject_repeat').map((warning) => [warning.count, warning.total]), [[4, 12]]);
});
