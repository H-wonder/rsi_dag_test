# 循环语义测试记录

> 2026-11-25。直接 POST 结构到后端（`:39910`），不经过 bridge。
> 测试结构放在 `structures/smoke/` 或临时 JSON；这里是结果汇总。

## 1. 终止与状态

| 用例 | 结构 | 结果 |
|---|---|---|
| 正常 forEach | 5 项，`maxIterations=10` | `DONE`，5 轮，5 成功 |
| `breakWhen n == 3` | 5 项 | `BROKEN`，2 轮后停 |
| `continueWhen n == 2` | 5 项 | `DONE`，5 轮，4 成功，1 跳过 |
| 达到 `maxIterations=2` | 5 项 | 循环 `EXHAUSTED` |
| 同上 + `allowPartial: true` | 5 项 | 整体 `OK`，循环 `EXHAUSTED`，`partial=true` |
| 同上，不加 `allowPartial` | 5 项 | 整体 `ERROR`：`循环 loop1 异常结束: EXHAUSTED` |
| `budget.maxFailures=2` | 每轮断言失败 | 循环 `FAILED`，整体 `ERROR` |
| `budget.wallClockMs=1` | 200 项 | 循环 `TIMEOUT`，10 轮后停；加 `allowPartial` 整体 `OK` |
| 两层嵌套 | 5×5 | 外层 `DONE`，5 轮 |
| 三层嵌套 | — | 加载时拒绝：`循环嵌套超过 2 层` |

## 2. while / retry

| 用例 | 结构 | 结果 |
|---|---|---|
| `while` | `condition: "i < 3"` | `DONE`，3 轮 |
| `retry` | 3 项，第 2/3 项断言失败，`maxAttempts=2` | `DONE`，1 成功，2 失败（每项重试 2 次） |

## 3. 长序列

| 用例 | 结果 |
|---|---|
| 120 项 forEach | 120 轮，120 条 `perIteration`，`checkpoints` 保留 20 条（i=20..115） |
| 41 行真实数据（space） | 扫描 41 行，3 间命中，`state.total=46.55` |

## 4. checkpoint

- `every=1, keep=20`：每轮记录，超过 20 条丢最早的；
- `every=5, keep=20`：生成 24 条，保留最后 20 条（i=20..115）；
- `checkpoint.file` 落盘：120 轮、every=5 → 内存 20 条，磁盘 24 条（含被环形缓冲淘汰的）。

## 5. skill flow

| 用例 | 结果 |
|---|---|
| `fetch` 节点声明 `skillFlow=@.../FLOW_SKILL_FETCH` | 引擎执行 `FLOW_CODE_FETCH`，Monday 任务 4/4、1.0 |
| 结构 | `structures/skill.monday_onboarding_pipeline.json` |

## 6. 仍未覆盖

- `resume`：按设计不做；
- 嵌套循环：只有 smoke test，没有真实二维任务；
- `retry` 只测了断言失败，没有真实网络/限流错误；
- 预算的单位只有毫秒和失败次数，没有 LLM/工具调用预算。
