# 槽位清单（08 → Site Factory 06/07）

08 把竞品做成**模块库**：卡片网格、数字条、图文行、FAQ、收尾通栏这些模块长什么样，都取自竞品。**页面结构是我们自己的**，和竞品无关：页面蓝图按页面类型规定每页有哪些槽位、按什么顺序、每个槽位由谁来填、要多少内容。

- **蓝图归 Site Factory 06 负责。** 06 逐页、逐槽位规划（`project.yaml` → `slot_manifest`），所以 07 不需要等任何模板就能开写。
- **08 只读取蓝图**：导入器和 scaffold 都通过 `--blueprints <slot-manifest.json>` 读入。SF 发布之前，`scripts/lib/page-blueprints.mjs` 里放着同一份默认蓝图。
- 每个模板工作区会生成 `docs/research/slot-manifest.json`（schema 为 `seo-site-slot-manifest-v1`）：内容是蓝图，加上 `module` 字段，即本模板用哪个模块渲染每个槽位。`module` 只供 08/09 使用，06/07 忽略它。

## 阶段分工

| 阶段 | 负责 |
|---|---|
| 05/06 | 站点规划：页面、上下级、导航、链接目标、锚文本；页面蓝图（每种页面类型的槽位） |
| 07 | 按槽位写文案（`sections[].slot`）、`structured` 数据、用事实核查各项说法 |
| 08 | 仿竞品设计做模块库（每种槽位对应一个模块）、锁定设计 token、开源授权字体 |
| 09 | 装配：把 07 文案放进槽位、用站点规划填的槽位（子页卡片）、图片（图片计划 → 实拍或生成 → 审批） |
| 10 | 技术 SEO/GEO/AEO：JSON-LD、canonical、sitemap、面包屑、校验链接（不重新规划） |
| 11 | 上线预检：hold 页面、竞品素材、占位内容、表单、noindex |
| 12 | 上线后：收录情况、第 4 和第 12 周查"查询词→页面"重叠、转化 |

## 槽位字段

| 字段 | 含义 |
|---|---|
| `id` | 槽位 id，07 写在每个 section 的 `slot` 上 |
| `block` | 渲染成哪种区块（`intro`、`splitMedia`、`featureGrid`、`proof`、`faq`、`gallery`、`stats`、`process`、`table`、`cta`、`form`） |
| `fill` | `copy`：07 写。`plan`：09 从 pages.json 生成，只用子页的名称和链接，不写新文案。`structured`：取 07 的 `structured` 字段。`site`：09 从站点级输入生成，例如表单契约 |
| `purpose` | 这个槽位的用途 |
| `words` | 一个 section 的标题字数和正文字数范围 |
| `items` / `itemWords` | 条目数量范围，以及每个条目的字数范围（卡片：`title`、`text`；FAQ：`question`、`answer`） |
| `repeat` | 这个槽位占几个连续的 section（用于图文行） |
| `media` | 这个槽位显示的图片类型和数量（09 阶段提供） |
| `module` | 本模板用哪个模块渲染这个槽位，例如 `featureGrid:outlined`、`splitMedia:single > wide` |

## 07 怎么填写 copy 槽位

- 文字槽位（`intro`、`proof`、`splitMedia`）每个写一个 section，图文行按 `repeat` 写多个：`{ section_id, slot, heading, body }`。
- 卡片槽位（`featureGrid`）每张卡一个 section，用同一个 `slot`，连续排列，每组 2–4 张。
- FAQ 槽位写一个 section，正文是问答对：问题一行，以 `?` 结尾；答案另起行；问答对之间空一行。
- CTA 槽位写一个 section，标题和正文成为收尾通栏的标题和说明文字；按钮和相关链接仍取自 `page.cta` 和 `page.links`。
- 联系页的 `form` 槽位（`fill: "site"`）由 09 按表单契约生成，07 不写；`site` 槽位不接受 07 的 section。
- `plan` 槽位会链接全部子页：不超过槽位上限的做成卡片，其余做成纯链接，保证聚合页链到所有子页。
- `structured` 类槽位照旧用 `structured.key_figures`、`structured.process_steps`、`structured.comparison`。
- `plan` 类槽位不需要 07 提供任何内容。
- 没带 `slot` 的 section 仍然接受，按内容形状映射，旧格式的包照样能用。

## 当前的页面蓝图

| 页面类型 | 槽位顺序 |
|---|---|
| home | intro（+4 张产品图）· 品类（plan）· 关键数字 · 能力（卡片）· 工厂故事（图文行）· 流程 · 服务（plan）· 质量（图文行）· faq · cta |
| about | 公司故事（1–2 行）· 关键数字 · 价值观（卡片）· 流程 · faq · cta |
| contact | 联系方式（卡片）· 表单 · faq |
| 产品 / 方案 / 批发聚合页 | intro · 子页卡片（plan）· 关键数字 · 对比表 · faq · cta |
| product_manufacturer | intro · 关键数字 · 细节（2–5 行）· 定制选项（卡片）· 对比表 · 条款 · 流程 · faq · cta |
| product_wholesale | intro · 关键数字 · 款式范围（卡片）· 细节（1–3 行）· 对比表 · 条款 · 流程 · faq · cta |
| solution | intro · 关键数字 · 服务范围（2–4 行）· 选项（卡片）· 对比表 · 条款 · 流程 · faq · cta |
