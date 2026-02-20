-- Keyaos D1 Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,          -- 平台生成的 pk-xxx
    balance_cents INTEGER DEFAULT 0,       -- 余额 (分)
    max_price_ratio REAL DEFAULT 1.0,      -- 用户愿意接受的最高价格比率
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Key 池
CREATE TABLE IF NOT EXISTS key_pool (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,                -- openrouter / zenmux / deepinfra
    api_key_encrypted TEXT NOT NULL,       -- AES-GCM 加密存储
    price_ratio REAL DEFAULT 0.5,          -- 折扣比率 (如 0.5 = 上游成本的50%)
    credits_cents INTEGER DEFAULT 0,       -- 剩余 credits (分)
    credits_source TEXT DEFAULT 'manual',  -- 'auto' (API获取) | 'manual' (用户设置)
    is_active INTEGER DEFAULT 1,
    health_status TEXT DEFAULT 'unknown',  -- ok / degraded / dead
    last_health_check INTEGER,
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
    upstream_cost_cents INTEGER DEFAULT 0,  -- 上游真实成本
    cost_cents INTEGER NOT NULL,            -- 用户实际支付
    seller_income_cents INTEGER DEFAULT 0,  -- Key 提供者收入
    platform_fee_cents INTEGER DEFAULT 0,   -- 平台收入
    created_at INTEGER NOT NULL,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (key_id) REFERENCES key_pool(id)
);
