# ZenMux — 验证测试档案

> 测试日期：2026-02-22 (updated)
> 验证状态：**全链路打通** ✅
> 验证脚本：`scripts/verify/zenmux.mjs`
> 验证结果：`scripts/verify/zenmux.json`

## 一、基本信息

| 项目 | 内容 |
|------|------|
| 供应商名称 | `zenmux` |
| 官方名称 | ZenMux |
| 类型 | OpenAI Compatible API 代理 |
| Base URL | `https://zenmux.ai/api/v1` |
| Token 格式 | Bearer Token (`sk-ai-v1-*`) |
| 模型列表 | `GET /api/v1/models`（**公开，无需认证**） |

## 二、模型与定价

### Models API 响应结构

返回 `data[]`，每个模型包含：

```json
{
  "id": "google/gemma-3-12b-it",
  "display_name": "Google: Gemma 3 12B",
  "pricings": {
    "prompt": [
      {
        "value": 0.024,
        "unit": "perMTokens",
        "currency": "USD",
        "conditions": {
          "prompt_tokens": { "unit": "kTokens", "gte": 0, "lt": 32 }
        }
      }
    ],
    "completion": [{ "value": 0.096, "unit": "perMTokens", "currency": "USD" }],
    "input_cache_read": [{ "value": 0.012, "unit": "perMTokens", "currency": "USD" }]
  },
  "context_length": 131072
}
```

- **字段名是 `pricings`**（带 's'），不是 `pricing`
- 值是数组，支持条件阶梯定价（按上下文窗口大小）
- 值是原生数字，单位 `perMTokens`
- `display_name` 提供可读名称
- 截至 2026-02-22：**108 个模型**

### Chat Completion 计费响应

⚠️ **ZenMux 不返回任何费用数据**，仅返回 token 计数：

```json
{
  "usage": {
    "completion_tokens": 3,
    "prompt_tokens": 22,
    "total_tokens": 25,
    "prompt_tokens_details": { "cached_tokens": 11, "isValid": true },
    "isValid": true
  }
}
```

- 无 `cost` 或 `estimated_cost` 字段
- Token 计数可能与其他供应商不同（内部系统提示注入）
- 首次请求就有 `cached_tokens`——内部积极缓存
- **Keyaos 必须独立计算费用**（模型定价 × token 计数）

## 三、凭证验证

### 关键发现：/models 端点是公开的

**⚠️ ZenMux 的 `/models` 端点不需要认证，任何 key（包括无效 key）都返回 200。**

这意味着**不能使用 `/models` 验证 API key 有效性**。

### 验证方案

通过最小化 chat completion 请求验证 key：

```
POST https://zenmux.ai/api/v1/chat/completions
Authorization: Bearer <key>
Body: { "model": "google/gemma-3-12b-it", "messages": [{"role":"user","content":"."}], "max_tokens": 1 }
```

- 有效 key → HTTP 200
- 无效 key → HTTP 403

适配器通过 `customValidateKey` 实现此逻辑。

### 历史问题：validationUrl 404

之前配置了 `validationUrl: "https://zenmux.ai/api/v1/generation?id=_validate"`，但该端点现在返回 404。
已移除该配置，改为 `customValidateKey` 方案。

## 四、测试结果汇总

| 测试项 | 结果 |
|--------|------|
| /models 列表 | ✅ 200, 108 models |
| 旧 validationUrl | ❌ 404（已移除） |
| /models 公开性 | ⚠️ 无效 key 也返回 200 |
| Chat completion 拒绝无效 key | ✅ 403 |
| Chat completion 正常请求 | ✅ 200 |

## 五、定价差异

ZenMux 与 OpenRouter/DeepInfra 对相同模型提供不同定价：

| Model | ZenMux | OpenRouter/DeepInfra | Difference |
|-------|--------|---------------------|------------|
| `google/gemma-3-12b-it` input | $0.024/M | $0.040/M | **40% cheaper** |
| `google/gemma-3-12b-it` output | $0.096/M | $0.130/M | **26% cheaper** |

## 六、踩坑记录

### 6.1 validationUrl 404

**症状**：添加凭证时报 "Invalid credential for zenmux. The secret was rejected by the provider."
**根因**：`generation?id=_validate` 端点被 ZenMux 移除，返回 404。
**修复**：移除 `validationUrl` 配置。

### 6.2 /models 无法验证 key

**症状**：无效 key 也能通过验证。
**根因**：`/models` 是公开端点，不检查认证。
**修复**：使用 `customValidateKey`，通过最小化 chat completion 请求验证 key 有效性。
