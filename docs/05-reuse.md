# 方法复用：消融、迁移与节点统计

> 2026-11-25。回答两个问题：
> 1. 提升是不是**循环结构**带来的？
> 2. 同一套节点/模式能不能**迁移到没做过的新题**？

## 1. 消融：去掉循环会怎样

做法：同一任务、同一初始状态，把循环换成“只处理第一条”的顺序结构
（`first` 节点，处理 1 条记录）。

| 任务 | 完整结构 | 消融（只处理第一条） | 差值 |
|---|---|---|---|
| `finance.qb_invoice_from_orders` | **1.0**（5/5） | **0.4**（2/5） | −0.60 |
| `operations.mailchimp_ecommerce_sync` | **1.0**（7/7） | **0.286**（2/7） | −0.714 |

结构：

- [ablation.qb_invoice_from_orders.json](../structures/ablation.qb_invoice_from_orders.json)
- [ablation.mailchimp_ecommerce_sync.json](../structures/ablation.mailchimp_ecommerce_sync.json)

结论：**覆盖率是这两题的主要失败原因**；不是模型理解问题，而是“只做了第一条”。
循环把覆盖率从 1/N 提到 N/N。

## 2. 迁移：没做过的新题，只换参数

约束：

- 从 40 个失败里选 2 道**没有参与设计**的题；
- 只允许使用已有节点类型；
- 不允许新增节点、不允许改解释器。

| 迁移题 | 基线 | 迁移结构 | 断言 | 轮次 | 新增节点类型 |
|---|---|---|---|---|---|
| `support.zoho_multitenant_isolation` | 0.75 | **1.0** | 16/16 | 3 | **0** |
| `marketing.analyst_mention_tracking` | 0.917 | **1.0** | 12/12 | 8 | **0** |

结构：

- [transfer.zoho_multitenant_isolation.json](../structures/transfer.zoho_multitenant_isolation.json)
  —— 复用 `fetch/rows/join/filter/loop/append/comment`，把 ticket 实际账户与映射表期望账户对比；
- [transfer.analyst_mention_tracking.json](../structures/transfer.analyst_mention_tracking.json)
  —— 复用 `fetch/rows/loop/datediff/branch/collect/encode`，按 Tier、30 天窗口、
  Everest 特例、embargo/非官方备注过滤后汇总。

结论：**两个迁移题都一次通过，且没有新增节点类型**。方法（模式 + 节点 + 参数）
可以复用到同数据集的新问题。

## 3. 节点使用统计

统计范围：10 个主任务（不含消融/迁移/压力测试）。

| 节点类型 | 任务数 | 占比 |
|---|---|---|
| `action` | 10 | 100% |
| `fetch` | 10 | 100% |
| `loop` | 10 | 100% |
| `rows` | 9 | 90% |
| `encode` | 8 | 80% |
| `filter` | 8 | 80% |
| `branch` | 5 | 50% |
| `collect` | 4 | 40% |
| `compute` | 2 | 20% |
| `datediff` | 2 | 20% |
| `join` | 2 | 20% |
| `businessdays` | 1 | 10% |

合计 108 个节点实例，12 种类型。

- **复用率**（≥2 题使用）：11/12 = **92%**；
- 唯一单题节点：`businessdays`（工作日计算），属于**控制原语**，参数无法表达，
  符合 02 的准入规则。

## 4. 结论

1. **循环是决定性的**：消融后两道题分别掉到 0.4 / 0.286；
2. **模式可迁移**：2 道 held-out 题、0 新增节点、全部 1.0；
3. **节点库没有膨胀**：108 个实例只用了 12 种类型，92% 被多题复用；
4. **单题逻辑在参数里**：阈值、排除规则、模板、字段名都写在 `when`/`args`，不是新节点。

## 5. 局限

- 迁移题只有 2 道，样本小；
- 人工仍需读题、写规则（例如 Everest 特例、2B-105 邮件证据）；
- 这两道迁移题恰好都能用现有节点解决；遇到需要 LLM 抽取的题（如发票邮件），
  仍需补 `extract`/`classify` 节点。
