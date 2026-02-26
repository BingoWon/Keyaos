-- Store price_multiplier on each usage record for analytics
ALTER TABLE usage ADD COLUMN price_multiplier REAL NOT NULL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);

-- Pre-aggregated OHLC candle data for price trend charts
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
