// Which component renders each block type of a page, and what it takes from the page: the block, its media (the list of
// its image positions, or the first alone), its pattern variant and the page context some blocks need. A block type
// with no entry is a type error (satisfies), so a new block type cannot be forgotten here. The blog's own blocks
// (prose, postList) render in the blog views.
import type { AuthoringPage, Block, Media } from '../../lib/authoring';
import BandBlock from './BandBlock.astro';
import CaseStudiesBlock from './CaseStudiesBlock.astro';
import ContactChannelsBlock from './ContactChannelsBlock.astro';
import CertificationsBlock from './CertificationsBlock.astro';
import CtaBlock from './CtaBlock.astro';
import FaqBlock from './FaqBlock.astro';
import FeatureGridBlock from './FeatureGridBlock.astro';
import FigureBlock from './FigureBlock.astro';
import FormBlock from './FormBlock.astro';
import GalleryBlock from './GalleryBlock.astro';
import IconListBlock from './IconListBlock.astro';
import LogosBlock from './LogosBlock.astro';
import OrderCaseBlock from './OrderCaseBlock.astro';
import OrderRoutesBlock from './OrderRoutesBlock.astro';
import PricingBlock from './PricingBlock.astro';
import ProcessBlock from './ProcessBlock.astro';
import RelatedPagesBlock from './RelatedPagesBlock.astro';
import SourcesBlock from './SourcesBlock.astro';
import SplitMediaBlock from './SplitMediaBlock.astro';
import StatsBlock from './StatsBlock.astro';
import StyleGridBlock from './StyleGridBlock.astro';
import SwatchesBlock from './SwatchesBlock.astro';
import TableBlock from './TableBlock.astro';
import TestimonialsBlock from './TestimonialsBlock.astro';
import TextBlock from './TextBlock.astro';

export interface BlockContext {
  block: Block;
  media: (Media | null)[];
  variant?: string;
  page: AuthoringPage;
  // The page's enquiry form (a closing button to the page itself leads there) and this split row's place in the sequence.
  formId: string | null;
  splitIndex: number;
}
type PageBlockType = Exclude<Block['type'], 'prose' | 'postList'>;
// component: any Astro component; each entry's props function gives exactly the props that component declares.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockEntry = { component: (props: any) => unknown; props: (context: BlockContext) => Record<string, unknown> };

const blockOnly = ({ block }: BlockContext) => ({ block });
const withVariant = ({ block, variant }: BlockContext) => ({ block, variant });
const withMedia = ({ block, media }: BlockContext) => ({ block, media });
const withMediaAndVariant = ({ block, media, variant }: BlockContext) => ({ block, media, variant });
const withFirstMedia = ({ block, media, variant }: BlockContext) => ({ block, media: media[0] ?? null, variant });
const withHeroCta = ({ block, media, variant, page }: BlockContext) => ({ block, variant, media, cta: page.hero.cta ?? null });

export const BLOCKS = {
  intro: { component: TextBlock, props: withMediaAndVariant },
  proof: { component: TextBlock, props: withMediaAndVariant },
  splitMedia: { component: SplitMediaBlock, props: ({ block, media, variant, page, splitIndex }) => ({ block, index: splitIndex, media, variant, cta: page.hero.cta ?? null, pageType: page.pageType }) },
  featureGrid: { component: FeatureGridBlock, props: withMediaAndVariant },
  gallery: { component: GalleryBlock, props: withHeroCta },
  process: { component: ProcessBlock, props: withHeroCta },
  faq: { component: FaqBlock, props: withVariant },
  cta: { component: CtaBlock, props: ({ block, media, variant, page, formId }) => ({ block, media: media[0] ?? null, variant, route: page.route, formId }) },
  band: { component: BandBlock, props: withFirstMedia },
  figure: { component: FigureBlock, props: ({ block, media }) => ({ block, media: media[0] ?? null }) },
  iconList: { component: IconListBlock, props: withVariant },
  stats: { component: StatsBlock, props: withVariant },
  table: { component: TableBlock, props: withVariant },
  logos: { component: LogosBlock, props: withVariant },
  contactChannels: { component: ContactChannelsBlock, props: withVariant },
  testimonials: { component: TestimonialsBlock, props: withMediaAndVariant },
  form: { component: FormBlock, props: withMediaAndVariant },
  sources: { component: SourcesBlock, props: blockOnly },
  certifications: { component: CertificationsBlock, props: withVariant },
  caseStudies: { component: CaseStudiesBlock, props: ({ block, media, page }) => ({ block, media, route: page.route }) },
  orderRoutes: { component: OrderRoutesBlock, props: blockOnly },
  relatedPages: { component: RelatedPagesBlock, props: ({ block, variant, page }) => ({ block, variant, route: page.route }) },
  styleGrid: { component: StyleGridBlock, props: withMedia },
  orderCase: { component: OrderCaseBlock, props: blockOnly },
  pricing: { component: PricingBlock, props: blockOnly },
  swatches: { component: SwatchesBlock, props: blockOnly },
} satisfies Record<PageBlockType, BlockEntry>;
