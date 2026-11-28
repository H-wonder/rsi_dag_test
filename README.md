# loop-structures

第三轮任务提交仓库：**在原生不支持循环的 rsi-flow 平台上，定义循环语义、提炼可复用的结构与节点，并用 AutomationBench 的失败任务验证。**

提交仓库：https://github.com/H-wonder/rsi_dag_test

本项目采用**单仓库**提交：后端、前端、画布库和 rsi-flow 框架都放在本仓库根目录，评审不需要再跳转其他仓库。

## 提交信息（对应四仓库格式）

| 论文组要求 | 本仓库对应位置 | 说明 |
|---|---|---|
| 我的后端项目 | [rsi-data-spring-boot](rsi-data-spring-boot) | Spring Boot 后端，含 `StructureExecutor`、`LoopRunner`、`extract` |
| 我的前端项目 | [rsi-data-platform](rsi-data-platform) | Next.js 前端，画布、运行、结果面板 |
| 我的前端编排框架（有改动则写） | [rsi-data-visual](rsi-data-visual) | 画布库；源码未改，随仓库提供以便前端直接运行 |
| 我的后端 rsi 编排框架（有改动则写） | [rsi-flow](rsi-flow) | rsi-flow 引擎；源码未改，保留作参考 |

如果论文组要求四个独立仓库链接，可分别使用：

- 后端：https://github.com/H-wonder/rsi_dag_test/tree/main/rsi-data-spring-boot
- 前端：https://github.com/H-wonder/rsi_dag_test/tree/main/rsi-data-platform
- 前端编排框架：https://github.com/H-wonder/rsi_dag_test/tree/main/rsi-data-visual
- 后端 rsi 编排框架：https://github.com/H-wonder/rsi_dag_test/tree/main/rsi-flow

## 改了什么

- **后端**：新增结构解释器 `StructureExecutor`、循环执行器 `LoopRunner`、`NodeSupport`/`Expr`/`BridgeClient`；加 `extract` 语义节点和 `ModelClient`；修改 `FlowCodeRun` 接入结构执行与 `/score`；新增 `FlowCodeFetch`/`flow-skill-fetch`。
- **前端**：修改 `Login/index.tsx` 的运行链路和结果面板；新增 `buildTest.tsx`（结构 JSON → 画布）和 12 题结构数据；修 React 19 `element.ref` 告警；dev 代理超时调到 300s。
- **未改**：`rsi-flow` 引擎和 `rsi-data-visual` 画布源码；前端通过 `file:../rsi-data-visual` 使用后者。
- **结构**：12 道题的 JSON 编排，业务规则放在 `when`、`cases`、模板参数里；10 主任务 + Zendesk 0 次模型调用，发票题 10 次。

## 成果

- 12/12 任务 `partial_credit = 1.0`，77/77 断言；10 主任务基线平均 0.426 → 1.0；
- 12 题全部从平台点“运行”跑通并截图；
- 消融：QB 1.0→0.4、Mailchimp 1.0→0.286；迁移 2 题 1.0、0 新增节点；
- 报告 [Round3-Loop-Structures-Report.pdf](reports/Round3-Loop-Structures-Report.pdf)（24 页）、12 张平台截图、每题结果 JSON 都在本仓库。

## 核心结论

1. 平台没有循环：`Executor` 是 DAG 队列，画布没有循环容器；
2. 循环是**结构层的显式节点**，由解释器执行，语义见报告第 4 节；
3. 节点分三层（控制 / 数据与 LLM / app 动作），业务规则参数化，见报告第 5.5 节；
4. 结构归纳为 6 个模式，配一张选择决策树，见报告第 6 节；
5. 问题清单、前后对照、失败原因见报告第 2、6、9 节和 `results/before-after.csv`。

> 设计文档（00–12、problems）不随代码仓库提交，保存在本地
> `notes/loop-structures-docs-2026-11-28/`；报告 PDF 内含主要设计、验收证据和代码走读摘要。

## 仓库结构

```text
loop-structures/
├── rsi-data-spring-boot/       后端（完整可构建）
├── rsi-data-platform/          前端（完整可安装）
├── rsi-data-visual/            画布库（前端依赖，未改源码）
├── rsi-flow/                   rsi-flow 引擎（未改源码）
├── automationbench/            AutomationBench 源码子集（bridge 使用）
├── bridge/world_bridge.py      bridge 入口
├── structures/                 12 题结构 + 消融/迁移/skill/压力测试
├── harness/                    跑分、平台批量运行、统计
├── results/                    CSV、每题 JSON、12 张平台截图
├── reports/                    24 页报告 PDF + LaTeX 源
└── schema/                     结构 JSON schema
```

## 如何运行

### 0. 环境

- JDK 8（后端编译）
- Maven 3.9+
- MySQL 8（或 Docker）
- Node.js 24 + pnpm 9（前端）
- Python 3.13 + uv（bridge，可选）

本仓库已经带有 bridge 需要的 `automationbench/` 源码子集和 12 道题的任务定义，
第一次 `uv run` 会自动建虚拟环境并安装依赖。

### 1. 后端

```bash
cd rsi-data-spring-boot

# 起 MySQL（本机已有 MySQL 可跳过）
docker compose up -d mysql

# 构建
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
mvn -DskipTests package

# 启动
java -jar core-starter/target/core-starter-1.0.0-executable.jar \
  --spring.profiles.active=test \
  --eureka.client.register-with-eureka=false \
  --eureka.client.fetch-registry=false
```

默认端口 `39910`。如果拿到学长提供的内网 `settings.xml`，构建时加
`-s /path/to/settings.xml`；仓库自带 `libs/maven-repo/` 作为没有 settings 时的兜底。
`settings.xml` 不要提交到仓库。数据库默认是 `flowtest / flowtest / flowtest`，
可用 `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` 覆盖。

### 2. 前端

```bash
cd rsi-data-platform
pnpm install --frozen-lockfile
pnpm dev
```

打开：

```text
http://localhost:3000/?task=hr.monday_onboarding_pipeline
```

`next.config.ts` 把 `/flowTesting-core/*` 代理到 `http://localhost:39910/*`。
前端依赖同级目录的 `../rsi-data-visual`，仓库里已经放好，不要改名/移动。

### 3. bridge（跑具体任务时才需要）

bridge 是一道题一个进程，持有这道题的 WorldState，并提供 `/tool`、`/score`、`/state`。
数据集与 bridge 都随仓库提供，第一次运行会自动安装 Python 依赖：

```bash
# 终端 C：以 Monday 为例（在仓库根目录）
uv run --project automationbench python bridge/world_bridge.py \
  --domain hr \
  --task hr.monday_onboarding_pipeline \
  --port 8765
```

启动成功：

```text
world bridge: hr.monday_onboarding_pipeline on http://127.0.0.1:8765
```

检查：

```bash
curl -s http://127.0.0.1:8765/health
```

#### 任务对应的 domain

| 任务 | `--domain` |
|---|---|
| `hr.monday_onboarding_pipeline` | `hr` |
| `finance.qb_invoice_from_orders` | `finance` |
| `finance.revenue_recognition` | `finance` |
| `finance.vendor_insurance_verification` | `finance` |
| `finance.payment_terms_tracking` | `finance` |
| `finance.invoice_email_extract` | `finance` |
| `hr.policy_update_distribution` | `hr` |
| `hr.zoom_orientation_sessions` | `hr` |
| `sales.overdue_followup_flag` | `sales` |
| `operations.space_utilization_analysis` | `operations` |
| `operations.mailchimp_ecommerce_sync` | `operations` |
| `support.zendesk_sf_case_sync` | `support` |

也可以看 `structures/<task>.json` 的 `meta.domain`。

切题/重跑/停止：

- 切题：`Ctrl+C` 停当前 bridge，再起新任务的 bridge；
- 重跑：bridge 是内存状态，重复点“运行”会继续写，可能重复建记录；重启 bridge 可回到干净状态；
- 端口占用：`fuser -k 8765/tcp`；
- 不要一个 bridge 跑两道题。

### 4. 平台点“运行”

打开对应任务的 URL，点“运行”，黑色面板显示：

```text
status: OK | score: 1 | assertions: 4/4
```

发票题约 100 秒（10 次模型调用），后端需要：

```text
OPENAI_BASE_URL
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-sol
```

密钥不写入仓库。平台 dev 代理已设 `proxyTimeout=300s`，不会 30 秒被截断。

### 5. 不走前端：直接跑结构

```bash
python3 harness/run_structure.py \
  --structure structures/hr.monday_onboarding_pipeline.json \
  --restart-bridge
```

该脚本要求后端在 `:39910`，并会自动起停 bridge（需要 AutomationBench 环境）。

## 代码在哪

- 后端：[rsi-data-spring-boot](rsi-data-spring-boot)
  - 解释器：`core-flow/.../Run/structure/`
  - 入口：`Run/code/FlowCodeRun.java`
  - 构建/运行：[README](rsi-data-spring-boot/README.md)
- 前端：[rsi-data-platform](rsi-data-platform)
  - 运行逻辑：`src/xpages/Login/index.tsx`
  - 结构→画布：`src/xpages/Login/test/buildTest.tsx`
  - 安装/运行：[README](rsi-data-platform/README.md)
- 画布库：[rsi-data-visual](rsi-data-visual)（未改源码）
- rsi-flow 引擎：[rsi-flow](rsi-flow)（未改源码）
- bridge：[bridge/world_bridge.py](bridge/world_bridge.py)
- 逐行代码走读：报告附录与本地文档（不随仓库提交）

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
- [x] 长序列：120 轮压力测试 + 41 行真实任务，见报告第 8 节
- [x] 消融 2 题 + 迁移 2 题 + 节点统计：报告第 7 节
- [x] 失败反馈与限制：报告第 9 节
- [x] LLM 生成契约：报告第 10 节
- [x] 报告 PDF：`reports/Round3-Loop-Structures-Report.pdf`
- [x] 提交仓库：https://github.com/H-wonder/rsi_dag_test

## 已知限制

- 真实嵌套循环任务、业务循环的 P4 重试、多次运行方差尚未覆盖；
- skill flow 目前只实现了 `fetch`，其余动作直连 bridge；
- 平台画布只能展示，节点参数还不能在线编辑；
- 发票题依赖模型，是本轮唯一有 LLM 调用的任务。
