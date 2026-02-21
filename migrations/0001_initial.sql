-- Keyaos D1 Schema (Financial Metaphor Edition)

-- 1. 下游 API Key (出水管：你的应用接入凭证)
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,                   -- 唯一标识 e.g. "sk-keyaos-..."
    owner_id TEXT NOT NULL,                -- Clerk User ID 归属
    name TEXT NOT NULL,                    -- 用户自定义名称 e.g. "Cursor 专用"
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);

-- 2. 供应商账单通道 / 上游额度池 (进水管：底层资产)
CREATE TABLE IF NOT EXISTS quota_listings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,                -- Clerk User ID 归属
    provider TEXT NOT NULL,                -- openrouter / zenmux / deepinfra
    api_key TEXT NOT NULL,                 -- 上游 API Key
    quota REAL DEFAULT 0.0,                -- 上游剩余资产
    quota_source TEXT DEFAULT 'manual',    -- 'auto' | 'manual'
    is_enabled INTEGER DEFAULT 1,          -- 用户意愿: 1 = enabled, 0 = paused
    price_multiplier REAL NOT NULL DEFAULT 1.0, -- 流动性结算比率 (Clearing Ratio)
    health_status TEXT DEFAULT 'unknown',  -- ok / degraded / dead / unknown
    last_health_check INTEGER,
    added_at INTEGER NOT NULL              -- 添加时间
);

CREATE INDEX IF NOT EXISTS idx_quota_listings_owner ON quota_listings(owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_listings_api_key
    ON quota_listings(api_key);

-- 3. 市场大盘报价 (各大厂模型实时价格，Cron 自动刷新)
CREATE TABLE IF NOT EXISTS market_quotes (
    id TEXT PRIMARY KEY,                    -- "provider:upstream_id"
    provider TEXT NOT NULL,
    upstream_id TEXT NOT NULL,
    display_name TEXT,
    input_price REAL NOT NULL DEFAULT 0.0,  -- system credits / 1M tokens
    output_price REAL NOT NULL DEFAULT 0.0, -- system credits / 1M tokens
    context_length INTEGER,
    is_active INTEGER DEFAULT 1,
    refreshed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_quotes_provider_upstream
    ON market_quotes(provider, upstream_id);

CREATE INDEX IF NOT EXISTS idx_market_quotes_routing
    ON market_quotes(upstream_id, is_active, input_price);

-- 4. 交易流水账本
CREATE TABLE IF NOT EXISTS ledger (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,                -- Clerk User ID 归属
    listing_id TEXT NOT NULL,              -- 绑定到哪个上游 quota_listings 消耗的
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    credits_used REAL NOT NULL,            -- 本次抵扣额度
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger(owner_id);
