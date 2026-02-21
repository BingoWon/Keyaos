export type Env = {
	DB: D1Database;
	ADMIN_TOKEN: string;
	CLERK_PUBLISHABLE_KEY?: string;
	CLERK_SECRET_KEY?: string;
	CNY_USD_RATE?: string;
	GEMINI_OAUTH_CLIENT_ID?: string;
	GEMINI_OAUTH_CLIENT_SECRET?: string;
	ASSETS?: Fetcher;
};

export type AppEnv = { Bindings: Env; Variables: { owner_id: string } };
