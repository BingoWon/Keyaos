export interface ModelEntry {
	id: string;
	owned_by: string;
	name?: string;
	input_price?: number;
	output_price?: number;
	context_length?: number;
}
