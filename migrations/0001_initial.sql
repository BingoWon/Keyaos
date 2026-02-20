-- Keyaos D1 Schema (Core Mode)

-- Key 池
CREATE TABLE IF NOT EXISTS key_pool (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,                -- openrouter / zenmux / deepinfra
    api_key TEXT NOT NULL,                 -- 上游 API Key
    credits_cents INTEGER DEFAULT 0,       -- 剩余 credits (分)
    credits_source TEXT DEFAULT 'manual',  -- 'auto' | 'manual'
    is_active INTEGER DEFAULT 1,
    health_status TEXT DEFAULT 'unknown',  -- ok / degraded / dead / unknown
    last_health_check INTEGER,
    added_at INTEGER NOT NULL              -- 添加时间
);

-- 防止同一个 API Key 被重复添加
CREATE UNIQUE INDEX IF NOT EXISTS idx_key_pool_api_key
    ON key_pool(api_key);

-- 供应商模型价格表 (Cron 自动同步)
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,                    -- "provider:upstream_id"
    provider TEXT NOT NULL,
    upstream_id TEXT NOT NULL,
    display_name TEXT,
    input_cost INTEGER NOT NULL DEFAULT 0,  -- cents / 1M tokens
    output_cost INTEGER NOT NULL DEFAULT 0, -- cents / 1M tokens
    context_length INTEGER,
    is_active INTEGER DEFAULT 1,
    synced_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_models_provider_upstream
    ON models(provider, upstream_id);

CREATE INDEX IF NOT EXISTS idx_models_routing
    ON models(upstream_id, is_active, input_cost);

-- 用量记录
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    key_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL,           -- 上游成本 (分)
    created_at INTEGER NOT NULL
);
