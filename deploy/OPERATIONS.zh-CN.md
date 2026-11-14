# 多站运营：登记表、配置生成、发布与回滚

面向同时运行很多站：每个站的运营信息只记在登记表的一行里，站点配置由命令生成，发布走同一个 GitHub 工作流，回滚几秒完成。

## 1. 站点登记表（一次性搭建）

1. 在现有 PostgreSQL 执行 `deploy/registry/schema.sql`，建 `sites` 和 `leads` 两张表。
2. 在 Directus 里把两张表加为集合（Settings → Data Model 会自动识别已有表）。
3. 建一个角色（例如 `site-factory`）：对 `sites` 可读、可更新；对 `leads` 可读、可新增、可更新。给这个角色建一个用户并生成静态令牌（Static Token）。这个令牌只放在环境变量 `DIRECTUS_TOKEN` 里，不写进任何文件。
4. 每个新站在 `sites` 里加一行：`id`（简短英文，如 `strandmill`）、`domain`（裸域名）、`name`（公司名）、`status`（先填 `building`）、`repo`、`deploy_path`（如 `/var/www/strandmill.com`）、`whatsapp`、`email`，可选 `agent_name`、`reply_time`。不要聊天就把 `chat_enabled` 设为 false。

`status` 的含义（依据 Google《暂停或停用网站》《含网址更改的网站迁移》和 HTTP 状态码文档）：

- `paused`（暂停营业）：网站**继续在线**，在 `site_notice` 里写明情况（例如"3 月 1 日恢复接单"），每页顶部显示这条公告（带 `data-nosnippet`，不进搜索摘要）。没写公告时上线前检查会拦下。不要把站撤下、不要用 Search Console 的"移除"；只有一两天的短暂停机才可以返回 503，且 robots.txt 始终返回 200。暂停的站照常监控、照常可以发布。
- `retired`（退役）：不再发布。要么把全部网址 301 到接替的站（在新站的 `previous_domains` 里填旧域名，Nginx 配置自动生成跳转；在 Search Console 用"更改地址"工具；跳转至少保留一年），要么让网址返回 404/410，robots.txt 仍返回 200。域名继续续费，不要放掉。
- 内容任务、日报按这个字段跳过 `retired` 的站。

上线记录：`verification`（建议 DNS TXT 验证，站点暂停或换服务器也不失效）、`search_console_verified`、`bing_verified`（在 Bing Webmaster 从 Search Console 导入）、`sitemap_submitted_at`、`launched_at`。这些都完成后才把状态改为 `live`。

## 2. 生成站点配置：`pnpm site:config`

在站点工作区运行（先导入品牌资料，站点身份里要有域名和公司名）：

```bash
DIRECTUS_URL=https://admin.<域名> DIRECTUS_TOKEN=... \
UMAMI_URL=https://analytics.<域名> UMAMI_USERNAME=... UMAMI_PASSWORD=... \
CHATWOOT_URL=https://chat.<域名> CHATWOOT_ACCOUNT_ID=1 CHATWOOT_API_TOKEN=... \
pnpm site:config
```

它会：
- 按域名找到登记表里的这一行（找不到就报错，不会自己造）；
- 这一行没有 `umami_website_id` 时，在 Umami 里找到或新建这个站的网站，把 ID 写回登记表；
- 有聊天渠道时，在 Chatwoot 里找到或新建这个站的收件箱、给虚拟客服起名并生成头像，把收件箱标识和客服名写回登记表；
- 生成 `src/data/site-runtime.json`（站点 id 和状态、统计脚本、聊天配置）。

没有设置某个服务的环境变量时，就跳过那一项（例如 Chatwoot 还没部署）。还没准备好 Directus 时，可以用一个 JSON 文件代替：`pnpm site:config -- --registry sites.json`（文件内容是若干行，字段同上）。

## 3. 发布与回滚

**每个站一个 GitHub 仓库**（站点工作区就是仓库根目录，包含 `pnpm-lock.yaml`）。模板核心同步时会把 `deploy/github/release.yml` 放到站点的 `.github/workflows/release.yml`。

仓库设置：
- Secrets：`DEPLOY_SSH_KEY`（只用于发布的专用密钥）、`DEPLOY_KNOWN_HOSTS`（服务器 `ssh-keyscan` 的输出）。
- Variables：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PATH`（与登记表的 `deploy_path` 一致）。
- Environment `production`：可以设为需要人工批准，避免推送即上线。

服务器准备（每站一次）：
- 建发布用户（只对 `/var/www/<域名>` 有写权限，不给 sudo），放入上面密钥的公钥。
- 建目录 `<deploy_path>/releases`。
- Nginx 的网站根目录指向 `<deploy_path>/current`（`pnpm build:nginx-config` 生成的配置默认如此）。

每次推送到 `main`：跑全部检查 → 正式构建 → 上线前检查（被拦就停，不上传）→ 上传到 `releases/<时间>-<提交>` → 切换 `current` 软链接 → 核查线上站点。服务器只保留最近 10 个版本，当前在线的版本永远不删。

回滚：在 GitHub 上手动运行这个工作流并勾选 rollback，或在服务器上执行：

```bash
sh <deploy_path>/site-release.sh rollback <deploy_path>
sh <deploy_path>/site-release.sh status <deploy_path>
```

## 4. 页面改名、删除与旧域名

- 页面删除或改名时，在站点的 `src/data/redirects.json` 里加一条：`{ "from": "/旧路径/", "to": "/新路径/" }`（301），或 `{ "from": "/旧路径/", "status": 410 }`（确实删除、没有替代页）。`pnpm build:nginx-config` 会把它们生成进 Nginx 配置；上线前检查发现删除的页面没有这样一条时会拦下（SEO 漂移检查）。
- 跳转一次到位，不要链式跳转。
- 旧域名写在登记表 `previous_domains`，新站的 Nginx 配置会把旧域名的所有路径 301 到新域名的同一路径（证书要同时覆盖旧域名）。

## 5. 发布后自动做的事

- **线上核查**：失败就自动回滚到上一个版本，回滚后再核查一次。
- **IndexNow**：发布成功后，把相对已确认 SEO 基线新增、修改、删除的网址提交给 IndexNow（Bing 等搜索引擎共用；第一次发布提交全部网址）。每个站的 key 由 `site:config` 生成并记在登记表 `indexnow_key`，key 文件放在网站根目录。
- **sitemap 的 lastmod**：导入文案时记录每页内容真正变化的日期（`src/data/page-dates.json`，要和内容一起提交），只有记录和页面内容对得上才输出，绝不用构建时间。

## 6. 多站之间的重复内容

同一个老板运营很多站，Google 的垃圾内容政策把"多个只有细微差别的网站"视为门页（doorway），也打击分散在多站的规模化内容。所以：

- 每次正式构建都会记录这个站的内容指纹（`docs/research/content-fingerprint.json`）。
- 发布前运行 `pnpm check:cross-site -- --against <其他站的工作区或指纹文件>`，或者设置 `SITE_FINGERPRINTS_DIR` 指向一个共享目录（每个站发布后把自己的指纹放进去）。与其他站的页面相似度达到 0.5 就拦下发布；没比对过也会拦下（没跑过的检查一律按拦下处理）。
- 各站之间不要互相加全站链接（页脚、页头），每个站要有自己明确的业务定位。

## 7. 线索

表单和聊天的线索都进 `leads` 表，字段约定和两个接口（`/api/leads`、`/api/chat-webhook`）见 `deploy/registry/LEADS_API.zh-CN.md`，由自有归因 API 实现。

## 8. 上线后监控清单（12 阶段，尚未实现，依据知识库整理）

| 频率 | 内容 |
|---|---|
| 每 1–5 分钟（Gatus） | 每个 `live`、`paused` 站：首页和 robots.txt 返回 200（绝不能 5xx）、sitemap 返回 200、`/api/leads` 健康、证书剩余超过 21 天 |
| 每天 | 定时跑线上核查并核对 robots.txt 没被改；导出 Search Console 和 Bing 的按页面、按搜索词数据进 Metabase（两者都只保留 16 个月，必须自己存）；各站线索数与近期平均比较 |
| 每次发布 | 线上核查、IndexNow、对重要新页做网址检查；sitemap 结构变了才重新提交 |
| 每周（按站汇总发企业微信） | 已编入索引的页数对比 sitemap 页数、软 404、"已抓取但未编入索引"；人工处置和安全问题（Search Console 邮件提醒发到一个有人看的邮箱）；服务器日志里 Googlebot、Bingbot 的访问和 4xx/5xx（用反向 DNS 确认真爬虫） |
| 每月 | 真实用户 Core Web Vitals、富媒体结果报告；Bing 网站扫描和建议；外链新增与垃圾外链；排名和流量同比；跨站重复内容扫描 |
| 每季度 | 表现下滑的页面：更新、合并（301）或保留；核对暂停和退役站的跳转与域名续费 |

## 9. 还没做的

- 归因 API 里 `/api/leads`、`/api/chat-webhook` 的实现（在归因 API 的仓库里做）。
- Metabase 每晚汇总（Umami + leads 进 `analytics_mart`，按站点筛选，标明更新时间）。
- 第 8 节的监控：从登记表生成 Gatus 检查项，告警发企业微信。
- 注册表和线索库的每日备份与恢复演练。
- 旧站退役：按"备份核验 → 停自动任务 → 移出日报和发布登记 → 下线域名和独立服务 → 删除确认不再需要的部署文件"执行，并按第 1 节的 `retired` 规则处理跳转和状态码。
