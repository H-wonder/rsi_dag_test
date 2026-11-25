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

## 3. 验证：12 题全部从平台运行

页面下拉框列出 12 个任务，也可以通过 `?task=<task_name>` 直接打开。
[platform_run.py](../harness/platform_run.py) 用无头 Firefox 逐题：

1. 启动对应 bridge；
2. 打开 `/?task=<task>`；
3. 点击“运行”；
4. 轮询 `/score`（发票题要等模型调用，最多 300s）；
5. 保存截图。

结果：[results/platform-runs.csv](../results/platform-runs.csv)，**12/12 全部 1.0**。
只跑新增题：`python3 harness/platform_run.py --only support.zendesk_sf_case_sync,finance.invoice_email_extract --append`。

| 任务 | 断言 | 截图 |
|---|---|---|
| `finance.payment_terms_tracking` | 7/7 | `results/platform-finance.payment_terms_tracking.png` |
| `finance.qb_invoice_from_orders` | 5/5 | `results/platform-finance.qb_invoice_from_orders.png` |
| `finance.revenue_recognition` | 3/3 | `results/platform-finance.revenue_recognition.png` |
| `finance.vendor_insurance_verification` | 6/6 | `results/platform-finance.vendor_insurance_verification.png` |
| `hr.monday_onboarding_pipeline` | 4/4 | `results/platform-hr.monday_onboarding_pipeline.png` |
| `hr.policy_update_distribution` | 4/4 | `results/platform-hr.policy_update_distribution.png` |
| `hr.zoom_orientation_sessions` | 6/6 | `results/platform-hr.zoom_orientation_sessions.png` |
| `operations.mailchimp_ecommerce_sync` | 7/7 | `results/platform-operations.mailchimp_ecommerce_sync.png` |
| `operations.space_utilization_analysis` | 5/5 | `results/platform-operations.space_utilization_analysis.png` |
| `sales.overdue_followup_flag` | 9/9 | `results/platform-sales.overdue_followup_flag.png` |
| `support.zendesk_sf_case_sync`（备用） | 16/16 | `results/platform-support.zendesk_sf_case_sync.png` |
| `finance.invoice_email_extract`（备用，含 LLM） | 5/5 | `results/platform-finance.invoice_email_extract.png` |

路径：平台点“运行” → `/flowTesting-core` 代理 → 后端 `:39910`。
后端日志可见 `FLOW_RUN 收到 structure` → `FLOW_RUN score=...` → `status=OK`。

页面运行后会显示一个黑色结果面板：`status | score | assertions`，
下面是最新循环的 `state/perIteration`。截图（发票题因为要等 10 次模型调用，面板会在约 100s 后出现）：
[platform-score-monday.png](../results/platform-score-monday.png)。

画布由 [buildTest.tsx](../../rsi-flow-platform/src/xpages/Login/test/buildTest.tsx) 从结构 JSON 生成：
主链从左到右，循环体/分支体放在下方并用 `edge: false` 的连线表示。

`getView` 会保留元素 `pendant` 里的自定义字段，因此 `node` / `meta` / `edge` 能原样带回。

## 4. 当前限制

- 画布上还不能编辑节点的参数（缺工具栏/表单模块），结构参数写在 `structures/*.json`，由 exporter 生成 `structures.ts`；
- 换任务需要改 `setView` 的导入；
- 这只是“人工编排”的演示入口；批量跑分仍用 `harness/run_structure.py`。

## 5. 下一步

- 加任务选择器（下拉切换 test 文件）；
- 把参数表单接上（需要平台缺失的模块）；
- 或者把结构文件转成画布初始化数据，再由页面加载。
