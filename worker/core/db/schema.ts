export interface DbApiKey {
	id: string;
	owner_id: string;
	name: string;
	is_enabled: number;
	created_at: number;
}

export interface DbCredential {
	id: string;
	owner_id: string;
	provider: string;
	auth_type: string;
	secret: string;
	quota: number | null;
	quota_source: string | null;
	is_enabled: number;
	price_multiplier: number;
	health_status: string;
	last_health_check: number | null;
	metadata: string | null;
	added_at: number;
}

export type Modality = "text" | "image" | "audio" | "video" | "file";

export interface DbModelPricing {
	id: string;
	provider: string;
	model_id: string;
	name: string | null;
	input_price: number;
	output_price: number;
	context_length: number | null;
	input_modalities: string | null; // JSON array or null if unknown
	output_modalities: string | null; // JSON array or null if unknown
	is_active: number;
	sort_order: number;
	upstream_model_id: string | null;
	refreshed_at: number;
}

export interface DbUsageEntry {
	id: string;
	consumer_id: string;
	credential_id: string;
	credential_owner_id: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	base_cost: number;
	consumer_charged: number;
	provider_earned: number;
	platform_fee: number;
	price_multiplier: number;
	created_at: number;
}

export interface DbPriceCandle {
	dimension: "model" | "provider";
	dimension_value: string;
	interval_start: number;
	open_price: number;
	high_price: number;
	low_price: number;
	close_price: number;
	volume: number;
	total_tokens: number;
}
