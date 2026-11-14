# 08 给 Site Factory 的回报（2026-11-14）

交接包：D:/korey_seo/site13-strandmill/inputs/freeze/s07-361a8152f4；模板 0fe551e1dcb1460eea9a8109964a029b1a0aa1b4；页面 37 个，已构建 37 个。

## 要 SF 改的问题

- / hero：design_finding（design-review）：At 1440 px the hero photo still has another banner's text baked into it ("Swim for Sunlit Days", "and summer-ready prints", and the outlines of "Shop Swimwear" and "Explore the Collection" buttons), and our H1, lead and Request a quote button sit on top of it, so two sets of text overlap (the phone crop hides it).
- / trustBar：design_finding（design-review）：Two trust figures still read as broken fragments ("65 that / SAMPLING TEAM", "55 custom / DAILY SAMPLES"), and "100,000 pieces" carries its unit inside the value, so on phones it wraps to two lines while the other figures take one and the 2×2 grid's first row goes uneven.
- / featureGrid-7：design_finding（design-review）：The card sets featureGrid-4 (private label and logo), featureGrid-7 (quotation to sampling), featureGrid-9 (MOQ and fees) and featureGrid-1 (a lead sentence only) still have no heading. The page jumps from m3's "OEM Swimwear Production" to packaging, ordering and payment terms with nothing to mark the change of topic.
- / overview-steps：design_finding（design-review）：The process sections overview-steps and cta-steps still have no heading. Their intro line ("Quality checks at every stage of an order", "From your enquiry to your sample") is set only at card-heading size, far under the page's other section headings, and on desktop their left column is an almost empty strip with that one small line at the top.
- /blog/ overview-steps：design_finding（design-review）：Still open from the last review: the process section still has no H2. Its left column holds only the lead 'Quality checks at every stage of an order.', now set at card-heading size, between H2 sections above and below, and leaves most of the column empty beside the five steps.
- /swimwear-consulting/ faq-steps：design_finding（design-review）：Still not fixed in the current shots: the navy step band has no heading. After the FAQ it reads as five loose figures and a button under an empty strip of navy padding (same at 390 px, where about 70px of bare navy comes before step 01).
- /custom-swimwear-printing/ hero：design_finding（design-review）：The desktop hero photo still has lettering printed into it ('…Sunlit Days', 'and summer-ready prints', and 'Shop Swimwear' / 'Explore the Collection' pills), which shows behind our live H1, lead and button, and the trust bar cuts off the last pill. The hero reads as two overlapping layers of text with dead buttons under the live one (reported before; unchanged in these shots).
- /women-s-swimwear-manufacturer/ m5：section_heading_lines（layout-plan）：mobile: "Custom Swimwear Embellishment: Rhinestones, Beads and Trims": 4 lines
- /cover-up-manufacturer/ iconList-1：section_heading_lines（layout-plan）：mobile: "Wholesale Cover-Up Orders: Samples, Lead Times, Payment and Shipping": 4 lines

## 业主待办（交接包 owner/todo.json）

- OT-supply-32c093c2：pending
- OT-supply-d05d7c7c：pending
- OT-supply-31249e96：pending
- OT-supply-be83e346：pending
- OT-confirm-a6a809d0：not_held
- OT-confirm-931fdb59：not_held
- OT-confirm-7bfa956e：not_held
- OT-confirm-1987a402：pending

只生成文件，是否转给 SF 由业主决定。
