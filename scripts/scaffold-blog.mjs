#!/usr/bin/env node

// Stage 08 canary for the blog templates: clearly marked placeholder posts (noindex, "[Placeholder]" copy, the site's
// own generated photos) so the hub and article layouts can be built and audited before any article is written.
// Leaves published posts alone and replaces only earlier placeholders. Removed again with --remove.
// Usage: node scripts/scaffold-blog.mjs [--count 4] [--remove]

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

const LENGTHS = ['Article title of a typical length for this blog', 'A longer article title that wraps onto a second line on most screens', 'Short title', 'Article title with a question at the end?'];

// contactRoute: the site's contact page (its plan names it: /contact/, /contact-us/ ...).
export function placeholderPosts(count, photos = [], contactRoute = '/contact/') {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const day = String(28 - index).padStart(2, '0');
    const photo = photos.length ? photos[index % photos.length] : null;
    return {
      slug: `placeholder-article-${number}`,
      status: 'placeholder',
      category: '[Placeholder] Category',
      seo: { title: `[Placeholder] Article ${number} title`, description: '[Placeholder] Article description. Authored copy of this length will render here.' },
      title: `[Placeholder] ${LENGTHS[index % LENGTHS.length]}`,
      lead: ['[Placeholder] The answer-first opening: two or three sentences that answer the question in the title directly. Authored copy of this length will render here.'],
      datePublished: `2026-08-${day}T09:00:00Z`,
      dateModified: `2026-08-${day}T09:00:00Z`,
      author: { type: 'Organization' },
      ...(photo ? { image: { src: photo.src, alt: photo.alt, width: photo.width, height: photo.height } } : {}),
      takeaways: ['[Placeholder] First key point of the article.', '[Placeholder] Second key point of the article.', '[Placeholder] Third key point of the article.'],
      sections: [
        { heading: '[Placeholder] First section question?', paragraphs: ['[Placeholder] The first sentence answers the heading. Authored copy of this length will render here, with a link to a [product page](/) placed by the writer.', '[Placeholder] A second paragraph of supporting detail. Authored copy of this length will render here.'] },
        { heading: '[Placeholder] Second section', paragraphs: ['[Placeholder] A section with a list.'], list: { items: ['[Placeholder] List item one', '[Placeholder] List item two', '[Placeholder] List item three'] } },
        { heading: '[Placeholder] Third section with a comparison', paragraphs: ['[Placeholder] A section with a table.'], table: { columns: ['[Placeholder] Option', '[Placeholder] Detail'], rows: [['[Placeholder] A', '[Placeholder] Value'], ['[Placeholder] B', '[Placeholder] Value']] } },
        { heading: '[Placeholder] Fourth section', paragraphs: ['[Placeholder] Closing section. Authored copy of this length will render here.'] },
      ],
      faq: [{ question: '[Placeholder] A reader question?', answer: '[Placeholder] Its answer.' }],
      sources: [{ title: '[Placeholder] Source title', url: 'https://example.com/' }],
      cta: { heading: '[Placeholder] Closing call to action', text: '[Placeholder] One sentence inviting an enquiry.', label: '[Placeholder] Contact us', href: contactRoute },
    };
  });
}

export async function scaffoldBlog({ root = process.cwd(), count = 4, remove = false } = {}) {
  const path = resolve(root, 'src/data/blog-posts.json');
  const published = (await readJson(path, [])).filter((post) => post.status !== 'placeholder');
  // The site's own generated photos (the library's heroes) as featured images.
  const media = (await readJson(resolve(root, 'src/data/template-variants.json'), {})).components?.media ?? {};
  const photos = [...new Map([media.hero, ...Object.values(media.heroByRoute ?? {})].filter(Boolean).map((photo) => [photo.src, photo])).values()];
  // The closing call to action leads to the site's contact page, wherever its plan puts it.
  const pages = [...await readJson(resolve(root, 'src/data/authoring-pages.json'), []), ...await readJson(resolve(root, 'src/data/placeholder-pages.json'), [])];
  const contactRoute = pages.find((page) => page.pageType === 'contact')?.route ?? '/contact/';
  const posts = [...published, ...(remove ? [] : placeholderPosts(count, photos, contactRoute))];
  await writeJson(path, posts);
  return { published: published.length, placeholders: remove ? 0 : count };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ count: { type: 'string' }, remove: { type: 'boolean' } });
  console.log(JSON.stringify(await scaffoldBlog({ count: values.count === undefined ? 4 : Number(values.count), remove: values.remove === true })));
});
