# Case 3: finance.revenue_recognition

## 输入
合同表，包含 Active、Cancelled、次月及以后开始的合同；任务只要求算 1 月的收入确认。

## 基线为什么失败
基线 0.75：多写了 CTR-003 一行，被负向断言抓住。它没有按合同状态和开始月份过滤。

## 结构为什么这样排
`fetch → rows → filter(Active & Start ≤ 2026-01) → loop(compute → append) → 汇总邮件`。
过滤只留下 1 月应确认的合同，循环里用 `compute` 算 `Total_Value / Term_Months_` 并累加，最后写表、发汇总。

## 结果
1.0（3/3），2 轮。结构不是越复杂越好：这题不需要二维嵌套，单层循环加过滤就能覆盖且不越界。
