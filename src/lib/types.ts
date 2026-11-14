// The renderer's types: the authoring content contract (scripts/lib/authoring-contract.mjs validates the data), the
// template's variants and the optional site data files.

export interface Link { label: string; href: string }
// mediaKind: the photography the blueprint slot declares (null: no template photo); absent: the module design decides.
// What a section asks to show (Site Factory's visuals; lib/visual-data.mjs draws the data).
export type SectionVisual = { id: string; caption?: string; purpose?: string } & ({ type: 'photo'; content: string; setting?: string } | { type: 'data'; data: { shape: string; items: unknown } });
interface BaseBlock { id: string; sourceSectionIds?: string[]; variant?: string; eyebrow?: string; mediaKind?: MediaKind | null; visuals?: SectionVisual[] }
// heading: absent on a block that goes on from another (continues: that block's id; a section longer than a block holds).
export interface TextBlock extends BaseBlock { heading?: string; continues?: string; paragraphs: string[]; wordCount?: number }
export interface IntroBlock extends TextBlock { type: 'intro' }
export interface ProofBlock extends TextBlock { type: 'proof' }
// `slot` marks an image position the pools could not fill: it renders as a labelled box (stage 11 supplies the image).
// `priority` marks the page's first image when the hero shows none: it may be in the first viewport, so it is not lazy.
// sources: the same picture's other crops by width (art direction), e.g. { media: '(max-width: 767px)', ... } for a
// portrait photo on phones.
export interface MediaSource { media: string; src: string; srcset?: string; width?: number; height?: number }
export interface Media { src: string; alt: string; width?: number; height?: number; srcset?: string; slot?: MediaKind; priority?: boolean; sources?: MediaSource[] }
export interface SplitMediaBlock extends TextBlock { type: 'splitMedia'; media?: Media | null }
// paragraphs: an optional lead under the heading (a list section's body).
// setColumns: the column count of the card set it belongs to (PageView.astro), set when rendered.
export interface FeatureGridBlock extends BaseBlock { type: 'featureGrid'; heading?: string; continues?: string; setColumns?: number; paragraphs?: string[]; span?: number; items: { heading: string; paragraphs: string[]; wordCount?: number; placeholder?: boolean }[] }
// action: a photo band that leads on (the reference's band carries a button); bandLink: where, set when rendered
// (PageView.astro, media-slots.mjs bandLink).
export interface GalleryBlock extends BaseBlock { type: 'gallery'; heading?: string; items: { caption?: string; href?: string; media?: Media | null }[]; links?: Link[]; action?: boolean; bandLink?: Link | null }
// provides: what the client gives at that step; duration: how long it takes, as written (a Site Factory flow).
export interface ProcessBlock extends BaseBlock { type: 'process'; continues?: string; heading?: string; paragraphs?: string[]; steps: (string | { heading?: string; text: string; provides?: string; duration?: string; placeholder?: boolean })[] }
// heading: absent on a block that goes on from the one before it (a FAQ of more pairs than a block holds).
export interface FaqBlock extends BaseBlock { type: 'faq'; heading?: string; items: { question: string; answer: string }[] }
export interface CtaBlock extends BaseBlock { type: 'cta'; heading?: string; paragraphs?: string[]; cta: Link; secondaryCta?: Link; links: Link[] }
export interface BandBlock extends BaseBlock { type: 'band'; heading: string; paragraphs?: string[]; cta?: Link; media?: Media | null }
export interface FigureBlock extends BaseBlock { type: 'figure'; heading?: string; paragraphs?: string[]; media?: Media | null }
export interface IconListBlock extends BaseBlock { type: 'iconList'; heading?: string; paragraphs?: string[]; items: { heading?: string; text: string; placeholder?: boolean }[] }
// note: the figure's conditions (07 key_figures[].note), shown small under the label; they belong to the promise.
// unit: what the value counts (pieces, days), set beside it; paragraphs: a lead under the heading (a figures section's body).
export interface StatsBlock extends BaseBlock { type: 'stats'; heading?: string; paragraphs?: string[]; items: { value: string; unit?: string; label: string; note?: string }[] }
// Price cards (Site Factory prices): what is priced, its amount (as written) with its unit and conditions, a sentence.
export interface PricingBlock extends BaseBlock { type: 'pricing'; heading?: string; paragraphs?: string[]; items: { heading: string; price: { amount: string; unit?: string; note?: string }; text: string }[] }
// Colour swatches (Site Factory swatches): a chip of the colour when given, the name and the composition.
export interface SwatchesBlock extends BaseBlock { type: 'swatches'; heading?: string; paragraphs?: string[]; items: { name: string; colour?: string; composition?: string }[] }
// paragraphs: a lead above the table; notes: text written under it (a Site Factory table section's body around its table).
export interface TableBlock extends BaseBlock { type: 'table'; heading?: string; paragraphs?: string[]; columns: string[]; rows: string[][]; notes?: string[] }
export interface LogosBlock extends BaseBlock { type: 'logos'; heading?: string; items: { name: string; note?: string; media?: Media | null }[] }
export interface TestimonialsBlock extends BaseBlock { type: 'testimonials'; heading?: string; items: { quote: string; author: string; headline?: string; role?: string; company?: string; country?: string; placeholder?: boolean }[] }
// The owner's proof (scripts/lib/site-proof.mjs): certificates with their issuer and number, and client case studies.
export interface CertificationsBlock extends BaseBlock { type: 'certifications'; heading?: string; items: { name: string; logo?: Media | null; issuer?: string; scope?: string; number?: string; validUntil?: string; url?: string }[] }
export interface CaseStudiesBlock extends BaseBlock { type: 'caseStudies'; heading?: string; linkLabel?: string; items: { client: string; title: string; summary: string; market?: string; results: { value: string; label: string }[]; href?: string }[] }
// How an order starts (Site Factory order_routes): the first two as route cards, the rest as a list; placeholder marks
// one borrowed from a competitor until the owner's facts hold it.
// The pages a page links to outside its copy (Site Factory page.links, then the site plan's related pages), as cards.
// A line page's styles (Site Factory style_cards): a photo, the name, one sentence and a quote link to the page's CTA.
export interface StyleGridBlock extends BaseBlock { type: 'styleGrid'; heading?: string; items: { name: string; intro: string }[]; cta: Link }
// A client's order (Site Factory cases): the goods as a label and the order in a sentence or two, no photo, no name.
export interface OrderCaseBlock extends BaseBlock { type: 'orderCase'; heading?: string; items: { product: string; text: string; placeholder?: boolean }[] }
export interface RelatedPagesBlock extends BaseBlock { type: 'relatedPages'; heading?: string; links: Link[] }
export interface OrderRoutesBlock extends BaseBlock { type: 'orderRoutes'; heading?: string; items: { heading: string; text: string; placeholder?: boolean }[] }
export interface FormField { name?: string; label: string; kind: 'text' | 'email' | 'tel' | 'textarea' | 'url'; required?: boolean; autocomplete?: string }
// The enquiry form (config/lead-form.json): posts to the first-party API only when its status is "connected".
export interface FormBlock extends BaseBlock { type: 'form'; heading?: string; paragraphs?: string[]; fields: FormField[]; submitLabel: string; consent?: { label: string; privacyRoute: string }; honeypot?: string; endpoint?: string; status?: 'connected' | 'not-connected' }
// The published sources of the industry knowledge a page's sections were given (07 AuthoredPage.knowledge).
export interface SourcesBlock extends BaseBlock { type: 'sources'; items: { title: string; url: string; publisher?: string }[] }
// The blog (scripts/lib/blog.mjs): an article section (paragraphs may link inline with [label](/route/)), and the hub's
// list of posts. A section written as an ordered body keeps the writer's order of paragraphs, subheadings, lists,
// tables and figures.
export interface ProseList { ordered?: boolean; items: string[] }
export interface ProseTable { columns: string[]; rows: string[][] }
// A chart the template draws (ArticleChart.astro): bars of values, a timeline of date ranges (YYYY-MM-DD), or steps.
export type ProseChart = { alt: string; caption?: string; unit?: string } & (
  | { kind: 'bar'; items: { label: string; value: number }[] }
  | { kind: 'timeline'; items: { label: string; start: string; end: string }[] }
  | { kind: 'steps'; items: { label: string; detail?: string }[] }
  | { kind: 'ranges'; items: { label: string; min: number; max: number }[] }
  | { kind: 'stats'; items: { label: string; value: string; unit?: string }[] }
  | { kind: 'shares'; items: { label: string; percent: number }[] }
  | { kind: 'comparison'; options: string[]; rows: { label: string; values: string[] }[] }
);
export type ProsePart = { text: string } | { subheading: string } | { list: ProseList } | { table: ProseTable } | { figure: { src: string; srcset?: string; alt: string; width?: number; height?: number; caption?: string } } | { chart: ProseChart };
export interface ProseBlock extends BaseBlock { type: 'prose'; heading: string; anchor: string; paragraphs: string[]; body?: ProsePart[]; list?: ProseList; table?: ProseTable }
export interface PostCard { title: string; href: string; excerpt: string; date: string; image?: Media; category?: string }
export interface PostListBlock extends BaseBlock { type: 'postList'; items: PostCard[]; pagination: { page: number; pages: number; base: string } }
// The company's ways to be reached, rendered from site-contact.json and the chat lines (lib/site-contact.mjs).
export interface ContactChannelsBlock extends BaseBlock { type: 'contactChannels'; heading?: string }
export type Block = IntroBlock | ProofBlock | SplitMediaBlock | FeatureGridBlock | GalleryBlock | ProcessBlock | FaqBlock | CtaBlock
  | BandBlock | FigureBlock | IconListBlock | StatsBlock | TableBlock | LogosBlock | TestimonialsBlock | FormBlock | SourcesBlock | ProseBlock | PostListBlock
  | CertificationsBlock | CaseStudiesBlock | OrderRoutesBlock | RelatedPagesBlock | StyleGridBlock | OrderCaseBlock | ContactChannelsBlock | PricingBlock | SwatchesBlock;
export interface Article { datePublished: string; dateModified: string; author: { type: 'Organization' | 'Person'; name?: string; url?: string }; image: Media | null; category: string | null; takeaways: string[]; minutes: number }

export interface AuthoringPage {
  id: string;
  route: string;
  pageType: string;
  // hold: a page Site Factory holds, built for the owner's review: noindex, out of the sitemap, the release held.
  status: 'authored' | 'placeholder' | 'hold';
  seo: { title: string; description: string; canonical: string };
  jsonLd: Record<string, unknown>[];
  // Site Factory's placeholder properties of jsonLd (Product offers, reviews...): never released.
  structuredDataPlaceholders?: { '@type': string; properties: string[] }[];
  hero: { eyebrow?: string; heading: string; lead?: string[]; cta?: Link; secondaryCta?: Link };
  blocks: Block[];
  // A blog post: its article data and its place under the blog.
  article?: Article;
  parent?: { name: string; route: string };
}

// route null: a menu heading without a page of its own (Site Factory: a specialist site's "Products" has no hub page).
export interface NavNode { label: string; route: string | null; children: NavNode[] }

// Photography classes observed on the reference; each block slot asks for one class.
export type MediaKind = 'product' | 'process' | 'material' | 'lifestyle' | 'portrait';
type Pools = Partial<Record<MediaKind, Media[]>>;

// blocks.<block id>: one section's own variant, and for a split row the side its photo takes (as the competitor's row
// has it) over the site-wide order.
export interface PageTypePatterns { splitSequence?: string[]; featureGrid?: string; gallery?: string; cta?: string; testimonials?: 'grid' | 'carousel'; logos?: 'grid' | 'strip' | 'marquee'; certifications?: 'grid' | 'strip'; contactChannels?: 'cards' | 'row' | 'list'; form?: 'plain' | 'media'; mediaModules?: { at: number; type: 'mosaic' | 'grid' }[]; blocks?: Record<string, { variant?: string; side?: 'media-start' | 'media-end' }> }

export interface TemplateVariants {
  header?: { ctaRoute: string | null; layout?: 'inline' | 'stacked'; topBar?: boolean; dropdown?: 'mega' | 'list'; carets?: boolean };
  // phoneGroups: on phones the columns' link groups fold under their titles (collapsed, as a competitor's footer does
  // there) or stay open; every link stays in the page.
  footer?: { layout?: 'minimal' | 'columns'; maxLinks?: number; phoneGroups?: 'open' | 'collapsed' };
  // pageTypes: per page type, the patterns of its sections (see PageTypePatterns); blocks.<block id>.variant sets one
  // section's variant over the one it was given from the competitor's module (a split row single instead of dual),
  // blocks.<block id>.side a split row's photo side (media-start, media-end) over the site-wide splitMedia order.
  pageTypes?: Record<string, PageTypePatterns>;
  hero: string;
  heroByPageType?: Record<string, string>;
  intro?: string;
  featureGrid: string;
  featureGridMedia?: boolean;
  // What the cards of photo-card designs show (scripts/lib/slot-visuals.mjs): the site's choice, else by the trade's
  // photos (tradePhotos "scenes": icons).
  cardVisual?: 'photo' | 'icon' | 'none';
  // The owner's own choices, over what a treatment or a repair sets (photo cards on a service business: only here).
  ownerChoices?: { cardVisual?: 'photo' | 'icon' | 'none' };
  tradePhotos?: 'scenes';
  splitMedia: string;
  proof: string;
  faq: string;
  cta: string;
  // headingAlign: how the reference sets its section headings (start: on the content's left edge; centre otherwise),
  // measured from its pages (scaffold-placeholder-pages.mjs); every section heading and its lead follow it.
  headingAlign?: 'start' | 'center';
  // heroText: the competitor's page titles as measured at capture (scaffold-placeholder-pages.mjs measureHeroText):
  // their first font family, case and average character width (em, over `chars` characters); the page titles are
  // sized to their own words with it (scripts/lib/heading-fit.mjs); leadWords: the words under the title on its photo (heroLeadShown).
  heroText?: { family?: string; textTransform?: string; charEm?: number; chars?: number; leadWords?: number };
  // breadcrumbs: the trail above the hero (top, the default) or under it, where the header lies over the hero photo.
  breadcrumbs?: 'top' | 'after-hero';
  // testimonials: the cards side by side (grid, the default) or one sliding row with previous/next controls and dots
  // (carousel, as a competitor's slider); per page type in pageTypes.
  testimonials?: 'grid' | 'carousel';
  // logos: tiles in rows (grid, the default), one sliding row with controls (strip), or one row that moves by itself
  // (marquee: pauses on hover and focus, still for reduced motion, still when every logo fits); per page type too.
  logos?: 'grid' | 'strip' | 'marquee';
  // certifications: the certificate cards in rows (grid, the default) or one sliding row with controls (strip, as a
  // competitor's certificate slider); per page type too.
  certifications?: 'grid' | 'strip';
  // contactChannels: the contact page's ways to reach the company as cards with an icon each (the default), one row of
  // icon links, or a list; every one links where it can (mail, phone, WhatsApp).
  contactChannels?: 'cards' | 'row' | 'list';
  // form: the enquiry form beside its intro's words (plain, the default) or with a photo under the intro (media, as a
  // competitor's photo-and-form module).
  form?: 'plain' | 'media';
  // phoneHeroes: the competitor shows a portrait hero on phones, so each hero has a portrait twin phones show instead
  // (set by apply-reference-analysis.mjs from the competitor's own photos; a generated library plans the twins).
  phoneHeroes?: boolean;
  // faqFirst: an accordion FAQ opens its first answer (open, the default) or shows every question closed (closed, as a
  // competitor's compact list).
  faqFirst?: 'open' | 'closed';
  // ctaForm: a closing band with the enquiry form shows the form beside its words in a panel (beside, the default) or
  // under its heading, without a panel (below, as a competitor's heading-above-form close).
  ctaForm?: 'beside' | 'below';
  // photoBreaks: extra photo rows a page gets where its text runs longer than the competitor's, by route (written by the
  // run from the layout audit by a rule fix since retired for the trial build, calibrate-plan.mjs; not a choice of the treatment).
  photoBreaks?: Record<string, number>;
  blog?: { hub?: { header?: string; card?: string }; post?: { layout?: string } };
  media: { hero: Media | null; heroByPageType?: Record<string, Media>; heroByRoute?: Record<string, Media>; pool?: Media[]; pools?: Pools; routePools?: Record<string, Pools>; routeCategories?: Record<string, string>; placeholders?: MediaKind[]; origin: string };
}

export interface SizedImage { src: string; width: number; height: number }
// Site identity (src/data/site-identity.json: stage 00's brand via import-brand-kit, or the build-brand-kit fallback).
export interface SiteIdentity {
  siteName: string;
  origin: string;
  logo: SizedImage;
  schemaLogo: SizedImage;
  icons: { rel: string; src: string; sizes: string; type: string }[];
  manifest: string | null;
  ogImage: SizedImage | null;
}
// The corner chat launcher (scripts/lib/chat-config.mjs).
export interface SiteChat {
  chatwoot?: { baseUrl: string; inboxIdentifier: string };
  whatsapp?: { label?: string; number: string }[];
  email?: string;
  prefill?: string;
  greeting?: string;
  agent?: { name: string; title?: string; avatar?: string };
  quickReplies?: string[];
  replyTime?: string;
  color?: string;
  autoOpen?: number;
  labels?: Record<string, string>;
}
// Per-site services (src/data/site-runtime.json); site: the registry entry (pnpm site:config).
export interface SiteRuntime { site?: { id: string; status: 'building' | 'live' | 'paused' | 'retired'; notice?: string; announcement?: string; previousDomains?: string[]; indexnowKey?: string }; analytics?: { provider: 'umami'; scriptSrc: string; websiteId: string }; chat?: SiteChat | false }
// The company's contact details (src/data/site-contact.json); placeholder: true until the owner replaces them.
export interface SiteContact { email?: string; phone?: string; address?: string; hours?: string; same_as?: string[]; placeholder?: boolean; standIns?: string[] }
// The site-wide trust bar (src/data/site-trust.json, scripts/lib/site-trust.mjs).
export interface SiteTrust { items: { value: string; label: string; note?: string; factId?: string; unconfirmed?: boolean }[]; founded?: string; location?: string; certifications?: string[] }

// One of the site's own photos (src/data/site-media.json via import-site-media).
export interface SitePhoto { class: MediaKind | 'hero'; src: string; srcset: string; width: number; height: number; alt: string; pages?: string[] }
