# 长序列验证：120 轮循环与 41 行真实数据

> 2026-11-25。目标：证明循环能跑完长序列，且状态不随轮数丢失。

## 1. 合成压力测试：120 项

结构：[structures/stress.loop.120.json](../structures/stress.loop.120.json)

```json
{
  "type": "loop",
  "items": "items",              // meta.vars 里 0..119
  "itemVar": "n",
  "maxIterations": 200,
  "state": { "sum": 0 },
  "checkpoint": { "every": 5, "keep": 20 }
}
```

实测（后端 `:39910`）：

| 指标 | 结果 |
|---|---|
| iterations | **120** |
| succeeded / failed | 120 / 0 |
| perIteration 条数 | 120（完整） |
| checkpoints | **20**（24 个生成，保留最后 20 个，i=20..115） |
| 耗时 | 0.12s |

说明：每轮日志完整保留；checkpoint 是环形缓冲，内存不随轮数增长。

## 2. 真实任务：41 行房间数据

任务：`operations.space_utilization_analysis`
结构：[structures/operations.space_utilization_analysis.json](../structures/operations.space_utilization_analysis.json)

```text
读取 41 行房间
  → 过滤 Office / <40% / 非 Renovation / 非 executive / 非 DECOMMISSIONED / 非 2B-105
  → 循环 3 间
       ├─ 算占用比例
       ├─ 算未使用座位
       └─ 累加到 state.total，并记录摘要
  → 创建 Notion 报告
  → 邮件发送 3 个房间 + 总浪费 46
```

结果：基线 0.6 → **1.0**（5/5），3 轮，`state.total = 46.55`，
邮件正文含 `3A-102 / 4B-201 / 5C-301 / 46`。

这一步同时验证了：

- **扫描长列表**（41 行）不会漏项；
- **循环状态**跨轮累积（`total`）；
- **汇总**从 state 取出，不依赖 LLM 上下文。

## 3. 状态放在哪里

| 内容 | 位置 | 生命周期 |
|---|---|---|
| 当前项 / 索引 | 循环帧 `loop.index/current` | 单轮 |
| 累加器 | `loop.state` | 整个循环 |
| 每轮日志 | `perIteration` | 运行结束写入结果 |
| 快照 | `checkpoints`（环形） | 最近 K 条 |
| 最终结果 | `loop.<id>.results/state` | 下游节点可读 |

LLM 不参与这些任务，所以“上下文窗口”不是瓶颈；状态在解释器作用域，
即使以后接入 LLM，每轮也只需要当前项 + 摘要。

## 4. 限制

- 120 项是合成数据，不是 benchmark 任务；
- 真实任务最大 41 行（space）和 25 个账户（vendor audit）；
- `resume` 未实现（设计取舍，见 01-loop-design 第 6 节）。
