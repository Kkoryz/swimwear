# 上线清单：Strandmill

状态：不能上线，还有 24 项拦截（检查时间 2026-11-14T13:11:26.614Z）

## 站长（你来提供或确认）（21）

- [ ] 把借用并匿名化的客户评价换成真实评价，或确认带着它们上线（pnpm signoff --confirm placeholder-testimonials）（涉及 10 个页面：/、/women-s-swimwear-manufacturer/、/bikini-manufacturer/ 等）
  - pages show borrowed, anonymised testimonials (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm placeholder-testimonials
- [ ] 把从其他厂商借来并匿名化的客户案例（A recent order）换成自己的真实订单，或确认带着它们上线（pnpm signoff --confirm placeholder-cases）（涉及 3 个页面：/swimwear-embroidery/、/swimwear-fabrics-sourcing/、/case-studies/）
  - pages show client cases borrowed from other makers and anonymised (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm placeholder-cases
- [ ] 把从竞品借来的卡片内容（定制、面料、产品范围等）换成自己的，或确认带着它们上线（pnpm signoff --confirm placeholder-cards）（涉及 19 个页面：/、/women-s-swimwear-manufacturer/、/one-piece-swimsuit-manufacturer/ 等）
  - pages show card copy borrowed from competitors (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm placeholder-cards
- [ ] 把从竞品借来的卖点（为什么选我们）换成自己的，或确认带着它们上线（pnpm signoff --confirm placeholder-selling-points）（涉及 9 个页面：/women-s-swimwear-manufacturer/、/men-s-swimwear-manufacturer/、/children-s-swimwear-manufacturer/ 等）
  - pages show selling points borrowed from competitors (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm placeholder-selling-points
- [ ] 把从竞品借来的下单步骤换成自己的做法，或确认带着它们上线（pnpm signoff --confirm placeholder-steps）（涉及 4 个页面：/bikini-manufacturer/、/men-s-swimwear-manufacturer/、/custom-swimwear-printing/ 等）
  - pages show order steps borrowed from competitors (placeholder): replace them with real ones, or confirm with pnpm signoff --confirm placeholder-steps
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - proof-clients: Replace the stated client names: Northfold Basics; Lune & Lark; Softmere; Kiri Studio; Harbour Knit Co.; Velda with real, permitted values (src/data/site-proof.json)
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - proof-testimonials: Replace the stated testimonials: Founder, Northfold Basics; Head of product, Lune & Lark; Buyer, Softmere with real, permitted values (src/data/site-proof.json)
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - sf-OT-supply-32c093c2: Site Factory: 提供并确认真实联系资料 | contact.email: sales@strandmill.com
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - sf-OT-supply-d05d7c7c: Site Factory: 提供并确认真实联系资料 | contact.phone: 
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - sf-OT-supply-31249e96: Site Factory: 提供并确认真实联系资料 | contact.address: Guangzhou, Guangdong, China
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - sf-OT-supply-be83e346: Site Factory: 提供并确认真实联系资料 | contact.hours: Monday to Saturday, 9:00-18:00 China Standard Time
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - sf-OT-confirm-1987a402: Site Factory: 逐条确认、替换或删除硬信息总表里的事实（价格、资质、规模、时限、合同条款） (see the handoff's owner/evidence/hard_info.md)
- [ ] 把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）
  - trust-homed:SG11: Confirm or replace the trust bar's figures from the unconfirmed fact homed:SG11: 100,000 pieces; 65 that; 55 custom
- [ ] 审批生成的图片（pnpm approve:images）（涉及 76 个页面：general-hero-1 (pending)、general-lifestyle-1 (pending)、general-lifestyle-2 (pending) 等）
  - AI images in use without review approval (pnpm approve:images)
- [ ] 提供询盘表单的接收地址（涉及 1 个页面：/contact-us/）
  - the enquiry form is not connected (config/lead-form.json status)
- [ ] 决定是否开启在线客服
  - src/data/site-runtime.json has no chat (its channels, or false for no chat)
- [ ] 在站点注册表登记这个站（域名、部署位置）
  - src/data/site-runtime.json has no registry entry (run pnpm site:config)
- [ ] 配置访问统计（Umami）
  - src/data/site-runtime.json has no analytics (Umami scriptSrc and websiteId)
- [ ] 提供真实的邮箱、电话、地址、营业时间和社交账号
  - src/data/site-contact.json holds stand-in contact details (project.yaml contact): the owner supplies the real email, phone, address, hours and profiles
- [ ] 页面上还有示例形态的联系方式（555-01xx 号码、example 域名、to be confirmed）：换成真实信息（涉及 37 个页面：/、/women-s-swimwear-manufacturer/、/one-piece-swimsuit-manufacturer/ 等）
  - pages show contact details of a stand-in form (555-01xx numbers, example domains, "to be confirmed")
- [ ] 确定正式的站点名称和品牌
  - brand kit source is make-wordmark, not stage 00

## Site Factory（内容和规划）（2）

- [ ] Site Factory 自己的拦截项（涉及 1 个页面：c-f7c91fefc9c3:service）
  - Site Factory held c-f7c91fefc9c3:service
- [ ] Site Factory 自己的拦截项（涉及 1 个页面：c-f7c91fefc9c3:service）
  - Site Factory held c-f7c91fefc9c3:service

## 模板流程（我来处理）（1）

- [ ] image_wrong_subject（涉及 5 个页面：/men-s-swimwear-manufacturer/ general-process-3-960.webp、/boardshorts-manufacturer/ general-hero-1-960.webp、/modest-swimwear-manufacturer/ general-process-3-960.webp 等）
  - photos that do not show their page's subject (docs/research/image-fit.json)

