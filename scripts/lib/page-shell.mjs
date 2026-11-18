// The page shell (site header and footer) of a reference page, and the content markers of page builders that
// render sections as plain divs. Semantic elements and ARIA roles come first; a page builder is recognised only by
// its documented markers, added here once (never in a caller). Browser-side functions receive PAGE_SHELL as an
// argument because code passed to page.evaluate cannot import modules.

// Elementor; Duda (hometeamluxuryrentals.com, 2026-11-16: its header a div.dmHeaderContainer, its phone header a
// div.hamburger-header-container, its footer a div.dmFooterContainer, none a <header> or <footer>).
const BUILDER_HEADER = ['[data-elementor-type="header"]', '.elementor-location-header', '.dmHeaderContainer', '.hamburger-header-container'];
const BUILDER_FOOTER = ['[data-elementor-type="footer"]', '.elementor-location-footer', '.dmFooterContainer'];

const header = ['header', '[role=banner]', ...BUILDER_HEADER].join(', ');
const footer = ['footer', '[role=contentinfo]', ...BUILDER_FOOTER].join(', ');

export const PAGE_SHELL = Object.freeze({
  header,
  footer,
  shell: `${header}, ${footer}`,
  // A header or footer inside one of these is the page's own (an article's header holding its hero: Concord's home opens
  // on a 1440×1000 video in article > header, measured as shell and counted for nothing), not the site's shell.
  page: ['main', 'article', '[role=main]'].join(', '),
  // Top-level content regions and disclosure widgets beyond the semantic defaults.
  sections: ['main > section', 'main > div', 'article > section', '.elementor-top-section', '[data-element_type="section"]'].join(', '),
  // A form a provider serves in its own frame: the page's markup holds no form, only the frame (HubSpot on
  // hometeamluxuryrentals.com, 2026-11-16: its contact form was classed an empty spacer).
  formEmbeds: ['hsforms.net', 'hubspot.com', 'typeform.com', 'jotform.com', 'docs.google.com/forms', 'forms.office.com', 'tally.so', 'cognitoforms.com', 'wufoo.com', 'formstack.com'].map((host) => `iframe[src*="${host}"]`).join(', '),
  disclosureTitles: ['.elementor-accordion-title', '.elementor-tab-title'].join(', '),
  disclosurePanels: ['.elementor-tab-content', '.elementor-accordion-content'].join(', '),
});
