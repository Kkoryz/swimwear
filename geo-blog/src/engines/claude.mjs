import { dedupeCitations, externalLinks, sleep, waitForHuman, waitStable } from '../browser.mjs';

const OWN = ['claude.ai', 'anthropic.com'];
const EDITOR = 'div.ProseMirror[contenteditable="true"]';

// Incognito chat; the prompt is prefilled from ?q= and sent with End + Enter.
export async function ask(page, prompt) {
  // Incognito chats have no URL of their own, so the app can keep the previous chat on screen: start from a blank page
  // and accept only a reply row that appears after this send.
  await page.goto('about:blank');
  await page.goto(`https://claude.ai/new?incognito=true&q=${encodeURIComponent(prompt)}`, { waitUntil: 'domcontentloaded' });
  await waitForHuman(page, async () => (await page.locator(EDITOR).count()) === 0 && /login/.test(page.url()), 'Claude is not signed in');
  const editor = page.locator(EDITOR).first();
  await editor.click({ timeout: 30000 });
  const rowsBefore = await page.locator('[data-is-streaming]').count();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('[data-is-streaming]').length > n, rowsBefore, { timeout: 60000 })
    .catch(() => { throw new Error('the prompt was not sent (no new reply appeared)'); });

  const row = page.locator('[data-is-streaming]').last();
  const markdown = row.locator('.standard-markdown, .progressive-markdown');
  await waitStable(async () => String((await markdown.allInnerTexts()).join('').length), {
    done: async () => (await row.getAttribute('data-is-streaming')) === 'false' && (await page.locator('button[aria-label*="Stop"]').count()) === 0,
  });
  const answer = (await markdown.allInnerTexts()).join('\n\n').trim();

  const citations = (await externalLinks(row.locator('a[href]'), OWN)).map((c) => ({ ...c, how: 'anchor' }));
  // "+N" labels merge several sources; hovering shows them in a popover outside the message row.
  const merged = row.locator('a, button, span').filter({ hasText: /\+\d+\s*$/ });
  for (let i = 0; i < (await merged.count()); i++) {
    try {
      await merged.nth(i).scrollIntoViewIfNeeded();
      await merged.nth(i).hover({ timeout: 3000 });
      await sleep(1500);
      const popover = await externalLinks(page.locator('[data-radix-popper-content-wrapper] a[href], [role="tooltip"] a[href]'), OWN);
      citations.push(...popover.map((c) => ({ ...c, how: 'popover' })));
    } catch { /* skipped */ }
  }
  const model = await page.locator('button').filter({ hasText: /(Opus|Sonnet|Haiku|Fable)/ }).first().innerText().catch(() => null);
  return {
    page_url: page.url(),
    model: model?.replace(/\s+/g, ' ').trim() ?? null,
    answer_text: answer,
    citations: dedupeCitations(citations),
    web_search_used: citations.length > 0 || /Searched the web/i.test(await row.innerText()),
    notes: '',
  };
}
