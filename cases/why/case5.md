# Case 5: sales.overdue_followup_flag

## 输入
任务、账户、备注三张表；状态字段不可信，逾期要按工作日和 extension 备注判断。

## 基线为什么失败
基线 0.44（4/9）：3 个逾期任务和 2 封汇总邮件缺失。它只看了表面状态。

## 结构为什么这样排
`SOQL 取任务/账户/备注 → join → loop(businessdays → branch)`。
先 join 账户和备注，再用 `businessdays` 算超过 3 个工作日；Completed 必须有完成备注，带 extension 的豁免；命中后建 OVERDUE 任务并 `collect` 到 `state.summary`。

## 结果
1.0（9/9），7 轮。关键是“状态字段不可信”这条业务规则：不 join 备注就会漏 Apex/Solaris、误标 Stratos。
