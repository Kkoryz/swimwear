# Authoring 接入说明

`seo-site-template` 把从参考站提取的视觉系统，与 Site Factory 提供的正文内容分开管理。

```text
参考站 URL ──capture/discover──▶ design-lock + font-lock + variants ─┐
                                                                    ├─▶ Astro 构建 ─▶ 审计
Site Factory 07 包 ──import:site-factory──▶ authoring-pages.json ──┘
```

## 输入

Authoring 页面保存在 `src/data/authoring-pages.json`。每页需要稳定的 `id`、路由、SEO 元数据和有序 `blocks`。区块数据描述信息与资源，不携带某个模板专用的 CSS 指令。

只为补全站点外壳而存在的页面（Site Factory 尚未撰写的首页、关于、联系页）放在 `src/data/placeholder-pages.json`，并标 `"status": "placeholder"`。渲染器会显示占位标记并输出 `data-page-status="placeholder"`。

## 内容合同（`seo-site-authoring-v1`）

`scripts/lib/authoring-contract.mjs` 是导入器、渲染器（`src/lib/authoring.ts`）和 `validate:template` 共用的唯一校验器。未知区块类型、缺字段、不支持的条目数量都会让构建失败。页面字段见英文版示例。

| 区块 | 必填字段 | 数量 |
|---|---|---|
| `intro` | `heading`、`paragraphs[]` | – |
| `splitMedia` | `heading`、`paragraphs[]`、可选 `media {src, alt}` | – |
| `featureGrid` | `items[] {heading, paragraphs[]}`、可选 `span` | 2–4 项 |
| `process` | `heading`、`steps[]` | 3–12 步 |
| `proof` | `heading`、`paragraphs[]` | – |
| `faq` | `heading`、`items[] {question, answer}` | 1–20 项 |
| `cta` | `cta {label, href}`、`links[] {label, href}` | 0–24 个链接 |

Hero 由 `page.hero` 渲染为第一个 `data-authoring-block`，所以每页渲染 `blocks.length + 1` 个区块。`canonical` 存的是路由；只有在 `astro.config.mjs` 设置了 `site` 时才输出绝对地址，不猜测域名。

## Site Factory 导入器

```bash
pnpm import:site-factory -- --package <authoring_package.json> --pages-plan <pages.json> [--only id,id]
```

输出 `src/data/authoring-pages.json`、`src/data/site-nav.json`（来自 `pages.json` 的 `header_nav`/`footer_nav`）和 `docs/research/site-factory-import.json`（每页的区块映射、跳过的页面、模板不渲染的字段）。

只导入 `release_status: ready_for_template` 的页面；`hold` 页面跳过并记录 `hold_reasons`，用 `--only` 指定 hold 页面会直接失败。

按**内容形状**映射，不看行业词，保留 section 顺序：

| 形状 | 区块 |
|---|---|
| 第一个 section | `intro` |
| ≥ 2 个空行分隔的组，每组首行以 `?` 结尾且后面有答案 | `faq`（出现没有问题或没有答案的组时导入失败） |
| ≥ 3 行且每行以 `1.` / `1)` / `Step 1` 开头 | `process` |
| 数字最多（≥ 4 个）的非 FAQ section：数量、天数、价格、条款 | `proof` |
| 其余 ≥ 120 词的 section | `splitMedia` |
| 连续的其余 < 120 词 section | 2 或 3 张等宽卡片的 `featureGrid`（4 个拆成 2 + 2，单独一个变成 `splitMedia`） |
| 页面 `cta` 加 `links` | 末尾的 `cta` 区块，内含相关链接 |

导入器逐字复制文案：只按空行拆段、按首行拆 FAQ，不改写、不删减、不添加。没有 `cta` 却有 `links` 时导入失败，不会静默丢弃。编辑备注 `notes` 记为未放置字段。

结构化字段（关键数字、流程步骤、对比表）由 Site Factory 07 以 `sf/structured/v1` 输出，见 [SITE_FACTORY_STRUCTURED_DATA.zh-CN.md](SITE_FACTORY_STRUCTURED_DATA.zh-CN.md)。07 输出之前可用 `--structured <覆盖文件> --facts <facts.yaml>` 提供；每个关键数字都必须逐字出现在它引用的已批准事实中。

## 渲染合同

1. 复用已确认的 Header、Footer、字体、颜色、空间尺度、圆角和图片处理方式。
2. 根据正文形状，把区块映射到兼容的 Astro 版式（`src/components/blocks/`）。
3. 根据真实字数和条目数量选择 compact、standard 或 long 密度。
4. 保留区块顺序和语义，但不强制沿用参考页的区块数量或页面高度。
5. 图片属于版式的一部分，必须明确宽高比、裁切规则和焦点位置。
6. 在渲染边界输出 `data-authoring-page`、`data-authoring-block` 和 `data-layout`。
7. 只有 Authoring 数据明确要求跨列时，才能输出 `data-explicit-span`。
8. 只链接已构建的路由；尚未构建的计划页面由 `SmartLink` 渲染为文字并标 `data-route-status="planned"`。

## 模板样式处理：`template-variants.json`

- `axes`（可选）：模板默认照参考站做。只有业主要求偏离时，才对每个改动的组合维度（`gridGeometry`、`sectionGrouping`、`spacingRhythm`、`cardTreatment`、`ctaGrouping`、`decoration`）写明 `source`（参考站怎么做）和 `candidate`（本模板怎么做）。
- `components`：每种区块采用参考站的哪种处理，取值见 `TEMPLATE_VARIANTS`。
- `components.media`：Hero 图和配图池，带 `origin` 标记（例如 `reference-placeholder`）。参考站照片只是占位，发布前必须替换。

字体角色、表面色板、摄影风格、Header/Footer 行为属于锁定不变量，放在 `design-lock.json`、`font-lock.json` 和 `global.css` 的 token 中，不属于变体。

### 图位与阅读节奏

Site Factory 的文案通常比参考站正文长，而且不带图片，所以节奏和配图都由模板提供：

- 每种区块都有由变体决定的图位：`intro: "gallery"`（一排 4 张产品图）、`featureGridMedia: true`（每张卡片一张图）、`splitMedia`（一张工艺图）、`proof: "panel-media"`（一张材料图）、`cta: "image-band"`（一条生活场景图片色带）。
- `components.media.pools` 按参考站的摄影类别（`product`、`process`、`material`、`lifestyle`）分组；`routePools` 可以为某个路由收窄某类图片（例如 bra 页只用文胸图）。`mediaAllocator` 保证同一页不重复用图。
- `TextFlow` 把正文排成一个导语句加若干组完整句子，只重新分组原句、不改字；审计比对文案时忽略空白。

## 一次完整的参考站流程

```bash
node scripts/create-workspace.mjs <参考站 url> <工作区>
pnpm capture:reference -- <参考站 url>
pnpm capture:reference-pages -- <站点根地址> home=/ manufacturer=/… wholesale=/… about=/… contact=/…
pnpm measure:reference-density -- <参考内容页 url>
# 分析 → docs/research/analysis/{design-lock,font-roles,media}.json、components.md、behaviors.md
pnpm apply:reference-analysis            # token 写入 global.css，图片池装入 public/media/reference 和 variants
pnpm import:site-factory -- --package … --pages-plan … [--only …]
pnpm scaffold:placeholder-pages -- --pages-plan … home=<url> about=<url> contact=<url>
# 需要人工判断：src/styles/reference.css（参考站的样式处理）、template-variants.json 的变体
pnpm check && pnpm audit:navigation-shell -- <预览地址> --capture-all && pnpm audit:authoring-layout -- <预览地址>
```

采集、密度测量和 pattern 测量之前，会先让参考站渲染成访客滚动浏览后看到的样子（`scripts/lib/reveal.mjs`）：`content-visibility: auto` 的区块强制显示，`data-lazy-src`/`data-src` 里的懒加载图片加载真实地址，并模拟一次鼠标移动，让优化插件推迟到首次交互才执行的脚本（如轮播）运行。回到页顶后会等滚动处理完成再测量，所以滚动后变成固定定位的 header 按页顶状态测量。

`scaffold:placeholder-pages` 测量参考页每个通栏区块（图片、字数、标题、表单、手风琴、表格），按形状映射为 `intro`/`proof`、`splitMedia`、`gallery`、`featureGrid`、`faq`、`cta`，保持参考页顺序，并按参考页 Hero 设定 `heroByPageType`（铺满照片加文字 → `media-overlay`；文字旁的色带图 → `media-split`；无文字照片 → `media-banner`；纯文字 → `plain`）。logo 墙和短数字行会被跳过，因为占位文案不能代替第三方 logo 或数字。通栏压图文字色带目前映射为 `splitMedia`，还没有专门的色带区块。

## 模板核心与工作区

工作区只拥有三类文件：数据（`src/data`、`docs/research`、`public`）、token（`src/styles/global.css`）和竞品专属样式（`src/styles/reference.css`）。其余都是模板核心（`scripts`、`config`、`src/components`、`src/lib`、`src/layouts`、`src/pages`、`src/styles/{template,patterns}.css`）。

- `pnpm sync:template-core -- <工作区> ...` 把核心复制进工作区，并写入 `template-core.json`（仓库 commit 和每个核心文件的哈希）。`create-workspace` 也会写这个文件。
- 工作区的核心文件被改动、丢失，或出现未记录的文件时，`validate:template` 会判失败，手工改动和过期副本都会暴露出来，不会悄悄漂移。
- `reference.css` 通过 `docs/research/CSS_HOOKS.md` 列出的 CSS 变量（用 `pnpm list:css-hooks` 重新生成），以及文档化的 `data-variant`/`data-pattern` 属性来改共享组件的样式，不去覆盖组件内部的类名嵌套。
- `template-variants.json` 里的全站样式取值（`hero`、`intro`、`featureGrid`、`splitMedia`、`proof`、`faq`、`cta`、`heroByPageType`）必须在 `TEMPLATE_VARIANTS`（`scripts/lib/authoring-contract.mjs`）列出的值里，`validate:template` 会拒绝其他值。
- 页面构建器的标记（例如 Elementor 的页头、页脚类名）只放在 `scripts/lib/page-shell.mjs`；所有采集和测量都通过 `scrollThroughPage`（`scripts/lib/reveal.mjs`）滚动页面。

## 站点身份与图片（09 阶段）

- `pnpm import:brand-kit -- --project <site-factory projects/<产品线>>` 把 00 的品牌素材（logo、favicon、web manifest、分享图）放到站点根目录，并写入 `src/data/site-identity.json`；`pnpm build:brand-kit` 是兜底方案。站点身份里的 origin 会设置 Astro 的 `site`，因此 canonical 是绝对地址。
- `pnpm plan:images -- --line "<产品>"` 规划图库：每个产品品类一套（该品类的 manufacturer 页和 wholesale 页共用），另加一套全站通用。
  - 数量按页面实际放置的图片算（`scripts/lib/media-slots.mjs`，与渲染共用同一份规则），每类图有上限（`config/image-briefs.json`）。
  - 参考模板里分析过的照片只作为**风格参考**附上。每张图从同类参考照片里取用得最少的几张（用量相同时优先选拍到同品类产品的），第一张决定它仿照的场景类型。
  - 规划里的主题只写图里拍什么，不写场景和风格。
  - `placeholderKinds` 里的图类不生成，保留为图片占位框。默认是 `process`：工厂、员工和生产工序必须用真实照片。
- `pnpm analyze:image-style` 写入 `docs/research/image-style.json`。每个图类一份（没有自己参考照片的图类用全站那份），包含两部分：
  - Codex 看完参考照片后写的风格描述：场景、背景、色彩、光线、人物、姿态、构图、要避免的风格。
  - 这些参考照片实测的色彩度、亮度、对比度范围。
  - 参考照片不变时沿用已有描述，不重新分析。
- `pnpm generate:images` 调用 Codex 内置生图工具（`reference-style-imagegen` 技能），每张图单独跑一次，提示词里带上该图类的风格描述；没有 `image-style.json` 时拒绝运行。
  - 结果与任一张参考照片的差异哈希相差 10 位以内，或与图库里另一张图相差 14 位以内时作废，下次运行重新生成。
  - 实测值超出该图类参考范围的，标记为 `review: style-drift`，等人工复核。
  - 通过的保存母图（`docs/research/images/masters`）和多尺寸 WebP（`public/media/generated`）；网页用的 WebP 不写任何元数据；是否 AI 生成（IPTC 数字来源类型 `trainedAlgorithmicMedia`）只记在图片登记表里。
  - `docs/research/image-plan.json` 是登记表：记录提示词、哈希、alt（英文，最多 125 个字符）、相似度、风格检查结果和复核状态。
  - 重新规划时，不再保留的条目对应的网页图片文件会被删除。
- 多样性：每张图固定分配服装颜色和模特（`config/image-briefs.json` 的 `garmentColours`、`casting`），同一参考场景的图必须明显不同，生成图不放在工厂场景。图像模型拒绝生成上身图（如内衣）时，先换措辞仍用模特重试（零售目录、日常叠穿，且不附参考图），仍不行再退到多样化的平铺图。`pnpm check:image-diversity` 用 DINOv2（small 量化版，CPU 运行，缓存在 `~/.cache/seo-site-template/models`）给每张图计算特征向量，按画面内容而非像素判断：余弦相似度 ≥ 0.80 视为近似图，退回并换下一组属性重生成；同时把整套图的 Vendi 多样性（按每张图折算）和竞品自己的图库比较：低于竞品 0.9 倍时，列出最冗余的几张图，由业主看总览图决定（11 阶段只提示，不阻止上线）。之后 `pnpm review:image-library` 让 Codex 看整套图的编号总览，把近似重复、同一模特重复出现、颜色不对、工厂场景、看不清主体的图退回重新生成。
- `pnpm approve:images -- --reviewer "<姓名>" --ids …` 在登记表里记录人工审核（审核人、日期、版权 `owned`）。没有 alt 的图不能通过；`--reject "<原因>"` 会让该图下次重新生成。只有审核通过的图能上线（11 阶段检查）。
- `pnpm apply:image-library` 用图库替换参考站的占位照片：全站图池、按路由的图池、每个路由一张首屏图。链接到产品页的品类卡片会显示该页自己的图片。占位图类始终显示为图片占位框，不会拿别的图类来填。
- `pnpm import:site-media -- --project <site-factory projects/<产品线>>` 把站点自己的照片（`media/media.json`，schema `sf/media/v1`：工厂、团队）导入 `public/media/site/` 和 `src/data/site-media.json`，用来填占位图类（工厂和团队 → `process`）；产品、头图、面料和使用场景照片优先于图库照片。站点上不标任何图片是怎么来的（业主 2026-10-24）：唯一的记录是上线前的交接单（`pnpm handoff [--real <业主实拍文件清单>]`，`docs/research/handoff.json`），里面标出要换成实拍的工厂、团队和客户照片，由业主在上线前替换。
- 参考站文件：抓取的证据文件放在 `docs/research/`（`reference-assets`、`navigation-assets`）；开发期当占位用的参考照片放在 `public/media/reference/`，`pnpm build:release` 会把它们从构建产物中删除，若仍有页面引用则构建失败。

## 询盘表单（09 阶段）

蓝图里 `fill: "site"`、`block: "form"` 的槽位使用 `config/lead-form.json` 的表单：带 name 和 autocomplete 的字段、链接到隐私页的同意勾选、防机器人的隐藏字段、同源的 `POST /api/leads`。`status` 为 `not-connected` 时表单禁用、没有 action；在接通并于部署后实测一次真实提交之前，11 阶段会阻止上线。

页面的 `knowledge`（给各段提供过事实的行业知识卡片：`card_id`、`title`、`sources[{url, title, publisher}]`）会变成结尾 CTA 之前的一个 `sources` 区块：带编号的"Sources"列表，同一个 url 只列一次。来源缺标题或不是 http(s) 链接时导入失败。知识卡片是行业陈述，不是公司事实：不计入 `citedFacts`，也不用 `--facts` 核对。

## 右下角聊天（09 阶段）

`src/data/site-runtime.json` 的 `chat` 决定每个站右下角的聊天窗口（每个站各自配置，不随模板同步）：

```json
{ "chat": {
  "chatwoot": { "baseUrl": "https://chat.example.com", "inboxIdentifier": "<该站 API 收件箱的 identifier>" },
  "whatsapp": [{ "label": "Sales", "number": "+86 138 0000 0000" }],
  "email": "sales@brand.com",
  "prefill": "Hello, I would like to ask about {title}: {url}",
  "greeting": "Hi there! Tell us about your project and we will get back to you.",
  "quickReplies": ["I would like a quote.", "Can I order samples first?"],
  "replyTime": "Typically replies within a few hours",
  "color": "#15803d",
  "autoOpen": 8
} }
```

- 它是站点自己的聊天窗口：顶部是站点图标、站名、可选的回复时间，以及 WhatsApp 和邮件两个小图标；中间是对话，开头只有一句团队问候，下面是最多 3 个点一下就直接发出的快捷问题（默认"I would like a quote."和"Can I order samples first?"，对话开始后消失）；底部是输入框和发送键。回复时间不填就不显示，不编造。
- 有 Chatwoot 时，访客的第一条消息在该站的 Chatwoot API 收件箱里新建联系人和对话（对话属性带上页面地址、页面标题、来源页和 UTM），之后的消息进同一个对话；团队在 Chatwoot 后台或手机 App 回复，窗口打开时每 4 秒、关闭时每 30 秒取一次新消息（关闭时有新回复会在气泡上显示红点）。对话保存在访客浏览器里，换页面、下次访问都能接着聊。第一条消息发出后请访客留邮箱，以便离开页面后也能回复。聊天服务器连不上时提示改用 WhatsApp 或邮件。
- 没有 Chatwoot 时，窗口照样可以输入，发送时把访客写的内容带到 WhatsApp（有号码时）或邮件。WhatsApp 和邮件链接始终预填访客写的内容（还没写时是一条写明当前页面的开场白）。
- 颜色默认绿色（`#15803d`，白字达到 WCAG AA）；`"color": "accent"` 跟随站点主色，也可填任意颜色（文字自动选黑或白）。WhatsApp 图标始终是 WhatsApp 绿。
- 电脑上访客停留 `autoOpen` 秒（默认 8；0 为不自动打开）后自动展开，每次访问只展开一次，访客关掉后 24 小时内不再自动展开；手机上从不自动展开，只显示气泡，点开后全屏显示。
- 不加载任何第三方脚本（不用 Chatwoot 的网页插件），访客发消息前不向聊天服务器发任何请求，不影响 LCP/INP。点击用 Umami 事件统计（`chat-whatsapp`、`chat-email`、`chat-quote`）。
- 配置有误（号码不是完整国际号码、Chatwoot 不是 https、没有任何渠道）时构建失败；没有 `chat`（未决定）或配置有误时 11 阶段阻止上线；`"chat": false` 表示该站不要聊天。
- 建站流程：组件在模板核心里，每个新站都自带；09 阶段运行 `pnpm setup:chat -- --channels <该站渠道.json>`（格式同上面的 `chat`，不含 chatwoot）写入配置。设置了环境变量 `CHATWOOT_URL`、`CHATWOOT_ACCOUNT_ID`、`CHATWOOT_API_TOKEN` 时，它还会在 Chatwoot 里为该站找到或新建 API 收件箱（名为"<站名> website chat"）并写入 `inboxIdentifier`；令牌只从环境变量读取，不写进任何文件。不要聊天的站运行 `pnpm setup:chat -- --off`。
- 服务器端（Chatwoot 部署、多个 WhatsApp、每站邮箱、线索回传）见 `docs/research/CHATWOOT_DEPLOY.zh-CN.md`。

## 多站运营

站点登记表（`deploy/registry/schema.sql`）是每个站运营信息的唯一来源：`pnpm site:config` 按域名读取登记表的一行，在 Umami、Chatwoot 里找到或新建该站的网站和收件箱，把 ID 写回登记表，并生成 `src/data/site-runtime.json`。询盘表单和聊天都带上站点、页面、来源网站和 UTM，进同一张 `leads` 表。每个站用同一个 GitHub 发布工作流（检查 → 正式构建 → 上线前检查 → 上传 → 切换 `current`），回滚几秒完成。步骤见 `deploy/OPERATIONS.zh-CN.md`。

## 技术 SEO（10 阶段）

`scripts/lib/seo-head.mjs` 根据页面、站点身份和站点规划输出给搜索引擎的信息，不重新规划内容：

- canonical 是 https 裸域的绝对地址；占位页 `noindex, follow` 且不进 `sitemap.xml`；有站点身份后 `robots.txt` 开放并带 sitemap；
- Open Graph 和 Twitter 标签取页面自己的标题和描述，加站点分享图；
- 首页有 WebSite 和 Organization；名称、网址和 logo 由站点身份（00 阶段）决定，页面自带的 JSON-LD 里也以此为准；
- 可见面包屑和 BreadcrumbList 用同一条路径（导航路径，只含已建成的页面）；
- JSON-LD 使用绝对地址，并转义 `<`。

`pnpm audit:seo`（已并入 `pnpm check`）检查构建结果，分失败和警告两级（警告不阻断，反馈给文案负责方）。失败项：标题、描述、canonical、robots、社交标签、JSON-LD 合法性、Product 和 FAQPage 的必填属性、JSON-LD 指向未建页面的链接、组织身份、面包屑一致性、图片 alt 和尺寸、首图懒加载、孤立页、sitemap、robots.txt 和 404 页，以及唯一 H1、文档语言、可索引页上的占位文字、按类型检查 JSON-LD（`scripts/lib/schema-rules.mjs`：必填属性、占位值、面包屑序号）。警告项：JSON-LD 推荐属性、已不出富结果的类型、标题层级跳级、纯数字标题、title 和描述长度、空或笼统的链接文字、重复的 title 和描述、链接到占位页、点击深度超过 3。规则移植自 claude-seo（MIT）。页头页脚菜单只显示已建成的页面（未建的规划页只在作为已建页面的分组时出现）。`pnpm build:nginx-config` 生成 Nginx 配置（唯一规范主机、结尾斜杠、404、缓存时长、压缩、安全响应头、`/api/` 反向代理）。统计：`src/data/site-runtime.json` 写入 `{ "analytics": { "provider": "umami", "scriptSrc": "…", "websiteId": "…" } }` 即加载 Umami 脚本。

知识库复核后的补充（2026-09-25）：sitemap 输出 lastmod（导入时记录内容真正变化的日期，与内容不符时不输出）；FAQPage 标记保留但审计提示已不出富结果（Google 2026 年 5 月起）；公司在结构化数据里是一个 `@id` 实体，页面标记里提到本公司的地方都指向它；页脚显示登记表里的邮箱和 WhatsApp。

## 上线前检查（11 阶段）

先 `pnpm build:release`（同时记录 `docs/research/seo-snapshot.json`：每页的 title、描述、canonical、robots、标题结构、JSON-LD 类型和哈希），再 `pnpm preflight`，结果写入 `docs/research/launch-preflight.json`：`ready_for_deployment` 或 `blocked`，永远不会是"已上线"。Site Factory 的 hold 原样排在最前，其后是本阶段自己的：占位页、竞品文件或照片、可索引页上的图片占位框、未审核或缺 alt 的 AI 图、未接通的表单、缺隐私页、未装统计、站点身份不是 00 阶段的或仍是暂定名或临时域名、SEO 审计失败、相对已确认基线的严重 SEO 漂移（页面消失、新增 noindex、canonical 变更、JSON-LD/title/H1 被删；审核后用 `pnpm seo:snapshot -- --accept --by "<姓名>"` 把新快照设为基线）、站内死链、首屏图片超过 350 KB。它还检查业主的上线签收清单（`docs/research/release-signoff.json`，schema `seo-site-release-signoff-v1`：上线前必须替换或确认的内容，如成立年份、证书、能力清单；事实类条目会列出引用它的页面），每个未确认的条目都会阻止上线，用 `pnpm signoff -- --confirm <id> --by "<姓名>"` 确认。部署后还列出需要在线上核对的事项：HTTPS、响应头和跳转、真实表单提交、Search Console 和 Bing 验证并提交 sitemap、真实用户 Core Web Vitals、抽查收录。

上线前检查新增（知识库复核）：删除的页面必须在 `src/data/redirects.json` 里有 301 或 410；Nginx 配置必须指向 `current` 且不含别的域名；与业主其他站的页面近似重复时拦下（`pnpm check:cross-site`，没比对只提示）；联系页没有任何可用联系方式时拦下；站点未登记、已退役、暂停但没有公告时拦下（暂停本身不拦）。发布后线上核查失败自动回滚，并向 IndexNow 提交变化的网址。详见 `deploy/OPERATIONS.zh-CN.md`。

## Pattern 库与覆盖率

`scaffold:placeholder-pages` 给参考站核心页的每个通栏区块命名 pattern（`scripts/lib/pattern-map.mjs`），并用区块库渲染：压图/左文右图/横幅/纯文字 Hero（支持小标题、副标题、第二个按钮）；文字、勾选清单、图标特点；单图、双图、带底色、宽图图文（视频和切换标签以图片呈现）；压图色带；宽图说明；编号卡片、分栏、联系卡片、带图卡片；等宽图库、拼图图库；统计、对比表格、logo 墙、评价、询盘表单（不连接后端）、FAQ、按钮行。社交图标、只有标题的行、装饰留白会被跳过并写明原因。

首页、About、Contact 的占位页逐区块对应参考页（占位文案、logo、数字、评价都明确标注，不编造）。07 文案页按同类参考页的图文序列和卡片、图库 pattern 呈现（`template-variants.json` 的 `pageTypes`）。页头页脚也是变体：`header.layout`（`stacked`/`inline`）、`topBar`、`dropdown`（`list`/`mega`）、`carets`、`ctaRoute`；`footer.layout`（按导航分组带标题的 `columns`，`maxLinks`）或 `minimal`。

`docs/research/pattern-inventory.json` 记录每个参考区块的 pattern、处理方式和截图（`docs/research/pattern-sections/`）。某个 pattern 没有处理方式，或参考页按高度计的覆盖率低于 80%，`validate:template` 失败。`pnpm compare:sections -- <预览地址>` 为每个占位页生成逐区块对照图（`docs/design-references/section-comparisons/`）。

## 视觉密度 gate

版式可以通过所有结构检查，但读起来仍是一堵文字墙。先测一次参考页：

```bash
pnpm measure:reference-density -- <参考页 url> <参考页 url> …
```

结果写入 `docs/research/raw/reference-density.json`（`seo-site-reference-density-v2`）：每页的每 1000px 字数、照片占比、结构块占比、视觉占比（两者合计）、最长纯文字段，以及允许范围（文字密度 ≤ 最密参考页 × 1.15；视觉占比在最低 × 0.75 到最高 × 1.35 之间；纯文字段 ≤ 最长 × 1.2）。`audit:authoring-layout` 用同样方法在 1440 下测每个 authored 页面，超出范围分别报 `density_text_heavy`、`density_too_few_images`、`density_too_many_images`（这两项按视觉占比）、`density_long_text_run`。authoring 模式必须有这个文件；v1 的文件视同没有，要重测。

怎么算（业主 2026-11-10）：照片是图片、视频和背景照片；结构块是表格、嵌入（iframe）、图表（svg、canvas）、卡片网格（三张以上并排、带底色或边框的文字卡片），以及我们自己的流程图、步骤卡片、数字卡片、表格和图表。两者都会截断纯文字段。字数只算显示出来、不在表格里的正文，折叠的标签页和手风琴内容不算。`site.json` 的 `densityPages` 指定标杆页面（可以是任何站，写完整网址：两个竞品的内容页）；不写时测参考站的各页，但不含联系页这类功能页。单独测量的页型有自己的区间（`components.densityBands.pageTypes`，业主 2026-11-12）：`site.json` 的 `densityPageTypes`（`{ "home": "/" }`，每个页型一个或几个路径），不写时首页用参考站首页；其他页型沿用标杆区间。竞品某页型的整幅照片带条数（`pageTypes.<type>.mediaModules` 中 band 的条数）是该页型的下限：视觉预算不会撤到下限以下，页面少于下限时布局审计报 `signature_missing`。

## 版式不变量

- 短页面应自然收口，不能为了模拟参考页高度而保留空壳。
- 长页面可以重复兼容的区块模式，但不能改变 Design Tokens。
- 没有显式跨列的同级卡片必须保持等宽。
- `data-boundary-anchor="box"` 只允许用于有意设计的全宽视觉区块；普通正文按可见内容测量边界。
- 桌面端和移动端都必须只有一个 H1、没有横向溢出、没有异常大的区块间距。

## 必须执行的验证

在 `site-template.json` 中设置 `"mode": "authoring"`、`routes`（所有渲染的路由）和 `representatives`，启动候选站后运行：

```bash
pnpm check
pnpm audit:navigation-shell -- http://127.0.0.1:4321 --capture-all
pnpm audit:authoring-layout -- http://127.0.0.1:4321
```

Authoring 审计读取渲染器使用的同一批页面文件，写出 `docs/research/authoring-layout-audit.json`。除版式外，文案没有出现在 `<main>`（`unplaced_copy`）、内链指向未构建路由、canonical 缺失或错误、JSON-LD 数量与数据不符，都会失败。任一失败都阻止交付。

## 同一内容应用到不同模板

Authoring 数据合同可以跨模板复用。同一份 JSON 应保留相同的信息结构和文案，但分别呈现每个模板自己的字体、配色、图片节奏、Navigation Shell 和组件组合。
