import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { AGENT_TREE_RULES, axeProblems, measureToolForms, scanAgentTree, toolFormProblems } from '../lib/axe-scan.mjs';
import { formTool, leadFormBlock, resourceFormBlock } from '../lib/lead-form.mjs';
import { LCP_FAIL_MS, LCP_WARN_MS, lcpPages, lcpProblems, measureLcp } from '../lib/lab-lcp.mjs';
import { BAR_CONTROLS_MAX, barCovers, measureBarCover } from '../lib/visual-checks.mjs';

// The template's enquiry bar rules (template.css .enquiry-bar) on a phone page with a form under a long section.
const barPage = (padding) => `<!doctype html><html><head><style>
  body { margin: 0; font: 16px sans-serif; }
  .enquiry-bar { position: fixed; inset: auto 0 0; z-index: 40; display: flex; padding: 0.5rem 16px; background: #fff; border-top: 1px solid #ccc; }
  .enquiry-bar a { flex: 1; min-height: 44px; }
  body:has(> .enquiry-bar) { padding-bottom: calc(44px + 1rem + 1px); }
  ${padding ? 'html:has(> body > .enquiry-bar) { scroll-padding-bottom: calc(44px + 1rem + 1px); }' : ''}
  input, button { display: block; height: 40px; margin: 8px 16px; }
</style></head><body>
  <main><section data-authoring-block="text" style="height: 1600px">Text</section>
  <section data-authoring-block="form"><form><label>Name <input name="name"></label><label>Email <input name="email" disabled></label>
    <label aria-hidden="true" style="position:absolute;left:-9999px">Trap <input name="trap" tabindex="-1"></label>
    <button type="submit" class="button button--primary">Send</button></form></section>
  <section style="height: 900px"></section></main>
  <div class="enquiry-bar" data-enquiry-bar><a class="button button--primary" href="/quote/">Get a quote</a></div>
</body></html>`;

test('a control brought up to the foot of a phone screen sits clear of the enquiry bar with its scroll padding, and under it without (four-site audit 2026-11-17, A8)', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(barPage(true));
    const kept = await page.evaluate(measureBarCover, BAR_CONTROLS_MAX);
    assert.deepEqual(kept.controls.map((item) => item.text), ['name', 'Send'], 'the bar\'s own link, the spam trap and a disabled control are not checked');
    assert.equal(kept.controls.find((item) => item.text === 'name').focused, true);
    assert.equal(kept.controls.find((item) => item.text === 'email'), undefined, 'a disabled control is not checked: nobody moves to it');
    assert.deepEqual(barCovers(kept), []);
    assert.equal(await page.evaluate(() => scrollY), 0, 'the page is left at its top');

    await page.setContent(barPage(false));
    const covered = barCovers(await page.evaluate(measureBarCover, BAR_CONTROLS_MAX));
    assert.ok(covered.length >= 1, 'without the scroll padding the bar hides a control');
    assert.ok(covered.every((item) => item.covered > 1 && item.block === 'form'));
  } finally {
    await browser.close();
  }
});

test('the agent tree scan runs Lighthouse\'s 33 rules only and fails what axe rates critical or serious (A4)', async () => {
  assert.equal(AGENT_TREE_RULES.length, 33);
  assert.equal(new Set(AGENT_TREE_RULES).size, 33);
  assert.ok(!AGENT_TREE_RULES.includes('color-contrast'), 'contrast is not in the set');
  const axe = (await import('axe-core')).default;
  const known = new Set(axe.getRules().map((rule) => rule.ruleId));
  assert.deepEqual(AGENT_TREE_RULES.filter((rule) => !known.has(rule)), [], 'every rule is one of the installed axe-core');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // An unnamed button (critical), an unnamed link (serious), low contrast (not in the set), a valid page otherwise.
    await page.setContent(`<!doctype html><html lang="en"><head><title>T</title></head><body><main>
      <button></button><a href="/x/"></a><p style="color:#eee;background:#fff">faint</p>
      <label>Name <input name="name"></label></main></body></html>`);
    const violations = await scanAgentTree(page);
    assert.deepEqual(violations.map((item) => item.rule).sort(), ['button-name', 'link-name']);
    const { failures, warnings } = axeProblems(violations);
    assert.deepEqual(failures.map((item) => [item.rule, item.impact]).sort(), [['button-name', 'critical'], ['link-name', 'serious']]);
    assert.equal(failures[0].nodes.length, 1);
    assert.deepEqual(warnings, []);
    await page.setContent('<!doctype html><html lang="en"><head><title>T</title></head><body><main><button>Send</button><a href="/x/">More</a></main></body></html>');
    assert.deepEqual(await scanAgentTree(page), []);
  } finally {
    await browser.close();
  }
  assert.deepEqual(axeProblems([{ rule: 'tabindex', impact: 'moderate', help: 'h', nodes: [{ target: 'a', html: '<a>' }] }]).warnings.map((item) => item.issue), ['agent_tree_minor']);
});

test('the phone LCP is measured on one page of each page type, warned over 2.5 s and failed over 4 s (P3)', () => {
  const pages = [
    { route: '/', pageType: 'home', status: 'authored' },
    { route: '/a/', pageType: 'product', status: 'placeholder' },
    { route: '/b/', pageType: 'product', status: 'authored' },
    { route: '/c/', pageType: 'product', status: 'authored' },
    { route: '/d/', pageType: 'privacy', status: 'placeholder' },
  ];
  assert.deepEqual(lcpPages(pages).map((page) => page.route), ['/', '/b/', '/d/'], 'the first authored page of each type, else its first');
  assert.deepEqual(lcpProblems({ ms: LCP_WARN_MS, element: 'img' }), { failures: [], warnings: [] });
  assert.deepEqual(lcpProblems({ ms: LCP_WARN_MS + 1, element: 'img' }).warnings.map((item) => item.issue), ['lcp_slow']);
  assert.deepEqual(lcpProblems({ ms: LCP_FAIL_MS + 1, element: 'h1' }).failures.map((item) => [item.issue, item.limit]), [['lcp_slow', LCP_FAIL_MS]]);
  assert.deepEqual(lcpProblems({ ms: null, error: 'timeout' }).warnings.map((item) => item.issue), ['lcp_not_measured']);
  assert.deepEqual(lcpProblems(null), { failures: [], warnings: [] }, 'a page not measured for its type');
});

test('the LCP load is throttled as Lighthouse\'s phone: a 95 KB photo over the local server takes over a second', async () => {
  // A PNG of 180 x 180 random pixels: about 95 KB that do not compress (a flat image is no LCP candidate in Chrome).
  const sharp = (await import('sharp')).default;
  const photo = await sharp(randomBytes(180 * 180 * 3), { raw: { width: 180, height: 180, channels: 3 } }).png().toBuffer();
  const server = createServer((request, response) => {
    if (request.url === '/photo.png') { response.writeHead(200, { 'content-type': 'image/png' }); response.end(photo); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><html><body style="margin:0"><img src="/photo.png" width="180" height="180" style="display:block"><p>Text</p></body></html>');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const lcp = await measureLcp(browser, `http://127.0.0.1:${server.address().port}/`);
    assert.equal(lcp.element, 'img', JSON.stringify(lcp));
    // Two round trips of 562.5 ms (the page, the photo) and 95 KB at 1.47 Mbps (about 0.5 s).
    assert.ok(lcp.ms > 1000, `throttled: ${lcp.ms} ms`);
  } finally {
    await browser.close();
    server.close();
  }
});

test('a live form is a WebMCP tool with every control it sends described, never self-submitting; a form that does not post is none (A7)', async () => {
  const block = leadFormBlock('hero-form');
  const tool = formTool(block, true);
  assert.equal(tool.name, 'send_enquiry_hero_form');
  assert.match(tool.description, /^Sends an enquiry to the company with this page's form/);
  for (const field of block.fields) assert.ok(tool.params[field.name], field.name);
  for (const name of ['consent', block.honeypot, 'page_url', 'referrer', 'utm_source', 'utm_content']) assert.ok(tool.params[name], name);
  assert.equal(formTool(block, false), null);
  const resource = formTool(resourceFormBlock('owner-resource', ['Size chart']), true);
  assert.match(resource.name, /^request_resource_owner_resource$/);
  for (const field of resourceFormBlock('owner-resource', ['Size chart']).fields) assert.ok(resource.params[field.name], field.name);
  assert.ok(resource.params.request_type);
  // The form's every control passes its name to the description lookup; nothing sets toolautosubmit.
  const source = await readFile(new URL('../../src/components/blocks/LeadForm.astro', import.meta.url), 'utf8');
  const controls = source.match(/<(input|select|textarea)\b[^>]*>/g);
  assert.ok(controls.length >= 8);
  for (const control of controls) assert.match(control, /\{\.\.\.(param\(|common\})/, control);
  assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ''), /toolautosubmit/, 'only its comment names it');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<form toolname="send_enquiry_x" tooldescription="Sends an enquiry"><input name="email" toolparamdescription="Your email"><input type="hidden" name="page_url" toolparamdescription="The page"><button>Send</button></form>
      <form toolname="half" tooldescription="d" toolautosubmit><input name="email" toolparamdescription="e"><textarea name="message"></textarea></form>
      <form class="chat"><input name="text"></form>`);
    const forms = await page.evaluate(measureToolForms);
    assert.deepEqual(forms.map((form) => form.form), ['send_enquiry_x', 'half'], 'a form with no annotation is no tool');
    assert.deepEqual(toolFormProblems(forms), [{ issue: 'webmcp_partial', form: 'half', autosubmit: true, missing: ['message'] }]);
  } finally {
    await browser.close();
  }
});
