import type { Modality, ModelType } from "../../worker/core/db/schema";
import type { ModelEntry } from "../types/model";
import { mergeModalities } from "./modalities";

export interface ModelGroup {
	id: string;
	type: ModelType;
	displayName: string;
	description: string | null;
	providers: ProviderRow[];
	createdAt: number;
	inputModalities: Modality[];
	outputModalities: Modality[];
	supportedParameters: string[];
}

export interface ProviderRow {
	provider_id: string;
	inputPrice: number;
	outputPrice: number;
	platformInputPrice?: number;
	platformOutputPrice?: number;
	contextLength: number;
}

export function aggregateModels(entries: ModelEntry[]): ModelGroup[] {
	const groups = new Map<string, ModelGroup>();

	for (const e of entries) {
		let group = groups.get(e.id);
		if (!group) {
			group = {
				id: e.id,
				type: e.type ?? "chat",
				displayName: e.name || e.id,
				description: e.description ?? null,
				providers: [],
				createdAt: 0,
				inputModalities: e.input_modalities ?? ["text"],
				outputModalities: e.output_modalities ?? ["text"],
				supportedParameters: [],
			};
			groups.set(e.id, group);
		}
		if (e.name && group.displayName === group.id) {
			group.displayName = e.name;
		}
		if (e.description && !group.description) {
			group.description = e.description;
		}
		mergeModalities(group.inputModalities, e.input_modalities);
		mergeModalities(group.outputModalities, e.output_modalities);
		if (e.supported_parameters) {
			for (const p of e.supported_parameters) {
				if (!group.supportedParameters.includes(p)) {
					group.supportedParameters.push(p);
				}
			}
		}
		if (e.created && (!group.createdAt || e.created < group.createdAt)) {
			group.createdAt = e.created;
		}
		group.providers.push({
			provider_id: e.provider_id,
			inputPrice: e.input_price ?? 0,
			outputPrice: e.output_price ?? 0,
			platformInputPrice: e.platform_input_price,
			platformOutputPrice: e.platform_output_price,
			contextLength: e.context_length ?? 0,
		});
	}

	for (const g of groups.values()) {
		g.providers.sort((a, b) => a.inputPrice - b.inputPrice);
	}

	return [...groups.values()];
}
