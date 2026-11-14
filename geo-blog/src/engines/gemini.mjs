import { dedupeCitations, externalLinks, sleep, waitForHuman, waitStable } from '../browser.mjs';

const OWN = ['google.com', 'gstatic.com', 'googleusercontent.com', 'gemini.google.com'];
const INPUT = 'div[contenteditable="true"][role="textbox"], rich-textarea .ql-editor';
const PILL = '[aria-label^="View source details for citation"]';

// Temporary chat (no memory), prompt typed with the keyboard and sent with Enter.
export async function ask(page, prompt) {
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.locator(INPUT).first().waitFor({ timeout: 20000 }).catch(() => {});
  await waitForHuman(page, async () => (await page.locator(INPUT).count()) === 0, 'Gemini is not signed in');
  // Temporary chat keeps the question out of the account's history and memory. The button renders after the input.
  let notes = '';
  const temp = page.locator('button[aria-label*="emporary chat"], button[aria-label*="临时"]').first();
  if (await temp.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
    await temp.click();
    const on = await page.getByText(/Just stopping by|temporary chat|临时对话/i).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (!on) notes = 'temporary chat may not be on; check the answer for personal context';
  } else notes = 'temporary chat button not found; check the answer for personal context';
  await page.locator(INPUT).first().click();
  await page.keyboard.type(prompt, { delay: 5 });
  await page.keyboard.press('Enter');
  // Grounded answers can take minutes before the first words appear.
  await page.locator('model-response').first().waitFor({ timeout: 180000 });

  const response = page.locator('model-response').last();
  await waitStable(async () => String((await response.innerText()).length), {
    interval: 3000,
    done: async () => (await response.locator('button[aria-label="Copy"], button[aria-label="复制"]').count()) > 0,
  });
  const answer = (await response.innerText()).replace(/^\s*Gemini said\s*/i, '').trim();

  const citations = (await externalLinks(response.locator('a[href]'), OWN)).map((c) => ({ ...c, how: 'anchor' }));
  // One real click per distinct source name; the popover's links are read by what is new on the page.
  const pills = response.locator(PILL);
  const seen = new Set();
  for (let i = 0; i < (await pills.count()); i++) {
    const label = (await pills.nth(i).getAttribute('aria-label')) ?? '';
    const names = label.replace(/^View source details for citations? from /, '').replace(/\. Press Enter.*$/, '');
    if (seen.has(names)) continue;
    seen.add(names);
    try {
      const before = new Set((await externalLinks(page.locator('a[href]'), OWN)).map((l) => l.url));
      await pills.nth(i).scrollIntoViewIfNeeded();
      await pills.nth(i).click({ timeout: 5000 });
      await sleep(2000);
      const after = await externalLinks(page.locator('a[href]'), OWN);
      citations.push(...after.filter((l) => !before.has(l.url)).map((c) => ({ ...c, how: 'pill-click' })));
      await page.keyboard.press('Escape');
    } catch { /* skipped */ }
  }
  const model = await page.locator('button').filter({ hasText: /^(Pro|Flash|Thinking|Fast)\b/ }).first().innerText().catch(() => null);
  return {
    page_url: page.url(),
    model: model?.trim() ?? null,
    answer_text: answer,
    citations: dedupeCitations(citations),
    web_search_used: citations.length > 0 || (await pills.count()) > 0,
    notes,
  };
}
