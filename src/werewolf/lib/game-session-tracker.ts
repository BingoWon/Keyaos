/**
 * Game session tracker — persists game analytics to Keyaos D1 via API.
 */

export interface GameSessionConfig {
	playerCount: number;
	difficulty?: string;
	usedCustomKey: boolean;
	modelUsed?: string;
}

let _getToken: (() => Promise<string | null>) | null = null;

export function setSessionTokenGetter(getter: () => Promise<string | null>) {
	_getToken = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
	if (!_getToken) return {};
	try {
		const token = await _getToken();
		if (token) return { Authorization: `Bearer ${token}` };
	} catch {}
	return {};
}

interface TrackerState {
	sessionId: string | null;
	config: GameSessionConfig | null;
	startTime: number;
	roundsPlayed: number;
	aiCallsCount: number;
	aiInputTokens: number;
	aiOutputTokens: number;
}

let state: TrackerState = {
	sessionId: null,
	config: null,
	startTime: 0,
	roundsPlayed: 0,
	aiCallsCount: 0,
	aiInputTokens: 0,
	aiOutputTokens: 0,
};

function genId(): string {
	return (
		crypto.randomUUID?.() ??
		`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
	);
}

export const gameSessionTracker = {
	async start(config: GameSessionConfig): Promise<string | null> {
		const id = genId();
		state = {
			sessionId: id,
			config,
			startTime: Date.now(),
			roundsPlayed: 0,
			aiCallsCount: 0,
			aiInputTokens: 0,
			aiOutputTokens: 0,
		};
		try {
			await fetch("/api/werewolf/sessions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(await authHeaders()),
				},
				body: JSON.stringify({
					id,
					player_count: config.playerCount,
					difficulty: config.difficulty || "normal",
					model_used: config.modelUsed,
				}),
			});
			return id;
		} catch {
			return null;
		}
	},

	async end(winner: string | null, completed: boolean): Promise<void> {
		if (!state.sessionId) return;
		const duration = Math.round((Date.now() - state.startTime) / 1000);
		try {
			await fetch(`/api/werewolf/sessions/${state.sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					...(await authHeaders()),
				},
				body: JSON.stringify({
					winner,
					completed: completed ? 1 : 0,
					rounds_played: state.roundsPlayed,
					duration_seconds: duration,
					ai_calls_count: state.aiCallsCount,
					ai_input_tokens: state.aiInputTokens,
					ai_output_tokens: state.aiOutputTokens,
				}),
			});
		} catch {}
	},

	async incrementRound(): Promise<void> {
		state.roundsPlayed += 1;
	},

	async syncProgress(): Promise<void> {
		if (!state.sessionId) return;
		const duration = Math.round((Date.now() - state.startTime) / 1000);
		try {
			await fetch(`/api/werewolf/sessions/${state.sessionId}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					...(await authHeaders()),
				},
				body: JSON.stringify({
					rounds_played: state.roundsPlayed,
					duration_seconds: duration,
					ai_calls_count: state.aiCallsCount,
					ai_input_tokens: state.aiInputTokens,
					ai_output_tokens: state.aiOutputTokens,
				}),
			});
		} catch {}
	},

	trackAICall(
		_inputChars: number,
		_outputChars: number,
		promptTokens?: number,
		completionTokens?: number,
	): void {
		state.aiCallsCount += 1;
		if (promptTokens) state.aiInputTokens += promptTokens;
		if (completionTokens) state.aiOutputTokens += completionTokens;
	},

	getSummary() {
		if (!state.sessionId) return null;
		return {
			sessionId: state.sessionId,
			roundsPlayed: state.roundsPlayed,
			durationSeconds: Math.round((Date.now() - state.startTime) / 1000),
			aiCallsCount: state.aiCallsCount,
			aiInputChars: 0,
			aiOutputChars: 0,
			aiPromptTokens: state.aiInputTokens,
			aiCompletionTokens: state.aiOutputTokens,
		};
	},
};
