# 右下角聊天：Chatwoot 服务器端部署

站点前端（站点自己的聊天窗口、预填消息、自动展开）已在模板里实现，每个站在 `src/data/site-runtime.json` 的 `chat` 里配置，见 `AUTHORING_INTEGRATION.zh-CN.md`「右下角聊天」。本文是服务器端：一套自托管 Chatwoot 服务所有站点。

## 1. 一套 Chatwoot，多个站、多个号码、多个邮箱

Chatwoot 里每个渠道是一个「收件箱」（inbox），所有收件箱在同一个后台和手机 App 里处理，可按收件箱分配客服或团队：

| 需要 | 做法 |
|---|---|
| 每个站自己的在线聊天 | 每个站建一个「API」收件箱，得到该站的 `inboxIdentifier`，写进该站的 `site-runtime.json`。站点上的聊天窗口是模板自己的界面，通过 Chatwoot 的公开 Client API 收发消息，不嵌入 Chatwoot 的网页插件 |
| 多个 WhatsApp 号码 | 每个号码建一个 WhatsApp（Cloud API）收件箱；站点窗口里的 WhatsApp 按钮写该站自己的号码 |
| 每个站不同的邮箱 | 每个邮箱建一个「邮件」收件箱（转发地址，或 IMAP 收信 + SMTP 发信） |

## 2. 服务器

- 官方最低 4 核 / 4GB。建议单独一台 Droplet，放在中国大陆以外（WhatsApp Cloud API 在大陆不可达）。
- 官方 Docker Compose：

```bash
wget -O .env https://raw.githubusercontent.com/chatwoot/chatwoot/develop/.env.example
wget -O docker-compose.yaml https://raw.githubusercontent.com/chatwoot/chatwoot/develop/docker-compose.production.yaml
# 编辑 .env：SECRET_KEY_BASE（随机长串）、FRONTEND_URL=https://chat.<你的域名>、POSTGRES_PASSWORD、REDIS_PASSWORD、SMTP_*（发信）
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
```

- 注意：官方 compose 自带 PostgreSQL（`pgvector/pgvector:pg16`）并绑定 `127.0.0.1:5432`。如果和现有的 PostgreSQL 16 放在同一台机器上会端口冲突：改掉这个端口映射，或让 Chatwoot 用现有库（需要装 pgvector 扩展）。
- Nginx 反向代理 `chat.<域名>` → `127.0.0.1:3000`，需要 `underscores_in_headers on;` 和 WebSocket 头（`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`），证书用 Let's Encrypt。Chatwoot 已对 `/public/api/*` 开放跨域，站点可以直接调用。
- 备份：`postgres_data` 和 `storage_data` 两个卷（聊天记录和附件）。

## 3. 每个站的 API 收件箱

自动方式（推荐）：在 Chatwoot 个人设置里取一个访问令牌，建站时设置环境变量 `CHATWOOT_URL`、`CHATWOOT_ACCOUNT_ID`、`CHATWOOT_API_TOKEN` 后运行 `pnpm setup:chat -- --channels <该站渠道.json>`，它找到或新建名为"<站名> website chat"的 API 收件箱，并把 `inboxIdentifier` 写进该站配置。

手动方式：设置 → 收件箱 → 新建 → API，名称写"<站名> website chat"，Webhook 留空；在收件箱设置里复制 inbox identifier，写入该站：

```json
{ "chat": { "chatwoot": { "baseUrl": "https://chat.<域名>", "inboxIdentifier": "<identifier>" }, "whatsapp": [...], "email": "..." } }
```

访客的第一条消息会新建联系人和对话，对话的自定义属性里有 `page_url`、`page_title`、`referrer` 和 `utm_*`（想在后台列表里显示，可在 设置 → 自定义属性 按同名建对话属性）。访客留的邮箱写到联系人上。

## 4. WhatsApp 号码

每个号码需要：Meta 企业账号、WhatsApp Business 账号（WABA）ID、电话号码 ID、永久访问令牌（系统用户）。在 Chatwoot 新建 WhatsApp 收件箱，填以上信息，再把 Chatwoot 给的 Webhook URL 和验证令牌填进 Meta 应用的 WhatsApp 配置。

- 多个号码在同一个 Meta 应用下时，Meta 应用里只需填其中一个收件箱的 Webhook URL，其他收件箱也能收到。
- 放进 Cloud API 的号码一般不能再同时用手机上的 WhatsApp。Chatwoot 对「共存」（同时用 WhatsApp Business App）的支持仍在审核中，已在手机上使用的号码迁移前先确认。
- 费用：客户主动发起、24 小时内的回复不收费；主动发模板消息（营销、通知）按 Meta 的价格收费。
- 站点上的 WhatsApp 按钮只是 `wa.me` 链接加预填文字，号码接不接 Chatwoot 都能用；接入后对话进 Chatwoot 统一处理。

## 5. 线索回传到自己的后端

设置 → 集成 → Webhooks，加一个地址（例如 `https://<域名>/api/chat-webhook`，由自有归因/线索 API 实现），订阅 `contact_created`、`conversation_created`（需要时加 `message_created`）。回传内容里有联系人（姓名、邮箱、电话）、收件箱（区分站点和号码）以及上面写入的 `page_url`、`referrer`、`utm_*`，与询盘表单 `POST /api/leads` 归到同一张线索表；需要时再同步到 Listmonk（营销订阅必须单独勾选同意）。接口要校验来源（固定密钥或只接受 Chatwoot 服务器 IP）。

## 6. 自动回复（可选）

Chatwoot 的 Agent Bot 通过 Webhook 把消息交给自己的机器人服务，可接自己的大模型做首轮应答和收集需求，再转人工。Chatwoot 自带的 AI（Captain）自托管免费版不可用。

## 7. 隐私

- 站点不加载任何 Chatwoot 脚本；访客发出第一条消息之前，不向聊天服务器发任何请求。会话标识只存在访客自己的浏览器里。
- 隐私政策里写明：聊天记录存放在自有服务器；WhatsApp 对话经过 Meta；邮件经过邮件服务商。
- 11 阶段：站点有 `chat` 时同样要求隐私页存在。
- 窗口在访客发第一条消息后请他留邮箱，邮箱写到 Chatwoot 联系人上，只用于回复这次咨询；营销订阅另行征得同意。

参考：Chatwoot 官方 Docker 部署文档 https://developers.chatwoot.com/self-hosted/deployment/docker ；WhatsApp 收件箱 https://www.chatwoot.com/hc/user-guide/articles/1756799850-how-to-setup-a-whats_app-channel-manual-flow ；Client API（contacts、conversations、messages）https://developers.chatwoot.com/api-reference/introduction
