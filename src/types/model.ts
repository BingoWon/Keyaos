import type { Modality, ModelType } from "../../worker/core/db/schema";

/** Dashboard model entry — one per provider × model_id offering */
export interface ModelEntry {
	id: string;
	type?: ModelType;
	provider_id: string;
	name?: string;
	description?: string | null;
	input_price?: number;
	output_price?: number;
	platform_input_price?: number;
	platform_output_price?: number;
	context_length?: number;
	created?: number | null;
	input_modalities?: Modality[];
	output_modalities?: Modality[];
	supported_parameters?: string[] | null;
}
