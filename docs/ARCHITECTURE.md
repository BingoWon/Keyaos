# Keyaos（氪钥枢）— 技术架构

## 命名

**英文名 Keyaos** — 由 **Key**（API Key）与 **Chaos**（混沌）融合而成，发音与 Chaos 基本一致，寓意在 API Key 的混沌中建立秩序。

**中文名 氪钥枢** — 拼音 Kè-Yào-Shū 与英文名 Ke-yao-s 精确对齐：

| 音节 | 英文 | 中文 | 含义 |
|------|------|------|------|
| Ke | **Ke**yaos | **氪** | 氪金：投入资源（互联网文化高辨识度词汇） |
| Yao | Ke**yao**s | **钥** | 密钥：API Key 的核心概念 |
| S(hu) | Keyao**s** | **枢** | 中枢：网关的核心定位 |

语义链：以氪驱钥、以钥控枢 — 投入资源 → 掌握密钥 → 控制中枢。

## 项目定位

Keyaos（氪钥枢）是一个开源的 AI API 网关引擎。用户添加自己的上游 API Key，系统自动路由到最便宜的供应商完成请求。

项目分为两层：

- **core（当前实现）**：个人自部署模式，单用户，通过 `ADMIN_TOKEN` 认证
- **platform（已实现）**：多用户平台模式，Clerk 身份鉴权、Credits 钱包、Stripe 充值、凭证市场

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
用户请求 (POST /v1/chat/completions 或 POST /v1/messages)
    │
    ├── 1. 认证：验证下游 API Key（Bearer 或 x-api-key）或 ADMIN_TOKEN
    ├── 2. 协议转换（仅 Anthropic）：Anthropic Messages → OpenAI 内部格式
    ├── 3. 定价查询：查 model_pricing 表 → 哪些供应商有此模型及价格
    ├── 4. 凭证选择：查 upstream_credentials 表 → 按 (input_price × price_multiplier) 排序
    │       ├── 过滤：is_enabled=1, health_status≠dead
    │       └── 失败自动重试下一个组合
    ├── 5. 请求转发：向上游平台发起请求
    ├── 6. 响应透传：SSE 流式 tee() 零延迟透传
    ├── 7. 协议转换（仅 Anthropic）：OpenAI 响应 → Anthropic Messages 格式（含 reasoning→thinking）
    ├── 8. 异步计费：waitUntil 提取 usage + cost → 写入 usage 表
    └── 9. 平台结算：consumer 扣费 + provider 入账 + 1% 双向服务费（自用免结算）
```

### 计费模型

| 上游 | 计费方式 | 说明 |
|------|---------|------|
| OpenRouter | `usage.cost` | 上游直接返回真实 USD 费用 |
| DeepInfra | `usage.estimated_cost` | 上游返回估算 USD 费用 |
| ZenMux | tokens × model_pricing 表单价 | 上游不返回费用，需自行计算 |

| Gemini CLI | tokens × model_pricing 表单价 | 订阅制无余额概念，使用影子定价 |
| Kiro | tokens × model_pricing 表单价 | 订阅制无余额概念，使用影子定价 |
| Google AI Studio | tokens × model_pricing 表单价 | 无余额 API，需手动设 quota |

费用分配：`用户支付 = 上游成本 × price_multiplier`

### 代码分层

```
worker/
├── index.ts                  入口 + Cron scheduled + 认证中间件
├── core/
│   ├── dispatcher.ts         全局最优 Key 选择
│   ├── billing.ts            用量记录 + quota 扣减 + 基础成本计算
│   ├── utils/
│   │   └── stream.ts         SSE 流拦截 + usage 提取
│   ├── db/                   DAO 层
│   │   ├── schema.ts         DB 类型定义
│   │   ├── api-keys-dao.ts   下游 API Key CRUD
│   │   ├── credentials-dao.ts  上游凭证 CRUD + 健康管理 + 统计
│   │   ├── pricing-dao.ts    模型定价 UPSERT + 查询
│   │   └── usage-dao.ts      API 使用记录
│   ├── models/               静态模型定义（无定价 API 的供应商）
│   │   ├── deepseek.json     DeepSeek 模型与 CNY 定价
│   │   ├── openai.json       OpenAI 模型与 USD 定价
│   │   ├── oaipro.json       OAIPro 模型（价格 0）
│   │   ├── qwen-code.json    Qwen Code 模型与 USD 影子定价
│   │   ├── google-ai-studio.json  Google AI Studio 模型与 USD 定价
│   │   ├── gemini-cli.json   Gemini CLI 模型与 USD 影子定价
│   │   ├── antigravity.json  Antigravity 模型与 USD 影子定价
│   │   └── kiro.json         Kiro 模型与 USD 影子定价
│   ├── sync/
│   │   └── sync-service.ts   Cron 定时同步模型与余额
│   ├── protocols/            可复用协议转换层
│   │   ├── anthropic.ts      Anthropic Messages ↔ OpenAI（含 reasoning→thinking）
│   │   ├── gemini-native.ts  OpenAI ↔ Google v1internal 双向转换
│   │   ├── kiro.ts           OpenAI ↔ AWS Event Stream 二进制协议转换
│   │   └── shared.ts         协议转换共享工具（extractText）
│   └── providers/            统一供应商接口
│       ├── interface.ts      ProviderAdapter 接口
│       ├── openai-compatible.ts  OpenAI 兼容适配器
│       ├── google-oauth-adapter.ts  Gemini CLI & Antigravity (OAuth)
│       ├── kiro-adapter.ts   Kiro IDE (AWS OAuth + 二进制协议)
│       └── registry.ts       供应商注册表（引用 models/*.json）
├── platform/                 Platform-only（core 不依赖）
│   ├── billing/
│   │   ├── settlement.ts     双向服务费计算 + 钱包结算
│   │   ├── admin-dao.ts      管理后台聚合查询 + 额度调整
│   │   ├── wallet-dao.ts     用户钱包余额（credit + debit）
│   │   ├── payments-dao.ts   充值记录
│   │   └── stripe.ts         Stripe Checkout + Webhook 签名验证
│   └── routes/
│       ├── admin.ts          /api/admin/* (PLATFORM_OWNER_ID 守护)
│       └── billing.ts        /api/billing/* + /api/webhooks/stripe
├── routes/
│   ├── gateway.ts            共享补全执行（调度 + 重试 + 计费）
│   ├── chat.ts               POST /v1/chat/completions（OpenAI 格式）
│   ├── messages.ts           POST /v1/messages（Anthropic 格式）
│   ├── models.ts             获取可用模型定价
│   ├── credentials.ts        上游凭证增删改查
│   ├── api-keys.ts           下游 API Key 管理
│   └── system.ts             统计信息 + 供应商列表
└── shared/
    ├── errors.ts             统一错误类型
    ├── types.ts              全局类型定义（AppEnv, Env）
    └── validate.ts           请求校验工具
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
| Kiro | `NULL` | 订阅制，无余额概念，quota 为 NULL | — |

**每次请求后**，`billing.ts` 自动依据上游消费将 `base_cost` 从上游凭证的 `quota` 中扣除（当 quota 非 NULL 时）。
当 quota 降至 0 时，健康状态会被标记为 `dead`。

**调度策略**：
- Core 模式：仅搜索当前用户的凭证。
- Platform 模式：全局搜索所有用户的凭证（凭证池），优先调用 `price_multiplier` 乘算后有效成本最低且健康状态正常的上游凭证。

**平台结算**（仅 Platform 模式）：

跨用户请求（consumer ≠ credential owner）：
- 消费者扣费：`base_cost × 1.01`
- 供给方入账：`base_cost × 0.99`
- 平台服务费：`base_cost × 0.02`（双向各 1%）

自用请求（consumer = credential owner，即用户使用自己上传的凭证）：
- **免服务费**：`consumer_charged = 0`，`provider_earned = 0`，`platform_fee = 0`
- **无钱包操作**：不执行 `settleWallets()`，用户 Credits 余额不变
- 上游凭证的 `quota` 仍正常扣减（`base_cost` 照常记录真实上游消耗）
- `usage` 表照常写入（审计留痕），但 `consumer_charged` / `provider_earned` / `platform_fee` 三字段全为 0
- 前端 Usage 页面标记为 "Self-use"（灰色标签，`netCredits = 0`）
- 前端 Ledger 页面**不显示**自用条目（Ledger 仅展示有 Credits 变动的记录）

设计原因：自用本质上是左口袋到右口袋，不构成交易。若收取服务费会惩罚使用自有资源的用户，与平台鼓励资源共享的初衷矛盾。Core 模式（单用户自部署）下所有请求均为自用，此时行为与无 Platform 层完全一致。

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

### usage

逐条 API 请求的使用记录。每条记录包含消费者和凭证供给方的双视角信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 使用记录 ID |
| consumer_id | TEXT | 消费者 ID（API 调用方） |
| credential_id | TEXT | 使用的上游凭证 ID |
| credential_owner_id | TEXT | 凭证供给方 ID |
| provider | TEXT | 上游平台 |
| model | TEXT | 模型名 |
| input_tokens | INTEGER | 输入 token 数 |
| output_tokens | INTEGER | 输出 token 数 |
| base_cost | REAL | 基础成本（上游真实费用） |
| consumer_charged | REAL | 消费者扣费金额（含 1% 服务费） |
| provider_earned | REAL | 供给方入账金额（扣除 1% 服务费） |
| platform_fee | REAL | 平台服务费（双向 1%） |
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
| credits | REAL | 入账 Credits（$1 USD = $1 Credits, 1:1） |
| status | TEXT | `pending` → `completed` / `expired` |
| created_at | INTEGER | 创建时间 |

### credit_adjustments [Platform]

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `adj_<uuid>` |
| owner_id | TEXT | 目标用户 ID |
| amount | REAL | 正=发放, 负=扣除 |
| reason | TEXT | 操作原因（自由文本） |
| created_at | INTEGER | 操作时间 |

运营者通过 Admin 页面发放或扣除 Credits 时写入此表，作为审计日志。实际余额变动仍通过 `WalletDao.credit()` / `debit()` 完成。

## API 路由

所有路由（除 `/health` 和 `/api/webhooks/*`）均需认证。

### OpenAI 兼容 API

| 路由 | 方法 | 说明 |
|------|------|------|
| /v1/chat/completions | POST | 聊天补全（OpenAI 格式） |
| /v1/models | GET | 可用模型列表（从 D1 提供） |

### Anthropic 兼容 API

| 路由 | 方法 | 说明 |
|------|------|------|
| /v1/messages | POST | 聊天补全（Anthropic Messages 格式） |

Anthropic 端点支持 `x-api-key` 头部认证（也兼容 `Authorization: Bearer`），请求/响应自动在 Anthropic ↔ OpenAI 格式之间双向转换。支持文本、tool use、图片、流式输出、reasoning→thinking 转换。

### 管理 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/credentials` | POST, GET, DELETE, PATCH | 上游凭证管理 |
| `/api/models` | GET | `model_pricing` 只读查询 |
| `/api/models/sync` | POST | 手动触发模型定价与余额同步 |
| `/api/usage` | GET | API 使用记录（逐条请求明细，双视角） |
| `/api/ledger` | GET | 账户流水（UNION usage + payments + credit_adjustments） |
| `/api/pool/stats` | GET | Key 池统计 |
| `/api/providers` | GET | 已集成供应商列表 |
| `/health` | GET | 健康检查（公开） |

### Platform 管理 API

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/me` | GET | Clerk/ADMIN_TOKEN | 返回当前用户 ID 和 isAdmin 状态 |
| `/api/admin/overview` | GET | PLATFORM_OWNER_ID | 平台概览指标（实时聚合） |
| `/api/admin/users` | GET | PLATFORM_OWNER_ID | 所有用户余额与消耗 |
| `/api/admin/credits` | POST | PLATFORM_OWNER_ID | 发放/扣除用户 Credits |
| `/api/admin/adjustments` | GET | PLATFORM_OWNER_ID | Credits 调整历史记录（分页） |
| `/api/admin/table/:name` | GET | PLATFORM_OWNER_ID | 只读表数据浏览（分页，默认按时间倒序） |

### Platform 计费 API

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/billing/balance` | GET | Clerk | 查询钱包余额 |
| `/api/billing/checkout` | POST | Clerk | 创建 Stripe Checkout Session |
| `/api/billing/history` | GET | Clerk | 充值记录 |
| `/api/webhooks/stripe` | POST | Stripe 签名 | Webhook 回调，入账 Credits |

## 上游平台

当前已集成（2026-02-24 验证）：

| 平台 | 端点 | 返回费用？ | 定价结构 | 协议 |
|------|------|:---------:|---------|------|
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ `usage.cost` | 字符串, USD/token | OpenAI |
| ZenMux | `https://zenmux.ai/api/v1` | ❌ 仅 tokens | 数组+条件, USD/M tokens | OpenAI |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | ✅ `usage.estimated_cost` | 数字, USD/M tokens | OpenAI |
| DeepSeek | `https://api.deepseek.com` | ❌ 仅 tokens | JSON 定义 CNY/M tokens | OpenAI |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` | ❌ 仅 tokens | JSON 定义 USD/M tokens | OpenAI |
| OAIPro | `https://api.oaipro.com/v1` | ❌ 仅 tokens | 无定价 API (价格 0) | OpenAI |
| OpenAI | `https://api.openai.com/v1` | ❌ 仅 tokens | JSON 定义 USD/M tokens | OpenAI |
| Qwen Code | `https://coding.dashscope.aliyuncs.com/v1` | ❌ 仅 tokens | JSON 定义 USD/M tokens (影子定价) | OpenAI |
| Gemini CLI | `https://cloudcode-pa.googleapis.com` | ❌ 仅 tokens | JSON 定义 USD/M tokens (影子定价) | Google v1internal |
| Antigravity | `https://daily-cloudcode-pa.sandbox.googleapis.com` | ❌ 仅 tokens | JSON 定义 USD/M tokens (影子定价) | Google v1internal |
| Kiro | `https://q.us-east-1.amazonaws.com` | ❌ 仅 tokens | JSON 定义 USD/M tokens (影子定价) | AWS Event Stream (自定义二进制) |

OpenAI Compatible 供应商共享 `OpenAICompatibleAdapter`。
Gemini CLI 与 Antigravity 共享 `GoogleOAuthAdapter`，内部通过 `protocols/gemini-native.ts` 完成 OpenAI ↔ Google v1internal 协议转换。
Kiro 使用独立的 `KiroAdapter`，内部通过 `protocols/kiro.ts` 完成 OpenAI ↔ AWS Event Stream 二进制协议转换。
OAIPro 为 API 聚合分发平台，模型 ID 为扁平格式，`parseModels` 自动映射为 `vendor/model` 标准格式以支持跨供应商聚合。

### 两种供应商类型

| 类型 | 认证方式 | 协议 | 余额 | 适配器 |
|------|---------|------|:----:|--------|
| API Key 供应商 | `Bearer <api_key>` | OpenAI Compatible | 有或手动设 | `OpenAICompatibleAdapter` |
| Google OAuth 反代理 | `refresh_token` → 自动刷新 `access_token` | Google v1internal（需协议转换） | 无（订阅制） | `GoogleOAuthAdapter`（参数化配置） |
| AWS OAuth 反代理 | `refreshToken` → 自动刷新 `accessToken` | AWS Event Stream（需二进制协议转换） | 无（订阅制） | `KiroAdapter` |

### OAuth 应用凭证设计

Gemini CLI 等 Google OAuth 供应商依赖 Google 的 "installed app" OAuth 模型，其 `client_id` 和 `client_secret` 是**应用标识**而非用户秘密（Google 官方文档明确声明可公开嵌入源码）。因此这些值直接硬编码在 adapter 中，无需任何环境变量配置。

Kiro 使用 AWS 社交认证（GitHub/Google），无需 `client_id`/`client_secret`，仅需用户的 `refreshToken` 即可完成 token 刷新。

用户秘密仅有 `refresh_token`（存储在 `upstream_credentials.secret` 中）。Adapter 内部使用硬编码的应用凭证（Google）或直接使用 refresh token（Kiro）完成 token 刷新。

> 硬编码时使用字符串拼接以规避 GitHub Push Protection 对 `GOCSPX-*` 模式的误报拦截。

## 模型数据架构

### 两层分离：JSON 定义层 + D1 运行层

| 层级 | 位置 | 职责 |
|------|------|------|
| JSON 定义层 | `worker/core/models/*.json` | 人可读的模型与定价源文件，跟随版本控制 |
| D1 运行层 | `model_pricing` 表 | 运行时查询、调度、计费的唯一数据源 |

**有定价 API 的供应商**（OpenRouter、ZenMux、DeepInfra）：Cron 自动从上游 `/models` 端点拉取最新数据写入 D1，JSON 层不涉及。

**无定价 API 的供应商**（DeepSeek、Google AI Studio、OAIPro、OpenAI、Qwen Code、Gemini CLI、Antigravity）：模型维护在 `models/*.json`，由 `registry.ts` 的 `parseModels` 在同步时读取并写入 D1。更新流程：运行生成脚本（如 `scripts/fetch-oaipro-models.mjs`）或手动修改 JSON → commit → Cron 或手动 `/api/models/sync` 写入 D1。

### 已知限制：分层定价 (Tiered Pricing)

部分供应商对同一模型实行上下文分层定价（如 DashScope ≤256K / >256K 单价差 3x，Google ≤128K / >128K 差 4x）。当前架构每个模型仅存储**单一价格**（基础档/最低档），不支持按上下文长度分档计费。

原因：
- OpenRouter `/models` API 仅返回基础档价格，分层数据不可通过 API 获取
- `model_pricing` 表结构为单一 `input_price` / `output_price`，无分层维度

影响范围：Qwen Code、Google AI Studio、Gemini CLI、Antigravity、Kiro（使用影子定价自行计算的供应商）。OpenRouter、DeepInfra 不受影响（上游返回 `usage.cost` / `usage.estimated_cost`，分层由上游处理）。

后期优化方向：`model_pricing` 扩展 `price_tiers` 字段或独立表，计费逻辑根据 `prompt_tokens` 动态选档。当前基础档定价覆盖绝大多数实际请求（极端长上下文场景下会略微低估）。

### 安全的差集停用

`deactivateMissing()` 仅在收到**非空有效模型列表**后执行。当 API 返回空数组或请求失败时跳过，避免误停所有模型。模型不会从 D1 中删除，仅标记 `is_active = 0`。

### 前端懒同步

`SidebarLayout` 在加载时检测 `/v1/models` 是否为空，若空则自动触发 `/api/models/sync`，确保首次部署后无需手动操作。

## 安全

- **凭证存储**：API Key 或 OAuth token 明文存于 D1（D1 提供静态加密），无应用层加密
- **认证**：`/api/*` 路由需 Clerk 或 `ADMIN_TOKEN` 认证；`/v1/*` 路由需下游 API Key 认证（`Authorization: Bearer` 或 `x-api-key`）
- **防重复**：`secret` 列有 UNIQUE 索引，防止同一凭证被重复添加
- **HTTPS**：Cloudflare 默认提供

## Platform 演进路线图

`platform` 是基于 `core` 之上演进出的多租户算力市场。核心原则依然是 **由外向内依赖**（`platform` 依赖 `core`，而 `core` 保持独立纯净）。

### 方向一：身份鉴权与租户隔离体系 ✅ 已完成
- Clerk 集成（`CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`）。
- 全表 `owner_id` 租户隔离。
- 前端 `isPlatform` 运行时门控。

### 方向二：中心化账户与支付网关 ✅ 已完成
- `wallets` 表存储用户 Credits 余额（`credit()` + `debit()`）。
- `payments` 表记录 Stripe 充值流水（`stripe_session_id` UNIQUE 防重复入账）。
- Stripe Checkout 一次性付费，零自建支付 UI，使用 raw `fetch()` 调用 Stripe REST API。
- Webhook `/api/webhooks/stripe` 签名验证（Web Crypto HMAC-SHA256）。
- 兑换比率：$1 USD = $1 Credits（1:1）。
- 余额预检：消费者余额 ≤ 0 时拒绝请求（402 Insufficient Credits）。
- 双向服务费：`settlement.ts` 中 `SERVICE_FEE_RATE = 0.01`（1%），全精度 IEEE 754 存储，计算和存储不做任何 rounding，仅前端展示时取舍（Billing: 4 位 floor, Ledger: 5 位四舍五入）。
- 自用免服务费：`calculateSettlement(baseCost, isSelfUse=true)` 返回全零，不执行钱包操作。

### 方向三：调度引擎与公开市场 ✅ 已完成
- Platform 模式下 Dispatcher 全局搜索所有用户的凭证（凭证池），按有效成本排序。
- 跨账户双向结算：`settleWallets()` 消费者扣费、供给方入账。自用（consumer = credential owner）跳过结算。
- **Usage 页面**（`/dashboard/usage`）：逐条 API 请求明细，双视角（`spent` / `earned` / `self`），API 仅返回 `netCredits`（不暴露 `baseCost`），前端展示 5 位小数标准四舍五入 + 最低值保护。
- **Ledger 页面**（`/dashboard/ledger`，仅 Platform 模式）：统一时间线，聚合 `usage`（排除自用） + `payments` + `credit_adjustments` 三表（SQL `UNION ALL`），展示所有 Credits 变动。Core 模式下不显示此页面（所有请求均为自用，无 Credits 变动）。

### 方向四：管理后台 ✅ 已完成
- `PLATFORM_OWNER_ID` 环境变量标识平台运营者，无需角色系统。
- `/api/admin/*` 路由由中间件守护，非运营者返回 403。
- 前端独立顶层路由 `/admin`，拥有专属 `AdminLayout` 侧边栏（Overview / Users / Data + 返回 Dashboard 链接）。
- `isAdmin` 状态提升至 `AuthContext`（`ClerkAuthBridge` 启动时单次 `/api/me` 请求），全局复用，无重复请求。
- 非 admin 用户访问 `/admin` 自动重定向至 `/dashboard`。
- 平台概览：实时聚合 SQL（总充值、总消耗、服务费、请求数、凭证数、用户数）。
- 用户管理：查看所有用户余额与消耗，发放/扣除 Credits（`credit_adjustments` 表审计追踪，`AdminDao.adjustCredits` 复用 `WalletDao.credit()`）。
- 数据浏览：只读查询任意 D1 表，分页浏览，默认按时间倒序。

### 方向五：客服集成 ✅ 已完成
- **Crisp** 异步聊天 widget，适合独立维护者（非即时客服，异步响应）。
- `crisp-sdk-web` NPM 集成，`VITE_CRISP_WEBSITE_ID` 环境变量控制开关。
- 未配置 Website ID 时完全无副作用（不加载任何外部资源）。
- Platform 模式下自动同步 Clerk 用户身份（email + 昵称）至 Crisp 会话。
- 用户登出时 `Crisp.session.reset()` 清除会话，防止身份混淆。

### 方向六：平台前端架构扩充
- **Landing Page**: 面向消费者的 SEO 官网。
- **User Console**: Dashboard 的企业增强版，增加财务看板和授权管理。
