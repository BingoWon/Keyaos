# Spec: 定价撮合系统

> **⚠️ SUPERSEDED** — 本文档描述的是项目早期设计愿景。当前实现请参阅 [DISPATCHING.md](../DISPATCHING.md)、[ADR-013](../decisions/013-openrouter-first.md) 和 `worker/core/dispatcher.ts` 源码。

## 概述

Keyaos 的定价系统允许 Key 分享者和使用者各自设定价格偏好，平台自动撮合匹配。

## 定价基准

每个 AI 模型有一个**市场参考价**（以 USD/1M tokens 为单位），由平台维护。这个价格参考各上游平台的官方定价。

所有用户设定的价格比率都是相对于这个市场参考价的。

## 分享者定价

分享者为自己的 Key 设定一个 `price_ratio`：

- `price_ratio = 0.5` → 以市场价 50% 出售
- `price_ratio = 0.8` → 以市场价 80% 出售
- `price_ratio = 0.0` → 免费分享
- `price_ratio = 1.0` → 原价

分享者可以随时调整价格。

## 使用者价格偏好

使用者设定一个 `max_price_ratio`：

- `max_price_ratio = 0.75` → 只愿意使用市场价 75% 以内的 Key
- `max_price_ratio = 1.0` → 接受任何价格（含原价兜底）

## 撮合逻辑

当一个 API 请求到来时，Key 调度器（Durable Object）执行以下步骤：

1. 根据请求的模型名 → 筛选支持该模型的所有活跃 Key
2. 过滤：
   - Key 未过期且健康
   - Key 预估余额足够
   - 分享者 price_ratio ≤ 使用者 max_price_ratio
3. 排序：price_ratio ASC → 余额 DESC → 最近使用时间 ASC
4. 从 Top-N 候选中选择一个（P2C 随机或直接 Top-1）
5. 预扣费
6. 若无匹配 Key → 使用兜底 Key（原价，price_ratio = 1.0）

## 费用计算

实际费用在请求完成后由 Queue 消费者计算：

```
actual_tokens = input_tokens + output_tokens（来自上游 usage 字段）
market_price = 市场参考价 × actual_tokens
actual_cost = market_price × price_ratio（分享者设定）
platform_fee = actual_cost × fee_percentage（平台服务费率）
owner_income = actual_cost - platform_fee
```

预扣与实际的差额在异步记账时修正。

## 兜底场景

使用兜底 Key 时：
- 按市场原价计费（price_ratio = 1.0）
- 平台不收取服务费（platform_fee = 0）
- 不产生分享者收入

## 价格透明

使用者在 Dashboard 中可以看到：
- 每次请求实际支付的价格
- 使用的是分享 Key 还是兜底 Key
- 省了多少钱（相比市场原价）
