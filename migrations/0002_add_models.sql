-- 0002_add_models.sql

-- 供应商模型价格表 (Cron 自动同步维护)
CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,              -- "openrouter:google/gemma-3-12b-it"
    provider TEXT NOT NULL,
    upstream_id TEXT NOT NULL,
    display_name TEXT,
    input_cost INTEGER NOT NULL DEFAULT 0,
    output_cost INTEGER NOT NULL DEFAULT 0,
    context_length INTEGER,
    is_active INTEGER DEFAULT 1,
    synced_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_models_provider_upstream
    ON models(provider, upstream_id);

CREATE INDEX IF NOT EXISTS idx_models_routing
    ON models(upstream_id, is_active, input_cost);

-- 交易表新增上游成本字段
ALTER TABLE transactions ADD COLUMN upstream_cost_cents INTEGER DEFAULT 0;
