/**
 * D1 Database Schema Types
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
	api_key: string;
	key_hint: string;
	price_ratio: number;
	credits_cents: number;
	credits_source: "auto" | "manual";
	is_active: number;
	health_status: "ok" | "degraded" | "dead" | "unknown";
	last_health_check: number | null;
	created_at: number;
}

export interface DbModel {
	id: string;
	provider: string;
	upstream_id: string;
	display_name: string | null;
	input_cost: number;
	output_cost: number;
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
