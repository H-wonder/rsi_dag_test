# 12 条案例（10 主 + 2 备用）

本目录把本轮 12 题按“前端结构 / 后端 case / 运行结果 / 为什么这样编排”逐条拆开。
其中 1–10 是 10 条主任务，11–12 是备用题（Zendesk 同步、发票抽取）；备用题是额外验证，
不影响前 10 条主案例，但为了和仓库里的 12 题数据对上，也一并列出。

## 案例索引

| # | 任务 | 前端结构 | 后端 case | 运行结果 | 为什么 |
|---|---|---|---|---|---|
| 1 | `hr.monday_onboarding_pipeline` | [case1.json](frontend/case1.json) | [case1.json](backend/case1.json) | [result1.json](results/result1.json) | [case1.md](why/case1.md) |
| 2 | `finance.qb_invoice_from_orders` | [case2.json](frontend/case2.json) | [case2.json](backend/case2.json) | [result2.json](results/result2.json) | [case2.md](why/case2.md) |
| 3 | `finance.revenue_recognition` | [case3.json](frontend/case3.json) | [case3.json](backend/case3.json) | [result3.json](results/result3.json) | [case3.md](why/case3.md) |
| 4 | `hr.policy_update_distribution` | [case4.json](frontend/case4.json) | [case4.json](backend/case4.json) | [result4.json](results/result4.json) | [case4.md](why/case4.md) |
| 5 | `sales.overdue_followup_flag` | [case5.json](frontend/case5.json) | [case5.json](backend/case5.json) | [result5.json](results/result5.json) | [case5.md](why/case5.md) |
| 6 | `operations.space_utilization_analysis` | [case6.json](frontend/case6.json) | [case6.json](backend/case6.json) | [result6.json](results/result6.json) | [case6.md](why/case6.md) |
| 7 | `hr.zoom_orientation_sessions` | [case7.json](frontend/case7.json) | [case7.json](backend/case7.json) | [result7.json](results/result7.json) | [case7.md](why/case7.md) |
| 8 | `finance.vendor_insurance_verification` | [case8.json](frontend/case8.json) | [case8.json](backend/case8.json) | [result8.json](results/result8.json) | [case8.md](why/case8.md) |
| 9 | `operations.mailchimp_ecommerce_sync` | [case9.json](frontend/case9.json) | [case9.json](backend/case9.json) | [result9.json](results/result9.json) | [case9.md](why/case9.md) |
| 10 | `finance.payment_terms_tracking` | [case10.json](frontend/case10.json) | [case10.json](backend/case10.json) | [result10.json](results/result10.json) | [case10.md](why/case10.md) |
| 11 | `support.zendesk_sf_case_sync`（备用） | [case11.json](frontend/case11.json) | [case11.json](backend/case11.json) | [result11.json](results/result11.json) | [case11.md](why/case11.md) |
| 12 | `finance.invoice_email_extract`（备用） | [case12.json](frontend/case12.json) | [case12.json](backend/case12.json) | [result12.json](results/result12.json) | [case12.md](why/case12.md) |

## 四个目录分别是什么

- `frontend/caseN.json`：平台画布使用的结构 JSON（`meta/nodes/edges`）。
  点“运行”时前端 `getView` 把它还原成 `{meta,nodes,edges}` POST 给后端。
- `backend/caseN.json`：这道题的后端 case 数据，包含 `task/domain/prompt/tools/initial_state/assertions`。
  它对应 AutomationBench 的题目定义，bridge 用它初始化 WorldState 和评分。
- `results/resultN.json`：实际运行后的分数摘要（baseline、structure、assertions、轮次、status、llmCalls）。
  完整运行记录仍在 `../results/<task>.json`。
- `why/caseN.md`：这道题的输入、基线为什么失败、结构为什么这样排、结果为什么是 1.0。

## 结果汇总

12 条案例全部从基线失败达到 `partial_credit = 1.0`，合计 77/77 条计分断言：
10 条主任务 56/56，Zendesk 16/16，发票题 5/5。每条的具体分数看 `results/resultN.json`。

> 说明：仓库里的 `automationbench/` 是 bridge 依赖的完整包，里面还有其他任务定义；
> 它们不参与这 12 条案例，也不影响评分。`cases/` 是单独抽出的 12 条案例；
> 暂不裁剪数据集，避免改 bridge 后重新引入运行风险。
