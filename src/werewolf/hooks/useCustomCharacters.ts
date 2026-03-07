/**
 * useCustomCharacters — no-op stub for Keyaos.
 * Custom character persistence via Supabase is not used.
 */

import type {
	CustomCharacter,
	CustomCharacterInput,
} from "@wolf/types/custom-character";
import { useCallback, useState } from "react";

export function useCustomCharacters(_user: unknown) {
	const [characters] = useState<CustomCharacter[]>([]);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);

	return {
		characters,
		loading,
		error,
		fetchCharacters: useCallback(async () => {}, []),
		addCharacter: useCallback(
			async (_input: CustomCharacterInput) => null as CustomCharacter | null,
			[],
		),
		updateCharacter: useCallback(
			async (_id: string, _input: Partial<CustomCharacterInput>) =>
				null as CustomCharacter | null,
			[],
		),
		deleteCharacter: useCallback(async (_id: string) => false, []),
	};
}
