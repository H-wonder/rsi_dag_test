# loop-structures

第三轮任务的提交仓库：**在原生不支持循环的 rsi-flow 平台上，定义循环语义、提炼可复用的结构与节点，并用 AutomationBench 的失败任务验证。**

本仓库保存结构 JSON、解释器说明、实验证据和报告；四个项目的代码改动分别在各自的
`feature-wonder` 分支（`rsi-flow` 引擎本身未改）。

## 结果（2026-11-26）

- **12 / 12** 任务达到官方 `partial_credit = 1.0`，合计 **77 / 77** 断言；
- 10 道主任务：基线平均 0.426 → 1.0，**0 次模型调用**；
- 2 道备用题：Zendesk 0.75 → 1.0（16/16，0 新增节点类型）；
  发票抽取 0.40 → 1.0（5/5，新增 `extract`，10 次模型调用）；
- 平台：12 题全部从 `rsi-flow-platform` 点“运行”跑通，每题一张截图
  （[platform-runs.csv](results/platform-runs.csv)）；
- 方法复用：消融 2 题 + held-out 迁移 2 题；10 主任务 108 实例 / 12 类型 / 92% 复用；
- 报告：[reports/Round3-Loop-Structures-Report.pdf](reports/Round3-Loop-Structures-Report.pdf)（15 页）。

## 核心结论

1. 平台没有循环：`Executor` 是 DAG 队列，画布没有循环容器；
2. 循环是**结构层的显式节点**，由解释器执行，语义契约见
   [docs/01-loop-design.md](docs/01-loop-design.md)；
3. 节点分三层（控制 / 数据与 LLM / app 动作），业务规则参数化，见
   [docs/02-node-taxonomy.md](docs/02-node-taxonomy.md)；
4. 结构归纳为 6 个模式，配一张选择决策树，见
   [docs/03-patterns.md](docs/03-patterns.md)；
5. 问题清单、前后对照、失败原因分别见
   [docs/problems.md](docs/problems.md)、[docs/09-results.md](docs/09-results.md)、
   [docs/10-limitations.md](docs/10-limitations.md)。

## 快速开始

```bash
# 1) 后端 :39910 + 前端 :3000（见 docs/00-presentation-guide.md）
# 2) 起某道题的 bridge（在四项目工作区，即本仓库的上一级；一道题一个进程）
cd ../automationbench-baseline
uv run --project ../datasets/AutomationBench python scripts/world_bridge.py \
  --domain hr --task hr.monday_onboarding_pipeline --port 8765

# 3) 打开平台，点“运行”
# http://localhost:3000/?task=hr.monday_onboarding_pipeline

# 或者不走前端，直接跑结构并取分
cd ../loop-structures
python3 harness/run_structure.py \
  --structure structures/hr.monday_onboarding_pipeline.json --restart-bridge
```

发票题的 `extract` 节点需要后端环境变量
`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`；密钥不写入仓库。

## 目录

```text
docs/        设计文档、代码走读、结果与限制
schema/      结构 JSON schema
structures/  12 题结构 + 消融/迁移/skill/压力测试
harness/     起 bridge、跑结构、批量平台运行、统计与导出
results/     前后对照 CSV、每题运行 JSON、12 张平台截图
reports/     报告 PDF 与 LaTeX 源
```

## 代码在哪

- 逐行代码走读：[docs/12-code-walkthrough.md](docs/12-code-walkthrough.md)
- 解释器：`rsi-flow-spring-boot` 的 `Run/structure/`
  （`StructureExecutor`、`LoopRunner`、`NodeSupport`、`Expr`、`BridgeClient`、`ModelClient`）；
- 前端：`rsi-flow-platform` 的 `src/xpages/Login/`（画布、运行、结果面板、
  `test/buildTest.tsx`、`test/structures.ts`）；
- bridge：`automationbench-baseline/scripts/world_bridge.py`；
- 引擎 `rsi-flow` 没有改；循环不在引擎里。

## 状态

- [x] 循环语义契约（01）
- [x] 节点分类（02）
- [x] 模式库（03）
- [x] 问题清单（12 题）
- [x] 解释器：loop / sequence / fetch / action / filter / map / aggregate / rows / assert / join / collect / extract
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
- [x] 第 11 题（备用）：`support.zendesk_sf_case_sync`，0.75 → **1.0**（16/16，0 新节点）
- [x] 第 12 题（备用）：`finance.invoice_email_extract`，0.40 → **1.0**（5/5，`extract` + 10 次调用）
- [x] 平台闭环：12 题全部从平台运行并得分（[platform-runs.csv](results/platform-runs.csv)）
- [x] 长序列：120 轮压力测试 + 41 行真实任务，见 [docs/08-long-sequence.md](docs/08-long-sequence.md)
- [x] 消融 2 题 + 迁移 2 题 + 节点统计：[docs/05-reuse.md](docs/05-reuse.md)
- [x] 失败反馈与限制：[docs/10-limitations.md](docs/10-limitations.md)
- [x] LLM 生成契约：[docs/06-llm-generation.md](docs/06-llm-generation.md)
- [x] 报告 PDF：`reports/Round3-Loop-Structures-Report.pdf`
- [ ] 提交（GitHub 推送与协作者邀请，按当前选择暂缓）

## 已知限制

- 真实嵌套循环任务、业务循环的 P4 重试、多次运行方差尚未覆盖；
- skill flow 目前只实现了 `fetch`，其余动作直连 bridge；
- 平台画布只能展示，节点参数还不能在线编辑；
- 发票题依赖模型，属于本轮唯一有 LLM 调用的任务。
