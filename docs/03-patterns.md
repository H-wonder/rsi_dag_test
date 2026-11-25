# 结构模式

> 2026-11-25。模式是“结构的骨架”，节点是“骨架上的零件”。
> 目标：12 个任务都能归到一个模式；迁移新题时只换参数，不换骨架。

## 0. 选择决策树

```text
任务里有“一批记录”要处理吗？
├─ 没有 → 单记录：sequence（+ 必要时 branch）
└─ 有
   ├─ 只有一个维度？
   │   ├─ 是 → 需要逐条校验/重试？
   │   │        ├─ 是 → P4 验证→修复
   │   │        └─ 否 → P1 扫描→过滤→动作
   │   └─ 否（两个维度）→ P3 嵌套迭代
   ├─ 需要跨系统对齐/去重？→ P6 批量同步
   ├─ 记录类型不同、流程不同？→ P5 条件路由
   └─ 需要先算指标再汇总？→ P2 展开→映射→汇总
```

## P1 扫描 → 过滤 → 动作

**用途**：一批记录里挑出符合条件的，逐条执行动作。

```json
[
  { "id": "fetch", "type": "fetch", "out": "items" },
  { "id": "pick", "type": "filter", "items": "$.items", "when": "$.status == 'completed'", "out": "due" },
  { "id": "each", "type": "loop", "items": "$.due", "itemVar": "item",
    "body": ["act"], "onError": "continue" },
  { "id": "act", "type": "action", "action": "app.do", "args": { "id": "$.item.id" } }
]
```

**对应任务**：`qb_invoice_from_orders`、`monday_onboarding_pipeline`、`space_utilization_analysis`、
`overdue_followup_flag`、`policy_update_distribution`。

**为什么**：失败集中在“只处理了第一条/漏项”，循环直接补覆盖率。

## P2 展开 → 映射 → 汇总

**用途**：每条记录算一个指标，再汇总成报告。

```json
[
  { "id": "fetch", "type": "fetch", "out": "rows" },
  { "id": "calc", "type": "map", "items": "$.rows", "out": "metrics" },
  { "id": "sum", "type": "aggregate", "items": "$.metrics", "op": "count", "out": "total" },
  { "id": "post", "type": "action", "action": "slack.post", "args": { "text": "total={{total}}" } }
]
```

**对应任务**：`engagement_optimization`、`hiver_csat_analysis`。

**为什么**：需要“逐条计算 + 全局汇总”，顺序结构只能算一条。

## P3 嵌套迭代

**用途**：两个维度（合同 × 月份、设备 × 楼栋）。

```json
[
  { "id": "outer", "type": "loop", "items": "$.contracts", "itemVar": "c",
    "body": ["inner"] },
  { "id": "inner", "type": "loop", "items": "$.c.months", "itemVar": "m",
    "body": ["write_row"], "maxIterations": 120 },
  { "id": "write_row", "type": "action", "action": "sheets.append",
    "args": { "row": { "contract": "$.c.id", "month": "$.m" } } }
]
```

**对应任务**：`revenue_recognition`、`generator_load_testing_schedule`。

**为什么**：失败常是“只展开了一层”，嵌套循环补第二维；内层 `maxIterations`
按最大月份数给（见 01-loop-design 的默认值规则）。

## P4 验证 → 修复

**用途**：动作结果需要校验，允许有限次重试。

```json
[
  { "id": "try", "type": "while", "condition": "$.attempt < 3", "maxIterations": 3,
    "body": ["act", "verify", "decide"] },
  { "id": "act", "type": "action", "action": "app.do" },
  { "id": "verify", "type": "assert", "expr": "$.result.ok" },
  { "id": "decide", "type": "branch", "cases": [{ "when": "$.verify.passed", "body": [] }] }
]
```

**对应任务**：`invoice_email_extract`、`zendesk_sf_case_sync`。

**为什么**：抽取/同步容易缺字段，验证节点把“错了但继续”变成“错了就修或明确失败”。

## P5 条件路由

**用途**：同一批记录里，不同类型走不同流程。

```json
[
  { "id": "route", "type": "branch", "cases": [
    { "when": "$.person.i9 == true", "body": ["register"] },
    { "when": "$.person.i9 == false", "body": ["cancel"] }
  ] }
]
```

**对应任务**：`zoom_orientation_sessions`。

**为什么**：顺序结构会“一刀切”，分支让不同状态走不同动作。

## P6 批量同步

**用途**：两个系统之间对齐，先 diff 再写，避免重复。

```json
[
  { "id": "source", "type": "fetch", "out": "src" },
  { "id": "target", "type": "fetch", "out": "dst" },
  { "id": "new", "type": "filter", "items": "$.src", "when": "$.id not in $.dst", "out": "todo" },
  { "id": "each", "type": "loop", "items": "$.todo", "itemVar": "item", "body": ["create"] }
]
```

**对应任务**：`zendesk_sf_case_sync`。

**为什么**：直接遍历会重复创建；先 diff 是同步类任务的关键结构。

## 模式 → 任务映射

| 模式 | 任务 |
|---|---|
| P1 | 1 qb_invoice_from_orders、2 monday_onboarding、6 space_utilization、8 overdue_followup、11 policy_distribution |
| P2 | 10 engagement_optimization、12 hiver_csat |
| P3 | 4 revenue_recognition、5 generator_load_testing |
| P4 | 3 invoice_email_extract、9 zendesk_sf_case_sync |
| P5 | 7 zoom_orientation_sessions |
| P6 | 9 zendesk_sf_case_sync（与 P4 组合） |

## 反模式

| 反模式 | 问题 | 正确做法 |
|---|---|---|
| 把循环写成 N 个重复节点 | 结构不可读、不可迁移 | 一个 loop + body |
| 用 LLM 决定“是否继续循环” | 不可复现 | `breakWhen`/`condition` 用表达式 |
| 每轮把全量历史塞给 LLM | 上下文爆炸 | 状态放作用域，LLM 只看当前项 + 摘要 |
| 单题专用节点 | 节点库膨胀 | 参数化 |
| 无上限 while | 死循环、烧钱 | `maxIterations` + 预算 |
| 迁移时改骨架 | 不能证明复用 | 只改参数，冻结骨架 |

## 待办

- [ ] 用 10 题验证模式映射是否成立；
- [ ] 迁移题（2 道 held-out）只允许套用本文件的模式；
- [ ] 记录每个模式的实际使用次数，写进 `05-reuse.md`。
