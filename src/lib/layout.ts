// Layout decisions from the content itself: a block's pattern variant, the density band of its copy, the columns of an
// equal grid and the flow of its sentences. Pure: no data files.
import { resolveVariant } from '../../scripts/lib/media-slots.mjs';
import { SECTION_WORDS } from '../../scripts/lib/rules.mjs';
import { variants } from './site-data';
import type { Block } from './types';

// Pattern variant for one block: the content's explicit request, then the page type's reference pattern
// (split rows cycle through the sequence observed on the matching reference page), then the template default.
export function blockVariant(block: Block, pageType: string, splitIndex: number): string | undefined {
  return resolveVariant(block, pageType, splitIndex, variants);
}

// Density band from the actual copy length, never from the reference page's section height.
export function density(words = 0): 'compact' | 'standard' | 'long' {
  if (words < SECTION_WORDS.standard) return 'compact';
  if (words < SECTION_WORDS.long) return 'standard';
  return 'long';
}

// Equal-grid plan (scripts/lib/block-layout.mjs, shared with the layout plan).
export { gridPlan } from '../../scripts/lib/block-layout.mjs';

// Splits verbatim paragraphs into a lead sentence and short runs of sentences. Layout only: no word changes.
export function textFlow(paragraphs: string[], { lead = true, maxWords = 48 } = {}) {
  // An inline link ([label](/route/)) is never split across sentences: it is set aside while the text is split.
  const links: string[] = [];
  const hold = (text: string) => text.replace(/\[[^\]]+\]\([^)\s]+\)/g, (link) => `\u0000${links.push(link) - 1}\u0000`);
  const restore = (text: string) => text.replace(/\u0000(\d+)\u0000/g, (_, index) => links[Number(index)]);
  const sentences = paragraphs.flatMap((paragraph) => hold(paragraph).split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/).map(restore));
  const words = (text: string) => text.split(/\s+/).length;
  const total = sentences.reduce((sum, sentence) => sum + words(sentence), 0);
  const leadSentence = lead && total >= 60 && sentences.length > 2 ? sentences.shift() ?? null : null;
  const runs: string[] = [];
  let current: string[] = [];
  for (const sentence of sentences) {
    if (current.length && [...current, sentence].join(' ').split(/\s+/).length > maxWords) { runs.push(current.join(' ')); current = []; }
    current.push(sentence);
  }
  if (current.length) runs.push(current.join(' '));
  return { lead: leadSentence, runs };
}
