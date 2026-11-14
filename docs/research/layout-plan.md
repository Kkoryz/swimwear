# 版式计划（2026-11-14）

节标题行数模型：the site's layout audit (882 headings)。额外照片墙上限：每页 12 条。

## 可行性

| 页面 | 页型 | 词数（参考） | 图片面积区间 | 不加墙的估算 | 结论 |
|---|---|---|---|---|---|
| / | home | 2086 | 33–59% | 13955px，图片 42.6% | 放得下 |
| /women-s-swimwear-manufacturer/ | product_manufacturer | 1851 | 23–88% | 8922px，图片 33.8% | 放得下 |
| /one-piece-swimsuit-manufacturer/ | product_manufacturer | 1643 | 23–88% | 8747px，图片 37.7% | 放得下 |
| /bikini-manufacturer/ | product_manufacturer | 1348 | 23–88% | 6587px，图片 37.8% | 放得下 |
| /men-s-swimwear-manufacturer/ | product_manufacturer | 1659 | 23–88% | 9211px，图片 33.4% | 放得下 |
| /boardshorts-manufacturer/ | product_manufacturer | 1735 | 23–88% | 9321px，图片 28.5% | 放得下 |
| /swim-trunks-manufacturer/ | product_manufacturer | 1840 | 23–88% | 8774px，图片 35% | 放得下 |
| /children-s-swimwear-manufacturer/ | product_manufacturer | 1921 | 23–88% | 10209px，图片 25.4% | 放得下 |
| /teen-swimwear-manufacturer/ | product_manufacturer | 1617 | 23–88% | 9580px，图片 26.8% | 放得下 |
| /baby-swimwear-manufacturer/ | product_manufacturer | 1578 | 23–88% | 7935px，图片 33.5% | 放得下 |
| /toddler-swimwear-manufacturer/ | product_manufacturer | 1155 | 23–88% | 6798px，图片 44.7% | 放得下 |
| /modest-swimwear-manufacturer/ | product_manufacturer | 2215 | 23–88% | 10905px，图片 27.7% | 放得下 |
| /burkini-manufacturer/ | product_manufacturer | 1388 | 23–88% | 7310px，图片 24.6% | 放得下 |
| /watersports-apparel-manufacturer/ | product_manufacturer | 607 | 23–88% | 5452px，图片 34% | 放得下 |
| /rash-guard-manufacturer/ | product_manufacturer | 2031 | 23–88% | 10749px，图片 31.8% | 放得下 |
| /resort-wear-manufacturer/ | product_manufacturer | 2019 | 23–88% | 10438px，图片 28.8% | 放得下 |
| /cover-up-manufacturer/ | product_manufacturer | 1952 | 23–88% | 9300px，图片 41.6% | 放得下 |
| /swimwear-embroidery/ | solution | 2166 | 23–88% | 13280px，图片 35% | 放得下 |
| /swimwear-consulting/ | solution | 2562 | 23–88% | 13218px，图片 29.3% | 放得下 |
| /development/ | solution | 2158 | 23–88% | 13356px，图片 34.3% | 放得下 |
| /swimwear-packaging-custom-brand-labels/ | solution | 2428 | 23–88% | 13236px，图片 39.8% | 放得下 |
| /custom-swimwear-printing/ | solution | 1613 | 23–88% | 10495px，图片 35.1% | 放得下 |
| /swimwear-hardware/ | solution | 2195 | 23–88% | 11522px，图片 35.1% | 放得下 |
| /swimwear-fabrics-sourcing/ | solution | 1776 | 23–88% | 12577px，图片 38.1% | 放得下 |
| /swimwear-launch-services/ | solution | 2042 | 23–88% | 10696px，图片 33.4% | 放得下 |
| /about-us/ | about | 1138 | —–88% | 7249px，图片 35.2% | 放得下 |
| /faq/ | general | 2015 | 23–88% | 14051px，图片 22.9% | 放得下，要加墙 1 条 |
| /case-studies/ | general | 455 | 23–88% | 4767px，图片 36.7% | 放得下 |
| /sustainability/ | general | 749 | 23–88% | 4480px，图片 37% | 放得下 |
| /request-a-quote/ | general | 801 | 23–88% | 5164px，图片 41.1% | 放得下 |
| /swimwear-accessories/ | product_manufacturer | 2109 | 23–88% | 11005px，图片 29% | 放得下 |
| /plus-size-swimwear-manufacturer/ | product_manufacturer | 1403 | 23–88% | 8235px，图片 37.1% | 放得下 |
| /couples-matching-swimsuit-manufacturer/ | product_manufacturer | 1264 | 23–88% | 8631px，图片 28.5% | 放得下 |

## 计划闸门：不通过（拦住，不出图）（0 条）

- 无

## 报告项（不拦，进 SF 回报）（2 条）

### 节标题预计超过 3 行（section_heading_lines，归SF 文案，2 条）

- /women-s-swimwear-manufacturer/ m5 mobile："Custom Swimwear Embellishment: Rhinestones, Beads and Trims": 4 lines
- /cover-up-manufacturer/ iconList-1 mobile："Wholesale Cover-Up Orders: Samples, Lead Times, Payment and Shipping": 4 lines


## 照片位清单

共 111 个（lifestyle 62，product 12，process 33，material 4），明细在 layout-plan.json 的 photoSlots。

## 只在一个站上量过（或没有记录）的阈值（12 个，换站时复核）

| 阈值 | 值 | 管什么 | 量过的站 |
|---|---|---|---|
| CAPS_SPREAD（scripts/lib/heading-fit.mjs） | `1.12` | how much wider than its average a title set in capitals wraps | site11 (motel; competitor Concord) |
| HERO_LEAD_SLACK（scripts/lib/heading-fit.mjs） | `8` | words a hero lead may run over the competitor's before it opens the page under the hero | site11 (motel; competitor Concord) |
| HOLD_SHARE（scripts/lib/template-gaps.mjs） | `0.15` | share of the competitor page a layout the template lacks takes before the run holds for a decision | site11 (motel; competitor Concord) |
| HUB_REPEAT_SECTIONS（scripts/lib/content-lint.mjs） | `3` | sections of a hub repeating its child pages before it goes back to Site Factory | site11 (motel; competitor Concord) |
| DENSITY_TOLERANCE（scripts/lib/density.mjs） | `{"wordsPer1000pxMax":1.15,"visualAreaPctMin":0.75,"visualAreaPctMax":1.35,"longestTextOnlyPxMax":1.2}` | slack around the competitor's density range | 没有记录 |
| BUDGET_MARGIN（scripts/lib/visual-budget.mjs） | `{"run":0.9,"visualPct":3}` | how far inside the band the visual budget aims | 没有记录 |
| MAX_PHOTO_STEPS（scripts/lib/rules.mjs） | `3` | steps a process shows as cards over a photo before it is a list | site12 (hotel-rm; competitor HHM) |
| PHOTO_STEPS_MAX_PHONE_PX（scripts/lib/plan-assertions.mjs） | `1000` | how tall a photo-steps block may run on a phone | site12 (hotel-rm; competitor HHM) |
| LONG_CARD_WORDS（scripts/lib/plan-assertions.mjs） | `40` | words that make a card long | 没有记录 |
| MAX_CARDS_LONG（scripts/lib/plan-assertions.mjs） | `3` | long cards a row may hold | 没有记录 |
| NEAR_DUPLICATE（scripts/lib/content-fingerprint.mjs） | `0.5` | similarity at which two sites' pages read as the same page | 没有记录 |
| MAX_BATCH（scripts/generate-images.mjs） | `12` | photos already made a run makes again before it waits for a person | 没有记录 |
