export interface AutoTopUpConfig {
	owner_id: string;
	enabled: number;
	threshold: number;
	amount_cents: number;
	payment_method_id: string | null;
	consecutive_failures: number;
	last_triggered_at: number | null;
	paused_reason: string | null;
}

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_FAILURES = 3;

export class AutoTopUpDao {
	constructor(private db: D1Database) {}

	async getConfig(ownerId: string): Promise<AutoTopUpConfig | null> {
		return this.db
			.prepare("SELECT * FROM auto_topup_config WHERE owner_id = ?")
			.bind(ownerId)
			.first<AutoTopUpConfig>();
	}

	async upsertConfig(
		ownerId: string,
		patch: { enabled?: number; threshold?: number; amount_cents?: number },
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO auto_topup_config (owner_id, enabled, threshold, amount_cents)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT(owner_id) DO UPDATE SET
					enabled = excluded.enabled,
					threshold = excluded.threshold,
					amount_cents = excluded.amount_cents,
					paused_reason = CASE WHEN excluded.enabled = 1 THEN NULL ELSE auto_topup_config.paused_reason END,
					consecutive_failures = CASE WHEN excluded.enabled = 1 THEN 0 ELSE auto_topup_config.consecutive_failures END`,
			)
			.bind(
				ownerId,
				patch.enabled ?? 0,
				patch.threshold ?? 5.0,
				patch.amount_cents ?? 1000,
			)
			.run();
	}

	async savePaymentMethod(
		ownerId: string,
		paymentMethodId: string,
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO auto_topup_config (owner_id, payment_method_id)
				 VALUES (?, ?)
				 ON CONFLICT(owner_id) DO UPDATE SET payment_method_id = excluded.payment_method_id`,
			)
			.bind(ownerId, paymentMethodId)
			.run();
	}

	async recordSuccess(ownerId: string): Promise<void> {
		await this.db
			.prepare(
				`UPDATE auto_topup_config
				 SET consecutive_failures = 0, last_triggered_at = ?, paused_reason = NULL
				 WHERE owner_id = ?`,
			)
			.bind(Date.now(), ownerId)
			.run();
	}

	async recordFailure(ownerId: string, reason: string): Promise<void> {
		const now = Date.now();
		await this.db
			.prepare(
				`UPDATE auto_topup_config
				 SET consecutive_failures = consecutive_failures + 1,
				     last_triggered_at = ?,
				     paused_reason = CASE WHEN consecutive_failures + 1 >= ? THEN ? ELSE paused_reason END,
				     enabled = CASE WHEN consecutive_failures + 1 >= ? THEN 0 ELSE enabled END
				 WHERE owner_id = ?`,
			)
			.bind(now, MAX_FAILURES, reason, MAX_FAILURES, ownerId)
			.run();
	}

	/** Check if the cooldown window has elapsed since last trigger */
	canTrigger(config: AutoTopUpConfig): boolean {
		if (!config.enabled || !config.payment_method_id || config.paused_reason)
			return false;
		if (
			config.last_triggered_at &&
			Date.now() - config.last_triggered_at < COOLDOWN_MS
		)
			return false;
		return true;
	}

	/** Atomically claim the trigger slot (prevents concurrent triggers) */
	async claimTrigger(ownerId: string): Promise<boolean> {
		const cutoff = Date.now() - COOLDOWN_MS;
		const res = await this.db
			.prepare(
				`UPDATE auto_topup_config
				 SET last_triggered_at = ?
				 WHERE owner_id = ? AND enabled = 1 AND payment_method_id IS NOT NULL
				   AND paused_reason IS NULL
				   AND (last_triggered_at IS NULL OR last_triggered_at < ?)`,
			)
			.bind(Date.now(), ownerId, cutoff)
			.run();
		return (res.meta?.changes ?? 0) > 0;
	}

	/** Find all users eligible for auto top-up (cron sweep) */
	async findEligible(): Promise<
		{
			owner_id: string;
			threshold: number;
			amount_cents: number;
			payment_method_id: string;
			balance: number;
			stripe_customer_id: string;
		}[]
	> {
		const cutoff = Date.now() - COOLDOWN_MS;
		const res = await this.db
			.prepare(
				`SELECT c.owner_id, c.threshold, c.amount_cents, c.payment_method_id,
				        w.balance, w.stripe_customer_id
				 FROM auto_topup_config c
				 JOIN wallets w ON w.owner_id = c.owner_id
				 WHERE c.enabled = 1
				   AND c.payment_method_id IS NOT NULL
				   AND c.paused_reason IS NULL
				   AND w.stripe_customer_id IS NOT NULL
				   AND w.balance < c.threshold
				   AND (c.last_triggered_at IS NULL OR c.last_triggered_at < ?)`,
			)
			.bind(cutoff)
			.all<{
				owner_id: string;
				threshold: number;
				amount_cents: number;
				payment_method_id: string;
				balance: number;
				stripe_customer_id: string;
			}>();
		return res.results || [];
	}
}
