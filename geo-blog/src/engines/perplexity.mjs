import { UnavailableError, dedupeCitations, externalLinks, waitForHuman, waitStable } from '../browser.mjs';

const OWN = ['perplexity.ai'];
const INPUT = '#ask-input, textarea, div[contenteditable="true"]';
const INCOGNITO_ITEM = '[role="menuitemcheckbox"]';

// Incognito is a checkbox item in the account menu (the account button sits bottom left, above the sidebar edge).
// Returns whether it is on afterwards.
async function ensureIncognito(page) {
  const box = await page.locator('button,[role="button"]').evaluateAll((els) => els
    .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })
    .filter((r) => r.x < 260 && r.y > innerHeight - 120 && r.w > 150)
    .sort((a, b) => b.y - a.y)[0]);
  if (!box) return false;
  await page.mouse.click(box.x + 14, box.y + box.h / 2);
  const item = page.locator(INCOGNITO_ITEM).filter({ hasText: /无痕|Incognito/ }).first();
  await item.waitFor({ timeout: 5000 }).catch(() => {});
  if (!(await item.count())) return false;
  if ((await item.getAttribute('data-state')) !== 'checked') await item.click();
  await page.waitForTimeout(1000);
  await page.mouse.click(box.x + 14, box.y + box.h / 2);
  const on = (await item.getAttribute('data-state').catch(() => null)) === 'checked';
  await page.keyboard.press('Escape');
  return on;
}

// Incognito (no memory); prompt typed on the home page, sources read from the Links tab (?sm=r).
export async function ask(page, prompt) {
  await page.goto('https://www.perplexity.ai/', { waitUntil: 'domcontentloaded' });
  await page.locator(INPUT).first().waitFor({ timeout: 20000 }).catch(() => {});
  await waitForHuman(page, async () => (await page.locator(INPUT).count()) === 0, 'Perplexity is not signed in');
  let notes = '';
  if (!(await ensureIncognito(page))) notes = 'incognito could not be switched on; check the answer for personal context';
  await page.locator(INPUT).first().click();
  await page.keyboard.type(prompt, { delay: 5 });
  await page.keyboard.press('Enter');
  // The search page keeps streaming, so its load event can come late: the URL change is enough. A free account
  // that used up its searches gets a dialog instead.
  const limit = page.getByText(/已达到免费搜索次数上限|reached (your|the) (free )?search limit/i).first();
  await Promise.race([
    page.waitForURL(/\/search\//, { timeout: 60000, waitUntil: 'commit' }),
    limit.waitFor({ timeout: 60000 }).then(() => { throw new UnavailableError('Perplexity free search limit reached; it resets in a few hours'); }),
  ]);

  // The outermost .prose only (nested list items also carry prose-* classes).
  const readAnswer = () => page.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="prose"]')];
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el))).map((el) => el.innerText).join('\n\n');
  });
  const answer = await waitStable(readAnswer, { interval: 2000, stableCount: 3 });

  const thread = page.url().split('?')[0];
  await page.goto(`${thread}?sm=r`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const citations = (await externalLinks(page.locator('a[href]'), OWN)).map((c) => ({ ...c, how: 'links-tab' }));
  return {
    page_url: thread,
    model: null,
    answer_text: answer.trim(),
    citations: dedupeCitations(citations),
    web_search_used: citations.length > 0,
    notes,
  };
}
