// The phone's Largest Contentful Paint under a slow network and CPU, measured once per page type by the layout audit
// (audit-authoring-layout.mjs; four-site audit 2026-11-17, Fable's plan P3: the lab number seen at build time, not
// first after launch). The throttling and the screen are Lighthouse's mobile defaults (lighthouse core/config/
// constants.js: throttling.mobileSlow4G as DevTools applies it, screenEmulationMetrics.mobile, the Moto G Power), set
// through the Chrome DevTools Protocol. Google's "good" LCP is 2.5 s, "poor" over 4 s (web.dev/articles/lcp): over the
// first the audit warns, over the second it fails. A lab number from one load on this machine: Google's page
// experience guidance reads the field data (CrUX, after launch) and the page as a whole, never one metric alone.

// Lighthouse's mobileSlow4G with DevTools' adjustment (requestLatencyMs = 150 ms RTT x 3.75, download 1.6 Mbps x 0.9,
// upload 750 kbps x 0.9) and its 4x CPU slowdown.
export const LCP_THROTTLING = Object.freeze({ requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675, cpuSlowdownMultiplier: 4 });
// Lighthouse's mobile screen (Moto G Power 2022).
export const LCP_SCREEN = Object.freeze({ width: 412, height: 823, deviceScaleFactor: 1.75 });
export const LCP_WARN_MS = 2500;
export const LCP_FAIL_MS = 4000;
// How long one throttled load may take before what was painted so far is read.
const LOAD_TIMEOUT_MS = 60000;
// Milliseconds waited after two frames past the load for its last paint.
const SETTLE_MS = 500;

// The page measured for each page type: its first authored page in the site's order, else its first page. The same
// page each run while the site's pages stay the same, so its measurement is kept with the page's other results.
export function lcpPages(pages) {
  const chosen = new Map();
  for (const page of pages) {
    const held = chosen.get(page.pageType);
    if (!held || (held.status !== 'authored' && page.status === 'authored')) chosen.set(page.pageType, page);
  }
  return pages.filter((page) => chosen.get(page.pageType) === page);
}

// One cold throttled load of url in its own browser context: { ms, element, url, size } of the last LCP candidate,
// or { ms: null, error } when none was painted.
export async function measureLcp(browser, url, { throttling = LCP_THROTTLING, screen = LCP_SCREEN } = {}) {
  const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: screen.deviceScaleFactor, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: throttling.requestLatencyMs, downloadThroughput: (throttling.downloadThroughputKbps * 1024) / 8, uploadThroughput: (throttling.uploadThroughputKbps * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttling.cpuSlowdownMultiplier });
    let error = null;
    await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS }).catch((failure) => { error = failure.message.split('\n')[0]; });
    // The photo that ended the load is drawn a few frames after the load event (decoded, then painted by the slowed
    // main thread), and its entry comes then: those frames are waited for before the entries are read (without the
    // wait a test photo's paint was missed and the page's text read as its LCP).
    await page.evaluate((settle) => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, settle)))), SETTLE_MS).catch(() => null);
    const entry = await page.evaluate(() => new Promise((done) => {
      // The buffered entries of the load; the last is the page's LCP.
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        done(last ? { ms: Math.round(last.startTime), element: last.element ? last.element.tagName.toLowerCase() : null, url: last.url || null, size: last.size } : null);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => done(null), 3000);
    })).catch(() => null);
    return entry ?? { ms: null, error: error ?? 'no largest-contentful-paint entry' };
  } finally {
    await context.close().catch(() => null);
  }
}

// The audit's findings of one measurement: { failures, warnings }, each { issue: 'lcp_slow' | 'lcp_not_measured', ... }.
export function lcpProblems(lcp) {
  if (!lcp) return { failures: [], warnings: [] };
  if (!Number.isFinite(lcp.ms)) return { failures: [], warnings: [{ issue: 'lcp_not_measured', value: lcp.error ?? null }] };
  const finding = { issue: 'lcp_slow', ms: lcp.ms, element: lcp.element ?? null, ...(lcp.url ? { url: lcp.url } : {}) };
  if (lcp.ms > LCP_FAIL_MS) return { failures: [{ ...finding, limit: LCP_FAIL_MS }], warnings: [] };
  if (lcp.ms > LCP_WARN_MS) return { failures: [], warnings: [{ ...finding, limit: LCP_WARN_MS }] };
  return { failures: [], warnings: [] };
}
