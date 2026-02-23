-- Platform billing: two-sided ledger with service fee

ALTER TABLE ledger RENAME COLUMN owner_id TO consumer_id;
ALTER TABLE ledger RENAME COLUMN credits_used TO base_cost;

ALTER TABLE ledger ADD COLUMN credential_owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger ADD COLUMN consumer_charged REAL NOT NULL DEFAULT 0;
ALTER TABLE ledger ADD COLUMN provider_earned REAL NOT NULL DEFAULT 0;
ALTER TABLE ledger ADD COLUMN platform_fee REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ledger_credential_owner ON ledger(credential_owner_id);
