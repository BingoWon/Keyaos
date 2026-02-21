export interface DbApiKey {
	id: string;
	owner_id: string;
	name: string;
	is_active: number;
	created_at: number;
}

export interface DbQuotaListing {
	id: string;
	owner_id: string;
	provider: string;
	api_key: string;
	quota: number;
	quota_source: string;
	is_enabled: number;
	price_multiplier: number;
	health_status: string;
	last_health_check: number | null;
	added_at: number;
}

export interface DbModelPricing {
	id: string;
	provider: string;
	upstream_id: string;
	display_name: string | null;
	input_price: number;
	output_price: number;
	context_length: number | null;
	is_active: number;
	refreshed_at: number;
}

export interface DbLedgerEntry {
	id: string;
	owner_id: string;
	listing_id: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	credits_used: number;
	created_at: number;
}
