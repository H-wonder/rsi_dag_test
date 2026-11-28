# Case 2: finance.qb_invoice_from_orders

## 输入
4 张订单，其中 3 张 Delivered、1 张 Returned；要给 Delivered 订单在 QuickBooks 建发票并给客户发邮件。

## 基线为什么失败
基线 0/5：没有建出发票，也没有发邮件。它没有把“逐单处理”跑完。

## 结构为什么这样排
`fetch → rows → filter(Delivered) → loop(invoice → encode → send)`。
先过滤掉 Returned 的 Meridian（负向断言要求不能给它开票），再对 3 张 Delivered 订单循环建发票、编码邮件、发送。

## 结果
1.0（5/5），3 轮。消融只处理第一条时只有 0.4（2/5），说明分数提升主要来自循环覆盖，而不是别的改动。
