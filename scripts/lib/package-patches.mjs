// A site's own changes to the Site Factory project it is built from (content/package-patches/*.json, in their order of
// name), applied when the project is frozen (freeze-site-factory.mjs), so every snapshot, and every step that reads it
// (the import, the placeholders, the menus, the site tree check), has them however often the project is imported.
// Site Factory sends some changes to a built site as instructions, not as a new package (owner 2026-11-18, Strandmill
// swim_1117d_fix4: the toddler and teen pages merged into the children's page): pages taken out of the package, the
// site tree and the site plan, with every entry and link that points at them (menus, routes, link plan, structural
// links, breadcrumbs, link lists; a link in copy to one left as its words); and sections and FAQ questions added to a
// page in the package's own form, so the import lays them out, photos included, as it does any other.
// A patch: { source?, removePages: [{ page_id, url, merged_into?, reason? }], insertSections: [{ page_id, after,
// sections: [<package section>] }], addQuestions: [{ page_id, section, qa: [{ question, answer }] }] }.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readJson } from './json-io.mjs';

export const PACKAGE_PATCHES_DIR = 'content/package-patches';

// The site's patches, in their order of name: [{ name, ...patch }] (none without the folder).
export async function readPackagePatches(root) {
  const dir = resolve(root, PACKAGE_PATCHES_DIR);
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const patches = [];
  for (const name of names) patches.push({ name, ...(await readJson(resolve(dir, name))) });
  return patches;
}

// A link's or a field's site route ("/a/" of "/a/#b", "https://host/a/"), else null.
const routeOf = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return new URL(value, 'http://site.invalid').pathname; } catch { return null; }
};
const ID_KEYS = ['page_id', 'link_id', 'id'];
const ROUTE_KEYS = ['url', 'item'];
const pointsAt = (value, gone) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && (ID_KEYS.some((key) => gone.ids.has(value[key])) || ROUTE_KEYS.some((key) => gone.routes.has(routeOf(value[key]))));

// A value without what points at the pages gone: an entry naming one (its id or route) left out of its list, a field
// keyed by one's id taken out, a Markdown link to one left as its words.
function without(value, gone) {
  if (typeof value === 'string') return value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (link, words, target) => (gone.routes.has(routeOf(target)) ? words : link));
  if (Array.isArray(value)) return value.filter((item) => !pointsAt(item, gone)).map((item) => without(item, gone));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !gone.ids.has(key)).map(([key, item]) => [key, without(item, gone)]));
  return value;
}

const plainText = (text) => String(text).replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1');

// The project's files with the patches applied: { authoringPackage, tree, sitePlan, applied: [{ patch, removed,
// inserted, questions, already }] }. Nothing given is changed. A page named twice, a removed page that still has pages
// under it, a page or section to add to that is not there: each stops the freeze, as a broken tree does. What a patch
// adds that the package already has (its section id, its question) is left as it is, under already.
export function patchProject({ authoringPackage, tree, sitePlan }, patches = []) {
  let pkg = structuredClone(authoringPackage);
  let plan = structuredClone(sitePlan);
  let siteTree = structuredClone(tree);
  const applied = [];
  for (const patch of patches) {
    const record = { patch: patch.name ?? null, ...(patch.source ? { source: patch.source } : {}), removed: [], inserted: [], questions: [], already: [] };
    const removals = patch.removePages ?? [];
    if (removals.length) {
      const gone = { ids: new Set(), routes: new Set() };
      for (const removal of removals) {
        const atRoute = removal.url ? pkg.pages.find((item) => routeOf(item.url) === routeOf(removal.url)) : null;
        if (atRoute && removal.page_id && atRoute.page_id !== removal.page_id) throw new Error(`${patch.name}: ${removal.url} is ${atRoute.page_id} in the package, not ${removal.page_id}`);
        const page = atRoute ?? pkg.pages.find((item) => item.page_id === removal.page_id);
        const id = removal.page_id ?? page?.page_id;
        const url = removal.url ?? page?.url ?? plan?.routes?.[id]?.url ?? null;
        if (!id) throw new Error(`${patch.name}: a page to remove needs its page_id`);
        gone.ids.add(id);
        if (url) gone.routes.add(routeOf(url));
        record.removed.push({ page_id: id, url, ...(removal.merged_into ? { merged_into: removal.merged_into } : {}), ...(removal.reason ? { reason: removal.reason } : {}), inPackage: Boolean(page), inTree: Boolean(siteTree?.pages?.some((item) => item.id === id)) });
      }
      const under = (siteTree?.pages ?? []).filter((item) => !gone.ids.has(item.id) && gone.ids.has(item.parent));
      if (under.length) throw new Error(`${patch.name}: ${under.map((item) => item.id).join(', ')} sits under a page the patch removes; name where it goes`);
      pkg = { ...without({ ...pkg, pages: [] }, gone), pages: pkg.pages.filter((item) => !gone.ids.has(item.page_id) && !gone.routes.has(routeOf(item.url))).map((item) => without(item, gone)) };
      if (plan) plan = without(plan, gone);
      if (siteTree?.pages) siteTree = { ...siteTree, pages: siteTree.pages.filter((item) => !gone.ids.has(item.id)).map((item) => (item.also_parents?.some((parent) => gone.ids.has(parent)) ? { ...item, also_parents: item.also_parents.filter((parent) => !gone.ids.has(parent)) } : item)) };
    }
    const pageOf = (id, what) => {
      const page = pkg.pages.find((item) => item.page_id === id);
      if (!page) throw new Error(`${patch.name}: ${what} ${id}, which the package does not have`);
      return page;
    };
    for (const insert of patch.insertSections ?? []) {
      const page = pageOf(insert.page_id, 'adds sections to');
      const at = page.sections.findIndex((section) => section.section_id === insert.after);
      if (at < 0) throw new Error(`${patch.name}: ${insert.page_id} has no section ${insert.after} to add sections after`);
      // After the section and the sections that go on from it.
      const run = new Set([insert.after]);
      let end = at;
      while (page.sections[end + 1] && run.has(page.sections[end + 1].continuation_of)) run.add(page.sections[++end].section_id);
      const fresh = [];
      for (const section of insert.sections ?? []) {
        if (!section?.section_id) throw new Error(`${patch.name}: a section added to ${insert.page_id} needs its section_id`);
        if (page.sections.some((own) => own.section_id === section.section_id)) record.already.push(`${insert.page_id} ${section.section_id}`);
        else fresh.push(section);
      }
      page.sections.splice(end + 1, 0, ...fresh);
      record.inserted.push(...fresh.map((section) => ({ page_id: insert.page_id, section_id: section.section_id, after: page.sections[page.sections.indexOf(section) - 1].section_id })));
    }
    for (const add of patch.addQuestions ?? []) {
      const page = pageOf(add.page_id, 'adds questions to');
      const section = page.sections.find((item) => item.section_id === add.section);
      if (!section) throw new Error(`${patch.name}: ${add.page_id} has no section ${add.section} to add questions to`);
      const asked = (question) => (section.qa ?? []).some((own) => own.question?.trim() === question.trim());
      const fresh = (add.qa ?? []).filter((item) => {
        if (!item?.question || !item?.answer) throw new Error(`${patch.name}: a question added to ${add.page_id} needs its question and answer`);
        if (asked(item.question)) { record.already.push(`${add.page_id} ${add.section}: ${item.question}`); return false; }
        return true;
      });
      section.qa = [...(section.qa ?? []), ...fresh];
      // The page's FAQPage holds its FAQ as the page shows it, in plain text.
      const faqPage = (page.structured_data ?? []).find((item) => item?.['@type'] === 'FAQPage');
      if (faqPage) faqPage.mainEntity = [...(faqPage.mainEntity ?? []), ...fresh.map((item) => ({ '@type': 'Question', name: plainText(item.question), acceptedAnswer: { '@type': 'Answer', text: plainText(item.answer) } }))];
      record.questions.push(...fresh.map((item) => ({ page_id: add.page_id, section: add.section, question: item.question, faqPage: Boolean(faqPage) })));
    }
    applied.push(record);
  }
  return { authoringPackage: pkg, tree: siteTree, sitePlan: plan, applied };
}
