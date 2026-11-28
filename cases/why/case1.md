# Case 1: hr.monday_onboarding_pipeline

## 输入
1 张新员工表，包含 Contractor 和备注延期的人；任务要求给每位符合条件的新人建 Monday item，状态 Not Started。

## 基线为什么失败
基线 0/4：一条 item 都没建。不是理解错，而是没有把每个人逐条落实。

## 结构为什么这样排
`fetch → rows → filter(Full-time & Notes 为空) → loop(create)`。
先用 `filter` 排除 Contractor（Mei-Ling）和备注延期（Derek），再让 `loop` 对剩下的 2 人各执行一次 `create`。如果写成顺序结构，就只能建第一个人；如果让 LLM 决定“建几个”，不可复现。

## 结果
1.0（4/4），2 轮。循环负责覆盖，过滤负责“不建不该建的”。
