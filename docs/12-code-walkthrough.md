# 代码走读：从平台点击到分数

> 2026-11-25。这份文档回答四个问题：
> 1. 我们到底写了哪些代码？
> 2. 代码在哪、从哪读起？
> 3. 每个任务具体在哪实现？
> 4. 一次点击“运行”在代码里发生了什么？

## 0. 两条链路

### 0.1 运行时链路（演示）

```text
浏览器
  src/xpages/Login/index.tsx        runStructure()
    getView() → nodes/meta/edges
    flowRunFacade() → POST /flowTesting-core/api/engine/flow
        ↓
后端 FlowEngineController
  FlowEngineService.runFlowByFlowId
    FlowEngine.run(FLOW_RUN)
      flow-run.json 的 event 节点
        FlowCodeRun.flowCodeRun(structure)
          new StructureExecutor(...).run()
            fetch/action → BridgeClient.call() → bridge /tool
            loop/branch 在 Java 里执行
          结束时 BridgeClient.getJson("/score")
          register("result", JSON)
        ↓
前端拿到 result → 黑色面板显示 status/score/assertions
```

### 0.2 证据链路（跑分）

```text
harness/run_structure.py
  start_bridge(task)              # Python 世界状态
  POST 结构到后端
  GET /score
  写 results/<task>.json / before-after.csv
```

两条链路用的是**同一份结构 JSON** 和**同一个后端**；差别只是前端是否参与。

---

## 0.3 位置速查（先看这三张表）

### 循环结构在哪

| 位置 | 链接 | 说明 |
|---|---|---|
| 结构里的循环节点 | [monday#L34](../structures/hr.monday_onboarding_pipeline.json#L34) | `loop1`：`type: loop`、`items`、`body` |
| schema 定义 | [structure.schema.json#L223](../schema/structure.schema.json#L226) | `loopNode` 的全部字段 |
| 语义设计 | [01-loop-design.md](01-loop-design.md) | 重复/终止/状态/预算/嵌套 |
| 后端实现 | [LoopRunner.java#L72](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java#L72) | 循环执行（`doLoop` 委托） |
| 加载时校验 | [StructureExecutor.java#L63](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L63) | 嵌套深度、body 引用 |

### 节点复用在哪

| 位置 | 链接 | 说明 |
|---|---|---|
| 统计表 | [05-reuse.md](05-reuse.md) 第 3 节 | 10 主任务 108 实例 / 12 类型 / 92% 复用；补 2 题后 +86 实例、+`extract` |
| 统计脚本 | [node_usage.py](../harness/node_usage.py) | 重新计算 |
| 类型→任务明细 | [05-reuse.md](05-reuse.md) 第 3.1 节 | 每种节点被哪些任务使用 |

### 后端实现在哪

| 功能 | 链接 | 行 |
|---|---|---|
| 接收 structure | [FlowCodeRun.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java#L33) | 33 |
| 解释器入口 | [StructureExecutor.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L101) | 101 |
| 循环 | [LoopRunner.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java#L72) | 72（入口委托在 [StructureExecutor#L660](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L660)） |
| fetch/action | [StructureExecutor.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L202) | 202 |
| 分支 | [StructureExecutor.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L616) | 616 |
| `extract` 节点 | [StructureExecutor.java#L447](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L447) | 447（分发在 194） |
| 模型客户端 | [ModelClient.java#L51](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/ModelClient.java#L51) | 51 |
| 表达式/模板 | [Expr.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/Expr.java#L21) | 21/39 |
| 调 bridge | [BridgeClient.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java#L38) | 38 |
| 取分 | [BridgeClient.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java#L78) | 78 |
| skill flow | [FlowCodeFetch.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java#L23) | 23 |

---

## 1. 代码清单

> 评审不需要切换四个仓库：backend/platform 的相关文件快照在
> [code/README.md](../code/README.md)，包含来源、分支、commit 和文件作用。



### 1.1 后端（`rsi-flow-spring-boot`，分支 `feature-wonder`）

| 文件 | 状态 | 作用 |
|---|---|---|
| [FlowCodeRun.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java) | 修改 | 接收 structure，调用解释器，取分，写回 result |
| [StructureExecutor.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java) | 新增 | 解释器：解析/校验/节点分发（695 行） |
| [ModelClient.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/ModelClient.java) | 新增 | `extract` 的模型调用（OpenAI 兼容，135 行） |
| [LoopRunner.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java) | 新增 | 循环执行：帧/终止/预算/状态（321 行，含详细注释） |
| [NodeSupport.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/NodeSupport.java) | 新增 | 数组/数字/模板/checkpoint 工具（90 行） |
| [Expr.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/Expr.java) | 新增 | JEXL 求值 + `{{}}` 模板 |
| [BridgeClient.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java) | 新增 | 调 bridge `/tool` 和 `/score` |
| [FlowCodeFetch.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java) | 新增 | `FLOW_SKILL_FETCH` 的代码节点 |
| [flow-skill-fetch.json](../../rsi-flow-spring-boot/core-flow/src/main/resources/flow/Skills/flow-skill-fetch.json) | 新增 | 把 fetch 注册成 flow |
| `flow-run.json` | 来自 dev_examples | `FLOW_RUN` 的 flow 定义 |

**没有改** `rsi-flow` 引擎（`feature-wonder` 与原分支一致）；循环不在引擎里，在解释器里。

### 1.1.1 代码来源说明

`feature-wonder` 基于学长的 `dev_examples`（`5483cf7`）。要区分：

| 来源 | 内容 |
|---|---|
| 学长 `dev_examples` | `Skill/code/` 下除 `FlowCodeFetch` 外的 11 个文件；`flow/Skills/` 下除 `flow-skill-fetch.json` 外的 JSON；`Run/code/FlowCodeRun.java` 的骨架；`flow/Run/flow-run.json` |
| 我们新增 | `Run/structure/` 全部（`StructureExecutor`、`LoopRunner`、`NodeSupport`、`Expr`、`BridgeClient`）；`Skill/code/FlowCodeFetch.java`；`flow/Skills/flow-skill-fetch.json` |
| 我们修改 | `FlowCodeRun.java` 的方法体（从 demo 分发改为执行结构、取分） |

### 1.2 前端（`rsi-flow-platform`，分支 `feature-wonder`）

| 文件 | 状态 | 作用 |
|---|---|---|
| [Login/index.tsx](../../rsi-flow-platform/src/xpages/Login/index.tsx) | 修改 | 任务下拉、运行按钮、getView→结构、结果面板 |
| [test/buildTest.tsx](../../rsi-flow-platform/src/xpages/Login/test/buildTest.tsx) | 新增 | 结构 JSON → 画布 elements/links |
| [test/structures.ts](../../rsi-flow-platform/src/xpages/Login/test/structures.ts) | 生成 | 12 个任务的结构 |
| [flows/.../Run/index.ts](../../rsi-flow-platform/src/flows/com.horsecoder.common.whuTalent.flowTesting.core/Run/index.ts) | 原有 | `flowRunFacade` 的 HTTP 封装 |

删除了 `loop_monday_test.tsx`、`loop_overdue_test.tsx`（已被 `structures.ts + buildTest` 取代）。

### 1.3 证据与工具（`loop-structures/harness`）

| 文件 | 作用 |
|---|---|
| [run_structure.py](../harness/run_structure.py) | 起 bridge → POST 结构 → 取分 → 写结果 |
| [platform_run.py](../harness/platform_run.py) | 无头浏览器逐题点“运行” |
| [collect_problems.py](../harness/collect_problems.py) | 数据集 + 基线 → problems.md |
| [summarize_results.py](../harness/summarize_results.py) | 重生成 before-after.csv |
| [node_usage.py](../harness/node_usage.py) | 节点使用统计 |
| [export_platform_structures.py](../harness/export_platform_structures.py) | 结构 JSON → structures.ts |

---

## 2. 一次点击的代码路径

### 2.1 前端：`runStructure`

[Login/index.tsx:39](../../rsi-flow-platform/src/xpages/Login/index.tsx#L40)

```ts
const view = getView(diagramRef);              // 当前画布
const nodes = elements.map(e => e.pendant.node).filter(Boolean);
const meta  = elements.find(e => e.pendant.meta)?.pendant.meta;
const edges = [["start", first.id], ...links 中没有 edge:false 的边];
const value = await flowRunFacade({ structure: JSON.stringify({meta,nodes,edges}) });
const parsed = JSON.parse(value.result);
setRunResult(parsed);                          // 结果面板
```

- 节点来自 `pendant.node`，任务信息来自 `pendant.meta`；
- 循环体/分支体的连线标了 `edge:false`，不会进入 `edges`；
- 面板代码在 [Login/index.tsx:140](../../rsi-flow-platform/src/xpages/Login/index.tsx#L150)。

### 2.2 后端：`FlowCodeRun`

[FlowCodeRun.java:33](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java#L33)

```java
JSONObject parsed = JSONObject.parseObject(structure);
JSONObject run = new StructureExecutor(parsed).run();       // ← 解释器
JSONObject score = new BridgeClient(bridgeUrl).getJson("/score");
run.put("score", score);
FlowEngine.instance().register("result", run.toJSONString());
```

### 2.3 解释器入口：`run`

[StructureExecutor.java:99](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L101)

1. `meta.vars` 放进变量表（压力测试用）；
2. 找 `start` 边指向的第一个节点；
3. 沿 `edges` 逐节点执行，直到 `end`；
4. 每个节点走 `executeNode` 的 `switch(type)`。

### 2.4 节点分发

| 类型 | 方法 | 行 |
|---|---|---|
| `fetch` / `action` | `doTool` | [196](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L202) |
| `assert` | `doAssert` | [242](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L236) |
| `rows` | `doRows` | [252](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L246) |
| `encode` | `doEncode` | [276](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L270) |
| `compute` | `doCompute` | [287](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L281) |
| `first` | `doFirst` | [333](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L337) |
| `datediff` | `doDateDiff` | [348](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L352) |
| `businessdays` | `doBusinessDays` | [365](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L369) |
| `join` | `doJoin` | [387](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L391) |
| `collect` | `doCollect` | [419](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L423) |
| `filter` | `doFilter` | [537](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L436) |
| `map` | `doMap` | [548](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L447) |
| `aggregate` | `doAggregate` | [564](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L463) |
| `branch` | `doBranch` | [616](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L616) |
| `extract` | `doExtract` | [447](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L447) |
| `loop` | `LoopRunner.run` | [72](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java#L72) |

`doTool` 的两种模式：

- 普通：`Expr.render(args)` → `BridgeClient.call(tool, args)`；
- skill flow：节点有 `skillFlow` → `FlowEngine.run(skillFlow)`，由引擎执行
  [FlowCodeFetch.java](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java)。

### 2.5 bridge 到底在哪被调用

只有 **取数/动作/编码/取分** 会碰 bridge；循环、分支、过滤、计算全在 Java 里。

| 调用点 | 文件:行 | 做什么 |
|---|---|---|
| `fetch` / `action` 节点 | [StructureExecutor.java#L237](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L237) | `bridge.call(tool, args)` → `POST /tool` |
| `encode` 节点 | [StructureExecutor.java#L280](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L280) | `base64_encode` 也走 bridge |
| 执行完取分 | [FlowCodeRun.java#L53](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java#L53) | `GET /score` |
| skill flow 的取数 | [FlowCodeFetch.java#L36](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java#L36) | 由引擎执行的 `api_fetch` |

bridge 地址解析顺序：[StructureExecutor.java:50](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L52)

```text
structure.meta.bridge
  → -Dbridge.url
  → 环境变量 BRIDGE_URL
  → BridgeClient 默认 http://127.0.0.1:8765
```

HTTP 细节在 [BridgeClient.java:38](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java#L38)（`/tool`）和
[:78](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java#L78)（`/score`）。

> 注意：`FlowCodeFetch` 用的是 `new BridgeClient(null)`，即默认 `8765`；
> 如果 bridge 换端口，skill flow 不会读 `meta.bridge`，这是一个已知限制。

---

## 3. `LoopRunner` 内部（最核心）

[LoopRunner.java:72](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java#L72)

### 3.1 帧

```text
frame = { index, count, current, state }
vars["loop"] = frame
vars[itemVar] = items[index]
vars[indexVar] = index
```

嵌套时保存/恢复上一层的 `loop/itemVar/indexVar`，最大深度 2（加载时校验）。

### 3.2 每轮顺序

```text
1. 更新 frame.index / indexVar
2. forEach: index >= size ? 结束
   while:   condition 为假 ? 结束
3. index >= maxIterations → EXHAUSTED
4. wallClockMs 超时 → TIMEOUT
5. breakWhen 为真 → BROKEN
6. continueWhen 为真 → skip，index++
7. 绑定 itemVar
8. 执行 body
9. 成功/失败计数；maxFailures 或 abort → FAILED
10. checkpoint（内存环形 + 可选 file 落盘）
```

### 3.3 状态在哪

| 内容 | 位置 |
|---|---|
| 当前项/索引 | `vars[itemVar]` / `vars[indexVar]` |
| 累加器 | `frame.state`（节点 `compute.accumulate` 写） |
| 每轮日志 | `summary.perIteration` |
| 快照 | `summary.checkpoints` + 可选 JSONL |
| 结果 | `summary` 写入 `vars["loop_<id>"]` |

`state` 被 `collect` 节点写成字符串，循环结束后用
`{{loop_loop1.state.summary}}` 放进邮件模板。

---

## 4. 十二个任务分别在哪实现

所有结构在 [structures/](../structures/)；每题一行“关键条件”，可以直接对照 JSON。

### 4.1 Monday onboarding

- 文件：[hr.monday_onboarding_pipeline.json](../structures/hr.monday_onboarding_pipeline.json)
- 基线：0/4，没建任何 item。
- 链：`fetch → rows → pick → loop1 → create`。
- 关键条件：`item.Type == 'Full-time' and item.Notes == ''`
- 结果：4/4，2 轮；Mei-Ling（Contractor）、Derek（延期）被过滤。

### 4.2 QB invoice

- 文件：[finance.qb_invoice_from_orders.json](../structures/finance.qb_invoice_from_orders.json)
- 基线：0/5。
- 链：`fetch → rows → pick(Delivered) → loop(invoice → encode → send)`。
- 关键条件：`item.Status == 'Delivered'`
- 消融：只处理第一条 → 0.4。

### 4.3 Revenue recognition

- 文件：[finance.revenue_recognition.json](../structures/finance.revenue_recognition.json)
- 基线：0.75，多写了 CTR-003。
- 链：`fetch → rows → pick → loop(calc → append) → encode → send`。
- 关键条件：
  `item.Status == 'Active' and item.Start_Date.substring(0,7).compareTo('2026-01') <= 0`
- `calc` 用 `compute` 做 `Total_Value / Term_Months_`，`accumulate` 到 `state.total`，
  `totalFormat: floor` 得到 46。
- 结果：3/3；负向断言 CTR-003 不再出现。

### 4.4 Policy distribution

- 文件：[hr.policy_update_distribution.json](../structures/hr.policy_update_distribution.json)
- 基线：0.25。
- 链：`fetch → rows → pick → encode → slack → loop(send)`。
- 关键条件：`Location == 'Remote' and Type == 'Full-time' and Employee != 'Carol Diaz'`
  （Carol 搬回 Austin 来自 Slack 消息，人工写进参数）。

### 4.5 Overdue follow-up

- 文件：[sales.overdue_followup_flag.json](../structures/sales.overdue_followup_flag.json)
- 基线：0.44。
- 链：`fetch_tasks/accounts/notes → ext_notes → join_acc → join_ext → loop(days → route)`。
- 关键条件（branch）：
  `(Status != 'Completed' or not Description.startsWith('Completed:'))
   and not has_extension and bdays > 3`
- `businessdays` 从 `ActivityDate` 算到 `2026-02-26`，排除周末；
- 命中后 `flag` 建 OVERDUE 任务，`collect` 写 `state.summary`；
- 结果：9/9，7 轮。

### 4.6 Space utilization

- 文件：[operations.space_utilization_analysis.json](../structures/operations.space_utilization_analysis.json)
- 基线：0.6。
- 链：`fetch → rows → pick → loop(ratio → used → unused → collect) → notion → encode → send`。
- 关键条件：Office、`Avg_Daily_Occupancy_ * 1 < 40`、排除 Renovation/executive/
  DECOMMISSIONED、`Room != '2B-105'`（2B-105 来自邮件“new team allocation”）。
- `unused` 用 `capacity - used` 算未用座位，累加得 46；
- 结果：5/5，扫描 41 行。

### 4.7 Zoom orientation

- 文件：[hr.zoom_orientation_sessions.json](../structures/hr.zoom_orientation_sessions.json)
- 基线：0.67。
- 链：`fetch → rows → pick → loop(route)`。
- 过滤：Notes 不含 moved/rescinded；
- 分支：`I_9_Submitted == 'Yes'` → 建会/注册/确认信；
  `== 'No'` → 上报 HR Director + 通知本人。
- 结果：6/6，3 轮；Derek/Lena 无邮件。

### 4.8 Vendor insurance

- 文件：[finance.vendor_insurance_verification.json](../structures/finance.vendor_insurance_verification.json)
- 基线：0.83。
- 链：`fetch → rows → pick(Active) → loop(days → route) → sum mail + slack`。
- 分支：`days < 0` → 改 Non-Compliant + 通知；`days <= 30` → 提醒。
- 改状态：`PUT Certificates!E{{v._row}}`（`rows` 节点写入 `_row`）。
- 结果：6/6，4 轮。

### 4.9 Mailchimp sync

- 文件：[operations.mailchimp_ecommerce_sync.json](../structures/operations.mailchimp_ecommerce_sync.json)
- 基线：0.71。
- 链：`fetch orders/optout → rows → join → loop(days → route)`。
- 过滤：7 天窗口、Notes 排除 refund/cancel/chargeback/internal、`not opted_out`；
- 标签分支：`Order_Count == 1` → new；`>= 2` → repeat + vip；`Order_Total > 500` → high。
- 结果：7/7，7 轮；消融只处理第一个买家 → 0.286。

### 4.10 Payment terms

- 文件：[finance.payment_terms_tracking.json](../structures/finance.payment_terms_tracking.json)
- 基线：0.00。
- 链：`fetch → rows → loop(route)`。
- 分支按供应商覆盖：
  - Pinnacle → Net 20（邮件修正，表里是 15）；
  - CloudHost → Net 30（Slack 说已 finalize，表里 Under Review）；
  - Metro → 2/10 Net 30（法律邮件说争议已解决，Notes 还写着 dispute）；
  - 其余 Finalized → 表里的 New_Terms。
- 结果：7/7；只信表格的 naive 版 0.571。

### 4.11 Zendesk → Salesforce 同步（备用题）

- 文件：[support.zendesk_sf_case_sync.json](../structures/support.zendesk_sf_case_sync.json)
- 基线：0.75，漏建 case、计数与通知不一致。
- 链：`fetch 三张配置表 → rows → fetch 用户/组织/联系人/账户/已有 case →
  join → map(算域名/优先级) → filter(可同步) → loop(建 case + 评论 + collect) →
  assert(总数 6) → Slack 汇总`。
- 关键条件（`ready` 节点）：
  `status == 'new' and contact_found and account_id != null and
   (block_status == null or block_status != 'Blocked') and not duplicate`
- 优先级三层覆盖（`prepare` 节点）：
  1. blocklist `Warning` → config 的 Low；
  2. SLA `Platinum` → config 的 Critical；
  3. 组织标签 `enterprise` → config 的 High；
  4. 否则 Zendesk priority 映射 High/Medium/Low。
- 三张配置表都真正参与计算：blocklist 过滤、SLA 优先级、config 的
  `Batch_Reference`/三个优先级规则值。
- 结果：16/16，5 轮；**0 个新节点类型**。

### 4.12 发票邮件抽取（备用题，能力补齐）

- 文件：[finance.invoice_email_extract.json](../structures/finance.invoice_email_extract.json)
- 基线：0.40，只记了部分发票、金额未更正。
- 链：`fetch 邮件列表 → loop(fetch 正文 → extract → collect) →
  fetch 阻断表/Slack → extract 更正 → filter 发票 → join 阻断名单 →
  合法/阻断分流 → 应用更正 → 阈值判断 → 循环写表 → 循环退回 → 汇总邮件`。
- 关键点：
  - `extract_email` 对每封邮件调用一次模型，返回 `kind/vendor/invoice/
    invoice_date/due_date/amount/authority/review_threshold`；
  - `validate` 要求发票字段齐全，否则自动重试（`retries: 1`）；
  - 阻断匹配用 `vendor.toLowerCase()` 与表里的 `Vendor Name` 对齐，
    避免 “Acme Supplies LLC” 与 “Acme Solutions Inc.” 混淆；
  - Slack 更正通过 `extract_correction` 抽出 `GL-88210 → 11,340.50`，
    再在 `apply_correction` 里覆盖邮件原值；
  - 阈值来自 VP 邮件（`authority == 'vp'` 且发件域为 `company.example.com`），
    控制器阈值被覆盖，外部审计的越权请求被忽略；
  - 汇总金额用 `aggregate sum(field: item.amount)`，注意 field 要写
    `item.amount`（只写 `amount` 会得到 0）。
- 结果：5/5，13 轮；**10 次模型调用**。

### 4.13 `extract` 节点本身

| 部分 | 位置 | 说明 |
|---|---|---|
| 分发 | [StructureExecutor.java#L194](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L194) | `case "extract"` |
| 执行 | [StructureExecutor.java#L447](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L447) | 渲染 prompt/schema、调用模型、校验、重试 |
| JSON 解析 | [StructureExecutor.java#L517](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L517) | 去代码围栏、截取第一个 `{...}` |
| 模型调用 | [ModelClient.java#L51](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/ModelClient.java#L51) | `/chat/completions`，读 `OPENAI_*` |
| 调用计数 | [StructureExecutor.java#L34](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L34) | 结果里的 `llmCalls` |
| 数组收集 | [StructureExecutor.java#L419](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L419) | `collect` 的 `as: array` |

节点字段：

```json
{
  "type": "extract",
  "out": "email_data",
  "prompt": "... {{detail.body_plain}} ...",
  "schema": { "kind": "invoice|policy|other", "amount": "number|null" },
  "required": ["kind", "sender"],
  "validate": "kind != 'invoice' or (vendor != null and amount != null)",
  "retries": 1,
  "reasoningEffort": "low",
  "maxTokens": 700
}
```

重试语义：解析失败、缺 `required` 字段、`validate` 为 false 都会触发；
重试时把错误原因追加到 prompt，要求只返回修正后的 JSON。
实测：故意要一个不存在的字段，结果 `llmCalls = 2`，最终返回
`extract 失败（2 次）: 缺少字段 must_exist`。

---

## 5. 平台画布是怎么来的

### 5.1 `structures.ts`

由 [export_platform_structures.py](../harness/export_platform_structures.py) 生成：

```text
structures/*.json（10 主 + 2 备用；消融/迁移/skill/stress 不导出）
  → structures.ts：{ "task": {...}, ... }
```

### 5.2 `buildTest`

[buildTest.tsx:149](../../rsi-flow-platform/src/xpages/Login/test/buildTest.tsx#L149)

1. 从 `edges` 找 `start` 后的链；
2. 链节点排成两行，其他节点（循环体/分支体）放下面；
3. 每个元素带 `pendant.node`，第一个带 `pendant.meta`；
4. 链边 `edge:true`，body 边 `edge:false`。

### 5.3 结果面板

[Login/index.tsx:140](../../rsi-flow-platform/src/xpages/Login/index.tsx#L150)：
解析 `value.result`，显示 `status / score / assertions` 和 `loops`。

---

## 6. 新增一个任务怎么做

1. 在 `loop-structures/structures/` 写 JSON（可复制最接近的一题）；
2. 本地验证：
   ```bash
   python3 harness/run_structure.py --structure structures/新任务.json --restart-bridge
   ```
3. 导出到平台：
   ```bash
   python3 harness/export_platform_structures.py
   ```
4. 起 bridge + 后端 + 前端，打开 `/?task=新任务`，点运行；
5. 结果写进 `results/`，必要时更新 `docs/problems.md`。

---

## 7. 推荐阅读顺序

1. [structures/hr.monday_onboarding_pipeline.json](../structures/hr.monday_onboarding_pipeline.json) —— 最简单的 P1；
2. [StructureExecutor.java:99](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java#L101) `run()`；
3. [LoopRunner.java:72](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/LoopRunner.java#L72) `run()`；
4. [FlowCodeRun.java:33](../../rsi-flow-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java#L33)；
5. [Login/index.tsx:39](../../rsi-flow-platform/src/xpages/Login/index.tsx#L40)；
6. [buildTest.tsx:149](../../rsi-flow-platform/src/xpages/Login/test/buildTest.tsx#L149)；
7. [run_structure.py:70](../harness/run_structure.py#L70)；
8. [schema/structure.schema.json](../schema/structure.schema.json)。

---

## 8. 几个容易混淆的点

| 问题 | 答案 |
|---|---|
| 为什么 rsi-flow 里没有循环代码？ | 循环在 `LoopRunner.run`（由 `StructureExecutor.doLoop` 委托），引擎只执行 `FLOW_RUN` 这个入口 |
| `loops` 里的 `iterations` 是什么？ | 实际执行的轮数，不是 `items` 长度 |
| `state.summary` 是谁写的？ | `collect` 节点（`doCollect`） |
| `_row` 哪来的？ | `rows` 节点给每行加的 Excel 行号，`values.update` 用 |
| 平台改了画布会改结构吗？ | 目前不会；结构以 JSON 为准，画布只做展示/取 nodes/edges |
| `score` 谁加的？ | `FlowCodeRun` 在结构执行完后调 bridge `/score` |
