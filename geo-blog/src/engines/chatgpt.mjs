import { dedupeCitations, drainOpened, externalLinks, sleep, waitForHuman, waitStable } from '../browser.mjs';

const OWN = ['chatgpt.com', 'openai.com'];
const SEND = 'button[data-testid="send-button"], #composer-submit-button, button[aria-label="发送"], button[aria-label="Send prompt"]';
const STOP = 'button[data-testid="stop-button"], button[aria-label*="停止"], button[aria-label*="Stop"]';
const DONE = 'button[aria-label="重新生成回复"], button[aria-label*="Regenerate"], button[data-testid="copy-turn-action-button"]';

// Temporary chat + web-search hint; the prompt is prefilled from ?q= and sent with a real click.
export async function ask(page, prompt) {
  await page.goto(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}&hints=search&temporary-chat=true`, { waitUntil: 'domcontentloaded' });
  await waitForHuman(page, async () => (await page.locator(SEND).count()) === 0 && (await page.getByRole('button', { name: /^(登录|Log in)$/ }).count()) > 0, 'ChatGPT is not signed in');
  await page.locator(SEND).first().click({ timeout: 30000 });
  const main = page.locator('main');
  await waitStable(async () => String((await main.innerText()).length), {
    interval: 3000,
    done: async () => (await page.locator(STOP).count()) === 0 && (await page.locator(DONE).count()) > 0,
  });

  const full = await main.innerText();
  const start = Math.max(full.lastIndexOf('ChatGPT 说：'), full.lastIndexOf('ChatGPT said:'));
  let answer = start >= 0 ? full.slice(start).replace(/^ChatGPT (说：|said:)\s*/, '') : full;
  answer = answer.split(/ChatGPT (可能会出错|can make mistakes)/)[0].trim();

  const citations = (await externalLinks(main.locator('a[href]'), OWN)).map((c) => ({ ...c, how: 'anchor' }));
  await drainOpened(page);
  const pills = main.locator('[class*="Pill"], button').filter({ hasText: /^\s*[\w.-]+\.[a-z]{2,}(\s*\+\d+)?\s*$|\+\d+\s*$/i });
  const pillCount = await pills.count();
  for (let i = 0; i < pillCount; i++) {
    const pill = pills.nth(i);
    try {
      await pill.scrollIntoViewIfNeeded();
      await sleep(400);
      await pill.click({ timeout: 5000 });
      await sleep(800);
      const extra = page.locator('[data-radix-popper-content-wrapper] button[aria-label^="Open "]');
      for (let j = 0; j < (await extra.count()); j++) await extra.nth(j).click({ timeout: 3000 }).catch(() => {});
      await page.keyboard.press('Escape');
    } catch { /* a pill that cannot be clicked is skipped; its domain stays in the answer text */ }
  }
  for (const url of await drainOpened(page)) citations.push({ url, title: '', how: 'pill-click' });
  return {
    page_url: page.url(),
    model: null,
    answer_text: answer,
    citations: dedupeCitations(citations),
    web_search_used: citations.length > 0 || pillCount > 0,
    notes: pillCount ? `${pillCount} citation pills clicked` : '',
  };
}
