# ADR-013: OpenRouter-First 模型目录策略

## 状态
已采纳 (2026-02-28)

## 背景

### 问题一：model_id 大小写不一致

DeepInfra API 返回 HuggingFace 风格的大写 model_id（如 `Qwen/Qwen3-Max`），而 OpenRouter 和 ZenMux 使用全小写格式（如 `qwen/qwen3-max`）。系统中所有 model_id 匹配均为精确字符串比较（SQL `WHERE model_id = ?`、前端 `Map.get(e.id)`），导致：

- **路由撮合断裂**：用户请求 `qwen/qwen3-max` 时，DeepInfra 的低价 offering（`Qwen/Qwen3-Max`）永远不会出现在候选列表中
- **前端重复展示**：同一模型以不同大小写出现为两个独立卡片
- **价格蜡烛分裂**：同一模型的价格走势被分成两条独立时间线

经生产环境 DB 验证，转为小写后有 31 个 DeepInfra 模型可与 OpenRouter 正确匹配。

### 问题二：模型目录缺乏权威排序

各供应商返回模型的顺序不一致，前端按"供应商数量降序"排序，无法反映模型的真实热度和质量。OpenRouter 是市面上最全面的 AI 模型聚合商，其 `/models` API 返回的顺序经过热度、使用量、评分、新上架等综合因素排序，是最权威的模型排序来源。

### 问题三：非主流模型噪音

部分供应商提供 OpenRouter 不收录的小众模型。这些模型缺乏 OpenRouter 的质量审核和排序权重，出现在模型列表中会稀释用户体验。

## 决策

### 1. OpenRouter 为唯一模型目录基准

系统中**只保留 OpenRouter 提供的模型**。Cron 同步时，先同步 OpenRouter 构建 model_id 白名单，其他供应商的模型若不在白名单中则丢弃、不写入数据库。

这意味着数据库中的所有模型都有 OpenRouter 的背书——经过热度筛选、质量审核、定价校验。

### 2. 保存 OpenRouter 排序

在 `model_pricing` 表新增 `sort_order` 列（INTEGER），OpenRouter 行存储 API 返回的数组索引（0 = 最热门），其他供应商行存储 999999（仅用作兜底）。

所有模型列表查询 `ORDER BY sort_order ASC`，前端不再自行排序。

### 3. DeepInfra model_id 归一化与转发

在 `parseDeepInfraModels()` 中将 `model_id` 统一转为小写（`.toLowerCase()`），与 OpenRouter 的小写格式对齐。原始大写 ID 存入 `upstream_model_id` 字段，供转发时恢复原始大小写（DeepInfra API 大小写敏感）。

`dispatcher.ts` 在调度结果中返回 `upstreamModelId`，`gateway.ts` 转发时使用 `upstreamModelId ?? modelId`，确保上游 API 收到正确格式的 model ID，而内部路由、计费、前端展示统一使用小写 canonical ID。

### 4. 两阶段同步

```
Phase 1: 同步 OpenRouter（canonical catalog）
         ├─ 写入 DB，附带 sort_order
         └─ 构建 allowedModelIds Set

Phase 2: 并行同步其他供应商
         ├─ 获取模型列表
         ├─ 过滤：models.filter(m => allowedModelIds.has(m.model_id))
         ├─ 仅写入过滤后的模型
         └─ deactivateMissing 清理不在过滤结果中的旧记录
```

如果 Phase 1 OpenRouter 返回 0 个模型（API 故障），**整个同步中止**，保护现有数据不被清空。

## 原因

- **一致性**：所有模型 ID 来源于 OpenRouter 的规范格式，消除跨供应商的命名差异
- **质量保证**：OpenRouter 的模型目录经过严格的上下架管理，不会出现废弃或低质量模型
- **用户体验**：按 OpenRouter 的热度排序展示，用户第一眼看到的就是最热门的模型
- **简洁性**：数据库中不再有"孤儿模型"——每个模型都保证在最大的聚合商平台上可用
- **渐进增强**：其他供应商仍然参与同步和撮合，只是模型范围被收束到 OpenRouter 的目录内

## 影响

- `model_pricing` 表的记录数量会减少（仅保留 OpenRouter 目录中的模型）
- 前端模型数量会下降，但这些模型的质量和排序更可靠
- 未来新增供应商时，其模型自动过滤到 OpenRouter 白名单，无需额外配置
- 如果 OpenRouter 下架了某个模型，下次同步时该模型会从所有供应商的记录中被 deactivate
- `sort_order` 每次同步都会更新，反映 OpenRouter 最新的排序变化

## 相关文件

- `worker/core/sync/sync-service.ts` — 两阶段同步实现
- `worker/core/providers/registry.ts` — OpenRouter 排序写入 + DeepInfra 大小写归一化 + `upstream_model_id`
- `worker/core/db/pricing-dao.ts` — sort_order / upstream_model_id 列写入和查询排序
- `worker/core/dispatcher.ts` — 调度结果返回 `upstreamModelId`
- `worker/routes/gateway.ts` — 转发使用 `upstreamModelId ?? modelId`
- `migrations/0001_initial.sql` — sort_order / upstream_model_id 列定义
- `src/pages/Dashboard.tsx` / `Models.tsx` / `Providers.tsx` — 移除前端自定义排序
