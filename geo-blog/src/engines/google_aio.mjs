import { dedupeCitations, sleep, waitForHuman } from '../browser.mjs';

const OWN = ['google.com', 'gstatic.com', 'googleusercontent.com', 'google.ca'];
const isOwn = (url) => { try { const h = new URL(url).hostname; return OWN.some((o) => h === o || h.endsWith(`.${o}`)); } catch { return true; } };

// AI Overview links are either direct, /url?q=<target>, or opaque /goto?url=<token> redirects (signed-out
// sessions); the last kind is resolved by reading the redirect target. Google's own pages return null.
export async function resolveGoogleLink(page, href) {
  if (!/^https?:/.test(href)) return null;
  if (!isOwn(href)) return href;
  const u = new URL(href);
  if (u.pathname === '/url') { const q = u.searchParams.get('q') || u.searchParams.get('url'); return q && !isOwn(q) ? q : null; }
  if (u.pathname !== '/goto') return null;
  const res = await page.context().request.get(href, { maxRedirects: 0 }).catch(() => null);
  const target = res?.headers().location;
  return target && /^https?:/.test(target) && !isOwn(target) ? target : null;
}

// The bare question as a Google search; the AI Overview block, expanded, with its reference links.
export async function ask(page, question) {
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(question)}&hl=en&gl=us`, { waitUntil: 'domcontentloaded' });
  await waitForHuman(page, async () => /\/sorry\//.test(page.url()) || (await page.locator('iframe[title*="reCAPTCHA"]').count()) > 0, 'Google shows a CAPTCHA');
  await sleep(2500);
  const heading = page.locator('h1, h2, div[role="heading"]').filter({ hasText: /^AI Overview/ }).first();
  const paa = await page.locator('div[data-q]').evaluateAll((els) => els.map((e) => e.getAttribute('data-q')).filter(Boolean)).catch(() => []);
  const organic = await page.locator('#search a:has(h3)').evaluateAll((els) => els.map((a) => a.href)).catch(() => []);
  if (!(await heading.count())) {
    return { page_url: page.url(), model: null, answer_text: '', citations: [], web_search_used: false, notes: 'no AI Overview shown', people_also_ask: paa, organic_urls: organic };
  }
  const expand = page.getByRole('button', { name: /^Show (more AI Overview|more|all)$/ }).first();
  if (await expand.count()) await expand.click({ timeout: 3000 }).catch(() => {});
  await sleep(1500);
  // Climb from the heading to the block that holds the whole overview.
  const box = await heading.evaluateHandle((h) => { let el = h; for (let i = 0; i < 10 && el.parentElement && el.innerText.length < 2500; i++) el = el.parentElement; return el; });
  const answer = await box.evaluate((el) => el.innerText);
  const anchors = await box.evaluate((el) => [...el.querySelectorAll('a[href]')]
    .map((a) => ({ url: a.href, title: (a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 160) })));
  const inBox = [];
  for (const a of anchors) {
    const url = await resolveGoogleLink(page, a.url);
    if (url) inBox.push({ ...a, url });
  }
  return {
    page_url: page.url(),
    model: null,
    answer_text: answer.trim(),
    citations: dedupeCitations(inBox.map((c) => ({ ...c, how: 'anchor' }))),
    web_search_used: true,
    notes: '',
    people_also_ask: paa,
    organic_urls: organic,
  };
}
