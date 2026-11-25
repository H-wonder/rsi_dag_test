# 平台闭环：画布 → 结构 JSON → 后端执行

> 2026-11-25。目标是把“人工编排”落在 **rsi-flow-platform** 上，而不是手写 JSON 直接 POST。

## 1. 映射规则

平台画布的元素和连线携带结构信息：

| 画布 | 结构 |
|---|---|
| 元素 `pendant.node` | 一个 `{id, type, ...}` 节点 |
| 元素 `pendant.meta`（只放第一个） | `meta`（task / domain / pattern / bridge） |
| 连线 `fromElementId → toElementId` | 一条 `edges` |
| 连线 `pendant.edge === false` | 仅视觉（如 loop body），不进入 edges |

示例：[rsi-flow-platform/src/xpages/Login/test/loop_monday_test.tsx](../../rsi-flow-platform/src/xpages/Login/test/loop_monday_test.tsx)

```text
fetch ── rows ── pick ── loop1
                          └── create   （body，仅视觉连线）
```

## 2. 运行按钮

[Login/index.tsx](../../rsi-flow-platform/src/xpages/Login/index.tsx) 的 `runStructure`：

1. `getView(diagramRef)` 取当前画布；
2. 从元素的 `pendant.node` 收集 `nodes`；
3. 从第一个元素的 `pendant.meta` 取 `meta`；
4. `start → 第一个节点`，其余边来自 links（排除 `edge === false`）；
5. `flowRun({ structure: JSON.stringify(...) })`。

后端 `FlowCodeRun` 收到后交给 `StructureExecutor`，执行结果写回 `result`。

## 3. 验证

页面上有任务下拉框：

| 任务 | 画布节点 | 结果 | 截图 |
|---|---|---|---|
| Monday onboarding | 5 | `DONE`，2 轮，4/4，**1.0** | [platform-monday.png](../results/platform-monday.png) |
| Overdue follow-up | **13** | `DONE`，7 轮，9/9，**1.0** | [platform-overdue.png](../results/platform-overdue.png) |

路径：平台页面点“运行” → `/flowTesting-core` 代理 → 后端 `:39910`。
后端日志可见 `FLOW_RUN 收到 structure` → `status=OK`。

Overdue 的画布上能看到：SOQL 取数、账户/备注 join、循环、工作日计算、逾期分支、
建任务、汇总、发信，共 13 个节点；循环体和分支体用 `edge: false` 的虚线表示。

`getView` 会保留元素 `pendant` 里的自定义字段，因此 `node` / `meta` / `edge` 能原样带回。

## 4. 当前限制

- 画布上还不能编辑节点的参数（缺工具栏/表单模块），结构参数写在 `test/*.tsx` 里；
- 换任务需要改 `setView` 的导入；
- 这只是“人工编排”的演示入口；批量跑分仍用 `harness/run_structure.py`。

## 5. 下一步

- 加任务选择器（下拉切换 test 文件）；
- 把参数表单接上（需要平台缺失的模块）；
- 或者把结构文件转成画布初始化数据，再由页面加载。
