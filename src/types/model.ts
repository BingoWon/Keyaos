import type { Modality } from "../../worker/core/db/schema";

/** Dashboard model entry — one per provider × model_id offering */
export interface ModelEntry {
	id: string;
	provider: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	platform_input_price?: number;
	platform_output_price?: number;
	context_length?: number;
	created_at?: number | null;
	input_modalities?: Modality[];
	output_modalities?: Modality[];
}
