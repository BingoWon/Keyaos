/**
 * D1 Database Schema Types
 * Matches the schema defined in migrations/0001_initial.sql
 */

export interface DbUser {
	id: string; // "user_1" etc. In production, this would be a UUID or K-Seq
	email: string;
	api_key: string; // The prefix pk-xxx the user sends as Bearer Token
	balance_cents: number;
	max_price_ratio: number;
	created_at: number; // Unix timestamp ms
	updated_at: number;
}

export interface DbKeyPool {
	id: string; // "key_xxx"
	owner_id: string; // References DbUser.id
	provider: string; // e.g. "openrouter", "openai"
	api_key_encrypted: string; // The encrypted raw remote key
	supported_models: string; // JSON array string '["gpt-4o", "claude"]'
	price_ratio: number; // e.g. 0.5 (50% of original price)
	remaining_balance_cents: number | null; // Estimated balance. NULL meaning unknown.
	is_active: number; // 0 (false) or 1 (true)
	health_status: "ok" | "degraded" | "dead" | "unknown";
	last_health_check: number | null;
	expires_at: number | null;
	created_at: number;
}

export interface DbTransaction {
	id: string; // "tx_xxx"
	buyer_id: string; // References DbUser.id
	key_id: string; // References DbKeyPool.id
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cost_cents: number;
	seller_income_cents: number;
	platform_fee_cents: number;
	created_at: number;
}
