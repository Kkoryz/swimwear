// Preflight check on the privacy page's table when Site Factory gives it (Site Factory integ deb67119, 2026-11-17: the
// package's data_practices, rendered as given by DataPracticesBlock.astro): its rows must be, row by row, the ones
// this site's own configuration gives (lib/data-practices.mjs dataPractices: the forms its pages carry, the services
// of src/data/site-runtime.json). A table that is not what the site collects is collection_mismatch, and the site is
// not released: Site Factory's switches (project.yaml site_services) or 08's runtime is to be corrected.
import { collectionMismatch, dataPractices, siteForms } from '../data-practices.mjs';

export function collectionProblems(ctx) {
  const own = dataPractices({ ...siteForms(ctx.pages), runtime: ctx.runtime }).items;
  return ctx.pages.flatMap((page) => (page.blocks ?? []).filter((block) => block.type === 'dataPractices' && block.practices).map((block) => ({ route: page.route, problems: collectionMismatch(block.practices.rows, own) })))
    .filter((item) => item.problems.length)
    .map(({ route, problems }) => ({ detail: `${route}: the table of what this site collects (the package's data_practices) is not what the site collects: ${problems.join('; ')} (correct Site Factory's project.yaml site_services or src/data/site-runtime.json, then build again)`, items: [route] }));
}

export const COLLECTION_CHECKS = [
  { code: 'collection_mismatch', level: 'hold', run: collectionProblems },
];
