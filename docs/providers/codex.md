# Codex — 已摒弃（Deprecated）

> **状态：已摒弃** ❌
> **决定日期：2026-02-22**
> **原因：chatgpt.com 屏蔽 Cloudflare Workers 出站请求，反代不可行**
> **保留文件：`scripts/verify/codex.mjs`、`scripts/verify/codex.json`（验证档案）**
> **已删除文件：`worker/core/providers/codex-adapter.ts`、`worker/core/protocols/codex-responses.ts`、`worker/core/models/codex.json`、`scripts/generate/codex.mjs`**

---

## 一、为什么摒弃 Codex

### 根本原因：Cloudflare Workers 的 `Cf-Worker` 请求头

Cloudflare Workers 运行时（workerd）对所有通过 `fetch()` 发出的出站 HTTP 请求**自动注入** `Cf-Worker` 请求头。这是运行时级别的行为，Worker 代码**无法移除或覆盖**——请求头在代码执行之后、请求发出之前由运行时注入。

chatgpt.com（Codex API 的唯一端点）检测到 `Cf-Worker` 请求头后，对所有此类请求返回 **403 Forbidden**（HTML 错误页面），不区分请求内容。

### 验证过程

1. **发现问题**：用户在前端添加 Codex 凭证时始终失败（`validateKey` 返回 `false`），但所有 Node.js 测试脚本均能成功验证。

2. **添加调试端点**：在 Worker 中添加临时 `/debug/codex-test` 端点，直接测试 `normalizeSecret` + `validateKey` 流程。
   - `normalizeSecret` 完全正常（JSON 解析、JWT 解码、expires_at 提取全部成功）
   - `validateKey` 中的 `fetch("https://chatgpt.com/backend-api/codex/responses", ...)` 返回 **403 Forbidden + HTML 页面**

3. **确认 `Cf-Worker` 请求头**：通过 `/debug/fetch-test` 端点请求 httpbin.org，观察到 Worker 出站请求携带：
   ```
   "Cf-Worker": "keyaos.example.com"
   ```

4. **最终验证**：在 Node.js 中手动添加 `Cf-Worker: keyaos.example.com` 请求头访问 chatgpt.com → **同样返回 403**。确认该请求头是触发封锁的直接原因。

### 影响范围

| 端点 | 从 Workers 访问 | 备注 |
|------|:---:|------|
| `chatgpt.com/backend-api/codex/*` | ❌ 403 | Codex API（ChatGPT OAuth 凭证唯一端点） |
| `auth.openai.com/oauth/token` | ✅ 200 | OAuth token 刷新 |
| `api.openai.com/v1/*` | ✅ 200 | OpenAI 标准 API（但 ChatGPT OAuth token 无权限） |

ChatGPT OAuth access_token 的 `aud` 为 `https://api.openai.com/v1`，但实际仅有 `chatgpt.com` 端点接受：
- `api.openai.com/v1/responses` → 401 "Missing scopes: api.responses.write"
- `api.openai.com/v1/chat/completions` → 429 "insufficient_quota"

**结论：不存在可用的替代端点。**

### 不存在可行的规避方案

| 方案 | 结果 |
|------|------|
| 添加 User-Agent / originator 请求头 | 无效，403 依旧 |
| 使用 `api.openai.com` 替代端点 | ChatGPT OAuth token 无权限 |
| 移除 `Cf-Worker` 请求头 | 不可能，运行时注入 |
| 外部中继（Vercel/AWS 部署中间代理） | 技术可行但增加架构复杂度、延迟和运维成本 |
| 整体迁移离开 Cloudflare Workers | 代价过大，失去 D1/Cron/Workers 生态 |

### 这个限制不影响 OpenAI 官方适配

使用标准 API key 的 OpenAI 适配（`openai` provider）完全正常：
- 端点 `api.openai.com/v1` 不屏蔽 Workers
- Codex 系列模型（如 `gpt-5.2-codex`）通过 OpenAI 标准 API 可正常访问
- 只要用户有足额的 OpenAI API credits，即可使用所有 Codex 模型

Codex 适配器的目的是让 ChatGPT Plus 订阅用户共享闲置额度。这个特定场景依赖 `chatgpt.com` 端点，因此不可行。

---

## 二、曾经完成的工作（已删除代码的存档）

以下记录已删除代码的核心设计，以便将来参考。

### 适配器设计

- **CodexAdapter**（`worker/core/providers/codex-adapter.ts`）：实现 `ProviderAdapter` 接口
- **协议转换层**（`worker/core/protocols/codex-responses.ts`）：OpenAI Chat Completions ↔ Codex Responses API 双向转换
- **静态模型定价**（`worker/core/models/codex.json`）：通过 OpenRouter 交叉引用生成
- **价格生成脚本**（`scripts/generate/codex.mjs`）：从 OpenRouter 拉取 Codex 模型定价

### 认证机制

- OAuth 2.0 + PKCE，Client ID: `app_EMoamEEZ73f0CkXaXp7hrann`
- Refresh token 单次使用轮换（OpenAI 特有）
- `getRotatedSecret()` 接口用于在 token 轮换后持久化新 token
- 凭证格式：用户粘贴 `~/.codex/auth.json` 完整内容

### 协议转换

- 请求：`messages` → `input` 数组，提取 `instructions`，强制 `store: false`、`stream: true`
- 响应（流式）：`response.output_text.delta` → `choices[0].delta.content`
- 响应（非流式客户端）：收集完整 SSE 流 → 组装 `chat.completion` 对象
- Usage：从 `response.completed` 事件的 `response.usage` 中提取

### 关键发现

1. Codex API **仅接受** `stream: true`，非流式返回 400
2. 必需请求字段：`instructions`、`input`（数组）、`store: false`、`stream: true`
3. 仅支持 Codex 系列模型（`gpt-5.2-codex` 等），通用模型返回 400
4. `ChatGPT-Account-ID` 请求头必需
5. OAuth refresh 使用 JSON body（非 form-urlencoded），scope 为 `openid profile email`（无 `offline_access`）
6. `refresh_token` 在 OAuth 响应中为 Optional 字段

---

## 三、验证档案

验证脚本和结果保留在：
- `scripts/verify/codex.mjs` — 完整的 Codex API 验证测试脚本
- `scripts/verify/codex.json` — 最后一次验证的完整结果

这些文件证明：**Codex API 本身功能完全正常，协议转换方案完全可行**。摒弃的唯一原因是 Cloudflare Workers 运行时限制。

---

## 四、如果将来重新考虑

如果将来需要重新支持 Codex，需满足以下**任一条件**：

1. **Cloudflare 提供关闭 `Cf-Worker` 请求头的选项**（目前不存在）
2. **OpenAI 取消对 Workers 流量的屏蔽**（可能性极低）
3. **项目迁移到不注入识别头的运行时**（如 Vercel Edge、Deno Deploy）
4. **部署外部中继服务**（Worker → 中继 → chatgpt.com）

此前完成的所有工作（协议转换、OAuth 轮换、定价方案）均已验证可行，参考本文档和验证脚本即可恢复。
