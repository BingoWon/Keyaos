-- Keyaos D1 Schema

-- 1. 下游 API Key (平台签发给用户的访问凭证)
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);

-- 2. 上游 Key (用户托管的上游供应商凭证及余额)
CREATE TABLE IF NOT EXISTS upstream_keys (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,                -- openrouter / zenmux / deepinfra
    api_key TEXT NOT NULL,                 -- 上游 API Key
    quota REAL DEFAULT 0.0,                -- 上游剩余额度
    quota_source TEXT DEFAULT 'manual',    -- 'auto' | 'manual'
    is_enabled INTEGER DEFAULT 1,          -- 1 = enabled, 0 = disabled
    price_multiplier REAL NOT NULL DEFAULT 1.0,
    health_status TEXT DEFAULT 'unknown',  -- ok / degraded / dead / unknown
    last_health_check INTEGER,
    added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upstream_keys_owner ON upstream_keys(owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_upstream_keys_api_key
    ON upstream_keys(api_key);

-- 3. 模型定价目录 (各供应商模型实时价格，Cron 自动刷新)
CREATE TABLE IF NOT EXISTS model_pricing (
    id TEXT PRIMARY KEY,                    -- "provider:upstream_id"
    provider TEXT NOT NULL,
    upstream_id TEXT NOT NULL,
    display_name TEXT,
    input_price REAL NOT NULL DEFAULT 0.0,  -- credits / 1M tokens
    output_price REAL NOT NULL DEFAULT 0.0, -- credits / 1M tokens
    context_length INTEGER,
    is_active INTEGER DEFAULT 1,
    refreshed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_pricing_provider_upstream
    ON model_pricing(provider, upstream_id);

CREATE INDEX IF NOT EXISTS idx_model_pricing_routing
    ON model_pricing(upstream_id, is_active, input_price);

-- 4. 交易流水
CREATE TABLE IF NOT EXISTS ledger (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    upstream_key_id TEXT NOT NULL,          -- 消耗的上游 Key ID
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    credits_used REAL NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger(owner_id);
