export type Env = {
	DB: D1Database;
	ADMIN_TOKEN: string;
	CLERK_PUBLISHABLE_KEY?: string;
	CLERK_SECRET_KEY?: string;
	CNY_USD_RATE?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	ASSETS?: Fetcher;
};

export type AppEnv = { Bindings: Env; Variables: { owner_id: string } };

export interface Settlement {
	consumerCharged: number;
	providerEarned: number;
	platformFee: number;
}
