export interface DbApiKey {
	id: string;
	owner_id: string;
	name: string;
	key_hash: string;
	encrypted_key: string;
	key_hint: string;
	is_enabled: number;
	expires_at: number | null;
	quota_limit: number | null;
	quota_used: number;
	allowed_models: string | null;
	allowed_ips: string | null;
	created_at: number;
}

export interface DbCredential {
	id: string;
	owner_id: string;
	provider_id: string;
	auth_type: string;
	encrypted_secret: string;
	secret_hash: string;
	secret_hint: string;
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

export type ModelType = "chat" | "embedding";

export interface DbModelPricing {
	id: string;
	provider_id: string;
	model_id: string;
	name: string | null;
	model_type: ModelType;
	input_price: number;
	output_price: number;
	context_length: number | null;
	input_modalities: string | null;
	output_modalities: string | null;
	is_active: number;
	upstream_model_id: string | null;
	metadata: string | null;
	created_at: number;
	refreshed_at: number;
}

export interface DbLogEntry {
	id: string;
	consumer_id: string;
	credential_id: string;
	credential_owner_id: string;
	provider_id: string;
	model_id: string;
	input_tokens: number;
	output_tokens: number;
	base_cost: number;
	consumer_charged: number;
	provider_earned: number;
	platform_fee: number;
	price_multiplier: number;
	status: "ok" | "error";
	error_code: number | null;
	error_detail: string | null;
	created_at: number;
}

export interface DbPriceCandle {
	dimension: "model:input" | "model:output" | "provider";
	dimension_value: string;
	interval_start: number;
	open_price: number;
	high_price: number;
	low_price: number;
	close_price: number;
	volume: number;
	total_tokens: number;
}

export interface DbChatThread {
	id: string;
	owner_id: string;
	title: string | null;
	model_id: string | null;
	status: "regular" | "archived";
	created_at: number;
	updated_at: number;
}

export interface DbChatMessage {
	id: string;
	thread_id: string;
	role: string;
	content: string;
	model_id: string | null;
	created_at: number;
}

export interface DbGiftCard {
	code: string;
	amount: number;
	redeemed_by: string | null;
	redeemed_at: number | null;
	created_by: string;
	batch_id: string | null;
	created_at: number;
}

export interface DbWerewolfSession {
	id: string;
	owner_id: string;
	player_count: number;
	difficulty: string;
	model_used: string | null;
	winner: string | null;
	completed: number;
	rounds_played: number;
	duration_seconds: number;
	ai_calls_count: number;
	ai_input_tokens: number;
	ai_output_tokens: number;
	created_at: number;
	updated_at: number;
}

export interface DbWerewolfCharacter {
	id: string;
	owner_id: string;
	display_name: string;
	gender: string;
	age: number;
	mbti: string;
	basic_info: string | null;
	style_label: string | null;
	avatar_seed: string | null;
	is_deleted: number;
	created_at: number;
	updated_at: number;
}
