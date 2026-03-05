export interface LogEntry {
	id: string;
	direction: "spent" | "earned" | "self";
	provider_id: string;
	model_id: string;
	inputTokens: number;
	outputTokens: number;
	netCredits: number;
	createdAt: number;
}
