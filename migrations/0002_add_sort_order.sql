-- Add sort_order column to model_pricing for OpenRouter model ordering
ALTER TABLE model_pricing ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 999999;
CREATE INDEX IF NOT EXISTS idx_model_pricing_sort ON model_pricing(model_id, sort_order);
