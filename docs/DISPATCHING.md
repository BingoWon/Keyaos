# Keyaos — 调度撮合机制

## 为什么做这件事

AI API 的使用者面临一个现实问题：配额碎片化。

一个人手里可能同时持有 OpenRouter 的免费额度、DeepInfra 的试用余额、DeepSeek 的充值账户。每个账户的余额不同、支持的模型不同、价格不同。切换使用时需要手动更换 Base URL 和 API Key，无法自动选择最划算的那个。

Keyaos 的初心很简单：**把零散的 API 配额汇聚成一个统一入口，让系统自动帮你选最便宜的那条路。**

这不是一个推理引擎，不是一个模型聚合器。它是一个纯粹的**资源调度层**——接收请求、选择最优上游、透传流式响应、记录消耗。

## 核心数据模型

| 概念 | 对应 | 说明 |
|------|------|------|
| 模型定价 | `model_pricing` 表 | 各供应商对各模型的实时定价（每百万 token 多少钱） |
| 上游凭证 | `upstream_credentials` 表 | 用户托管的上游凭证（含 secret 字段）及其剩余配额 |
| 交易流水 | `ledger` 表 | 每次请求的 token 消耗和费用扣减（含 `credential_id` 关联） |
| 调度引擎 | `dispatcher.ts` | 接收需求，在定价和上游凭证之间找到最优路径 |

调度的本质是：**在已知定价和已有上游凭证之间，找到成本最低的路径。**

## 撮合机制全流程

一个用户请求从进入到完成，经历六个阶段：

### 阶段一：定价同步

**触发方式**：Cloudflare Cron Triggers，每 5 分钟执行一次。

同步采用 **OpenRouter-First 两阶段策略**（详见 [ADR-013](decisions/013-openrouter-first.md)）：

**Phase 1 — 同步 OpenRouter（canonical catalog）**：首先同步 OpenRouter 的模型列表，写入 `model_pricing` 表并保存 API 返回的**数组索引**作为 `sort_order`（0 = 最热门）。同时构建 `allowedModelIds` 白名单集合。如果 OpenRouter 返回 0 个模型（API 故障），整个同步中止，保护现有数据。

**Phase 2 — 同步其他供应商**：并行请求所有非 OpenRouter 供应商的模型列表 API，但只保留 `model_id` 存在于 `allowedModelIds` 白名单中的模型。白名单外的模型直接丢弃，不写入数据库。

关键设计决策：
- **OpenRouter 为唯一模型目录基准**：系统只提供 OpenRouter 认可的模型。其他供应商的独有模型不会进入数据库，也不会出现在前端或路由候选中。
- **model_id 统一小写**：DeepInfra 等供应商返回 HuggingFace 风格大写 ID（如 `Qwen/Qwen3-Max`），在解析阶段统一转为小写（`qwen/qwen3-max`），与 OpenRouter 的规范格式对齐。
- **价格统一为 USD cents / 百万 tokens**，消除供应商间的价格格式差异（有的返回 USD/token 字符串，有的返回 USD/M 数字，有的是 CNY）。
- **`sort_order` 排序**：所有模型列表查询 `ORDER BY sort_order ASC`，保持 OpenRouter 基于热度、使用量、评分的权威排序。前端不再自行排序。
- **`deactivateMissing` 机制**：每次刷新后，本次未出现的模型被标记为 `is_active=0`，确保已下架的模型不会被路由到。比对使用精确的 ID 集合，而非时间窗口。

### 阶段二：调度撮合（Dispatcher）

当用户请求到达 `POST /v1/chat/completions`，Dispatcher 执行以下步骤：

**Step 0 — Provider 过滤（可选）**：如果请求 body 中包含 `provider` 字段（`string | string[]`），则只保留指定供应商的候选。省略该字段时全部供应商参与调度。

```json
{ "model": "openai/gpt-5.2-codex", "provider": "codex" }
{ "model": "openai/gpt-5.2-codex", "provider": ["codex", "oaipro"] }
```

**Step 1 — 查定价**：在 `model_pricing` 表中查找 `upstream_id = 用户请求的 model` 且 `is_active = 1` 的所有记录，按 `input_price ASC` 排序。如果 Step 0 指定了供应商，则跳过不在列表中的定价记录。

这一步回答：**哪些供应商有这个模型，基础价格各是多少？**

**Step 2 — 查上游凭证**：对每个有此模型的供应商，在 `upstream_credentials` 表中查找该用户拥有的、已启用的、非 dead 的 upstream credentials。排序逻辑：`ORDER BY price_multiplier ASC, COALESCE(quota, 9999999) DESC`——订阅型供应商的 `quota` 可为 NULL，此时视为无限额度参与排序。

这一步回答：**对于每个供应商，用户有哪些可用的 credential，哪个最划算？**

**Step 3 — 计算有效成本**：对每个 (供应商定价, credential) 组合，计算：

```
有效成本 = 供应商基础价格 × 该 credential 的 price_multiplier
```

**Step 4 — 全局排序**：将所有候选按有效成本升序排列。

这是关键：不是"先选最便宜的供应商，再在其中选 credential"，而是**跨供应商全局比较有效成本**。一个贵供应商上的低 multiplier credential 可能比一个便宜供应商上的高 multiplier credential 更划算。

**输出**：一个按有效成本排序的候选队列。

### 阶段三：故障转移（Retry）

拿到候选队列后，系统按顺序逐个尝试：

1. 向上游发起请求
2. 如果上游返回非 2xx（如 429 限流、402 余额不足）→ 标记该 credential 的健康状态 → 跳到下一个候选
3. 如果网络层异常（超时、连接拒绝）→ 同上
4. 如果上游返回 2xx → 成功，进入响应透传阶段
5. 如果所有候选都失败 → 返回 503 给客户端

这意味着：**只要你的 upstream credentials 池里还有任何一个能用的 credential，用户请求就不会失败。** 系统会自动跳过失效的 credential，找到能工作的那个。

### 阶段四：零延迟透传

上游返回 2xx 后，系统需要同时做两件事：
1. 把响应流送给客户端（不能有任何延迟）
2. 从响应流中提取 usage 信息（用于计费）

解决方案：**`Response.body.tee()`**。

将上游的 ReadableStream 一分为二：
- 一路直接返回给客户端 → 零延迟
- 另一路在后台异步解析 SSE 帧，提取最后一帧中的 `usage` 对象

对于非流式 JSON 响应，使用 `response.clone().json()` 异步解析。

客户端感知不到任何额外延迟。

### 阶段五：计费清算

从 usage 中提取到 token 消耗后，计费采用**双轨策略**：

| 情况 | 计费方式 | 适用供应商 |
|------|---------|-----------|
| 上游返回了真实费用 | 直接采用 `usage.cost` 或 `usage.estimated_cost` | OpenRouter, DeepInfra |
| 上游只返回 token 数 | `(tokens / 1M) × 报价单价` 自行计算 | ZenMux, DeepSeek, Gemini CLI |

计费结果写入两个地方：
- `usage` 表：完整交易记录（谁、用了什么模型、花了多少，通过 `credential_id` 关联上游凭证）。同时记录 `price_multiplier`，为价格走势分析提供原始数据。
- `upstream_credentials.quota`：扣减对应 credential 的剩余额度（订阅型供应商 `quota` 可为 NULL，此类凭证不做额度扣减）

每 5 分钟，Cron 自动将 usage 数据聚合为 K 线蜡烛（OHLC），供前端价格走势图使用。详见 [PRICE_ANALYTICS.md](../docs/PRICE_ANALYTICS.md)。

当 quota 降至 0，该 upstream credential 自动标记为 `health_status = 'dead'`，后续调度不再选择它。

整个计费过程通过 `waitUntil()` 异步执行，不阻塞客户端响应。

**Auto Top-Up 触发**：Platform 模式下，扣费完成后如果消费者余额低于其配置的阈值，系统会实时触发自动充值（使用保存的支付方式发起 off-session PaymentIntent）。Cron 每 5 分钟扫描所有低余额用户作为兜底。`claimTrigger()` 通过原子 UPDATE 实现 5 分钟冷却窗口，防止并发重复扣款。

### 阶段六：健康感知

每个 upstream credential 有四种健康状态：

```
unknown → ok → degraded → dead
```

状态转移规则：
- **请求成功且流完整传输** → `ok`（不是拿到 200 就标记，而是流结束后才确认）
- **上游返回 5xx / 429 等临时错误** → `degraded`（仍参与调度，但排在 ok 后面）
- **上游返回 401 / 402 / 403** → `dead`（credential 失效或余额耗尽，排除出候选池）
- **quota 降至 0** → `dead`

`dead` 状态的 upstream credential 被彻底排除出调度候选。对于 `auto` 类型的 credential（如 OpenRouter），Cron 会每 5 分钟重新查询上游余额，如果用户在上游充值了，quota 会自动恢复，但 health_status 的恢复需要下一次成功请求来触发。

## `price_multiplier` 的语义

每个 upstream credential 有一个 `price_multiplier`（默认 1.0）。它的作用：

1. **调度权重**：有效成本 = 基础价格 × multiplier。multiplier 越低，越优先被选中。
2. **自主计费比例**：当上游不返回费用时，token 计费也乘以 multiplier。

使用场景：
- 某个 credential 有折扣（如 OpenRouter 的 credit bonus）→ 设 `price_multiplier = 0.8`，让它被优先选中
- 某个 credential 想降低优先级但不禁用 → 设 `price_multiplier = 2.0`，只在其他 credential 不可用时才使用
- 未来平台模式下，供给方可通过 multiplier 表达自己的定价意愿

## 设计原则

**数据驱动，非配置驱动**：模型目录和价格不是手动配置的，而是由 Cron 从上游实时同步。系统始终基于最新数据做决策。

**零延迟优先**：用户感知的延迟 = 上游延迟。系统不在热路径上做任何额外处理（计费、健康上报全部异步）。

**故障隔离**：单个 credential 失效不影响整体服务；单个供应商 API 超时不影响其他供应商的刷新；计费写入失败不影响响应交付。

**渐进式演进**：当前是单用户聚合自己的 credentials（core 模式）。数据模型已经内置了 `owner_id` 和 `price_multiplier`，为未来的多租户市场化预留了完整的语义空间——从"个人 credential 池"到"公开算力市场"，不需要重建数据模型，只需要开放访问边界。
