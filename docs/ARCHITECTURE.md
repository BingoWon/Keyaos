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
| 定时任务 | Cron Triggers | 定时自动同步供应商模型和价格 |

## 核心设计

### 三个支柱

1. **数据驱动的模型目录** — `model_pricing` 表由 Cron 自动同步，系统始终知道哪些模型可用、价格多少
2. **全局最优路由** — Dispatcher 按 `上游成本 × price_multiplier` 排序，永远选最便宜的 provider+key 组合
3. **双模式计费** — 优先用上游返回的真实费用（OpenRouter/DeepInfra），否则自行计算（ZenMux）

### 请求流

```
用户请求 (POST /v1/chat/completions)
    │
    ├── 1. 认证：验证下游 API Key 或 ADMIN_TOKEN
    ├── 2. 定价查询：查 model_pricing 表 → 哪些供应商有此模型及价格
    ├── 3. 凭证选择：查 upstream_credentials 表 → 按 (input_price × price_multiplier) 排序
    │       ├── 过滤：is_enabled=1, health_status≠dead
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
| ZenMux | tokens × model_pricing 表单价 | 上游不返回费用，需自行计算 |

| Gemini CLI | tokens × model_pricing 表单价 | 订阅制无余额概念，使用影子定价 |
| Google AI Studio | tokens × model_pricing 表单价 | 无余额 API，需手动设 quota |

费用分配：`用户支付 = 上游成本 × price_multiplier`

### 代码分层

```
worker/
├── index.ts               入口 + Cron scheduled + 认证中间件
├── core/
│   ├── dispatcher.ts       全局最优 Key 选择
│   ├── billing.ts          用量记录 + credits 扣减
│   └── utils/
│       └── stream.ts       SSE 流拦截 + usage 提取
├── db/                    # DAO (CredentialsDao, PricingDao, LedgerDao)
│   ├── schema.ts           DB 类型定义
│   ├── credentials-dao.ts  上游凭证 CRUD + 健康管理 + 统计
│   ├── pricing-dao.ts      模型定价 UPSERT + 查询
│   └── ledger-dao.ts       用量与流水记录
├── models/                # 静态模型定义（无 API 的供应商）
│   ├── deepseek.json       DeepSeek 模型与 CNY 定价
│   ├── gemini-cli.json     Gemini CLI 模型与 USD 影子定价
│   └── google-ai-studio.json  Google AI Studio 模型与 USD 定价
├── sync/
│   └── sync-service.ts     Cron 定时同步模型与余额
├── protocols/             # 可复用协议转换层
│   └── gemini-native.ts    OpenAI ↔ Google v1internal 双向转换
├── providers/             # 统一供应商接口
│   ├── interface.ts        ProviderAdapter 接口
│   ├── openai-compatible.ts  OpenAI 兼容适配器
│   ├── gemini-cli-adapter.ts  Gemini CLI (OAuth + 协议转换)
│   └── registry.ts        供应商注册表（引用 models/*.json）
├── platform/              # Platform-only（core 不依赖）
│   ├── billing/
│   │   ├── wallet-dao.ts   用户钱包余额
│   │   ├── payments-dao.ts 充值记录
│   │   └── stripe.ts       Stripe Checkout + Webhook 签名验证
│   └── routes/
│       └── billing.ts      /api/billing/* + /api/webhooks/stripe
├── routes/
│   ├── chat.ts             POST /v1/chat/completions
│   ├── models.ts           获取可用模型定价
│   ├── credentials.ts      上游凭证增删改查
│   └── system.ts           统计信息 + 供应商列表
└── shared/
    └── errors.ts           统一错误类型
```

## 数据库设计（D1）

### upstream_credentials

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 凭证 ID (cred_xxx) |
| provider | TEXT | openrouter / zenmux / deepinfra |
| secret | TEXT UNIQUE | 上游 API Key 或 OAuth token |
| auth_type | TEXT | `api_key` / `oauth` |
| metadata | TEXT | JSON，扩展元数据 |
| quota | REAL NULL | 剩余配额（NULL 表示订阅制供应商无余额概念） |
| quota_source | TEXT NULL | `auto` / `manual`（NULL 表示无 quota） |
| is_enabled | INTEGER | 是否启用 |
| health_status | TEXT | ok / degraded / dead / unknown |
| last_health_check | INTEGER | 上次健康检查时间 |
| price_multiplier | REAL | 定价乘数 |
| added_at | INTEGER | 添加时间 |

### Quota 机制

每个上游凭证可维护一个 `quota` 余额。`quota` 和 `quota_source` 允许为 NULL：**订阅制供应商**（如按月付费的 API）无余额概念，设为 NULL 即可，调度时不受 quota 限制。

对于有余额概念的凭证，分两种来源：

| Provider | Quota 来源 | 添加凭证时 | 手动调整？ |
|----------|:----------:|-----------|:---------:|
| OpenRouter | `auto` | 调 `/credits` 获取 `total_credits - total_usage` | ❌ 禁止 |
| DeepSeek | `auto` | 调 `/user/balance` 获取余额 | ❌ 禁止 |
| ZenMux | `manual` | 用户在请求中提供初始 `quota` | ✅ 允许 |
| DeepInfra | `manual` | 用户在请求中提供初始 `quota` | ✅ 允许 |
| Gemini CLI | `NULL` | 订阅制，无余额概念，quota 为 NULL | — |

**每次请求后**，`billing.ts` 自动依据上游消费将 `credits_used` 从上游凭证的 `quota` 中扣除（当 quota 非 NULL 时）。
当 quota 降至 0 时，健康状态会被标记为 `dead`。

**调度策略**：优先调用 `price_multiplier` 乘算后有效成本最低且健康状态正常的上游凭证。

### model_pricing

供应商模型定价表，由 Cron 自动同步维护。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `provider:model_id` |
| provider | TEXT | openrouter / zenmux / deepinfra |
| model_id | TEXT | 标准模型 ID（如 `google/gemini-2.5-flash`） |
| name | TEXT | 人类可读名称 |
| input_price | REAL | 输入价格（/ 百万 tokens） |
| output_price | REAL | 输出价格（/ 百万 tokens） |
| context_length | INTEGER | 最大上下文长度 |
| is_active | INTEGER | 是否可用 |
| refreshed_at | INTEGER | 最后刷新时间 |

### ledger

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 流水 ID |
| credential_id | TEXT | 使用的上游凭证 ID |
| provider | TEXT | 上游平台 |
| model | TEXT | 模型名 |
| input_tokens | INTEGER | 输入 token 数 |
| output_tokens | INTEGER | 输出 token 数 |
| credits_used | REAL | 扣除的平台额度 (Credits) |
| created_at | INTEGER | 产生时间 |

### wallets [Platform]

| 字段 | 类型 | 说明 |
|------|------|------|
| owner_id | TEXT PK | 用户 ID（Clerk userId） |
| balance | REAL | 当前 Credits 余额 |
| updated_at | INTEGER | 最后更新时间 |

### payments [Platform]

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `pay_<uuid>` |
| owner_id | TEXT | 用户 ID |
| stripe_session_id | TEXT UNIQUE | Stripe Checkout Session ID（幂等防重复入账） |
| amount_cents | INTEGER | 实付金额（美分） |
| credits | REAL | 入账 Credits（$1 = 100 Credits） |
| status | TEXT | `pending` / `completed` / `failed` |
| created_at | INTEGER | 创建时间 |

## API 路由

所有路由（除 `/health` 和 `/api/webhooks/*`）均需认证。

### OpenAI 兼容 API

| 路由 | 方法 | 说明 |
|------|------|------|
| /v1/chat/completions | POST | 聊天补全 |
| /v1/models | GET | 可用模型列表（从 D1 提供） |

### 管理 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/credentials` | POST, GET, DELETE, PATCH | 上游凭证管理 |
| `/api/models` | GET | `model_pricing` 只读查询 |
| `/api/models/sync` | POST | 手动触发模型定价与余额同步 |
| `/api/pool/stats` | GET | Key 池统计 |
| `/api/providers` | GET | 已集成供应商列表 |
| `/health` | GET | 健康检查（公开） |

### Platform 计费 API

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/billing/balance` | GET | Clerk | 查询钱包余额 |
| `/api/billing/checkout` | POST | Clerk | 创建 Stripe Checkout Session |
| `/api/billing/history` | GET | Clerk | 充值记录 |
| `/api/webhooks/stripe` | POST | Stripe 签名 | Webhook 回调，入账 Credits |

## 上游平台

当前已集成（2026-02-21 验证）：

| 平台 | 端点 | 返回费用？ | 定价结构 | 协议 |
|------|------|:---------:|---------|------|
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ `usage.cost` | 字符串, USD/token | OpenAI |
| ZenMux | `https://zenmux.ai/api/v1` | ❌ 仅 tokens | 数组+条件, USD/M tokens | OpenAI |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | ✅ `usage.estimated_cost` | 数字, USD/M tokens | OpenAI |
| DeepSeek | `https://api.deepseek.com` | ❌ 仅 tokens | JSON 定义 CNY/M tokens | OpenAI |
| Gemini CLI | `https://cloudcode-pa.googleapis.com` | ❌ 仅 tokens | JSON 定义 USD/M tokens (影子定价) | Google v1internal |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | ❌ 仅 tokens | JSON 定义 USD/M tokens | OpenAI |
| OAIPro | `https://api.oaipro.com/v1` | ❌ 仅 tokens | 无定价 API (价格 0) | OpenAI |

前六家为 OpenAI Compatible，共享 `OpenAICompatibleAdapter`。
Gemini CLI 使用独立的 `GeminiCliAdapter`，内部通过 `protocols/gemini-native.ts` 完成 OpenAI ↔ Google v1internal 协议转换。
OAIPro 为 API 聚合分发平台，模型 ID 为扁平格式，`parseModels` 自动映射为 `vendor/model` 标准格式以支持跨供应商聚合。

### 两种供应商类型

| 类型 | 认证方式 | 协议 | 余额 | 适配器 |
|------|---------|------|:----:|--------|
| API Key 供应商 | `Bearer <api_key>` | OpenAI Compatible | 有或手动设 | `OpenAICompatibleAdapter` |
| OAuth 反代理 | `refresh_token` → 自动刷新 `access_token` | 非标准（需协议转换） | 无（订阅制） | 专用 Adapter（如 `GeminiCliAdapter`） |

### OAuth 应用凭证设计

Gemini CLI 等 OAuth 供应商依赖 Google 的 "installed app" OAuth 模型，其 `client_id` 和 `client_secret` 是**应用标识**而非用户秘密（Google 官方文档明确声明可公开嵌入源码）。因此这些值直接硬编码在 adapter 中，无需任何环境变量配置。

用户秘密仅有 `refresh_token`（存储在 `upstream_credentials.secret` 中）。Adapter 内部使用硬编码的应用凭证 + 用户的 `refresh_token` 完成 token 刷新。

> 硬编码时使用字符串拼接以规避 GitHub Push Protection 对 `GOCSPX-*` 模式的误报拦截。

## 模型数据架构

### 两层分离：JSON 定义层 + D1 运行层

| 层级 | 位置 | 职责 |
|------|------|------|
| JSON 定义层 | `worker/core/models/*.json` | 人可读的模型与定价源文件，跟随版本控制 |
| D1 运行层 | `model_pricing` 表 | 运行时查询、调度、计费的唯一数据源 |

**有定价 API 的供应商**（OpenRouter、ZenMux、DeepInfra）：Cron 自动从上游 `/models` 端点拉取最新数据写入 D1，JSON 层不涉及。

**无定价 API 的供应商**（DeepSeek、Gemini CLI、Google AI Studio、OAIPro）：模型维护在 `models/*.json`，由 `registry.ts` 的 `parseModels` 在同步时读取并写入 D1。更新流程：运行生成脚本（如 `scripts/fetch-oaipro-models.mjs`）或手动修改 JSON → commit → Cron 或手动 `/api/models/sync` 写入 D1。

### 安全的差集停用

`deactivateMissing()` 仅在收到**非空有效模型列表**后执行。当 API 返回空数组或请求失败时跳过，避免误停所有模型。模型不会从 D1 中删除，仅标记 `is_active = 0`。

### 前端懒同步

`SidebarLayout` 在加载时检测 `/v1/models` 是否为空，若空则自动触发 `/api/models/sync`，确保首次部署后无需手动操作。

## 安全

- **凭证存储**：API Key 或 OAuth token 明文存于 D1（D1 提供静态加密），无应用层加密
- **认证**：`/api/*` 和 `/v1/*` 路由需 `ADMIN_TOKEN` Bearer 认证
- **防重复**：`secret` 列有 UNIQUE 索引，防止同一凭证被重复添加
- **HTTPS**：Cloudflare 默认提供

## Platform 演进路线图

`platform` 是基于 `core` 之上演进出的多租户算力市场。核心原则依然是 **由外向内依赖**（`platform` 依赖 `core`，而 `core` 保持独立纯净）。

### 方向一：身份鉴权与租户隔离体系 ✅ 已完成
- Clerk 集成（`CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`）。
- 全表 `owner_id` 租户隔离。
- 前端 `isPlatform` 运行时门控。

### 方向二：中心化账户与支付网关 ✅ 充值已完成
- `wallets` 表存储用户 Credits 余额。
- `payments` 表记录 Stripe 充值流水（`stripe_session_id` UNIQUE 防重复入账）。
- Stripe Checkout 一次性付费，零自建支付 UI，使用 raw `fetch()` 调用 Stripe REST API。
- Webhook `/api/webhooks/stripe` 签名验证（Web Crypto HMAC-SHA256）。
- 兑换比率：$1 USD = 100 Credits。
- **待实现**：钱包余额消费扣减（请求前预检 + 请求后扣减）、防透支机制。

### 方向三：调度引擎与公开市场
- 允许供给方将自己的 `upstream_credentials` 公开到交易池。
- 进化 Dispatcher 路由算法，支持供需双方撮合。
- 构建跨账户资金结算逻辑。

### 方向四：平台前端架构扩充
- **Landing Page**: 面向消费者的 SEO 官网。
- **User Console**: Dashboard 的企业增强版，增加财务看板和授权管理。
- **Admin System**: 平台运管的超管后台。
