# OAIPro 适配档案

## 基本信息

```
供应商: OAIPro
Base URL: https://api.oaipro.com/v1
兼容性: OpenAI Compatible ✅
货币: USD
模型列表: GET /v1/models → 不包含定价 ❌ 不包含 context_length ❌
定价格式: N/A（/models 无定价字段，需 hardcode 或从官网获取）
凭证验证方式: GET /v1/models (200=有效, 401=无效)
余额查询 API: N/A（无可用余额/额度 API）
supportsAutoCredits: false
费用返回: 无 (usage 无 cost 字段，需自行计算)
流式 usage: 支持 stream_options ✅
特殊 header: 无
```

## 平台性质

OAIPro 是 API 聚合分发平台（类似 Keyaos 本身），代理多家上游的模型。支持 OpenAI 和 Anthropic 系列，不支持 Google Gemini。

模型 ID 使用**扁平格式**（如 `gpt-4o-mini`、`claude-sonnet-4-20250514`），不带 `vendor/` 前缀。
模型列表通过 `scripts/fetch-oaipro-models.mjs` 脚本生成静态 JSON（`worker/core/models/oaipro.json`），
脚本自动完成 vendor 前缀映射和非 chat 模型过滤。

## 可用模型（共 87 个）

### Chat 模型（主要）

| 系列 | 模型 |
|-------|------|
| GPT-5.x | gpt-5.2, gpt-5.1, gpt-5, gpt-5-mini, gpt-5-nano |
| GPT-4.x | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4.5-preview |
| GPT-4o | gpt-4o, gpt-4o-mini, chatgpt-4o-latest |
| GPT-4 | gpt-4, gpt-4-turbo |
| o-series | o4-mini, o3, o3-mini, o1, o1-mini, o1-preview |
| Claude 4.x | claude-opus-4-6, claude-opus-4-5, claude-opus-4-1, claude-opus-4, claude-sonnet-4-5, claude-sonnet-4 |
| Claude 3.x | claude-3-7-sonnet (+ thinking), claude-3-5-haiku, claude-3-5-sonnet, claude-3-opus, claude-3-haiku |
| Claude 2.x | claude-2.0, claude-2.1 |
| Legacy | gpt-3.5-turbo 系列 |

### 非 Chat 模型

babbage-002, davinci-002, dall-e-2/3, whisper-1, tts-1 系列, text-embedding 系列, text-moderation 系列

## API 响应样本

### GET /models 响应片段

```json
{
  "id": "gpt-4o-mini",
  "object": "model",
  "created": 1626777600,
  "owned_by": "openai"
}
```

无 `pricing`、`context_length`、`name` 等扩展字段。

### 凭证验证

- 有效凭证: HTTP 200
- 无效凭证: HTTP 401，响应体:
```json
{
  "error": {
    "message": "无效的令牌 (request id: ...)",
    "type": "new_api_error"
  }
}
```

### 余额查询

无可用 API。`/dashboard/billing/subscription` 返回固定大数（非真实余额）：

```json
{
  "object": "billing_subscription",
  "has_payment_method": true,
  "soft_limit_usd": 100000000,
  "hard_limit_usd": 100000000,
  "system_hard_limit_usd": 100000000,
  "access_until": 0
}
```

`/v1/dashboard/billing/usage` 返回累计用量（非余额）：

```json
{ "object": "list", "total_usage": 0.0414 }
```

### Chat Completions — 非流式 usage

```json
{
  "id": "chatcmpl-DBjtqPe84xPKpHA1uPLtXFh3GCgp3",
  "model": "gpt-4o-mini-2024-07-18",
  "object": "chat.completion",
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 9,
    "total_tokens": 22,
    "prompt_tokens_details": { "cached_tokens": 0, "audio_tokens": 0 },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

Claude 模型也返回标准 usage：
```json
{
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 12,
    "total_tokens": 25,
    "cache_write_tokens": 0,
    "cache_read_tokens": 0
  }
}
```

无 `cost`、`estimated_cost` 等费用字段。

### Chat Completions — 流式最后两帧

```
data: {"id":"chatcmpl-...","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20,...},"obfuscation":"wby9kk09VU5"}
data: [DONE]
```

`stream_options: { include_usage: true }` 有效。usage 出现在 `[DONE]` 前的独立帧中。
流式 chunk 中含非标准字段 `obfuscation`（可忽略）。

## 模型获取策略

### 核心限制

OAIPro 的 `/v1/models` 端点**需要认证**（Bearer Token），且返回数据**不包含定价和 context_length**。
这意味着：

1. **无法在 Cron 定时任务中自动拉取** — 运行时没有用户的 OAIPro API Key 可用于获取模型列表
2. **无法从 API 获取定价** — 即使拿到模型列表，也没有价格信息
3. **模型 ID 为扁平格式** — 如 `gpt-4o-mini`，不带 `vendor/` 前缀，无法直接与其他供应商的 `openai/gpt-4o-mini` 聚合

### 处理方式：脚本生成静态 JSON

采用 `scripts/fetch-oaipro-models.mjs` 离线脚本生成 `worker/core/models/oaipro.json`：

```bash
# 需要 .env.local 中配置 OAIPRO_KEY
node scripts/fetch-oaipro-models.mjs
```

脚本执行流程：

1. **拉取** — 用 OAIPRO_KEY 调用 `GET /v1/models` 获取全量模型列表
2. **过滤** — 仅保留 OpenAI 系列（`gpt*`、`chatgpt*`、`o[0-9]*`）和 Anthropic 系列（`claude*`），丢弃 embedding、tts、dall-e、moderation 等非 chat 模型，也丢弃 Gemini 系列（OAIPro 实测返回 503）
3. **ID 映射** — 扁平 ID 加 vendor 前缀：`gpt-4o-mini` → `openai/gpt-4o-mini`，`claude-sonnet-4-20250514` → `anthropic/claude-sonnet-4-20250514`
4. **定价交叉引用** — 从 `scripts/research/openrouter_models.json` 查找匹配模型的定价、context_length 和 display name。采用模糊匹配策略处理 ID 差异：
   - 精确匹配 `vendor/model`
   - 去除日期后缀：`-20241022` / `-2024-10-22`
   - Anthropic 版本号规范化：`claude-3-5-sonnet` → `claude-3.5-sonnet`
   - 变体映射：`-thinking` → `:thinking`，`-chat-latest` → `-chat`
5. **丢弃无价格模型** — 未在 OpenRouter 找到匹配价格的模型视为过时或不主流，直接排除（不写入 JSON）
6. **输出** — 写入 `worker/core/models/oaipro.json`，字段统一为 `id`、`name`、`input_usd`、`output_usd`、`context_length`

### 运行时适配

`registry.ts` 中 OAIPro 配置：
- `staticModels: true` — 跳过 HTTP 拉取，直接读静态 JSON
- `stripModelPrefix: true` — 转发请求时去除 `openai/` 或 `anthropic/` 前缀，还原为 OAIPro 期望的扁平 ID

### 更新时机

当需要同步 OAIPro 最新模型列表时：
1. 确保 `scripts/research/openrouter_models.json` 是最新的（运行 OpenRouter 模型拉取）
2. 运行 `node scripts/fetch-oaipro-models.mjs`
3. Review 生成的 JSON，commit 提交

## 已知问题与注意事项

1. **无定价 API** — `/models` 不返回定价或 context_length，价格来源于 OpenRouter 交叉引用
2. **`/models` 需认证** — 与多数供应商不同，无法在运行时动态拉取模型列表
3. **无余额 API** — 无法自动查询余额，`supportsAutoCredits: false`
4. **无 cost 字段** — 计费需基于 token 数量和 shadow pricing 自行计算
5. **模型 ID 扁平格式** — 存储使用 `vendor/model` 格式以支持聚合，请求时通过 `stripModelPrefix` 还原
6. **部分模型不可用** — 如 Gemini 系列返回 503（"无可用渠道"），已在过滤中排除
7. **错误信息为中文** — 如 `"无效的令牌"`、`"无可用渠道"`
8. **`obfuscation` 字段** — 流式 chunk 含此非标准字段，不影响功能

## 验证记录

- 验证日期: 2026-02-21
- 定价同步: ⚠️ 无定价 API，需 hardcode
- 凭证添加: ✅ (200/401 标准行为)
- 非流式 Chat: ✅ (GPT-4o-mini, Claude Sonnet 4)
- 流式 Chat: ✅ (stream_options 有效，[DONE] 正常)
- 计费入账: ⚠️ 无 cost 字段，需自行计算
- 健康状态: ✅ (标准 HTTP 状态码)
- 余额自动刷新: N/A
