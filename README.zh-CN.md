# SEO Website Template

[English](README.md)

这是一个 Astro-first 的建站 Skill 和工程脚手架：输入一个参考网站，提取它的字体、配色、空间、图片处理、Header、Footer、响应式行为和页面模式，然后生成可以继续接入 SEO 内容流程的 Astro 模板。

它追求的是**设计语言一致、具体呈现不同**。后续页面可以使用不同文案、不同区块数量、不同正文长度和不同路由，而不是逐字逐段复制参考站。

> 基于 [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) 改造，并重新设计为 Astro 与结构化 SEO Authoring 工作流。

## 包含内容

- Astro 静态输出与严格 TypeScript
- 首页优先的 Canary 验证流程
- 自动读取 Header 的 Navigation Shell 模式
- 共用 Header、Footer、字体和 Design Tokens
- 页面类型识别和 Astro 路由生成
- Site Factory / 结构化 Authoring 接入
- 自动适应长正文和短正文的版式规则
- 桌面端与移动端导航、留白、网格审计
- Codex、Claude Code、Cursor、Windsurf、Gemini 等 Agent 的 Skill 文件

## 环境要求

- Node.js 24 或更高版本
- pnpm 11
- 可以操作浏览器的 AI Coding Agent

## 快速开始

```powershell
git clone https://github.com/Kkoryz/seo_website_template.git
cd seo_website_template
pnpm install

# 为一个参考站创建隔离的 Astro 工作区
node scripts/create-workspace.mjs https://example.com ../my-seo-site
cd ../my-seo-site
pnpm install
```

用 Coding Agent 打开 `my-seo-site`，调用仓库内的 Skill：

```text
$seo-site-template https://example.com D:/absolute/path/to/my-seo-site
```

使用 Slash Command 的 Agent 可以调用：

```text
/seo-site-template https://example.com D:/absolute/path/to/my-seo-site
```

## 标准流程

1. 在桌面、平板和手机宽度捕获参考站首页。
2. 锁定真实观察到的字体、颜色、空间、图片规则、Header 和 Footer。
3. 先完成并确认首页 Canary。
4. 发现 Header 导航，识别代表页面类型。
5. 生成 `/about`、一个产品或制造商页面和 `/contact-us`。
6. 扩展为完整 Navigation Shell。
7. 通过 `src/data/authoring-pages.json` 输入结构化正文（Site Factory 用 `pnpm import:site-factory` 按内容形状导入 07 产物，见 [Authoring 接入说明](docs/research/AUTHORING_INTEGRATION.zh-CN.md)）。
8. 运行导航、Authoring 版式、类型和构建 Gate。

## 最后：GEO 博客文章（`geo-blog/`）

流程里的最后一个模块，独立存在。建站流程（site run）的最后一步 `geo-blogs`（`scripts/geo-blogs.mjs`）会写一份站点档案（`docs/research/geo-site.json`），然后用它调用 `geo site`，默认做 3 篇（在 `site.json` 的 `geoBlog` 里可以设 `dir`、`count`、`market`，或者用环境变量 `GEO_BLOG_DIR`）。选题由模块自己挑，这一步只负责等它做完。上线后还可以单独再跑，继续加文章。[`geo-blog/`](geo-blog/README.md) 从一个关键词出发：挑买家问题，看 ChatGPT、Claude、Gemini、Perplexity 和 Google AI Overview 怎么回答、引用了哪些页面，抓这些页面，找缺口，出大纲，写成文章；然后调用站点的 `scripts/import-geo-article.mjs`（`pnpm blog:geo <run>`）生成配图，建成待审核的博客文章，`pnpm blog:publish` 之后才上线。文章接口见 [Article Visuals](docs/research/ARTICLE_VISUALS.md)。`geo-blog/` 是 GEO 仓库的 git subtree，用 `git subtree pull --prefix=geo-blog <仓库> master` 更新。

## Authoring 模型

内容层负责路由、SEO 字段、文案、媒体引用、链接、条目数量和有序区块；Astro 模板负责组件结构和已经锁定的视觉系统。

核心区块类型包括：

```text
hero · intro · featureGrid · splitMedia · process · proof · faq · cta
```

因此，同一份内容可以套用到不同模板中，信息结构不变，但分别呈现各模板自己的视觉语言。详细合同见 [Authoring 接入说明](docs/research/AUTHORING_INTEGRATION.zh-CN.md)。

## 常用命令

```powershell
pnpm capture:reference -- https://example.com
pnpm discover:navigation-shell -- https://example.com
pnpm audit:navigation-shell -- http://127.0.0.1:4321 --capture-all
pnpm import:site-factory -- --package authoring_package.json --pages-plan pages.json
pnpm audit:authoring-layout -- http://127.0.0.1:4321
pnpm check
```

`pnpm check` 会运行单元测试、Astro 模板合同校验、`astro check` 和生产构建。

## 怎么分享给别人

这是一个私有仓库。仓库地址、ZIP、Release 和 Template 链接都只对**已经获得权限并登录 GitHub**的用户有效。

先邀请接收者：

1. 打开 GitHub 仓库。
2. 进入 **Settings → Collaborators → Add people**。
3. 输入对方的 GitHub 用户名或邮箱并发送邀请。
4. 对方接受邀请后，再把 <https://github.com/Kkoryz/seo_website_template> 发给他。

对方随后可以运行：

```bash
git clone https://github.com/Kkoryz/seo_website_template.git
```

你也可以打开 **Settings → General → Template repository**。启用后，已经拥有访问权限的人可以点击 **Use this template**，在自己有建仓权限的账号下创建一份历史独立的副本。

个人账号下的私有仓库，受邀 Collaborator 包含写入权限。如果你需要团队管理或更细的权限，建议把仓库放到 GitHub Organization，再通过 Team 分配权限。如果只想一次性交付源码、不希望对方持续访问仓库，可以手动导出源码压缩包，并先排除生成资源和本地凭据。

不需要分享 `node_modules`、`.astro`、`dist`、抓取的第三方资源或已生成的客户网站。只分享这个模板仓库，让使用者在自己本地生成独立工作区。

## 范围

本模块负责生成可复用的 Astro 静态展示模板，不包含后端复刻、登录态页面、结账流程和部署。

## 许可证

MIT，原项目署名保留在 [LICENSE](LICENSE) 中。
