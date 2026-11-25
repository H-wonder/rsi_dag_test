# loop-structures

第三轮任务的提交仓库：**在原生不支持循环的 rsi-flow 平台上，定义循环语义、提炼可复用的结构与节点，并用 AutomationBench 的失败任务验证。**

本仓库同时是四个项目（`rsi-flow`、`rsi-flow-spring-boot`、`rsi-flow-platform`、`rsi-flow-visual`）`feature-wonder` 分支改动的镜像。

## 核心结论（随进度更新）

1. 平台没有循环：`Executor` 是 DAG 队列，画布没有循环容器；
2. 因此循环必须是**结构层的显式节点**，由解释器执行，语义契约见
   [docs/01-loop-design.md](docs/01-loop-design.md)；
3. 节点分三层（控制 / 数据与 LLM / app 动作），业务规则参数化，见
   [docs/02-node-taxonomy.md](docs/02-node-taxonomy.md)；
4. 结构归纳为 6 个模式，配一张选择决策树，见
   [docs/03-patterns.md](docs/03-patterns.md)；
5. 12 个失败任务作为验证集，问题清单见 [docs/problems.md](docs/problems.md)。

## 目录

```text
docs/        设计文档与结果分析
schema/      结构 JSON schema
structures/  各任务的结构（含消融、迁移）
harness/     起 bridge、跑结构、取分数
results/     前后对照 CSV、运行日志
reports/     报告 PDF
patch/       四个仓库的 diff 镜像
```

## 状态

- [x] 循环语义契约（01）
- [x] 节点分类（02）
- [x] 模式库（03）
- [x] 问题清单（12 题）
- [x] 解释器：loop / sequence / fetch / action / filter / map / aggregate / rows / assert
- [x] 第 1 题：`hr.monday_onboarding_pipeline`，0.0 → **1.0**（4/4，2 轮）
- [x] 第 2 题：`finance.qb_invoice_from_orders`，0.0 → **1.0**（5/5，3 轮）
- [x] 第 3 题：`finance.revenue_recognition`，0.75 → **1.0**（3/3，2 轮）
- [x] 第 4 题：`hr.policy_update_distribution`，0.25 → **1.0**（4/4，2 轮）
- [x] 第 5 题：`sales.overdue_followup_flag`，0.44 → **1.0**（9/9，7 轮，含分支/join/state）
- [x] 第 6 题：`operations.space_utilization_analysis`，0.60 → **1.0**（5/5，扫描 41 行）
- [x] 第 7 题：`hr.zoom_orientation_sessions`，0.67 → **1.0**（6/6，3 轮，I-9 分支）
- [x] 第 8 题：`finance.vendor_insurance_verification`，0.83 → **1.0**（6/6，4 轮，过期/预警分支）
- [x] 第 9 题：`operations.mailchimp_ecommerce_sync`，0.71 → **1.0**（7/7，7 轮，标签分支）
- [x] 第 10 题：`finance.payment_terms_tracking`，0.00 → **1.0**（7/7，5 轮，邮件证据覆盖）
- [x] 平台闭环：10 题全部从平台运行并得分（[platform-runs.csv](results/platform-runs.csv)），见 [docs/07-platform.md](docs/07-platform.md)
- [x] 长序列：120 轮压力测试 + 41 行真实任务，见 [docs/08-long-sequence.md](docs/08-long-sequence.md)
- [x] **10 题全部 1.0，见 [docs/09-results.md](docs/09-results.md)**
- [ ] 消融与迁移
- [ ] 报告

## 相关链接

- 目标：[../notes/target.md](../notes/target.md)
- 计划：[../notes/round3-plan.md](../notes/round3-plan.md)
- 循环设计（笔记版）：[../notes/round3-loop-design.md](../notes/round3-loop-design.md)
