/**
 * D1 Database Schema Types — Core Mode
 */

export interface DbKeyPool {
	id: string;
	provider: string;
	api_key: string;
	credits_cents: number;
	credits_source: "auto" | "manual";
	is_active: number;
	health_status: "ok" | "degraded" | "dead" | "unknown";
	last_health_check: number | null;
	added_at: number;
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
	key_id: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cost_cents: number;
	created_at: number;
}
