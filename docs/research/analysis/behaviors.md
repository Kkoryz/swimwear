# Observed interactions: swimwearbali.com

What the captures show the pages do. "Observed" means a computed style, a DOM state or an inline script in
`docs/research/reference-pages/<page type>/raw/`; hover and open states that the capture did not record are marked as not
observed. The template adds an island only for behaviour that needs client state.

| Behaviour | Where | Evidence | Template consequence |
|---|---|---|---|
| **Sticky header** | every route, all three viewports | `header#masthead > div > section:nth-of-type(1)` has `position: fixed; top: 0px` and Elementor `data-settings` `"sticky":"top","sticky_on":["desktop","tablet","mobile"]`; transition `background-color 0.4s ease-in-out` on the shell. An inline script adds `myfixedHeader` to `#menubar` after 50px of scroll (`fixed_header_scroll = "50"`). | Header stays at the top on scroll (CSS `position: sticky`); no state needed. The look after the 50px class change was not captured. |
| **Dropdown menus** | desktop header, six of seven items | `a.elementor-item.has-submenu` with `aria-haspopup="true"`, `aria-expanded="false"`; `ul.sub-menu` `display: none; position: absolute; top: 100%`, width 156px, white. | Dropdown list under the item (`header.dropdown: "list"`, carets shown). Opening on hover vs click was not recorded; the open panel's styles are the closed element's computed values. |
| **Mobile menu** | tablet 768 and mobile 390 | Header shows a hamburger (three white bars) instead of the items (design references). The open drawer was not captured. | Hamburger menu; the drawer's look is not observed. |
| **Logo marquee** | home section 5 | Track 5600px wide with `animation: 42s linear infinite marquee-scroll` (desktop line 176259); `marquee-logo-box` items repeated four times in the DOM. | `logos: marquee` (moves by itself, pauses for reduced motion per the template). |
| **Testimonial slider** | home section 18 | ElementsKit testimonial widget on Swiper: `swiper-initialized swiper-horizontal`, duplicate slides for looping, `aria-label="3 / 8"`, slides 403.333px wide, `margin-right: 20px`; class `arrow_inside`. | `testimonials: carousel` (three in view on desktop). Autoplay timing not recorded. |
| **Gallery lightbox** | home section 8 | Six photos with `cursor: zoom-in`; DOM has `div.swb-lb` with `swb-lb-prev`, `swb-lb-next`, `swb-lb-close`, `swb-lb-count`. | A click opens the photo large with previous/next/close and a counter. Needs client state if reproduced. |
| **Fabric tabs** | home section 4 | Elementor tabs (`div.elementor-tab-title.elementor-active`, `role="tab"`, `aria-selected="true"`), pill tabs, active filled `#111111`. Separate tab widgets for desktop and for tablet/phone (`elementor-hidden-desktop` / `elementor-hidden-tablet elementor-hidden-mobile`). | Tabbed panel of swatch cards (the swatch cards are text images and are not reused). |
| **FAQ accordion (home)** | home section 16 | Native `<details>` / `<summary class="swb-faq__q">`; all closed in the capture. | `faq: two-column`, `faqFirst: closed`; no script needed. |
| **FAQ accordion (solution)** | solution FAQ | Screenshot: white rows, the first open ("Do I need a tech pack?") with its answer, the others closed with a ▸ marker. | `faq: accordion` with the first open on that page type. |
| **Footer toggles on phones** | every route, tablet and mobile | Elementor toggle widget: `div#elementor-tab-title-5911 > a.elementor-toggle-title` "GET STARTED" etc., chevrons at the right; lists hidden. | `footer.phoneGroups: "collapsed"`. |
| **Hero video** | home section 1, home sections 2-3 | `videofrontopage-section1.mp4` (15 MB) loaded for the home hero; sections 2 and 3 embed videos (black boxes in the 1440 shot; `elementor-widget-video`). Home hero background image is `swimwearbali_desktop_frontpage-scaled.webp`. | The template shows the still photo; video is not reproduced. |
| **YouTube embeds** | manufacturer section 5 | YouTube thumbnails and `generate_204` requests in the asset map; a black box in the 1440 shot. | Not reproduced (no photo pool use). |
| **Button transitions** | header items, buttons | Header items `transition: 0.4s`; manufacturer buttons class `elementor-animation-grow`. | Hover colours/scales were not captured; leave to the treatment within the palette. |
| **Contact form** | contact section 2 | Formidable form (`frm_button_submit`), inputs name/email/message, submit "SEND". | The site's own form from `config/lead-form.json`. |

Not observed: hover colours of nav items and buttons, the open dropdown's shadow, the mobile drawer, slider autoplay
and arrows' look, focus styles.
