/**
 * Fetches available models from Keyaos's API and adapts them
 * to the wolfcha ModelRef format.
 */
import type { ModelRef } from "@wolf/types/game";

const CACHE_KEY = "wolfcha_keyaos_models";
const CACHE_TTL_MS = 5 * 60 * 1000;
const SELECTED_MODELS_KEY = "wolfcha_selected_models";

export interface KeyaosModel {
	id: string;
	provider_id: string;
	name?: string;
}

let _cachedModels: ModelRef[] | null = null;
let _cacheTime = 0;
let _getToken: (() => Promise<string | null>) | null = null;

export function setModelTokenGetter(getter: () => Promise<string | null>) {
	_getToken = getter;
}

function toModelRef(m: KeyaosModel): ModelRef {
	return {
		provider: m.provider_id || "keyaos",
		model: m.id,
	};
}

export async function fetchKeyaosModels(): Promise<ModelRef[]> {
	if (_cachedModels && Date.now() - _cacheTime < CACHE_TTL_MS) {
		return _cachedModels;
	}

	try {
		const cached = sessionStorage.getItem(CACHE_KEY);
		if (cached) {
			const { models, ts } = JSON.parse(cached) as {
				models: KeyaosModel[];
				ts: number;
			};
			if (Date.now() - ts < CACHE_TTL_MS) {
				_cachedModels = models.map(toModelRef);
				_cacheTime = ts;
				return _cachedModels;
			}
		}
	} catch {}

	const headers: Record<string, string> = {};
	if (_getToken) {
		try {
			const token = await _getToken();
			if (token) headers.Authorization = `Bearer ${token}`;
		} catch {}
	}

	const res = await fetch("/v1/models", { headers });
	if (!res.ok) return _cachedModels ?? [];

	const data = await res.json();
	const list: KeyaosModel[] = Array.isArray(data?.data)
		? data.data
		: Array.isArray(data)
			? data
			: [];
	_cachedModels = list.map(toModelRef);
	_cacheTime = Date.now();

	try {
		sessionStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ models: list, ts: _cacheTime }),
		);
	} catch {}

	return _cachedModels;
}

export function getCachedModels(): ModelRef[] {
	return _cachedModels ?? [];
}

export function getSelectedModels(): string[] {
	try {
		const raw = localStorage.getItem(SELECTED_MODELS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((s: unknown) => typeof s === "string" && s)
			: [];
	} catch {
		return [];
	}
}

export function setSelectedModels(models: string[]) {
	try {
		if (models.length === 0) {
			localStorage.removeItem(SELECTED_MODELS_KEY);
		} else {
			localStorage.setItem(SELECTED_MODELS_KEY, JSON.stringify(models));
		}
	} catch {}
}
