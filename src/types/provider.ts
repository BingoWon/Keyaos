export interface CredentialGuide {
	placeholder: string;
	secretPattern?: string;
	filePath?: string;
	command?: string;
	steps: string[];
}

export interface ProviderMeta {
	id: string;
	name: string;
	logoUrl: string;
	supportsAutoCredits: boolean;
	authType: "api_key" | "oauth";
	isSubscription: boolean;
	credentialGuide: CredentialGuide | null;
}
