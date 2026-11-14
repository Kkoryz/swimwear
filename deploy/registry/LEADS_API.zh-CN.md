# 线索接口约定（归因 API 实现）

所有站点的线索进同一张表 `leads`（`deploy/registry/schema.sql`），用 `site_id` 区分站点、`source` 区分来源。网站模板只负责把数据带齐，写库、校验、通知由自有归因 API 实现（Nginx 把各站的 `/api/` 反向代理到它，端口 3001）。

## 1. 询盘表单：`POST /api/leads`

模板的表单（`config/lead-form.json`，`status` 为 `connected` 时启用）以普通表单提交（`application/x-www-form-urlencoded`）到同源的 `/api/leads`，字段：

| 字段 | 来源 | 说明 |
|---|---|---|
| `name` `email` `company` `phone` `message` | 访客填写 | `name`、`email`、`message` 必填 |
| `consent` | 访客勾选 | 值为 `yes`，没有就拒收 |
| `website` | 防机器人隐藏字段 | 有值就当垃圾丢弃（仍返回成功，不提示机器人） |
| `site_id` | 模板写入 | 登记表 `sites.id`，由 `pnpm site:config` 生成 |
| `page_url` | 模板写入 | 提交所在页面的绝对地址 |
| `referrer` | 浏览器 | 访客从哪个网站来 |
| `utm_source` `utm_medium` `utm_campaign` `utm_term` `utm_content` | 页面地址参数 | 没有就是空 |

接口要做的：
1. 校验：`site_id` 必须在 `sites` 里且状态不是 `retired`；请求的 Host 必须等于该站的 `domain`（防止别的站冒用）；邮箱格式；`message` 长度上限（例如 5000 字）；同一 IP 每分钟限流。
2. 写入 `leads`：`source = 'form'`，`utm` 存成 JSON，`status = 'new'`。
3. 通知：企业微信推送"新询盘：站点、姓名、邮箱、页面"。
4. 返回：`303 See Other` 跳回 `page_url`，并带 `?sent=1`（页面可据此显示"已收到"）；出错时跳回并带 `?error=1`，不要返回 JSON 给浏览器。

## 2. 聊天：`POST /api/chat-webhook`

在 Chatwoot 设置 → 集成 → Webhooks 里加这个地址（带一个固定密钥参数，例如 `?key=...`，接口核对），订阅 `conversation_created` 和 `contact_updated`：

- **站点**：网站聊天窗口建对话时，对话自定义属性里带 `site_id`（`source = 'chat'`）。WhatsApp 收件箱的对话没有这个属性：收件箱名称写成"<site_id> WhatsApp"，按名称对应（`source = 'whatsapp'`）。
- **页面和来源**：对话的自定义属性里有 `page_url`、`page_title`、`referrer`、`utm_*`（聊天窗口创建对话时写入）。
- **写入**：`conversation_created` 新建一条线索，`external_id` 为 Chatwoot 对话 id；`contact_updated`（访客留了邮箱）更新同一条线索的 `email`、`name`。`(source, external_id)` 唯一，重复推送不会重复入库。

## 3. 状态与成交

在 Directus 里给 `leads` 建视图，按站点、状态筛选。状态流转：`new` → `contacted` → `quoted` → `won` / `lost`（`spam` 单独标记）。成交时人工填 `deal_value` 和 `deal_currency`，这是目前没有订单系统时的成交来源；Metabase 的成交看板只读 `status = 'won'` 的记录。

## 4. 统计事件

模板已给这些操作加了 Umami 事件：`form-submit`（点提交）、`chat-quick-reply`（点快捷问题）、`chat-whatsapp`、`chat-email`。事件只用于看转化漏斗，线索以 `leads` 表为准。
