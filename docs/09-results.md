# 10 题前后对照

> 2026-11-25。数据源：[results/before-after.csv](../results/before-after.csv)；
> 每题完整运行记录在 `results/<task>.json`。

## 汇总

| 指标 | 结果 |
|---|---|
| 修复任务数 | **10 / 10**（全部 `partial_credit = 1.0`） |
| 基线平均分 | 0.426 |
| 结构平均分 | **1.000** |
| 断言 | 56 / 56 通过 |
| 循环轮次合计 | 38 |
| 单题耗时 | 0.01–0.15s（不含 bridge 启动） |
| LLM 调用 | **0**（全部为确定性结构） |

## 逐题

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

## 观察

1. **失败集中在“覆盖”而不是“理解”**：0 分的题（Monday、QB、Payment Terms）
   都是“一条都没做/只做了一部分”，循环直接补齐。
2. **过滤条件决定正确性**：Revenue、Vendor、Mailchimp 的关键不是循环，而是
   “哪些不该做”（Cancelled、Inactive、refund/internal/opt-out）。
3. **分支比循环更常决定成败**：10 题里 5 题用 P5（条件路由），说明业务规则的分流
   是主要复杂度。
4. **不需要模型**：10 题全部用确定性 API + JEXL 完成，模型调用为 0；提升来自结构，
   不是模型能力。
5. **长序列可行**：41 行扫描、120 轮压力测试（见 08-long-sequence.md）。

## 口径与限制

- 基线是任务一 max-effort（`gpt-5.6-sol`）结果，同一初始状态；
- “修好”= 官方 `partial_credit = 1.0`；负向断言按官方口径排除；
- 业务规则由人写入结构（部分来自邮件/Slack 证据，如 Carol、2B-105、Pinnacle Net 20），
  这是“人工编排”的一部分，也是下一阶段 LLM 要生成的内容；
- 不是所有题都必须用循环；单条记录的任务循环退化为 1 次，结构仍然成立。
