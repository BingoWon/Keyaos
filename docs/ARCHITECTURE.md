# Keyaos — 技术架构

## 项目定位

Keyaos 是一个开源的 AI API 网关引擎。用户添加自己的上游 API Key，系统自动路由到最便宜的供应商完成请求。

项目分为两层：

- **core（当前实现）**：个人自部署模式，单用户，通过 `ADMIN_TOKEN` 认证
- **platform（未来计划）**：多用户平台模式，注册登录、充值、Marketplace

依赖方向：platform → core（单向）。core 永远不依赖 platform。

## 基础设施

完全构建于 Cloudflare 生态：

| 组件 | 服务 | 用途 |
|------|------|------|
| 计算 | Workers | API 网关、请求路由、流式代理 |
| 数据库 | D1 (SQLite) | 用户、Key 池、模型目录、交易记录 |
| 定时任务 | Cron Triggers | 每 5 分钟自动同步供应商模型和价格 |

## 核心设计

### 三个支柱

1. **数据驱动的模型目录** — `models` 表由 Cron 每 5 分钟自动同步，系统始终知道哪些模型可用、价格多少
2. **全局最优路由** — Dispatcher 按 `上游成本 × 折扣率` 排序，永远选最便宜的 provider+key 组合
3. **双模式计费** — 优先用上游返回的真实费用（OpenRouter/DeepInfra），否则自行计算（ZenMux）

### 请求流

```
用户请求 (POST /v1/chat/completions)
    │
    ├── 1. 认证：验证下游 API Key 或 ADMIN_TOKEN
    ├── 2. 市场报价获取：查 market_quotes 表 → 哪些供应商有此模型及价格
    ├── 3. Quota Listing 选择：查 quota_listings 表 → 按 (input_price × price_ratio) 排序
    │       ├── 过滤：is_enabled=1, health_status≠dead
    │       ├── 解密上游凭证
    │       └── 失败自动重试下一个组合
    ├── 4. 请求转发：向上游平台发起请求
    ├── 5. 响应透传：SSE 流式 tee() 零延迟透传
    └── 6. 异步计费：waitUntil 提取 usage + cost → 写入 ledger
```

### 计费模型

| 上游 | 计费方式 | 说明 |
|------|---------|------|
| OpenRouter | `usage.cost` | 上游直接返回真实 USD 费用 |
| DeepInfra | `usage.estimated_cost` | 上游返回估算 USD 费用 |
| ZenMux | tokens × models 表单价 | 上游不返回费用，需自行计算 |

费用分配：`用户支付 = 上游成本 × price_ratio + 平台费`

### 代码分层

```
worker/
├── index.ts               入口 + Cron scheduled + requireAuth()
├── core/
├── core/                  # 核心网关与调度逻辑
│   ├── dispatcher.ts       全局最优 Key 选择
│   ├── billing.ts          用量记录 + credits 扣减
│   └── utils/
│       └── stream.ts       SSE 流拦截 + usage 提取
├── db/                    # DAO (QuotasDao, MarketDao, LedgerDao)
│   ├── schema.ts           3 个 DB 类型定义
│   ├── quotas-dao.ts       配额池 CRUD + 健康管理 + 统计
│   ├── market-dao.ts       市场报价 UPSERT + 查询
│   └── ledger-dao.ts       用量与账本记录
├── refresh/
│   └── refresh-service.ts Cron 定时刷新与拉取逻辑
├── providers/             # 统一供应商接口 (OpenRouterAdapter 等)
│   ├── interface.ts        ProviderAdapter 接口
│   ├── openai-compatible.ts  统一适配器
│   └── registry.ts        供应商注册表
├── routes/
│   ├── chat.ts             POST /v1/chat/completions
│   ├── market.ts           # 获取可用市场报价 (基于本地缓存)
│   ├── quotas.ts           # 增删改查上游配额
│   └── system.ts           # 统计信息，手动刷新接口 + 供应商列表 (/api/)
└── shared/
    └── errors.ts           统一错误类型
```

## 数据库设计（D1）

### quota_listings

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 配额 ID |
| provider | TEXT | openrouter / zenmux / deepinfra |
| api_key | TEXT UNIQUE | 上游 API Key |
| quota | REAL | 剩余配额容量 |
| quota_source | TEXT | `auto` / `manual` |
| is_enabled | INTEGER | 是否启用 |
| health_status | TEXT | ok / degraded / dead / unknown |
| last_health_check | INTEGER | 上次健康检查时间 |
| price_multiplier | REAL | 定价比例系数 |
| added_at | INTEGER | 添加时间 |


### Quota 机制

每个配额凭证维护一个 `quota` 余额，分两种来源：

| Provider | Quota 来源 | 添加 Key 时 | 手动调整？ |
|----------|:----------:|-----------|:---------:|
| OpenRouter | `auto` | 调 `/credits` 获取 `total_credits - total_usage` | ❌ 禁止 |
| ZenMux | `manual` | 用户在请求中提供初始 `quota` | ✅ 允许 |
| DeepInfra | `manual` | 用户在请求中提供初始 `quota` | ✅ 允许 |

**每次请求后**，`billing.ts` 自动依据上游消费将 `credits_used` 从配额记录的 `quota` 中扣除。
当 quota 降至 0 时，健康状态会被标记（如 health_status=dead）。

**配额网络策略**：优先调用 `price_multiplier` 乘算后性价比最高且正常运作的配额节点。

### market_quotes

供应商模型价格表，由 Cron 每 5 分钟自动同步维护。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `provider:upstream_id` |
| provider | TEXT | openrouter / zenmux / deepinfra |
| upstream_id | TEXT | 上游模型 ID |
| display_name | TEXT | 人类可读名称 |
| input_price | REAL | 输入价格（/ 百万 tokens） |
| output_price | REAL | 输出价格（/ 百万 tokens） |
| context_length | INTEGER | 最大上下文长度 |
| is_active | INTEGER | 是否可用 |
| refreshed_at | INTEGER | 最后刷新时间 |

### ledger

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 账单流 ID |
| listing_id | TEXT | 使用的上游配额 ID |
| provider | TEXT | 上游平台 |
| model | TEXT | 模型名 |
| input_tokens | INTEGER | 输入 token 数 |
| output_tokens | INTEGER | 输出 token 数 |
| credits_used | REAL | 平台扣费点数额度 (Credits) |
| created_at | INTEGER | 产生时间 |

## API 路由

所有路由（除 `/health`）均需 `Authorization: Bearer <ADMIN_TOKEN>`。

### OpenAI 兼容 API

| 路由 | 方法 | 说明 |
|------|------|------|
| /v1/chat/completions | POST | 聊天补全 |
| /v1/models | GET | 可用模型列表（从 D1 提供） |

### 管理 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/quotas` | POST, GET, DELETE | 配额池管理 |
| `/api/market` | GET | `market_quotes` 表只读查询 (用于面板展示) |
| `/refresh` | POST | 手动触发模型与余额刷新 |
| /pool/stats | GET | Key 池统计 |
| /providers | GET | 已集成供应商列表 |
| /health | GET | 健康检查（公开） |

## 上游平台

当前已集成（2026-02-20 验证）：

| 平台 | 端点 | 返回费用？ | 定价结构 |
|------|------|:---------:|---------|
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ `usage.cost` | 字符串, USD/token |
| ZenMux | `https://zenmux.ai/api/v1` | ❌ 仅 tokens | 数组+条件, USD/M tokens |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | ✅ `usage.estimated_cost` | 数字, USD/M tokens |

所有三家均为 OpenAI Compatible，共享同一个 `OpenAICompatibleAdapter`。

## 安全

- **Key 存储**：API Key 明文存于 D1（D1 提供静态加密），无应用层加密
- **认证**：`/api/*` 和 `/v1/*` 路由需 `ADMIN_TOKEN` Bearer 认证
- **防重复**：`api_key` 列有 UNIQUE 索引，防止同一 Key 被重复添加
- **HTTPS**：Cloudflare 默认提供

## Platform 演进路线图 (Roadmap)

`platform` 是基于 `core` 之上演进出的多租户算力流动性市场。核心原则依然是 **由外向内依赖**（`platform` 依赖中间件调用 `core` 进行通信，而 `core` 保持独立纯净的系统定义）。

未来平台化能力将遵循以下四大方向依次建设：

### 方向一：身份鉴权与租户隔离体系 (Identity & Multi-tenancy)
引入底层核心的多租户隔离。
- 引入用户资源表 (`users` / `organizations`)。
- 集成具备会话管理的无状态 Auth 方案（如 Clerk、Supabase Auth 或 GitHub OAuth）。
- 扩展 D1 Schema，使得 `quota_listings`、`api_keys`、`ledger` 等全局大表具备 `owner_id` ，防止租户间数据越权。

### 方向二：中心化账户与支付网关 (Billing & Ledger System)
从当前的本地抵扣演练场跨越至真金白银的双线记账。
- 建立法币/平台币（Credits）的高一致性钱包余额表。
- 接入 Stripe 等支付渠道，支持终端用户兑换系统 Credits 额度。
- 设计防透支与结算锁定机制，通过 `ledger` 流水严格对账资金拨交流向。

### 方向三：撮合引擎与公开市场 (Marketplace Engine)
建立算力资源的“深度”与“流动性”。
- 允许 Supplier 勾选 `is_public`，从而将自己的私人 `quota_listings` 推送至公开交易池。
- 进化 Dispatcher 寻找最短成本路径的核心路由算法（Bid vs Ask 撮合）。
- 构建智能合约形态的跨账户资金结算逻辑（需求方抵扣余额，供给方即时挂账）。

### 方向四：平台前端架构扩充 (Frontend Applications)
- **Landing Page**: 面向消费者的 SEO 官网引擎，科普算力聚合理念。
- **User Console**: 即目前极简 Dashboard 的企业增强版，增加用户财务看板和授权链路管理。
- **Admin System**: 平台自身运管的超管后台，监测异常请求和僵尸（Dead）配额。
