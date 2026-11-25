# 节点分类与准入规则

> 2026-11-25。配套：[01-loop-design.md](01-loop-design.md)、[03-patterns.md](03-patterns.md)。

## 1. 为什么要分层

如果每个业务规则都做成节点，节点库会膨胀，结构不可读，LLM 也无法生成。分层的目的：
**把“控制”“能力”“业务”分开**，让节点数量保持在一个封闭的小集合里。

## 2. 三层 + 参数

| 层 | 职责 | 复用范围 | 例子 |
|---|---|---|---|
| **L1 控制** | 决定执行顺序与次数 | 所有任务 | `sequence`、`branch`、`loop`、`while`、`fanout`/`join`、`checkpoint`、`assert` |
| **L2 数据/LLM** | 取数、过滤、变换、抽取 | 大多数任务 | `fetch`、`filter`、`map`、`aggregate`、`extract`、`classify`、`dedupe` |
| **L3 动作** | 对某个 app 执行写操作 | 同 app 的任务 | `gmail.send`、`sheets.append`、`calendar.create`、`quickbooks.create_invoice`、`monday.create_item`、`slack.post` |
| **参数** | 业务规则、阈值、字段名、模板 | 单题 | `when: "$.days > 30"`、`status == 'completed'`、`body` 模板 |

## 3. 准入规则

新增节点前必须通过三问：

1. **会被 ≥2 个任务使用吗？**
2. **它是控制原语吗？**（循环/分支/并行/重试/校验）
3. **能用现有节点 + 参数表达吗？**

都不满足 → 不做节点，做成参数。

### 反例与正例

| 需求 | 错误做法 | 正确做法 |
|---|---|---|
| “逾期 30 天” | 新节点 `OverdueNode` | `filter` 的 `when: "$.days > 30"` |
| “只处理 completed 订单” | 新节点 `CompletedOrderNode` | `filter` 参数 |
| “发票号格式校验” | 新节点 `InvoiceNoCheckNode` | `assert` + 正则参数 |
| “QuickBooks 建发票” | 写进解释器 | L3 动作节点 / skill flow |
| “每 10 条暂停” | 新节点 `ThrottleNode` | `loop` 的 `checkpoint.every` + 预算 |
| “邮件线程解析” | 参数做不到 | 可以是 L3/L2（新的交互原语） |

**例外**：如果节点引入的是新的**交互原语**（分页游标、线程解析、文件二进制处理），
即使只有一个任务用，也可以成节点，但必须在文档里说明“为什么参数表达不了”。

## 4. 节点目录（v0）

状态：`计划` / `实现中` / `已完成`。

### L1 控制

| 节点 | 输入 | 输出 | 关键参数 | 状态 |
|---|---|---|---|---|
| `sequence` | 前驱结果 | — | `body: [nodeId]` | 计划 |
| `branch` | 上下文 | 选中的分支 | `cases: [{when, body}]`, `default` | 计划 |
| `loop` | `items` 或 `condition` | `results[]`, `failures[]`, `state` | 见 01-loop-design | 计划 |
| `while` | `condition` | 同上 | `condition`, `maxIterations`, `body` | 计划 |
| `fanout` / `join` | 集合 / 分支结果 | 合并结果 | `items`, `body`, `joinMode` | 计划（本轮可能不做） |
| `checkpoint` | 当前帧 | 快照 | `every`, `keep` | 计划 |
| `assert` | 表达式 | `passed`/`missing` | `expr`, `message` | 计划 |

### L2 数据/LLM

| 节点 | 输入 | 输出 | 关键参数 | 状态 |
|---|---|---|---|---|
| `fetch` | — | 文本/JSON | `method`, `url`, `params`, `body` | 计划 |
| `filter` | 数组 | 子数组 | `items`, `when`（JEXL） | 计划 |
| `map` | 对象/数组 | 新对象 | `fields`, `template` | 计划 |
| `aggregate` | 数组 | 数字/分组 | `items`, `op`, `by` | 计划 |
| `extract` | 文本 | JSON | `prompt`, `schema` | 计划 |
| `classify` | 文本 | 标签 | `prompt`, `labels` | 计划 |
| `dedupe` | 数组 | 去重数组 | `items`, `key` | 计划 |

### L3 动作

| 节点 | 底层 | 参数 | 状态 |
|---|---|---|---|
| `gmail.send` | `api_fetch` | `to`, `subject`, `body` | 计划 |
| `sheets.append` / `update` | `api_fetch` | `spreadsheet`, `worksheet`, `row/cells` | 计划 |
| `calendar.create` | `api_fetch` | `title`, `start`, `end`, `attendees` | 计划 |
| `quickbooks.create_invoice` | `api_fetch` | `customer`, `lines` | 计划 |
| `monday.create_item` | `api_fetch` | `board`, `group`, `name`, `columns` | 计划 |
| `slack.post` | `api_fetch` | `channel`, `text` | 计划 |

L3 动作的实现方式：**注册为 skill flow**，解释器通过 `FlowEngine.run(flowId)` 调用，
这样引擎真正执行每次动作；直连 bridge 只作调试兜底（结构里标 `direct: true`）。

## 5. 统计口径

- **节点复用率** = 被 ≥2 个任务使用的节点类型数 / 节点类型总数；
- **单题专用节点** = 只在一个任务出现的节点类型，必须逐个解释；
- 统计脚本放在 `harness/node_usage.py`，结果写 `docs/05-reuse.md`。

## 6. 待办

- [ ] 实现 L1 的 loop/while/branch/assert；
- [ ] 实现 L2 的 fetch/filter/map/aggregate；
- [ ] 把 3 个通用动作注册为 skill flow；
- [ ] 用 10 题反推节点目录是否需要调整。
