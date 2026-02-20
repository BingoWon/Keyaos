-- Keyaos D1 Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    balance_cents INTEGER DEFAULT 0,
    max_price_ratio REAL DEFAULT 1.0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Key 池 (卖家提交的 Key)
CREATE TABLE IF NOT EXISTS key_pool (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    supported_models TEXT NOT NULL,         -- JSON array, empty = all models
    price_ratio REAL DEFAULT 0.5,
    remaining_balance_cents INTEGER,
    is_active INTEGER DEFAULT 1,
    health_status TEXT DEFAULT 'unknown',
    last_health_check INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

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

-- 交易记录
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    buyer_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    upstream_cost_cents INTEGER DEFAULT 0,
    cost_cents INTEGER NOT NULL,
    seller_income_cents INTEGER DEFAULT 0,
    platform_fee_cents INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (key_id) REFERENCES key_pool(id)
);
