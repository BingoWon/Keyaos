ALTER TABLE usage RENAME TO logs;

DROP INDEX IF EXISTS idx_usage_consumer;
DROP INDEX IF EXISTS idx_usage_credential_owner;
DROP INDEX IF EXISTS idx_usage_created;

CREATE INDEX IF NOT EXISTS idx_logs_consumer ON logs(consumer_id);
CREATE INDEX IF NOT EXISTS idx_logs_credential_owner ON logs(credential_owner_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
