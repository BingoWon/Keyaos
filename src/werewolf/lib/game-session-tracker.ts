/**
 * Game session tracker — no-op stub for Keyaos.
 * Supabase game_sessions table is not used; analytics can be added later.
 */

export interface GameSessionConfig {
	playerCount: number;
	difficulty?: string;
	usedCustomKey: boolean;
	modelUsed?: string;
}

const noop = {
	async start(_config: GameSessionConfig): Promise<string | null> {
		return null;
	},
	async end(_winner: string | null, _completed: boolean): Promise<void> {},
	async incrementRound(): Promise<void> {},
	async syncProgress(): Promise<void> {},
	trackAICall(
		_inputChars: number,
		_outputChars: number,
		_promptTokens?: number,
		_completionTokens?: number,
	): void {},
	getSummary() {
		return null;
	},
};

export const gameSessionTracker = noop;
