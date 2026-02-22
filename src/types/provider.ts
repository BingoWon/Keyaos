export interface ProviderMeta {
	id: string;
	name: string;
	logoUrl: string;
	supportsAutoCredits: boolean;
	authType: "api_key" | "oauth";
	isSubscription: boolean;
}
