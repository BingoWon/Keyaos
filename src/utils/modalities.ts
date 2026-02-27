import type { Modality } from "../../worker/core/db/schema";

/**
 * Merge modalities from a new entry into an existing array (union).
 * Skips null (unknown) entries. Mutates `target` in place.
 */
export function mergeModalities(
	target: Modality[],
	source: Modality[] | null | undefined,
): void {
	if (!source) return;
	for (const m of source) {
		if (!target.includes(m)) target.push(m);
	}
}
