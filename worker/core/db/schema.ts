/**
 * D1 Database Schema Types
 * Matches the schema defined in migrations/
 */

export interface DbUser {
	id: string;
	email: string;
	api_key: string;
	balance_cents: number;
	max_price_ratio: number;
	created_at: number;
	updated_at: number;
}

export interface DbKeyPool {
	id: string;
	owner_id: string;
	provider: string;
	api_key_encrypted: string;
	supported_models: string; // JSON array string
	price_ratio: number;
	remaining_balance_cents: number | null;
	is_active: number;
	health_status: "ok" | "degraded" | "dead" | "unknown";
	last_health_check: number | null;
	expires_at: number | null;
	created_at: number;
}

export interface DbModel {
	id: string; // "provider:upstream_id"
	provider: string;
	upstream_id: string;
	display_name: string | null;
	input_cost: number; // cents per 1M tokens
	output_cost: number; // cents per 1M tokens
	context_length: number | null;
	is_active: number;
	synced_at: number;
}

export interface DbTransaction {
	id: string;
	buyer_id: string;
	key_id: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	upstream_cost_cents: number;
	cost_cents: number;
	seller_income_cents: number;
	platform_fee_cents: number;
	created_at: number;
}
