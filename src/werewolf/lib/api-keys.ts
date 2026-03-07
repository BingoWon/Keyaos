/**
 * API key management — simplified for Keyaos.
 * Keyaos handles auth via Clerk tokens; no user-managed API keys needed.
 * Only model selection persistence is retained.
 */

import {
	getSelectedModels as getKeyaosSelectedModels,
	setSelectedModels as setKeyaosSelectedModels,
} from "@wolf/lib/keyaos-models";
import { GENERATOR_MODEL, REVIEW_MODEL, SUMMARY_MODEL } from "@wolf/types/game";

const GENERATOR_MODEL_STORAGE = "wolfcha_generator_model";
const SUMMARY_MODEL_STORAGE = "wolfcha_summary_model";
const REVIEW_MODEL_STORAGE = "wolfcha_review_model";

function readStorage(key: string): string {
	try {
		return localStorage.getItem(key)?.trim() ?? "";
	} catch {
		return "";
	}
}

function writeStorage(key: string, value: string) {
	try {
		const trimmed = value.trim();
		if (!trimmed) localStorage.removeItem(key);
		else localStorage.setItem(key, trimmed);
	} catch {}
}

export function isCustomKeyEnabled(): boolean {
	return false;
}

export function setCustomKeyEnabled(_value: boolean) {}

export function hasZenmuxKey(): boolean {
	return false;
}
export function hasDashscopeKey(): boolean {
	return false;
}
export function hasNewapiKey(): boolean {
	return false;
}
export function hasMinimaxKey(): boolean {
	return false;
}

export function getZenmuxApiKey(): string {
	return "";
}
export function getDashscopeApiKey(): string {
	return "";
}
export function getMinimaxApiKey(): string {
	return "";
}
export function getMinimaxGroupId(): string {
	return "";
}
export function getNewapiApiKey(): string {
	return "";
}
export function getNewapiBaseUrl(): string {
	return "";
}

export function setZenmuxApiKey(_key: string) {}
export function setDashscopeApiKey(_key: string) {}
export function setMinimaxApiKey(_key: string) {}
export function setMinimaxGroupId(_id: string) {}
export function setNewapiApiKey(_key: string) {}
export function setNewapiBaseUrl(_url: string) {}

export function getValidatedZenmuxKey(): string {
	return "";
}
export function setValidatedZenmuxKey(_key: string) {}
export function getValidatedDashscopeKey(): string {
	return "";
}
export function setValidatedDashscopeKey(_key: string) {}
export function getValidatedNewapiKey(): string {
	return "";
}
export function setValidatedNewapiKey(_key: string) {}

export function getSelectedModels(): string[] {
	return getKeyaosSelectedModels();
}

export function setSelectedModels(models: string[]) {
	setKeyaosSelectedModels(models);
}

export function getGeneratorModel(): string {
	return readStorage(GENERATOR_MODEL_STORAGE) || GENERATOR_MODEL;
}

export function setGeneratorModel(model: string) {
	writeStorage(GENERATOR_MODEL_STORAGE, model);
}

export function getSummaryModel(): string {
	return readStorage(SUMMARY_MODEL_STORAGE) || SUMMARY_MODEL;
}

export function setSummaryModel(model: string) {
	writeStorage(SUMMARY_MODEL_STORAGE, model);
}

export function getReviewModel(): string {
	return readStorage(REVIEW_MODEL_STORAGE) || REVIEW_MODEL;
}

export function setReviewModel(model: string) {
	writeStorage(REVIEW_MODEL_STORAGE, model);
}

export function clearApiKeys() {
	try {
		localStorage.removeItem(GENERATOR_MODEL_STORAGE);
		localStorage.removeItem(SUMMARY_MODEL_STORAGE);
		localStorage.removeItem(REVIEW_MODEL_STORAGE);
	} catch {}
}

export interface KeyValidationResult {
	valid: boolean;
	error?: string;
	errorCode?: string;
}

export async function validateApiKeyBalance(): Promise<KeyValidationResult> {
	return { valid: true };
}
