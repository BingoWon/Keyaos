import type { Modality } from "../../worker/core/db/schema";

export interface ModelEntry {
	id: string;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	platform_input_price?: number;
	platform_output_price?: number;
	context_length?: number;
	created?: number;
	input_modalities?: Modality[];
	output_modalities?: Modality[];
}
