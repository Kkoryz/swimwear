import { resolve } from 'node:path';
import { blogPages, isReleaseBuild, plainText } from './blog.mjs';
import { galleryShown } from './gallery.mjs';
import { readJson, writeJson } from './json-io.mjs';
import { updatePageDates } from './page-dates.mjs';
import { withPhotoBriefs } from './photo-briefs.mjs';
import { withPostAuthors } from './site-people.mjs';

// Each page's main keyword (the site plan's primary_query) by route, from the plan the last import used; empty without one.
export async function mainKeywords(root) {
  const report = await readJson(resolve(root, 'docs/research/site-factory-import.json'), null);
  const plan = report?.inputs?.pagesPlan ? await readJson(report.inputs.pagesPlan, null) : null;
  return new Map((plan?.pages ?? []).filter((page) => page.primary_query).map((page) => [page.url, page.primary_query]));
}

// Every page the renderer builds: Site Factory pages, clearly marked placeholder pages and the blog (blog.mjs), with
// the photo briefs planned from their copy laid on their sections as the renderer has them (lib/photo-briefs.mjs);
// photoBriefs false: the pages as written. release: the pages of a release build (blog.mjs blogPages; by default as
// SITE_RELEASE says).
export async function loadSitePages(root, { photoBriefs = true, release = isReleaseBuild() } = {}) {
  const authored = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  const placeholders = await readJson(resolve(root, 'src/data/placeholder-pages.json'), []);
  const posts = await readJson(resolve(root, 'src/data/blog-posts.json'), []);
  const blog = await readJson(resolve(root, 'src/data/blog.json'), null);
  // A post signed by the company is signed by the team's writer (lib/site-people.mjs), as the renderer has it.
  const pages = withPostAuthors([...authored, ...placeholders, ...blogPages(posts, blog, { release })]);
  return photoBriefs ? withPhotoBriefs(pages, await readJson(resolve(root, 'src/data/photo-briefs.json'), null)) : pages;
}

// Records when each page's content last changed (src/data/page-dates.json, lib/page-dates.mjs).
export async function recordPageDates({ root = process.cwd(), today } = {}) {
  const path = resolve(root, 'src/data/page-dates.json');
  const previous = await readJson(path, {});
  const dates = updatePageDates(await loadSitePages(root), previous, today);
  await writeJson(path, dates);
  return { dates, changed: Object.keys(dates).filter((route) => previous[route]?.hash !== dates[route].hash) };
}

// Every visible string a page must render, used to prove that no authored copy was dropped.
// builtRoutes: related-page links to pages not built yet are not shown (CtaBlock), so they are not copy to place.
// variantOf (block -> the variant it renders with, lib/media-slots.mjs resolveVariant): what a variant leaves out by
// design is not copy to place either: a closing form band has the form in place of its button (CtaBlock), a table as
// cards titles each card with its first cell and so shows no first column heading (TableBlock).
// linkableRoutes: the related links name indexable pages only (RelatedPagesBlock isLinkable, site13 blind audit H-4): one
// to a page held out of the index is not shown, so it is not copy to place either.
export function pageCopy(page, builtRoutes = null, variantOf = null, linkableRoutes = null) {
  const hero = page.hero || {};
  const strings = [hero.eyebrow, hero.heading,...(hero.lead || []).map(plainText), hero.cta?.label, hero.secondaryCta?.label];
  for (const block of page.blocks || []) {
    const variant = variantOf?.(block);
    strings.push(block.eyebrow, block.heading, ...(block.paragraphs || []).map(plainText), ...(block.list?.items || []).map(plainText), ...(block.table ? [...block.table.columns, ...block.table.rows.flat().map(plainText)] : []), ...(block.steps || []).flatMap((step) => (typeof step === 'string' ? [step] : [step.heading, plainText(step.text), step.provides, step.duration])), block.submitLabel);
    // A gallery shows what exists (lib/gallery.mjs); what it leaves out is not copy to place.
    const shown = block.type === 'gallery' && builtRoutes ? galleryShown(block, (href) => builtRoutes.has(href)) : null;
    for (const item of shown ? [...shown.cards, ...shown.names].map((entry) => entry.item) : block.items || []) {
      strings.push(item.caption, item.heading, item.title, item.text && plainText(item.text), item.note && plainText(item.note), item.value, item.label, item.quote, item.author, ...(item.paragraphs || []).map(plainText), item.question, ...(item.answer ? item.answer.split('\n').map(plainText) : []));
      // A logo with an image carries its name as alt text; a logo slot without one shows the name.
      if (block.type === 'logos' && !item.media) strings.push(item.name);
      // The owner's proof: certificates, case studies and who said a testimonial.
      if (block.type === 'certifications') strings.push(item.name, item.issuer, item.scope, item.number, item.validUntil);
      if (block.type === 'styleGrid') strings.push(item.name, item.intro);
      if (block.type === 'orderCase') strings.push(item.product);
      if (block.type === 'stats') strings.push(item.unit);
      if (block.type === 'pricing') strings.push(item.price.amount, item.price.unit, item.price.note);
      if (block.type === 'swatches') strings.push(item.name, item.composition);
      if (block.type === 'team') strings.push(item.name, item.bio);
      if (block.type === 'caseStudies') strings.push(item.client, item.summary && plainText(item.summary), ...(item.results || []).flatMap((result) => [result.value, result.label]));
      strings.push(item.headline, item.role, item.company, item.country);
    }
    for (const field of block.fields || []) strings.push(field.label);
    strings.push(...(block.columns || []).slice(block.type === 'table' && variant === 'cards' ? 1 : 0), ...(block.rows || []).flat().map(plainText));
    if (!(block.type === 'cta' && variant === 'form')) strings.push(block.cta?.label, block.secondaryCta?.label);
    for (const link of shown ? shown.links : block.links || []) {
      const local = link.href?.startsWith('/');
      if (['cta', 'relatedPages'].includes(block.type) && builtRoutes && local && !builtRoutes.has(link.href)) continue;
      if (block.type === 'relatedPages' && linkableRoutes && local && !linkableRoutes.has(link.href.split('#')[0])) continue;
      strings.push(link.label);
    }
  }
  return strings.filter((value) => typeof value === 'string' && value.trim());
}

export const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();
