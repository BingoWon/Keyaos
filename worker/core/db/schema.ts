export interface DbApiKey {
	id: string; // "sk-keyaos-xxxxx"
	name: string;
	is_active: number;
	created_at: number;
}

export interface DbCreditListing {
	id: string; // "openrouter:sk-or-xxxx"
	provider: string; // openrouter, deepinfra, zenmux
	api_key: string;
	credits_cents: number;
	credits_source: string; // 'auto' or 'manual'
	is_enabled: number;
	price_multiplier: number;
	health_status: string; // 'ok' | 'degraded' | 'dead' | 'unknown'
	last_health_check: number | null;
	added_at: number;
}

export interface DbMarketQuote {
	id: string; // "provider:upstream_id", e.g. "openrouter:anthropic/claude-3-opus"
	provider: string;
	upstream_id: string; // "anthropic/claude-3-opus"
	display_name: string | null;
	input_cost: number;
	output_cost: number;
	context_length: number | null;
	is_active: number;
	refreshed_at: number;
}

export interface DbLedgerEntry {
	id: string; // uuid
	listing_id: string; // Maps to DbCreditListing.id
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cost_cents: number;
	created_at: number;
}
