# Codex — 验证测试档案

> 测试日期：2026-02-22 (updated)
> 测试凭证来源：`~/.codex/auth.json`（ChatGPT OAuth 登录，Plus 计划）
> 验证状态：**全链路打通** ✅
> 验证脚本：`scripts/verify/codex.mjs`
> 验证结果：`scripts/verify/codex.json`

## 一、基本信息

| 项目 | 内容 |
|------|------|
| 供应商名称 | `codex` |
| 官方名称 | OpenAI Codex |
| 类型 | 反代适配（本地 CLI 工具额度共享） |
| API 协议 | **OpenAI Responses API**（`POST /responses`），非标准 Chat Completions |
| API 端点 | `https://chatgpt.com/backend-api/codex/responses` |
| 认证方式 | OAuth 2.0 + PKCE（ChatGPT 账号登录），`Bearer <access_token>` + `ChatGPT-Account-ID` header |
| OAuth Client ID | `app_EMoamEEZ73f0CkXaXp7hrann`（公开值，PKCE 无 client_secret） |
| OAuth Issuer | `https://auth.openai.com` |
| 凭证存储位置 | `~/.codex/auth.json`（或 OS Keyring） |
| 用户需上传 | `~/.codex/auth.json` 完整内容（包含 `access_token`、`refresh_token`、`account_id`） |
| 订阅要求 | ChatGPT Plus / Pro / Team / Enterprise |
| 官方文档 | https://developers.openai.com/codex |

## 二、认证机制详解

### 2.1 认证模式

ChatGPT OAuth 2.0 + PKCE（无 client_secret）：
- 登录后获得 `access_token`、`refresh_token`、`id_token`
- access_token 有效期约 10 天（864000s）
- redirect_uri: `http://localhost:1455/auth/callback`

### 2.2 auth.json 结构

```json
{
  "auth_mode": "chatgpt",
  "OPENAI_API_KEY": null,
  "tokens": {
    "id_token": "eyJ...",
    "access_token": "eyJ...",
    "refresh_token": "rt_...",
    "account_id": "d126c61f-..."
  },
  "last_refresh": "2026-02-22T02:47:38.714277Z"
}
```

用户上传完整 auth.json 内容，适配器自动提取所需字段。

### 2.3 关键发现：Refresh Token 轮换（单次使用）

**⚠️ 这是本适配中最重要的设计约束。**

OpenAI OAuth 实行 **refresh token rotation**（刷新令牌轮换）：

- 每次使用 `refresh_token` 换取新的 `access_token` 时，OpenAI 同时返回一个**新的** `refresh_token`
- 旧的 `refresh_token` 立即失效
- 如果尝试重用已消耗的 refresh_token，会返回 `refresh_token_reused` 错误

**关键观察**：
- Codex CLI 本身在正常使用中**不频繁刷新 token**——access_token 有效期 10 天，CLI 在有效期内直接使用 access_token
- 因此 `~/.codex/auth.json` 中的 `refresh_token` 在用户正常使用期间通常**不会变化**
- 但一旦被消耗（无论是我们的适配器还是其他工具），该 token 即刻失效

**适配器设计应对**：
1. **凭证添加时**：优先使用 `access_token` 进行验证（JWT 解析 exp 判断有效期），避免消耗 refresh_token
2. **请求转发时**：access_token 有效则直接使用；过期时调用 refresh 并**捕获新的 refresh_token**
3. **轮换持久化**：通过 `ProviderAdapter.getRotatedSecret()` 接口，调用方在 `forwardRequest` 后检查是否有新 token，如有则更新数据库
4. **验证脚本**：**绝不调用** refresh 端点，避免破坏 auth.json 中的 token

### 2.4 Token 刷新接口

```
POST https://auth.openai.com/oauth/token
Content-Type: application/json

{
  "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
  "grant_type": "refresh_token",
  "refresh_token": "<refresh_token>",
  "scope": "openid profile email"
}
```

- 使用 JSON body（与官方 Codex CLI 一致），**不使用** `application/x-www-form-urlencoded`
- scope 为 `"openid profile email"`，**不含** `offline_access`（与官方一致）
- 无需 client_secret（PKCE 公开客户端）
- 返回新 access_token（10 天有效）
- `refresh_token` 为 **Optional** 字段——可能返回新 token（旧的立即失效），也可能不返回（保留原 token）

### 2.5 关键发现：API 端点

ChatGPT OAuth 模式下，Codex **不使用** `api.openai.com/v1`，而是使用：

```
https://chatgpt.com/backend-api/codex/responses
```

源码依据（`model_provider_info.rs:148`）：
```rust
let default_base_url = if matches!(auth_mode, Some(AuthMode::Chatgpt)) {
    "https://chatgpt.com/backend-api/codex"
} else {
    "https://api.openai.com/v1"
};
```

## 三、测试结果汇总

### A. Access Token 有效性检查 ✅

- JWT 解析 `exp` 字段判断有效期
- 当前 token 剩余 ~233 小时（约 10 天）
- 过期时需用户运行 `codex login` 重新获取

### B. 凭证验证（access_token 路径）✅

使用 access_token 向 `/responses` 发送最小请求验证认证有效性：
- HTTP 400（认证通过，请求格式无关紧要）= 验证成功
- HTTP 401 = 认证失败

### C. 流式请求 ✅（唯一支持的模式）

**⚠️ Codex API 现在要求 `stream: true`。非流式请求返回 400 "Stream must be set to true"。**

```
POST https://chatgpt.com/backend-api/codex/responses
Headers: Authorization: Bearer <access_token>
         ChatGPT-Account-ID: <account_id>
         Content-Type: application/json
Body: {
  "model": "gpt-5.2-codex",
  "instructions": "You are a helpful assistant.",
  "input": [{"role": "user", "content": "Say hello in one word only."}],
  "store": false,
  "stream": true
}
```

SSE 事件序列：
1. `response.created` — 响应创建
2. `response.in_progress` — 开始处理
3. `response.output_item.added` — reasoning 开始
4. `response.output_item.done` — reasoning 完成
5. `response.output_item.added` — message 开始
6. `response.content_part.added` — 内容块开始
7. `response.output_text.delta` — **增量文本**（`delta` 字段）
8. `response.output_text.done` — 文本完成
9. `response.content_part.done` — 内容块完成
10. `response.output_item.done` — message 完成
11. `response.completed` — **最终事件，包含完整 usage（在 `response` 嵌套对象中）**

Usage 位置：`data.response.usage`，包含 `input_tokens`、`output_tokens`、`total_tokens`。

### D. 非流式请求 ❌（不再支持）

- `stream: false` → HTTP 400 "Stream must be set to true"
- 适配器始终发送 `stream: true` 到上游，对于客户端非流式请求，收集 SSE 流后组装完整响应返回

### E. 模型限制

- ✅ `gpt-5.2-codex`、`gpt-5.1-codex-mini`、`gpt-5.3-codex` 等 Codex 系列
- ❌ `gpt-4o-mini` 等通用模型（返回 400: "not supported when using Codex with a ChatGPT account"）

### F. 凭证验证 ✅

- 无效 token → HTTP 401

### G. 必需请求字段

- `instructions`：必填（返回 400: "Instructions are required"）
- `input`：必须是数组（返回 400: "Input must be a list"）
- `store`：必须设为 `false`（返回 400: "Store must be set to false"）
- `stream`：必须设为 `true`（返回 400: "Stream must be set to true"）

## 四、本地模型缓存

`~/.codex/models_cache.json` 包含 10 个模型（visibility=list 表示用户可见）：

| slug | visibility | reasoning levels |
|------|:---:|------|
| gpt-5.3-codex | list | low, medium, high, xhigh |
| gpt-5.2-codex | list | low, medium, high, xhigh |
| gpt-5.1-codex-max | list | low, medium, high, xhigh |
| gpt-5.2 | list | low, medium, high, xhigh |
| gpt-5.1-codex-mini | list | low, medium, high, xhigh |
| gpt-5.1-codex | hide | low, medium, high, xhigh |
| gpt-5.1 | hide | low, medium, high, xhigh |
| gpt-5-codex | hide | low, medium, high, xhigh |
| gpt-5 | hide | low, medium, high, xhigh |
| gpt-5-codex-mini | hide | low, medium, high, xhigh |

## 五、与 Gemini CLI 对比

| 维度 | Gemini CLI | Codex |
|------|-----------|-----------|
| OAuth 类型 | Google "Installed App" | PKCE (public client) |
| Client Secret | 有（公开，已硬编码） | **无** |
| Refresh Token 轮换 | **否**（可重复使用） | **是**（单次使用，消耗后失效） |
| 用户上传凭证 | refresh_token | auth.json（含 access_token + refresh_token + account_id） |
| API 端点 | `cloudcode-pa.googleapis.com` | `chatgpt.com/backend-api/codex` |
| API 协议 | Google Native → 需协议转换 | Responses API → 需协议转换 |
| 流式格式 | 自定义 JSON chunks | SSE events (`response.output_text.delta`) |
| 非流式支持 | ✅ | ❌（必须 stream=true） |
| Usage 返回 | ✅ | ✅ (`input_tokens`, `output_tokens`) |
| 免费使用 | ✅ Google 免费额度 | ❌ 需 ChatGPT Plus/Pro 订阅 |
| 余额查询 | ❌ | ❌ |
| 模型获取 | API 可查询 | 本地缓存 / 手工维护 |

## 六、适配实现

### 凭证方案

用户粘贴 `~/.codex/auth.json` 完整内容。适配器 `normalizeSecret()` 自动提取：
- `refresh_token`、`account_id`（必需）
- `access_token`、`expires_at`（可选，从 JWT 解析有效期）

### 认证链路

1. 首选使用 `access_token`（有效期内直接使用）
2. 过期时使用 `refresh_token` 刷新，同时捕获新的 `refresh_token` 并持久化到数据库
3. 每个请求携带 `Authorization: Bearer <access_token>` 和 `ChatGPT-Account-ID: <account_id>`

### 协议转换

Chat Completions → Responses API 请求转换：
- `messages` → `input`（数组格式）
- 增加 `instructions`（从 system message 提取或使用默认值）
- 增加 `store: false`
- **始终 `stream: true`**（上游不支持非流式）

Responses API → Chat Completions 响应转换：
- 流式：`response.output_text.delta` → `choices[0].delta.content`
- 非流式客户端：收集完整 SSE 流 → 组装 `chat.completion` 响应
- `response.completed` 的 `response.usage` → Chat Completions `usage`

### 定价

公开定价通过 OpenRouter 交叉引用自动维护（`scripts/generate/codex.mjs`）。
Usage 字段返回 `input_tokens` 和 `output_tokens`，可直接用于计费。

## 七、踩坑记录

### 7.1 refresh_token_reused 错误

**症状**：用户粘贴 auth.json 添加凭证时失败。
**根因**：验证测试脚本调用了 OAuth refresh 端点，消耗了一次性的 refresh_token。后续任何使用该 token 的操作都会失败。
**修复**：
1. 验证时优先使用 access_token（不消耗 refresh_token）
2. 验证脚本不再调用 refresh 端点
3. 适配器实现 `getRotatedSecret()` 在 token 轮换后持久化新 token

### 7.2 stream=false 被拒绝

**症状**：非流式请求返回 400 "Stream must be set to true"。
**根因**：Codex API 不再支持非流式请求（可能是近期变更）。
**修复**：协议转换层始终设置 `stream: true`；适配器对非流式客户端请求收集 SSE 流后组装完整响应。

### 7.3 错误的 API 端点

**症状**：使用 `api.openai.com/v1` 返回 401/403。
**根因**：ChatGPT OAuth 模式使用 `chatgpt.com/backend-api/codex`，不是标准 OpenAI API。
**发现途径**：阅读 Codex CLI Rust 源码 `model_provider_info.rs`。
