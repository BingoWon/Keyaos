# ADR-014: 多模态定价与计费精度分析

## 状态
已分析，暂不适配 (2026-02-28)

## 背景

### 发现

OpenRouter `/models` API 返回的定价对象最多包含 9 种模态维度：

| 定价键 | 覆盖率 | 含义 |
|---|---|---|
| `prompt` | 337/337 | 文本输入 (USD/token) |
| `completion` | 337/337 | 文本输出 (USD/token) |
| `input_cache_read` | 106/337 | 缓存命中折扣价 |
| `web_search` | 53/337 | 联网搜索固定费用 |
| `input_cache_write` | 25/337 | 缓存写入价格 |
| `internal_reasoning` | 18/337 | 思考链 token 价格 |
| `image` | 17/337 | 图片输入 token 价格 |
| `audio` | 17/337 | 音频输入 token 价格 |
| `request` | 4/337 | 每请求固定费用 |

当前系统仅存储 `input_price`（prompt）和 `output_price`（completion）两个维度。

### 核心问题：各供应商计费能力差异

| 供应商 | 返回实际费用 | Token 维度 | 计费方式 | 风险评估 |
|---|---|---|---|---|
| OpenRouter | ✅ `usage.cost` | prompt + completion | 精确（上游直接返回） | 零 |
| DeepInfra | ✅ `usage.estimated_cost` | prompt + completion | 精确（上游直接返回） | 零 |
| ZenMux | ❌ | 仅 prompt + completion | 兜底公式计算 | 中（多模态被低估） |
| Gemini AI Studio | ❌ | prompt + completion + 隐含 thinking | 兜底公式计算 | 中（thinking tokens 计费不透明） |
| Kiro | ❌ | 估算值（无标准 token 计数） | 启发式估算 | 高（订阅制，仅做参考） |

### 计费链路分析

`calculateBaseCost()` 采用三级回退：

```
1. usage.cost           → OpenRouter 返回，精确包含所有模态费用
2. usage.estimated_cost → DeepInfra 返回，精确
3. (prompt_tokens × input_price) + (completion_tokens × output_price) → 兜底
```

第 3 级兜底的局限：
- **图片/音频 token**：可能被合并计入 `prompt_tokens` 但按文本单价计算（实际图片单价可能不同）
- **思考链 token**：Gemini 隐含在 `total_tokens` 中但不暴露，我们用 `completion_tokens` 计费会漏掉
- **Web 搜索**：固定费用，不体现在 token 计数中
- **缓存**：缓存读取价格通常更低，但我们统一按非缓存价格计费

## 决策

**暂不适配多模态定价。**

## 原因

### 1. 实际影响受 OpenRouter-First 策略限制

OpenRouter 作为 canonical catalog 和首选供应商，其 `usage.cost` 已精确覆盖所有模态费用。只有当 OpenRouter 向其他供应商让出路由（如 ZenMux 提供更低文本价格）时才触发兜底计费。而 ZenMux 提供的主要是文本模型——多模态模型（Gemini、Claude）走 OpenRouter 时费用精确。

### 2. 上游 API 能力是天花板

不返回 `cost` 的供应商（ZenMux、Gemini AI Studio），即使我们存储了所有 9 种定价维度，也无法从标准 OpenAI-compatible `usage` 字段中获取细分模态 token 数（如图片 token、音频 token 分别是多少）。这是上游 API 的结构性限制，应用层无法补救。

### 3. 改动规模大、收益低

完整适配需要：
- DB 新增列或 JSON 字段存储 9 种价格
- 修改所有 parse 函数提取细分定价
- `calculateBaseCost` 按模态维度分别计算
- 前端 UI 展示多维度价格（复杂化 ModelCard）
- 需要上游返回细分 token 数才能利用这些价格

### 4. 文本计费是大多数请求的主体

在当前 AI API 使用中，绝大多数请求是纯文本。图片/音频输入虽然存在，但占总请求量的少数。缓存折扣和推理链对用户来说是透明的优化。

## 风险评估

### 可能被低估的场景

1. **ZenMux + 图片输入**：如果用户发送图片给 ZenMux 路由的多模态模型，图片 token 按文本价格计费（通常价格相同或更低）
2. **Gemini AI Studio + 长推理**：thinking tokens 被漏算（但 Gemini AI Studio 目前价格极低：$0.15/M input）
3. **Web 搜索费用**：OpenRouter 的 web_search 固定费用（$0.01/请求）在兜底计费中被忽略

### 缓解措施（已生效）

- OpenRouter-First 策略确保大多数请求走精确计费路径
- 调度器优先选择低成本供应商，间接偏向 OpenRouter 和 DeepInfra（都返回精确费用）

## 未来计划

### Phase 1（低优先级）

- 在 `calculateBaseCost` 中新增日志，当走兜底计费且模型有多模态能力时记录 warning
- 监控兜底计费的频率和涉及的模型

### Phase 2（视需求而定）

- 如果 ZenMux 或其他非 cost 供应商开始大量路由多模态请求，考虑：
  - DB 新增 `pricing_details JSON` 列存储全量定价对象
  - 前端 ModelCard 展开区域添加 "Pricing Details" 信息行

## 相关文件

- `worker/core/billing.ts` — `calculateBaseCost` 三级回退逻辑
- `worker/core/utils/stream.ts` — `TokenUsage` 接口（仅 prompt/completion/cost）
- `worker/core/providers/registry.ts` — `parseOpenRouterModels` 仅读取 prompt/completion
- `docs/providers/openrouter.md` — OpenRouter 返回 `usage.cost`
- `docs/providers/deepinfra.md` — DeepInfra 返回 `usage.estimated_cost`
- `docs/providers/zenmux.md` — ZenMux 不返回费用，仅 token 计数
- `docs/providers/gemini-aistudio.md` — 不返回费用，thinking tokens 隐含在 total_tokens
- `docs/decisions/013-openrouter-first.md` — OpenRouter-First 策略（间接缓解此问题）
