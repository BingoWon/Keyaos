/**
 * useCustomCharacters — persists custom AI personas to Keyaos D1 via API.
 */

import type {
	CustomCharacter,
	CustomCharacterInput,
} from "@wolf/types/custom-character";
import { MAX_CUSTOM_CHARACTERS } from "@wolf/types/custom-character";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth";

export function useCustomCharacters() {
	const { getToken, isSignedIn } = useAuth();
	const [characters, setCharacters] = useState<CustomCharacter[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const getTokenRef = useRef(getToken);
	getTokenRef.current = getToken;

	const headers = useCallback(async (): Promise<Record<string, string>> => {
		const h: Record<string, string> = { "Content-Type": "application/json" };
		try {
			const token = await getTokenRef.current();
			if (token) h.Authorization = `Bearer ${token}`;
		} catch {}
		return h;
	}, []);

	const fetchCharacters = useCallback(async () => {
		if (!isSignedIn) {
			setCharacters([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/werewolf/characters", {
				headers: await headers(),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			const list: CustomCharacter[] = (json.data ?? []).map(
				(r: Record<string, unknown>) => ({
					id: r.id as string,
					user_id: r.owner_id as string,
					display_name: r.display_name as string,
					gender: (r.gender as string) || "male",
					age: (r.age as number) || 25,
					mbti: (r.mbti as string) || "",
					basic_info: (r.basic_info as string) || undefined,
					style_label: (r.style_label as string) || undefined,
					avatar_seed: (r.avatar_seed as string) || undefined,
					is_deleted: false,
					created_at: new Date(r.created_at as number).toISOString(),
					updated_at: new Date(r.updated_at as number).toISOString(),
				}),
			);
			setCharacters(list);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [headers, isSignedIn]);

	useEffect(() => {
		fetchCharacters();
	}, [fetchCharacters]);

	const createCharacter = useCallback(
		async (input: CustomCharacterInput): Promise<CustomCharacter | null> => {
			const id = crypto.randomUUID?.() ?? `${Date.now()}`;
			try {
				const res = await fetch("/api/werewolf/characters", {
					method: "POST",
					headers: await headers(),
					body: JSON.stringify({ id, ...input }),
				});
				if (!res.ok) return null;
				const now = new Date().toISOString();
				const char: CustomCharacter = {
					id,
					user_id: "",
					display_name: input.display_name,
					gender: input.gender,
					age: input.age,
					mbti: input.mbti,
					basic_info: input.basic_info,
					style_label: input.style_label,
					avatar_seed: input.avatar_seed,
					is_deleted: false,
					created_at: now,
					updated_at: now,
				};
				setCharacters((prev) => [char, ...prev]);
				return char;
			} catch {
				return null;
			}
		},
		[headers],
	);

	const updateCharacter = useCallback(
		async (
			id: string,
			input: Partial<CustomCharacterInput>,
		): Promise<CustomCharacter | null> => {
			try {
				const res = await fetch(`/api/werewolf/characters/${id}`, {
					method: "PATCH",
					headers: await headers(),
					body: JSON.stringify(input),
				});
				if (!res.ok) return null;
				let updated: CustomCharacter | null = null;
				setCharacters((prev) =>
					prev.map((c) => {
						if (c.id !== id) return c;
						updated = { ...c, ...input, updated_at: new Date().toISOString() };
						return updated;
					}),
				);
				return updated;
			} catch {
				return null;
			}
		},
		[headers],
	);

	const deleteCharacter = useCallback(
		async (id: string): Promise<boolean> => {
			try {
				const res = await fetch(`/api/werewolf/characters/${id}`, {
					method: "DELETE",
					headers: await headers(),
				});
				if (!res.ok) return false;
				setCharacters((prev) => prev.filter((c) => c.id !== id));
				return true;
			} catch {
				return false;
			}
		},
		[headers],
	);

	const canAddMore = useMemo(
		() => characters.length < MAX_CUSTOM_CHARACTERS,
		[characters.length],
	);

	const remainingSlots = useMemo(
		() => Math.max(0, MAX_CUSTOM_CHARACTERS - characters.length),
		[characters.length],
	);

	return {
		characters,
		loading,
		error,
		canAddMore,
		remainingSlots,
		fetchCharacters,
		createCharacter,
		updateCharacter,
		deleteCharacter,
	};
}
