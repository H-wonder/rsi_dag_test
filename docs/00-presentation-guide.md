# 讲解与验收指南

> 2026-11-25。给作者自己看的“怎么讲、怎么演示、怎么过验收”。
> 所有数字来自 [09-results.md](09-results.md)，所有证据文件都在本仓库。
> 本文偏“怎么讲”；**逐行代码、每个任务在哪实现，见
> [12-code-walkthrough.md](12-code-walkthrough.md)**。
> PDF：[reports/Round3-Loop-Structures-Report.pdf](../reports/Round3-Loop-Structures-Report.pdf)。

## 0. 一句话

> 平台原生不支持循环；我们在结构层定义了循环语义，用人工编排的结构修复了
> AutomationBench 的 10 个主任务（全部 1.0），并用消融和迁移证明是“结构”在起作用，
> 不是模型变强。两道备用题也已补齐：Zendesk 用现有节点，发票题只新增 `extract`
> 语义节点（10 次模型调用，只负责把文本变字段）。

## 1. 目标回顾

来自 `notes/target.md`：

1. 10 条可判定问题 + 前后对照；
2. 带循环的编排：重复条件、终止条件、状态；
3. 在 rsi-flow-platform 上人工编排；
4. 失败反馈；
5. 下一阶段让 LLM 生成结构。

## 2. 我们做了什么（四层）

### 2.1 结构层：定义循环

平台/引擎没有循环（`Executor` 是 DAG 队列），所以定义了一个显式 `loop` 节点：

```json
{ "type": "loop", "mode": "forEach", "items": "...", "body": ["..."],
  "maxIterations": 50, "breakWhen": "...", "state": {...},
  "onError": "continue", "budget": {"wallClockMs": 600000, "maxFailures": 3},
  "checkpoint": {"every": 5, "keep": 20, "file": "/tmp/x.jsonl"} }
```

- 重复：遍历 `items` / `condition`；
- 终止：集合耗尽 / `breakWhen` / `maxIterations` / 时间预算 / 错误预算；
- 状态：`loop.state`、`results`、`failures`、`perIteration`、`checkpoints`；
- 嵌套：最多 2 层；
- 文档：[01-loop-design.md](01-loop-design.md)、测试：[11-loop-tests.md](11-loop-tests.md)。

### 2.2 解释器：执行结构

后端 [FlowCodeRun.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java)
收到结构 JSON，交给
[StructureExecutor.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java)：

- 节点：`fetch / rows / filter / map / aggregate / loop / branch / action / encode /
  compute / datediff / businessdays / join / collect / first / assert`；
  备用发票题新增 `extract`（prompt + JSON schema + validate + retry）；
- 表达式：JEXL；
- 动作：bridge `/tool`（Gmail、Sheets、Salesforce、Zoom、Mailchimp、Notion、Slack、Zoho…）；
- skill flow：`fetch` 节点可声明 `skillFlow=@.../FLOW_SKILL_FETCH`，由 rsi-flow 引擎执行；
  实现见 [FlowCodeFetch.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java)
  与 [flow-skill-fetch.json](../rsi-data-spring-boot/core-flow/src/main/resources/flow/Skills/flow-skill-fetch.json)。

### 2.3 平台：画布 → 结构

- 页面：[Login/index.tsx](../rsi-data-platform/src/xpages/Login/index.tsx)；
- 下拉框/`?task=` 切换 12 个任务；
- 生成器：[buildTest.tsx](../rsi-data-platform/src/xpages/Login/test/buildTest.tsx)；
- 每个元素 `pendant.node` 存节点，`pendant.meta` 存任务信息；
- 链路边变成 `edges`；循环体/分支体用 `edge:false` 的虚线；
- 点“运行” → `getView` → 结构 JSON → 后端。
- 文档：[07-platform.md](07-platform.md)。

### 2.4 证据：12 题、消融、迁移

- 12 题全部 1.0（77/77 断言），见 [before-after.csv](../results/before-after.csv)；
  其中 10 主任务 + Zendesk 为 0 次 LLM，发票题为 10 次；
- 消融：QB 1.0→0.4，Mailchimp 1.0→0.286；
- 迁移：Zoho 0.75→1.0、Analyst 0.917→1.0，0 新增节点；
- 节点：10 主任务 108 实例 / 12 类型 / 92% 类型复用；补两题后 194 实例 / 17 类型，15/17 复用；只有 `extract` 是新写节点。

## 3. 成果数字

| 指标 | 值 |
|---|---|
| 修复任务 | 12/12（10 主 + 2 备用） |
| 基线平均分 | 0.451（10 主题 0.426） |
| 结构平均分 | 1.000 |
| 断言 | 77/77 |
| LLM 调用 | 10 主题 0；Zendesk 0；发票题 10 |
| 平台运行 | 12/12（每题一张截图） |
| 迁移 | 2/2，0 新增节点 |
| 长序列 | 120 轮压力 + 41 行真实 |

## 4. 文件地图

```text
loop-structures/
├── docs/
│   ├── 00-presentation-guide.md   ← 本文件
│   ├── 01-loop-design.md          循环语义
│   ├── 02-node-taxonomy.md        节点分类与准入
│   ├── 03-patterns.md             P1–P6 + 决策树
│   ├── 04-design-rationale.md     每题为什么这样编排
│   ├── 05-reuse.md                消融/迁移/节点统计
│   ├── 06-llm-generation.md       下一阶段契约
│   ├── 07-platform.md             平台闭环
│   ├── 08-long-sequence.md        长序列
│   ├── 09-results.md              12 题结果
│   ├── 10-limitations.md          失败反馈与限制
│   └── 11-loop-tests.md           循环语义测试
├── structures/                    12 题 + 消融/迁移/skill/压力测试
├── results/                       CSV、每题 JSON、12 张平台截图
├── harness/                       运行器、平台批量、统计、导出
└── schema/structure.schema.json   结构 schema
```

### 4.1 代码跳转

| 层 | 文件 | 作用 |
|---|---|---|
| 后端入口 | [FlowCodeRun.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/code/FlowCodeRun.java) | 接收 structure，调用解释器 |
| 解释器 | [StructureExecutor.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/StructureExecutor.java) | loop/branch/节点执行 |
| 表达式 | [Expr.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/Expr.java) | JEXL + `{{}}` 模板 |
| bridge 客户端 | [BridgeClient.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Run/structure/BridgeClient.java) | 调工具 |
| skill flow | [FlowCodeFetch.java](../rsi-data-spring-boot/core-flow/src/main/java/com/horsecoder/common/whuTalent/core/flow/Skill/code/FlowCodeFetch.java)、[flow-skill-fetch.json](../rsi-data-spring-boot/core-flow/src/main/resources/flow/Skills/flow-skill-fetch.json) | 引擎执行取数 |
| 入口 flow | [flow-run.json](../rsi-data-spring-boot/core-flow/src/main/resources/flow/Run/flow-run.json) | `FLOW_RUN` 定义 |
| 页面 | [Login/index.tsx](../rsi-data-platform/src/xpages/Login/index.tsx) | 下拉框、运行按钮、getView |
| 结构→画布 | [buildTest.tsx](../rsi-data-platform/src/xpages/Login/test/buildTest.tsx) | nodes/edges → elements/links |
| 结构数据 | [structures.ts](../rsi-data-platform/src/xpages/Login/test/structures.ts) | 12 题结构 |
| 前端请求 | [Run/index.ts](../rsi-data-platform/src/flows/com.horsecoder.common.whuTalent.flowTesting.core/Run/index.ts) | POST `/api/engine/flow` |
| schema | [structure.schema.json](../schema/structure.schema.json) | 节点/结构约束 |
| 结构文件 | [structures/](../structures/) | 12 题 + 消融/迁移 |
| 运行器 | [run_structure.py](../harness/run_structure.py) | 单题跑分 |
| 平台批量 | [platform_run.py](../harness/platform_run.py) | 12 题 UI 跑分；`--only` 可只跑单题 |
| 统计 | [node_usage.py](../harness/node_usage.py)、[summarize_results.py](../harness/summarize_results.py) | 节点统计、CSV |
| 问题生成 | [collect_problems.py](../harness/collect_problems.py) | 从数据集生成 problems.md |
| 结构导出 | [export_platform_structures.py](../harness/export_platform_structures.py) | JSON → structures.ts |
| 引擎 DAG | [Executor.java](../rsi-flow/flow-core/src/main/java/cc/eamon/open/flow/core/stereotype/support/route/Executor.java) | 为什么原生没有循环 |

## 5. 验收对照表

| target.md 要求 | 证据 | 怎么展示 |
|---|---|---|
| 10 条可判定问题 | [problems.md](problems.md) | 打开总览表，指出输入/期望断言/基线失败 |
| 前后对照 | [09-results.md](09-results.md)、[before-after.csv](../results/before-after.csv) | 主任务 0.426→1.0；备用题 0.75/0.40→1.0 |
| 平台人工编排 | [07-platform.md](07-platform.md)、[platform-runs.csv](../results/platform-runs.csv) | 现场打开平台，切换任务，点运行 |
| 循环：重复/终止/状态 | [01](01-loop-design.md)、[11](11-loop-tests.md) | 讲 forEach/while/retry、预算、checkpoint |
| 长序列 | [08](08-long-sequence.md) | 120 轮 + 41 行，展示 perIteration/checkpoint |
| 失败反馈 | [10-limitations.md](10-limitations.md) | 主动讲备用题、naive 0.571、断言≠语义 |
| 方法复用 | [05-reuse.md](05-reuse.md) | 消融掉分 + 2 道 held-out 迁移 |
| LLM 生成设想 | [06](06-llm-generation.md) | 输入/约束/判定/人工边界 |
| AI 使用与核实 | 本文第 10 节 | 主动说明 |

## 6. 现场演示脚本（10–15 分钟）

### 准备（演示前 5 分钟）

```bash
# 1) 后端（:39910，平台代理目标）
cd rsi-data-spring-boot
docker compose up -d mysql              # 或本机已有 MySQL
java -jar core-starter/target/core-starter-1.0.0-executable.jar \
  --spring.profiles.active=test --server.port=39910 \
  --eureka.client.register-with-eureka=false --eureka.client.fetch-registry=false

# 2) 前端
cd ../rsi-data-platform && pnpm dev     # :3000

# 3) 任务 bridge（以 overdue 为例，在仓库根目录）
cd ..
uv run --project automationbench python bridge/world_bridge.py \
  --domain sales --task sales.overdue_followup_flag --port 8765
```

### 演示 1：平台画布（3 分钟）

1. 打开 `http://localhost:3000/?task=sales.overdue_followup_flag`；
2. 指出 13 个节点：SOQL、join、循环、工作日、分支、建任务、汇总、发信；
3. 点“运行”；
4. 页面下方黑色面板会显示 `status: OK | score: 1 | assertions: 9/9`；
   也可以终端 `curl -s localhost:8765/score` 交叉验证；
5. 后端日志展示 `FLOW_RUN 收到 structure` → `status=OK`。

### 演示 2：前后对照（2 分钟）

打开 [09-results.md](09-results.md)：10 主任务基线 0.426 → 结构 1.0；备用题 0.75/0.40 → 1.0。
重点讲 3 个 0 分题（Monday、QB、Payment Terms）是怎么被逐条执行修复的。

### 演示 3：消融（2 分钟）

打开 [05-reuse.md](05-reuse.md)：

- QB 只处理第一条 → 0.4；
- Mailchimp 只处理第一个买家 → 0.286。

> “这证明提升来自循环，不是模型。”

### 演示 4：迁移（2 分钟）

Zoho 0.75→1.0（16/16）、Analyst 0.917→1.0（12/12），
**没有新增节点类型**，只换参数。

### 演示 5：限制（1 分钟）

主动打开 [10-limitations.md](10-limitations.md)：

- 12/12 是“断言全过”，不是语义 100%；
- 备用题原来为什么没做、后来怎么补的；
- naive 版本 0.571，说明人工读证据不可替代。

## 7. 复现命令

```bash
# 结构导出到平台
python3 loop-structures/harness/export_platform_structures.py

# 单题跑分（自动起/停 bridge）
cd loop-structures
python3 harness/run_structure.py \
  --structure structures/hr.monday_onboarding_pipeline.json --restart-bridge

# 12 题全部从平台 UI 跑（需要 backend/dev/geckodriver）
python3 harness/platform_run.py

# 重新汇总 before-after.csv
python3 harness/summarize_results.py

# 节点使用统计
python3 harness/node_usage.py
```

## 8. 评委可能问什么

| 问题 | 回答 |
|---|---|
| 平台原生不支持循环，你们怎么做的？ | 结构层定义 `loop` 节点，解释器执行；不在引擎里改 DAG（01/11） |
| 是不是因为模型变强？ | 10 主任务 + Zendesk **0 次 LLM 调用**；只有发票题用 10 次抽取；消融掉到 0.4/0.286（05） |
| 怎么证明方法可复用？ | 2 道 held-out 迁移，0 新增节点，全部 1.0（05） |
| 为什么是 12 题？ | 目标是“至少 10”；原 10 主任务 + 2 道备用题均已补齐（problems/09） |
| 哪些没修好？ | 12 题都是 1.0；剩余是 naive 证据版本 0.571、断言≠语义、嵌套/P4 真实场景未验证（10） |
| 下一步 LLM 怎么生成？ | 输入/约束/判定/人工边界（06） |
| AI 是不是替你编排了？ | 结构由人确认；AI 辅助读数据/起草/实现；每题能解释（第 10 节） |
| 为什么平台跑分和脚本一致？ | 同一份结构 JSON；平台只是 `getView` 收集 nodes/edges（07） |

## 9. 提交前 checklist

- [ ] 代码推到自己的 GitHub（当前**未推送**，按你的选择暂缓）
- [ ] 公开仓库可访问；私有则邀请 5 个账号
- [ ] README 首页有“一句话 + 结果 + 文档索引”
- [ ] 报告/PDF（待写）
- [ ] 提交说明：仓库链接 + 问题清单 + 对照 + 失败项 + AI 使用与核实
- [ ] 不要提交 `.env`、MySQL 密码、`ziyuan/settings.xml`

## 10. AI 使用与核实方式（可直接改写进提交说明）

**AI 做了什么**

- 读取数据集、定位断言与失败原因；
- 起草结构 JSON、解释器代码、测试与文档；
- 运行 harness、汇总结果。

**人做了什么**

- 决定每个任务的结构与规则（例如“Carol 已搬回 Austin”“2B-105 有新团队入驻”
  “Pinnacle 应为 Net 20”）；
- 确认断言与任务语义一致；
- 能逐题解释“为什么这样编排、为什么不用另一种”。

**怎么核实**

- 官方 `partial_credit` + 断言 diff；
- 平台 UI 实际点击运行，12/12 截图；
- 消融（去掉循环掉分）与迁移（新题 0 新增节点）；
- 循环语义测试（终止/状态/预算/checkpoint）。

**边界**

- 不是 LLM 端到端自动生成结构；10 主任务 + Zendesk 没有调用模型；
  发票题只在 `extract` 节点里调用模型（10 次），规则与结构仍由人编排。

## 11. 术语

| 术语 | 含义 |
|---|---|
| 结构（structure） | 画布导出的 `meta/nodes/edges` JSON |
| 模式（P1–P6） | 编排骨架：扫描过滤、汇总、嵌套、验证修复、分支、同步 |
| L1/L2/L3 | 控制节点 / 数据与 LLM 节点 / app 动作 |
| 消融（ablation） | 去掉循环、只处理第一条，用来证明循环的作用 |
| 迁移（transfer） | 把模式用到没做过的新题，只换参数 |
| skill flow | 注册在 rsi-flow 引擎里的可复用动作（如 FLOW_SKILL_FETCH） |
