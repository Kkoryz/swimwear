# 版式计划（2026-11-14）

节标题行数模型：none (no layout audit yet: section heading lines not predicted)。额外照片墙上限：每页 12 条。

## 可行性

| 页面 | 页型 | 词数（参考） | 图片面积区间 | 不加墙的估算 | 结论 |
|---|---|---|---|---|---|
| / | home | 2086 | 33–59% | 18651px，图片 27.5% | 放得下，要加墙 3 条 |
| /women-s-swimwear-manufacturer/ | product_manufacturer | 1851 | 23–88% | 12868px，图片 32.9% | 放得下 |
| /one-piece-swimsuit-manufacturer/ | product_manufacturer | 1643 | 23–88% | 12972px，图片 37.3% | 放得下 |
| /bikini-manufacturer/ | product_manufacturer | 1348 | 23–88% | 9812px，图片 40.4% | 放得下 |
| /men-s-swimwear-manufacturer/ | product_manufacturer | 1659 | 23–88% | 12871px，图片 35.4% | 放得下 |
| /boardshorts-manufacturer/ | product_manufacturer | 1735 | 23–88% | 13502px，图片 28.6% | 放得下 |
| /swim-trunks-manufacturer/ | product_manufacturer | 1840 | 23–88% | 13371px，图片 31.5% | 放得下 |
| /children-s-swimwear-manufacturer/ | product_manufacturer | 1921 | 23–88% | 15049px，图片 25.6% | 放得下 |
| /teen-swimwear-manufacturer/ | product_manufacturer | 1617 | 23–88% | 13094px，图片 28.6% | 放得下 |
| /baby-swimwear-manufacturer/ | product_manufacturer | 1578 | 23–88% | 11768px，图片 33.6% | 放得下 |
| /toddler-swimwear-manufacturer/ | product_manufacturer | 1155 | 23–88% | 9751px，图片 46% | 放得下 |
| /modest-swimwear-manufacturer/ | product_manufacturer | 2215 | 23–88% | 16010px，图片 26.4% | 放得下 |
| /burkini-manufacturer/ | product_manufacturer | 1388 | 23–88% | 10684px，图片 27.3% | 放得下 |
| /watersports-apparel-manufacturer/ | product_manufacturer | 607 | 23–88% | 6949px，图片 40% | 放得下 |
| /rash-guard-manufacturer/ | product_manufacturer | 2031 | 23–88% | 15229px，图片 33.1% | 放得下 |
| /resort-wear-manufacturer/ | product_manufacturer | 2019 | 23–88% | 14842px，图片 27.4% | 放得下 |
| /cover-up-manufacturer/ | product_manufacturer | 1952 | 23–88% | 13227px，图片 39.7% | 放得下 |
| /swimwear-embroidery/ | solution | 2166 | 23–88% | 16933px，图片 25.4% | 放得下 |
| /swimwear-consulting/ | solution | 2562 | 23–88% | 18246px，图片 25.7% | 放得下 |
| /development/ | solution | 2158 | 23–88% | 16555px，图片 28.2% | 放得下 |
| /swimwear-packaging-custom-brand-labels/ | solution | 2428 | 23–88% | 16711px，图片 32.4% | 放得下 |
| /custom-swimwear-printing/ | solution | 1613 | 23–88% | 13170px，图片 28.2% | 放得下 |
| /swimwear-hardware/ | solution | 2195 | 23–88% | 15346px，图片 27.1% | 放得下 |
| /swimwear-fabrics-sourcing/ | solution | 1776 | 23–88% | 15360px，图片 31.2% | 放得下 |
| /swimwear-launch-services/ | solution | 2042 | 23–88% | 15250px，图片 26.5% | 放得下 |
| /about-us/ | about | 1138 | —–88% | 9359px，图片 32.3% | 放得下 |
| /faq/ | general | 2015 | 23–88% | 17542px，图片 19.3% | 放得下，要加墙 2 条 |
| /case-studies/ | general | 455 | 23–88% | 4660px，图片 35.3% | 放得下 |
| /sustainability/ | general | 749 | 23–88% | 6809px，图片 27.1% | 放得下 |
| /request-a-quote/ | general | 801 | 23–88% | 6862px，图片 39.3% | 放得下 |
| /swimwear-accessories/ | product_manufacturer | 2109 | 23–88% | 15993px，图片 28.7% | 放得下 |
| /plus-size-swimwear-manufacturer/ | product_manufacturer | 1403 | 23–88% | 11815px，图片 37.3% | 放得下 |
| /couples-matching-swimsuit-manufacturer/ | product_manufacturer | 1264 | 23–88% | 11604px，图片 30% | 放得下 |

## 计划闸门：不通过（拦住，不出图）（0 条）

- 无

## 报告项（不拦，进 SF 回报）（0 条）

- 无

## 照片位清单

共 123 个（lifestyle 74，product 12，process 33，material 4），明细在 layout-plan.json 的 photoSlots。

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
