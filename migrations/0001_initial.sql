-- Keyaos D1 Schema

-- 1. Downstream API keys (platform-issued access tokens)
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
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
    is_active INTEGER DEFAULT 1,
    refreshed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_pricing_provider_model ON model_pricing(provider, model_id);
CREATE INDEX IF NOT EXISTS idx_model_pricing_routing ON model_pricing(model_id, is_active, input_price);

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
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_consumer ON usage(consumer_id);
CREATE INDEX IF NOT EXISTS idx_usage_credential_owner ON usage(credential_owner_id);

-- 5. [Platform] User wallets
CREATE TABLE IF NOT EXISTS wallets (
    owner_id TEXT PRIMARY KEY,
    balance REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- 6. [Platform] Payment records
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    credits REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);

-- 7. [Platform] Admin credit adjustments (audit trail for grants/revokes)
CREATE TABLE IF NOT EXISTS credit_adjustments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adjustments_owner ON credit_adjustments(owner_id);
