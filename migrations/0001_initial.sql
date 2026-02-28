-- Keyaos D1 Schema

-- 1. Downstream API keys (platform-issued access tokens)
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);

-- 2. Upstream credentials (user-hosted provider keys and quotas)
CREATE TABLE IF NOT EXISTS upstream_credentials (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'api_key',
    secret TEXT NOT NULL,
    quota REAL,
    quota_source TEXT,
    is_enabled INTEGER DEFAULT 1,
    price_multiplier REAL NOT NULL DEFAULT 1.0,
    health_status TEXT DEFAULT 'unknown',
    last_health_check INTEGER,
    metadata TEXT,
    added_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_owner ON upstream_credentials(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_secret ON upstream_credentials(secret);

-- 3. Model pricing catalog (auto-synced by cron)
CREATE TABLE IF NOT EXISTS model_pricing (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    name TEXT,
    input_price REAL NOT NULL DEFAULT 0.0,
    output_price REAL NOT NULL DEFAULT 0.0,
    context_length INTEGER,
    input_modalities TEXT DEFAULT NULL,
    output_modalities TEXT DEFAULT NULL,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 999999,
    upstream_model_id TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    refreshed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_pricing_provider_model ON model_pricing(provider, model_id);
CREATE INDEX IF NOT EXISTS idx_model_pricing_routing ON model_pricing(model_id, is_active, input_price);
CREATE INDEX IF NOT EXISTS idx_model_pricing_sort ON model_pricing(model_id, sort_order);

-- 4. API usage records (two-sided: consumer + credential owner)
CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY,
    consumer_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    credential_owner_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    base_cost REAL NOT NULL,
    consumer_charged REAL NOT NULL DEFAULT 0,
    provider_earned REAL NOT NULL DEFAULT 0,
    platform_fee REAL NOT NULL DEFAULT 0,
    price_multiplier REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_consumer ON usage(consumer_id);
CREATE INDEX IF NOT EXISTS idx_usage_credential_owner ON usage(credential_owner_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);

-- 5. Pre-aggregated OHLC candle data for price trend charts
CREATE TABLE IF NOT EXISTS price_candles (
    dimension TEXT NOT NULL,
    dimension_value TEXT NOT NULL,
    interval_start INTEGER NOT NULL,
    open_price REAL NOT NULL,
    high_price REAL NOT NULL,
    low_price REAL NOT NULL,
    close_price REAL NOT NULL,
    volume INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    PRIMARY KEY (dimension, dimension_value, interval_start)
);

-- 6. [Platform] User wallets
CREATE TABLE IF NOT EXISTS wallets (
    owner_id TEXT PRIMARY KEY,
    balance REAL NOT NULL DEFAULT 0,
    stripe_customer_id TEXT,
    updated_at INTEGER NOT NULL
);

-- 7. [Platform] Payment records
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'manual',
    stripe_session_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    credits REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);

-- 8. [Platform] Auto top-up configuration
CREATE TABLE IF NOT EXISTS auto_topup_config (
    owner_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    threshold REAL NOT NULL DEFAULT 5.0,
    amount_cents INTEGER NOT NULL DEFAULT 1000,
    payment_method_id TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_triggered_at INTEGER,
    paused_reason TEXT
);

-- 9. [Platform] Admin credit adjustments (audit trail for grants/revokes)
CREATE TABLE IF NOT EXISTS credit_adjustments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_owner ON credit_adjustments(owner_id);
