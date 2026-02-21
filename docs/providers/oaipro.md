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

## 模型更新流程

```bash
# 从 OAIPro API 重新拉取模型列表（需要 .env.local 中配置 OAIPRO_KEY）
node scripts/fetch-oaipro-models.mjs

# 脚本自动完成：
# 1. 从 /v1/models 拉取全量列表
# 2. 过滤：仅保留 OpenAI (gpt/chatgpt/o-series) + Anthropic (claude)
# 3. 映射：扁平 ID → vendor/model 格式 (gpt-4o-mini → openai/gpt-4o-mini)
# 4. 输出：worker/core/models/oaipro.json
```

## 已知问题与注意事项

1. **无定价 API** — `/models` 不返回任何定价或 context_length，需 hardcode 价格表
2. **无余额 API** — 无法自动查询余额，`supportsAutoCredits: false`
3. **无 cost 字段** — 计费需基于 token 数量自行计算
4. **模型 ID 不含 vendor 前缀** — 与现有供应商的 `vendor/model` 命名不同，聚合需处理
5. **部分模型不可用** — gemini-2.5-flash 返回 503（"无可用渠道"），模型列表不代表全部可用
6. **错误信息为中文** — 如 `"无效的令牌"`、`"无可用渠道"`
7. **`obfuscation` 字段** — 流式 chunk 含此非标准字段，不影响功能

## 验证记录

- 验证日期: 2026-02-21
- 定价同步: ⚠️ 无定价 API，需 hardcode
- 凭证添加: ✅ (200/401 标准行为)
- 非流式 Chat: ✅ (GPT-4o-mini, Claude Sonnet 4)
- 流式 Chat: ✅ (stream_options 有效，[DONE] 正常)
- 计费入账: ⚠️ 无 cost 字段，需自行计算
- 健康状态: ✅ (标准 HTTP 状态码)
- 余额自动刷新: N/A
