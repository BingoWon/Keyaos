-- Keyaos D1 Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,          -- 平台生成的 pk-xxx
    balance_cents INTEGER DEFAULT 0,       -- 余额 (分)
    max_price_ratio REAL DEFAULT 1.0,      -- 买方最高价格比率 (如 0.75 = 市场价75%)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Key 池 (卖家提交的 Key)
CREATE TABLE IF NOT EXISTS key_pool (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,                -- 卖家 user_id
    provider TEXT NOT NULL,                -- openrouter / zenmux / deepinfra
    api_key_encrypted TEXT NOT NULL,       -- 加密存储
    price_ratio REAL DEFAULT 0.5,          -- 卖价比率 (如 0.5 = 上游成本的50%)
    remaining_balance_cents INTEGER,       -- 预估剩余余额
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
    key_id TEXT NOT NULL,                  -- 执行请求的 Key
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    upstream_cost_cents INTEGER DEFAULT 0, -- 上游真实成本
    cost_cents INTEGER NOT NULL,           -- 买家实际支付
    seller_income_cents INTEGER DEFAULT 0, -- 卖家收入
    platform_fee_cents INTEGER DEFAULT 0,  -- 平台收入
    created_at INTEGER NOT NULL,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (key_id) REFERENCES key_pool(id)
);
