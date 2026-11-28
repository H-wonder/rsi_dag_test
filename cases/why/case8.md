# Case 8: finance.vendor_insurance_verification

## 输入
保险证书表；只处理 Active 供应商；过期改 Non-Compliant，30 天内到期提醒。

## 基线为什么失败
基线 0.83（5/6）：状态列或邮件不完整。它没有把过期/将到期/正常三类都处理对。

## 结构为什么这样排
`filter(Active) → loop(datediff → branch)`：
`days < 0` → 改 Non-Compliant + 通知；`0 ≤ days ≤ 30` → 提醒；其余不动作；最后汇总邮件 + Slack。
改状态用 `PUT Certificates!E{_row}`，`rows` 节点写入的 `_row` 保证改到原行。

## 结果
1.0（6/6），4 轮。分支不是越多越好，而是把“过期/预警/正常”三种业务后果分开。
