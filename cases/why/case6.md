# Case 6: operations.space_utilization_analysis

## 输入
41 行房间表；只分析 Office、占用率低于 40% 的房间，排除 Conference/Renovation/executive/DECOMMISSIONED，2B-105 因新团队入驻要排除。

## 基线为什么失败
基线 0.60（3/5）：缺房间明细和未用座位总数。它没有扫全表，也没有算 `capacity - used`。

## 结构为什么这样排
`rows → filter → loop(算占用比例 → 算未使用座位 → 累加 → collect)`，最后写 Notion、发汇总邮件。
2B-105 的排除来自邮件证据，写进 `when`；累加器放在 `loop.state`，跨 41 行保留。

## 结果
1.0（5/5），扫描 41 行、3 间命中，总浪费 46.55。长表不漏项、状态不丢，是这题的核心。
