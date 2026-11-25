# 循环结构设计：在原生不支持循环的平台上补出循环语义

> 2026-11-25。配套计划：[round3-plan.md](../../notes/round3-plan.md)。
> 本文件定义循环的**语义契约**，后续实现、报告和 LLM 生成都以它为准。

## 1. 现状：三处都没有循环

| 位置 | 现状 | 证据 |
|---|---|---|
| `rsi-flow` 引擎 | `Executor` 是一个 `Queue<Source>`，按 routes 把节点入队、出队，跑完即止，**没有回边** | [Executor.java:80](../../rsi-flow/flow-core/src/main/java/cc/eamon/open/flow/core/stereotype/support/route/Executor.java#L80) |
| 节点校验 | `FlowHolder`/`FlowNodeHolder` 在流程开始/节点结束时各校验一次，没有“每轮重新校验”的概念 | [FlowHolder.java:161](../../rsi-flow/flow-core/src/main/java/cc/eamon/open/flow/core/stereotype/execute/holder/FlowHolder.java#L161) |
| 画布 | `rsi-flow-visual` / `rsi-flow-platform` 只有元素和连线，没有循环容器、没有回边语义 | 平台源码中无 loop 相关实现 |

结论：循环不能靠“画一条回去的线”实现，必须在**结构层**定义一种显式的循环节点，由解释器执行。

## 2. 设计目标

1. **可判定**：重复条件、终止条件、每轮状态都有明确表达式和存放位置；
2. **长序列不丢上下文**：状态在流程作用域，不在 LLM 上下文里；每轮可恢复；
3. **可嵌套**：最多两层（合同×月份、设备×楼栋）；
4. **可复现**：顺序固定、随机性关闭、预算明确；
5. **可生成**：节点/字段是封闭集合，LLM 能按 schema 产出。

## 3. 循环类型

统一成一个 `loop` 节点，用 `mode` 区分：

| 模式 | 重复条件 | 典型用途 |
|---|---|---|
| `forEach` | `items` 里还有下一个 | 逐行/逐条处理（大多数任务） |
| `while` | `condition` 为真 | 轮询、等待状态变化 |
| `retry` | 上次失败且未超次数 | 工具瞬时错误重试 |

```json
{
  "id": "loop_orders",
  "type": "loop",
  "mode": "forEach",
  "items": "$.orders",
  "itemVar": "order",
  "indexVar": "i",
  "maxIterations": 50,
  "condition": null,
  "breakWhen": "$.loop.failures.length > 3",
  "continueWhen": "$.order.status != 'completed'",
  "body": ["create_invoice", "send_email"],
  "state": { "created": 0 },
  "onError": "continue",
  "checkpoint": { "every": 1, "keep": 20 }
}
```

字段含义：

- `items`：集合表达式（JSONPath/JEXL），`forEach` 必填；
- `condition`：布尔表达式，`while`/`retry` 必填；
- `itemVar` / `indexVar`：每轮绑定的变量名；
- `body`：节点 id 列表，按顺序执行；
- `state`：跨轮累加器，初始值在这里声明；
- `onError`：`continue` / `abort` / `retry`；
- `checkpoint`：每 N 轮存一次快照，保留最近 K 条。

## 4. 执行模型

解释器维护一个**循环帧栈**：

```text
LoopFrame {
  loopId, mode, index, current, items,
  results[], failures[], checkpoints[],
  startedAt, iterations, status
}
```

作用域布局：

```text
scope["loop.<loopId>"] = {
  index, current, count, status,
  results: [...], failures: [...],
  state: { ... }          // 用户声明的累加器
}
```

伪代码：

```text
push frame
while true:
    if mode == forEach:
        if index >= items.length: status = DONE; break
        current = items[index]
    else:
        if not eval(condition): status = DONE; break
        current = null
    if eval(breakWhen): status = BROKEN; break
    if maxIterations reached: status = EXHAUSTED; break
    if eval(continueWhen): index++; continue
    bind itemVar=current, indexVar=index
    for node in body:
        execute(node)          // 失败按 onError 处理
    index++
    maybeCheckpoint()
pop frame
```

执行完后，下游节点可以读：

- `$.loop.<id>.results`
- `$.loop.<id>.count`
- `$.loop.<id>.failures`
- `$.loop.<id>.state.*`

## 5. 终止条件与预算

终止来自五个来源，先到先停：

| 来源 | 字段 | 状态 |
|---|---|---|
| 集合耗尽 / 条件为假 | `items` / `condition` | `DONE` |
| 显式跳出 | `breakWhen` | `BROKEN` |
| 迭代上限 | `maxIterations`（见下方默认值规则） | `EXHAUSTED` |
| 时间预算 | `budget.wallClockMs`（默认 10 分钟） | `TIMEOUT` |
| 错误预算 | `budget.maxFailures`（默认 3） | `FAILED` |

可选预算：`budget.maxLlmCalls`、`budget.maxToolCalls`，用于长序列成本控制。

`maxIterations` 默认值规则（避免 50 静默截断 100+ 行的任务）：

| 模式 | 默认值 | 说明 |
|---|---|---|
| `forEach`，`items` 长度已知 | `max(50, N)` | N 为集合长度，够用即可 |
| `forEach`，长度未知 | 50 | 结构里应显式写大一点 |
| `while` / `retry` | 10 | 轮询/重试不需要很多轮 |
| 硬上限 | 300 | 超过必须显式声明并给出理由 |

**不允许静默截断**：达到上限时 `status=EXHAUSTED`，结果 JSON 里必须出现该状态；
默认让整个结构失败，除非结构显式声明 `allowPartial: true`。

## 6. 状态与上下文：长序列不丢

三个存放位置，职责分开：

| 内容 | 存放 | 生命周期 |
|---|---|---|
| 当前项、索引、累加器 | 流程作用域 `loop.<id>` | 整个流程 |
| 全量结果 | `results[]`（只存 id/关键字段，不存大对象） | 整个流程 |
| 每轮快照 | 内存环形缓冲（默认 20 条）+ 磁盘 JSONL（全部轮次） | 循环期间 / 运行结束 |

LLM 上下文策略：

- 每轮只给 LLM：**当前项 + 结构摘要**（总数、已完成数、最近 K 条结果、失败摘要）；
- 历史全量数据留在作用域，不塞进 prompt；
- 摘要由 `aggregate` 节点生成，固定模板，避免上下文随轮数线性增长。

恢复策略：**本轮不做真正的 resume**，只预留字段。

原因：benchmark 的 `WorldState` 在 bridge 进程内，重启即重置；“跳过已完成项”会把
“上一轮的世界状态”和“这一轮重置后的世界状态”混在一起，结果不可信。所以：

- 每次运行都从干净状态开始，失败就整体重跑；
- schema 保留 `resume` 字段和每轮 `itemId/status` 记录，等 bridge 支持状态快照后再实现；
- 报告里把这一点写成“可复现性优先于断点续跑”的设计取舍。

## 7. 嵌套

- 帧栈天然支持嵌套；
- 变量名必须显式（`contract`、`month`），禁止同名遮蔽；
- **最大深度 2**，超过则结构校验失败（保证 LLM 可生成、可调试）；
- 内层循环的 `maxIterations` 独立计算，但共享外层的时间/调用预算。

## 8. 失败语义

| `onError` | 行为 |
|---|---|
| `continue`（默认） | 记录 `{index, itemId, node, error}`，继续下一轮 |
| `abort` | 立即停止，整个循环 `FAILED` |
| `retry` | 该轮重试，`maxAttempts` 默认 2，仅对工具错误生效 |

区分两类错误：

- **瞬时错误**（网络、限流）→ 可重试；
- **语义错误**（缺字段、规则不满足）→ 不重试，记失败。

## 9. 可观测性

结束时输出：

```json
{
  "loop": "loop_orders",
  "status": "DONE",
  "iterations": 5,
  "succeeded": 4,
  "failed": 1,
  "skipped": 0,
  "failures": [{ "index": 3, "itemId": "ORD-4", "error": "..." }],
  "perIteration": [{ "i": 0, "itemId": "ORD-1", "ms": 820, "tools": 2, "llm": 0 }]
}
```

这份日志直接进 `results/`，也是失败分析的原始材料。

## 10. 平台怎么画（原生没有循环容器）

**权威来源先说清楚**：解释器只读结构根部的 `meta.structure`（完整 schema）。
画布元素是**人类看的投影**，不是执行依据。这样即使画布丢字段，执行也不受影响。

两种画法：

**A. 容器 + 所属节点 + 回边（视觉更好）**

- 一个 `type: "loop"` 的容器元素；
- 循环体节点带 `parent: "<loopId>"`；
- 从体尾到容器画一条虚线回边，仅作视觉提示；
- 解释器读 `parent` 分组，不依赖回边的几何。

**B. 单节点 + 内嵌 body（兜底）**

- 画布上只放一个 loop 元素，`detail.body` 里内嵌节点数组；
- 视觉信息少，但 round-trip 风险最低。

**D1 必须验证**：`getView` 是否保留 `parent`、`type`、自定义 `detail` 字段。
保留 → 用 A 做演示；不保留 → 用 B 或只画容器，执行照旧读 `meta.structure`。

## 11. 与 rsi-flow 的关系

### 11.1 引擎在本方案里的职责

`rsi-flow` 不是可有可无的：它负责

1. **流程注册**：启动时扫描 classpath 下的 flow JSON，建立 `flowId → FlowHolder`；
2. **流程执行**：`FlowEngine.run(flowId)` → `FlowHolder.execute()` → `Executor` 按 routes 调度；
3. **节点绑定**：`type:"event"` 的节点找到 `@Flow("...")` 代码方法，`type:"flow"` 的节点调用另一个 flowId；
4. **参数与结果校验**：入参/出参类型、`notnull`、默认值、作用域；
5. **Spring 集成**：`flow-spring-boot-starter` 把 `@FlowComponent` 扫描进容器。

换句话说：`FLOW_RUN` 本身就是一个 flow，`FlowCodeRun` 只是它里面的一个节点；没有引擎，
这个入口根本不会被执行。

### 11.2 循环为什么不在引擎里

`Executor` 是 DAG 队列，没有回边；`FlowHolder` 只在流程开始/节点结束校验一次。
要把循环做进引擎，必须改 `flow-core` 并另发 Maven 版本，而后端依赖的是 Nexus 上的
`0.4.14`，链路长、风险高。因此本轮把循环放在结构层，**引擎负责“执行一个节点/一个 skill”，
解释器负责“决定执行多少次”**。

### 11.3 建议的分工（让引擎真正参与）

- L3 动作节点尽量注册成 **skill flow**（`flowId`），解释器通过
  `FlowEngine.instance().register(...).run(skillFlowId).retrieve("result")` 调用；
- 这样每次工具调用都真的经过引擎，而不是解释器直连 bridge；
- 高频、临时的调试动作才允许直连 bridge，并在结构里标注 `direct: true`；
- 引擎的共享作用域（`shareScope` 让所有 scope 指向默认域）意味着嵌套调用要使用
  唯一的参数名，或调用后清理，避免脏变量。

### 11.4 迁移路径

以后要把循环下沉为引擎原生能力：

- 新增 `LoopNode`，输入输出契约与本设计一致；
- `Executor` 增加“帧”概念，或由节点内部循环；
- 现有结构 JSON 不用改。

本轮不实现，只在报告里写清迁移路径和动机。

## 12. 测试矩阵（解释器单元测试）

| 用例 | 期望 |
|---|---|
| 空集合 | 0 轮，`DONE`，下游可读 count=0 |
| 单元素 | 1 轮 |
| `breakWhen` 触发 | `BROKEN`，保留已完成结果 |
| `continueWhen` 跳过 | 该轮不执行 body，索引前进 |
| 达到 `maxIterations` | `EXHAUSTED`，按 `allowPartial` 决定成败 |
| `onError=continue` | 失败入 `failures`，后续轮继续 |
| `onError=abort` | 立即停止，`FAILED` |
| `retry` 瞬时错误 | 重试后成功，记录 attempts |
| 嵌套两层 | 内外层索引独立，变量不串 |
| 深度 3 | 结构校验拒绝 |

## 13. 已定

1. `maxIterations`：`forEach` 默认 `max(50, N)`，`while/retry` 默认 10，硬上限 300；
   达到上限必须显式暴露 `EXHAUSTED`，不静默截断。
2. `resume`：本轮不做，只预留字段；原因是 bridge 重启会重置 WorldState，
   跨运行的“续跑”不可信。
3. checkpoint：内存环形缓冲 20 条 + 磁盘 JSONL 全量；失败记录全部保留。
4. 画布：执行只认 `meta.structure`；A（容器+回边）仅作视觉，D1 验证 round-trip 后决定用不用。
5. L3 动作优先注册为 skill flow，由引擎执行；直连 bridge 只作调试兜底。
