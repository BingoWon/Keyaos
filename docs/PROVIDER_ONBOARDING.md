# Keyaos — 供应商适配指南

每次接入新的 AI 模型供应商时，按照本文档执行调研、适配、验证三个阶段。

## 阶段一：API 调研

在写任何代码之前，先收集以下信息并记录到本文档附录的供应商档案中。

### 1.1 基本信息

| 项目 | 需要确认的内容 |
|------|--------------|
| 供应商名称 | 正式英文名（用作 `id`），如 `openrouter` |
| 基础端点 | Chat Completions 的 base URL |
| 兼容性 | 是否 OpenAI Compatible（`/v1/chat/completions`） |
| 认证方式 | `Bearer` token？还是自定义 header？ |
| 货币单位 | USD / CNY / EUR |
| 官方文档链接 | Pricing page, API reference |

### 1.2 四个关键 API

每个供应商需要确认以下四个能力。用 curl 逐一验证，记录请求和响应格式。

#### A. 模型列表 — `GET /models`

> 平台需要定期同步供应商的可用模型及定价。

```bash
curl -s https://<base>/v1/models \
  -H "Authorization: Bearer $KEY" | jq '.data[0]'
```

关注点：
- 响应结构：`{ data: [...] }` 还是其他？
- 每个 model 对象是否包含 **定价字段**？（大多数不包含）
- 定价字段格式：USD/token 字符串？USD/M 数字？数组？
- 是否包含 `context_length`？
- model ID 格式：`meta-llama/Llama-3-8B` 还是 `llama-3-8b`？

如果 `/models` 不返回定价，需要额外调研：
- 是否有独立的 pricing API？
- 还是只能从官方文档 hardcode？

#### B. 凭证验证 — 检测 API Key 是否有效

> 用户添加上游凭证时，平台需要即时验证其有效性。

常见策略（按优先级）：

| 策略 | 说明 | 示例 |
|------|------|------|
| 专用验证端点 | 最理想，无副作用 | OpenRouter `/api/v1/auth/key` |
| `/models` 请求 | 最通用的 fallback | 返回 401 = 无效 |
| 轻量级查询 | 余额查询等只读 API | DeepSeek `/user/balance` |

```bash
# 测试有效凭证
curl -s -o /dev/null -w "%{http_code}" \
  https://<base>/v1/models -H "Authorization: Bearer $VALID_KEY"
# 应返回 200

# 测试无效凭证
curl -s -o /dev/null -w "%{http_code}" \
  https://<base>/v1/models -H "Authorization: Bearer invalid-key-xxx"
# 应返回 401 或 403
```

关注点：
- 无效凭证返回的 HTTP 状态码是什么？（401? 403? 其他?）
- 是否有 rate limit 问题（频繁验证是否会被封？）

#### C. 余额查询 — 查询剩余额度

> `supportsAutoCredits` 的核心依据。如果供应商提供余额 API，平台可自动追踪额度。

```bash
curl -s https://<base>/user/balance \
  -H "Authorization: Bearer $KEY" | jq .
```

关注点：
- 是否有余额查询 API？如果没有，`supportsAutoCredits = false`
- 响应格式：`{ remaining: 10.5 }` 还是 `{ balance_infos: [...] }`？
- 余额单位：USD 还是 CNY？（需要在 `currency` 中标明）
- 是否返回已用量（`usage`）？

#### D. Chat Completions — 核心转发能力

> 这是平台的核心功能，必须验证流式和非流式两种模式。

**非流式测试**：

```bash
curl -s https://<base>/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<model-id>",
    "messages": [{"role": "user", "content": "Say hello"}]
  }' | jq '.usage'
```

**流式测试**：

```bash
curl -s https://<base>/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<model-id>",
    "messages": [{"role": "user", "content": "Count to 3"}],
    "stream": true,
    "stream_options": {"include_usage": true}
  }'
```

关注点：
- `usage` 对象结构：是否包含 `prompt_tokens`, `completion_tokens`, `total_tokens`？
- 是否返回费用字段（`cost`, `estimated_cost`, `native_tokens_cost`）？
- 流式模式下，`usage` 出现在哪一帧？最后一帧？独立帧？
- `stream_options: { include_usage: true }` 是否被支持？
- 流式最后是否以 `data: [DONE]` 结尾？
- 是否有非标准的 SSE 格式？

### 1.3 调研结论模板

完成调研后，填写以下表格：

```
供应商: _______________
Base URL: _______________
兼容性: OpenAI Compatible ✅ / 部分兼容 ⚠️ / 不兼容 ❌
货币: USD / CNY
模型列表 API: GET /v1/models → 包含定价? ___
定价格式: _______________
凭证验证方式: _______________
余额查询 API: _______________ (无则填 N/A)
supportsAutoCredits: true / false
费用返回: usage.cost / usage.estimated_cost / 无 (需自行计算)
流式 usage 支持: stream_options 有效? ___
特殊 header: _______________
```

## 阶段二：代码适配

### 判断适配类型

根据调研结果，确定供应商属于哪种类型：

| 类型 | 判断条件 | 适配方式 | 代码位置 |
|------|---------|---------|---------|
| **OpenAI Compatible** | `POST /v1/chat/completions` 兼容 | 仅在 `registry.ts` 中添加 Config 条目 | `registry.ts` |
| **OAuth 反代理** | 非 OpenAI 协议 + OAuth 认证 | 编写专用 Adapter + 协议转换层 | `providers/<name>-adapter.ts` + `protocols/<name>.ts` |

**OpenAI Compatible 供应商**（如 OpenRouter、DeepSeek）：所有适配工作集中在 **一个文件**：`worker/core/providers/registry.ts`。

**OAuth 反代理供应商**（如 Gemini CLI）：需要创建三个组件：
1. **协议转换层** — `worker/core/protocols/<name>.ts`：OpenAI ↔ 原生协议的双向转换（可复用于同协议族的其他供应商）
2. **专用 Adapter** — `worker/core/providers/<name>-adapter.ts`：实现 `ProviderAdapter` 接口，管理 OAuth token 刷新、模型列表等
3. **注册** — 在 `registry.ts` 中实例化并注册

OAuth 反代理适配要点：
- OAuth 应用凭证（`client_id`/`client_secret`）如果是公开的 installed app 类型，直接**硬编码**在 adapter 中（使用字符串拼接规避 GitHub Push Protection）
- 用户提供的 `refresh_token` 存入 `upstream_credentials.secret`
- Adapter 应实现 `normalizeSecret()` 方法智能处理用户输入（如自动从 JSON 中提取 `refresh_token`、拒绝 `access_token` 误传）
- `info.authType` 设为 `"oauth"`，`supportsAutoCredits` 设为 `false`
- `fetchCredits()` 返回 `null`（订阅制无余额概念）
- `fetchModels()` 返回硬编码模型列表 + 影子定价（从同模型的其他平台获取公开价格）

以下为 OpenAI Compatible 供应商的适配步骤：

### 2.1 编写 parseModels 函数

根据调研结果，在 `registry.ts` 中添加解析函数：

```typescript
function parseNewProviderModels(raw: Record<string, unknown>): ParsedModel[] {
  const data = raw.data as Record<string, unknown>[] | undefined;
  if (!data) return [];
  const results: ParsedModel[] = [];

  for (const m of data) {
    const id = m.id as string;
    // ... 根据实际响应结构提取定价
    if (!id) continue;

    results.push({
      id: `newprovider:${id}`,
      provider: "newprovider",
      model_id: id,
      name: (m.name as string) || null,
      input_price: dollarsToCentsPerM(/* ... */),
      output_price: dollarsToCentsPerM(/* ... */),
      context_length: (m.context_length as number) || null,
      is_active: 1,
    });
  }
  return results;
}
```

注意事项：
- `id` 格式固定为 `provider:model_id`
- 价格必须统一为 **USD cents / 1M tokens**（使用 `dollarsToCentsPerM` 辅助函数）
- 如果供应商用 CNY 定价，需在 `parseModels` 中接收 `cnyUsdRate` 参数进行转换
- 如果 `/models` 不返回定价，需要 hardcode 价格表（参考 `parseDeepSeekModels`）

### 2.2 编写 parseCredits 函数（如需要）

仅当余额 API 的响应格式非标准时才需要：

```typescript
function parseNewProviderCredits(
  json: Record<string, unknown>,
): ProviderCredits | null {
  // 从 json 中提取 remaining 和 usage
  return { remaining: /* ... */, usage: /* ... */ };
}
```

如果余额 API 返回标准的 `{ data: { total_credits, total_usage } }` 格式，则无需自定义 parser，`OpenAICompatibleAdapter` 内置了默认处理。

### 2.3 添加 Config 条目

在 `PROVIDER_CONFIGS` 数组中添加一条：

```typescript
{
  id: "newprovider",
  name: "New Provider",
  baseUrl: "https://api.newprovider.com/v1",
  currency: "USD",                        // 或 "CNY"
  supportsAutoCredits: true,              // 有余额 API 则 true
  creditsUrl: "https://api.newprovider.com/v1/credits",  // 可选
  validationUrl: "https://api.newprovider.com/v1/auth",  // 可选，默认用 /models
  parseModels: parseNewProviderModels,
  parseCredits: parseNewProviderCredits,  // 可选
},
```

`OpenAICompatibleConfig` 完整字段参考：

| 字段 | 必填 | 说明 |
|------|:----:|------|
| `id` | ✅ | 供应商 ID（snake_case，全小写） |
| `name` | ✅ | 显示名称 |
| `baseUrl` | ✅ | Chat Completions 前缀（不含 `/chat/completions`） |
| `currency` | ✅ | `"USD"` 或 `"CNY"` |
| `supportsAutoCredits` | ✅ | 是否支持自动余额查询 |
| `creditsUrl` | 条件 | 余额查询 URL（`supportsAutoCredits=true` 时必填） |
| `validationUrl` | 可选 | 凭证验证 URL（默认 `baseUrl + /models`） |
| `modelsUrl` | 可选 | 模型列表 URL（默认 `baseUrl + /models`） |
| `parseModels` | 可选 | 自定义模型解析（默认提取 id + name，价格为 0） |
| `parseCredits` | 可选 | 自定义余额解析 |
| `extraHeaders` | 可选 | 额外 HTTP 头（某些供应商需要自定义 header） |

## 阶段三：验证

### 3.1 定价同步验证

```bash
# 触发手动同步
curl -X POST http://localhost:8787/api/refresh \
  -H "Authorization: Bearer admin"

# 查看同步结果
curl http://localhost:8787/v1/models | jq '.data[] | select(.owned_by == "newprovider")'
```

验证要点：
- [ ] 模型数量是否合理
- [ ] `input_price` / `output_price` 是否为正数且在合理范围
- [ ] `context_length` 是否正确
- [ ] model ID 是否与上游一致

### 3.2 凭证添加验证

```bash
# 用有效凭证测试
curl -X POST http://localhost:8787/api/credentials \
  -H "Authorization: Bearer admin" \
  -H "Content-Type: application/json" \
  -d '{"provider": "newprovider", "secret": "sk-valid-xxx"}'

# 用无效凭证测试（应该报错）
curl -X POST http://localhost:8787/api/credentials \
  -H "Authorization: Bearer admin" \
  -H "Content-Type: application/json" \
  -d '{"provider": "newprovider", "secret": "invalid-key"}'
```

验证要点：
- [ ] 有效凭证 → 201，返回 secretHint
- [ ] 无效凭证 → 400，错误消息清晰（如 credential_not_found）
- [ ] 如果 `supportsAutoCredits=true`，`quotaSource` 应为 `"auto"`，`quota` 应 > 0
- [ ] 如果 `supportsAutoCredits=false`，不提供 quota 时应报错

### 3.3 Chat Completions 验证

**非流式**：

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer admin" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<upstream_model_id>",
    "messages": [{"role": "user", "content": "Say hello"}]
  }' | jq .
```

**流式**：

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer admin" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<upstream_model_id>",
    "messages": [{"role": "user", "content": "Count to 3"}],
    "stream": true
  }'
```

验证要点：
- [ ] 非流式：200 响应，`choices` 非空
- [ ] 流式：SSE 帧正常输出，以 `[DONE]` 结尾
- [ ] 日志中 `[BILLING]` 无错误
- [ ] `ledger` 中出现新记录（`credits_used > 0`）
- [ ] 对应凭证的 `quota` 有扣减

### 3.4 健康状态验证

```bash
# 查看凭证状态
curl http://localhost:8787/api/credentials \
  -H "Authorization: Bearer admin" | jq '.data[] | {id, provider, health, quota}'
```

验证要点：
- [ ] 成功请求后 `health` 为 `"ok"`
- [ ] 凭证失效后（如余额耗尽）`health` 变为 `"dead"`
- [ ] 上游临时错误后 `health` 变为 `"degraded"`

### 3.5 余额自动刷新验证（仅 autoCredits 供应商）

```bash
# 触发刷新
curl -X POST http://localhost:8787/api/refresh \
  -H "Authorization: Bearer admin"

# 检查 quota 是否更新
curl http://localhost:8787/api/credentials \
  -H "Authorization: Bearer admin" | jq '.data[] | select(.provider == "newprovider") | {quota, quotaSource}'
```

### 3.6 Ledger 验证

```bash
curl http://localhost:8787/api/ledger?limit=5 \
  -H "Authorization: Bearer admin" | jq '.data[0]'
```

验证要点：
- [ ] `provider` 字段正确
- [ ] `inputTokens` / `outputTokens` > 0
- [ ] `creditsUsed` > 0 且数值合理

## 阶段四：存档与文档更新

### 4.1 创建供应商档案

在 `docs/providers/` 目录下创建 `<provider-id>.md`（如 `docs/providers/openrouter.md`），包含以下内容：

```markdown
# <Provider Name> 适配档案

## 基本信息
（填写 1.3 调研结论模板的内容）

## API 响应样本

### GET /models 响应片段
（粘贴 1-2 个 model 对象的完整 JSON，展示定价字段结构）

### 凭证验证
- 有效凭证: HTTP <status>
- 无效凭证: HTTP <status>，响应体: ...

### 余额查询响应（如有）
（完整 JSON 响应）

### Chat Completions — 非流式 usage
（粘贴 usage 对象的完整 JSON）

### Chat Completions — 流式最后一帧
（粘贴包含 usage 的 SSE 帧原文）

### 费用字段
（标注 usage.cost / usage.estimated_cost / 无，附原始值示例）

## 定价解析说明
（描述从原始响应到 dollarsToCentsPerM 的转换逻辑和公式）

## 已知问题与注意事项
（记录适配过程中遇到的非标准行为、坑、限制）

## 验证记录
- 验证日期: YYYY-MM-DD
- 验证人: ...
- 定价同步: ✅ / ❌
- 凭证添加: ✅ / ❌
- 非流式 Chat: ✅ / ❌
- 流式 Chat: ✅ / ❌
- 计费入账: ✅ / ❌
- 健康状态: ✅ / ❌
- 余额自动刷新: ✅ / ❌ / N/A
```

### 4.2 更新项目文档

1. **`ARCHITECTURE.md`** — 在上游平台表格中添加新供应商
2. **本文档附录** — 添加供应商摘要档案（保持精简，详细数据在 `docs/providers/` 中）

## 附录：已适配供应商档案

### OpenRouter

```
Base URL: https://openrouter.ai/api/v1
兼容性: OpenAI Compatible ✅
货币: USD
模型列表: GET /v1/models → 包含定价 ✅ (pricing.prompt / pricing.completion, USD/token 字符串)
凭证验证: GET /api/v1/auth/key (专用端点)
余额查询: GET /api/v1/credits → { data: { total_credits, total_usage } }
supportsAutoCredits: true
费用返回: usage.cost (真实 USD)
流式 usage: 支持 stream_options
```

### ZenMux

```
Base URL: https://zenmux.ai/api/v1
兼容性: OpenAI Compatible ✅
货币: USD
模型列表: GET /v1/models → 包含定价 ✅ (pricings.prompt[].value / pricings.completion[].value, USD/M tokens)
凭证验证: GET /api/v1/generation?id=_validate (专用端点)
余额查询: 无
supportsAutoCredits: false
费用返回: 无 (需自行计算)
流式 usage: 支持 stream_options
```

### DeepInfra

```
Base URL: https://api.deepinfra.com/v1/openai
兼容性: OpenAI Compatible ✅
货币: USD
模型列表: GET /v1/openai/models → 包含定价 ✅ (metadata.pricing.input_tokens / output_tokens, USD/M tokens)
凭证验证: GET /v1/openai/models (通用 fallback)
余额查询: 无
supportsAutoCredits: false
费用返回: usage.estimated_cost (估算 USD)
流式 usage: 支持 stream_options
```

### DeepSeek

```
Base URL: https://api.deepseek.com
兼容性: OpenAI Compatible ✅
货币: CNY
模型列表: GET /models → 不包含定价 ❌ (需 hardcode，参考官方 Pricing 页面)
凭证验证: GET /models (通用 fallback)
余额查询: GET /user/balance → { balance_infos: [{ currency, total_balance }] }
supportsAutoCredits: true
费用返回: 无 (需自行计算)
流式 usage: 支持 stream_options
特殊事项: 定价以 CNY/M tokens 为单位，需在 parseModels 中按汇率转换
```

### Gemini CLI

```
Base URL: https://cloudcode-pa.googleapis.com
兼容性: 不兼容 OpenAI ❌ (Google 私有 v1internal 协议，需协议转换层)
认证方式: OAuth (refresh_token → access_token 自动刷新)
货币: N/A (订阅制无余额)
模型列表 API: 无 (硬编码)
凭证验证方式: POST /v1internal:loadCodeAssist (200=有效, 401=无效)
余额查询 API: N/A
supportsAutoCredits: false
费用返回: 无 (仅 usageMetadata token 计数，使用影子定价自行计算)
流式 usage: 最后一帧含完整 usageMetadata (无 [DONE] 终止帧)
特殊事项: OAuth 应用凭证硬编码在 adapter 中; 需 project ID 动态发现; thoughtsTokenCount 合并入 completion_tokens
详细档案: docs/providers/gemini-cli.md
```

### OAIPro

```
Base URL: https://api.oaipro.com/v1
兼容性: OpenAI Compatible ✅
货币: USD
模型列表: GET /v1/models → 不包含定价 ❌ 不包含 context_length ❌
定价格式: N/A (无定价 API，价格记录为 0)
凭证验证方式: GET /v1/models (200=有效, 401=无效)
余额查询 API: N/A
supportsAutoCredits: false
费用返回: 无 (需自行计算)
流式 usage: 支持 stream_options ✅
特殊事项: API 聚合分发平台; /models 需认证, 通过 scripts/fetch-oaipro-models.mjs 脚本生成静态 JSON; 模型 ID 扁平格式, 脚本自动映射为 vendor/model 以对齐聚合; 仅保留 OpenAI + Anthropic 系列
详细档案: docs/providers/oaipro.md
```
