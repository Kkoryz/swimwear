# Site Factory 07 结构化数据（`sf/structured/v1`）

请 Site Factory 07 在每页的 `sections` 之外，额外输出一个可选的 `structured` 对象，让模板能渲染段落文字填不了的竞品 pattern：关键数字行、流程时间线、对比表。模板导入器（`scripts/import-site-factory.mjs`）已经支持读取。

## 格式（`authoring_package.json` 每页）

```jsonc
"structured": {
  "key_figures_title": "可选标题",
  "key_figures": [                                  // 2–6 项
    { "value": "50 pieces per style per colour", "label": "minimum order quantity", "fact_id": "moq" }
  ],
  "process_title": "可选标题",
  "process_steps": [                                // 2–12 步，按顺序
    { "title": "可选的步骤名", "text": "一到两句说明。", "fact_ids": ["sample-time"] }
  ],
  "comparison": {                                   // 可选
    "title": "可选标题",
    "columns": ["Topic", "Custom designs", "Ready-to-order"],   // 2–6 列
    "rows": [["Minimum order", "…", "…"]],                      // 1–20 行，每行每列一个单元格
    "fact_ids": ["moq"]
  }
}
```

## 导入器强制检查

- `key_figures[].value` 是声明：必须**逐字**出现在它引用的事实原文中（忽略大小写和空白），且该事实 `approved_public: true`，否则导入失败。
- 所有 `fact_id` / `fact_ids` 必须存在于 `facts.yaml`。
- `label`、`title`、`text`、列名和单元格是 07 撰写的文案，和正文一样逐字渲染，并遵守同样的声明规则（不支持的声明应让页面进入 hold）。
- 导入器不会从正文推导这些字段，也不会删改它们。

## 放置位置

- 关键数字 → intro 之后的 `stats` 统计行
- 对比表 → 条款（proof）区块之前，没有则放在 FAQ 之前的 `table`
- 流程步骤 → 第一个正文区块（图文、卡片或图集）之后的 `process` 时间线，没有则放在 FAQ 之前

## 07 输出之前

`--structured <文件>` 可以按 `page_id` 从覆盖文件提供同样的对象（`{ "schema_version": "sf/structured/v1", "origin": "…", "pages": { "<page_id>": { … } } }`）；只要有结构化数据，就必须同时给 `--facts <facts.yaml>`。导入报告会逐页记录 `structured: "package"` 或覆盖文件的 `origin`，原型数据不会被误当成 07 产物。
