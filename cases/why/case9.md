# Case 9: operations.mailchimp_ecommerce_sync

## 输入
订单表 + opt-out 表；7 天窗口；排除 refund/cancel/chargeback/internal/opt-out；按首购/复购/高价值打标签。

## 基线为什么失败
基线 0.71（5/7）：标签和 Slack 文案缺失。它没有把过滤、会员添加和标签分支串起来。

## 结构为什么这样排
`orders join optout → loop(datediff → branch)`：
先 join 标记 opt-out，再用 `datediff` 过滤 7 天窗口和内部/退款备注；命中后加 member，再按 `Order_Count` 和 `Order_Total` 分流打 new/repeat+vip/high 标签。

## 结果
1.0（7/7），7 轮。消融只处理第一个买家时只有 0.286（2/7），说明循环覆盖和过滤共同决定分数。
