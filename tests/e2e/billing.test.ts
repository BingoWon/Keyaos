/**
 * Cross-user billing e2e test
 *
 * Verifies the full platform settlement flow when the consumer (API key owner)
 * differs from the credential owner:
 *   consumer wallet debit, provider wallet credit, 1% bilateral service fee.
 *
 * Prerequisites:
 * - Local dev server running (pnpm dev) with CLERK_SECRET_KEY configured
 * - KEYAOS_API_KEY in .env.local (must belong to a DIFFERENT user than credentials)
 * - The consumer wallet must have a positive balance
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import { describe, test } from "node:test";

const API_BASE = process.env.API_BASE || "http://localhost:5173";
const KEYAOS_KEY = process.env.KEYAOS_API_KEY;
if (!KEYAOS_KEY) throw new Error("KEYAOS_API_KEY env var is required");

function dbQuery(sql: string): unknown[] {
	const raw = execSync(
		`npx wrangler d1 execute keyaos-db --local --command "${sql.replace(/"/g, '\\"')}" --json 2>/dev/null`,
		{ cwd: process.cwd(), encoding: "utf-8" },
	);
	return JSON.parse(raw)[0]?.results ?? [];
}

function getBalance(ownerId: string): number {
	const rows = dbQuery(
		`SELECT balance FROM wallets WHERE owner_id = '${ownerId}'`,
	) as { balance: number }[];
	return rows[0]?.balance ?? 0;
}

describe("Platform billing: cross-user settlement", () => {
	test("Consumer balance decreases, provider balance increases", async () => {
		const consumerRow = dbQuery(
			`SELECT owner_id FROM api_keys WHERE id = '${KEYAOS_KEY}'`,
		) as { owner_id: string }[];
		assert.ok(consumerRow.length > 0, "Consumer API key not found in DB");
		const consumerId = consumerRow[0].owner_id;

		const beforeConsumer = getBalance(consumerId);
		assert.ok(
			beforeConsumer > 0,
			`Consumer balance must be positive, got ${beforeConsumer}`,
		);

		// Snapshot ALL wallet balances before the request
		const allBalances = new Map<string, number>();
		const wallets = dbQuery("SELECT owner_id, balance FROM wallets") as {
			owner_id: string;
			balance: number;
		}[];
		for (const w of wallets) allBalances.set(w.owner_id, w.balance);

		const res = await fetch(`${API_BASE}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${KEYAOS_KEY}`,
			},
			body: JSON.stringify({
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "Say hi" }],
			}),
		});
		assert.strictEqual(res.status, 200, "Chat should succeed");
		await res.text();

		const credentialId = res.headers.get("x-credential-id") ?? "";
		assert.ok(credentialId, "Missing x-credential-id");

		const credOwner = dbQuery(
			`SELECT owner_id FROM upstream_credentials WHERE id = '${credentialId}'`,
		) as { owner_id: string }[];
		const providerId = credOwner[0].owner_id;

		assert.notStrictEqual(
			consumerId,
			providerId,
			"Consumer and provider must be different users",
		);

		const beforeProvider = allBalances.get(providerId) ?? 0;

		// Wait for async billing via waitUntil
		await new Promise((r) => setTimeout(r, 3000));

		const afterConsumer = getBalance(consumerId);
		const afterProvider = getBalance(providerId);

		assert.ok(
			afterConsumer < beforeConsumer,
			`Consumer balance should decrease: ${beforeConsumer} → ${afterConsumer}`,
		);
		assert.ok(
			afterProvider > beforeProvider,
			`Provider balance should increase: ${beforeProvider} → ${afterProvider}`,
		);

		const ledger = dbQuery(
			`SELECT consumer_id, credential_owner_id, base_cost, consumer_charged, provider_earned, platform_fee
			 FROM ledger WHERE credential_id = '${credentialId}'
			 ORDER BY created_at DESC LIMIT 1`,
		) as {
			consumer_id: string;
			credential_owner_id: string;
			base_cost: number;
			consumer_charged: number;
			provider_earned: number;
			platform_fee: number;
		}[];

		assert.ok(ledger.length > 0, "Ledger entry not found");
		const entry = ledger[0];
		assert.strictEqual(entry.consumer_id, consumerId);
		assert.strictEqual(entry.credential_owner_id, providerId);
		assert.ok(entry.base_cost > 0, "base_cost should be positive");
		assert.ok(
			entry.consumer_charged > entry.base_cost,
			"consumer_charged > base_cost (includes 1% fee)",
		);
		assert.ok(
			entry.provider_earned < entry.base_cost,
			"provider_earned < base_cost (minus 1% fee)",
		);
		assert.ok(entry.platform_fee > 0, "platform_fee should be positive");

		const feeRatio = entry.platform_fee / entry.base_cost;
		assert.ok(
			Math.abs(feeRatio - 0.02) < 0.001,
			`Platform fee ~2% of base_cost, got ${(feeRatio * 100).toFixed(2)}%`,
		);

		console.log(
			`  consumer: ${beforeConsumer.toFixed(6)} → ${afterConsumer.toFixed(6)}`,
		);
		console.log(
			`  provider: ${beforeProvider.toFixed(6)} → ${afterProvider.toFixed(6)}`,
		);
		console.log(`  base=${entry.base_cost}, fee=${entry.platform_fee}`);
	});

	test("Zero-balance consumer gets 402 Insufficient Credits", async () => {
		const consumerRow = dbQuery(
			`SELECT owner_id FROM api_keys WHERE id = '${KEYAOS_KEY}'`,
		) as { owner_id: string }[];
		const consumerId = consumerRow[0].owner_id;
		const originalBalance = getBalance(consumerId);

		dbQuery(
			`UPDATE wallets SET balance = 0 WHERE owner_id = '${consumerId}'`,
		);

		await new Promise((r) => setTimeout(r, 500));

		try {
			const res = await fetch(`${API_BASE}/v1/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${KEYAOS_KEY}`,
				},
				body: JSON.stringify({
					model: "openai/gpt-4o-mini",
					messages: [{ role: "user", content: "hi" }],
				}),
			});

			assert.strictEqual(
				res.status,
				402,
				"Should return 402 for zero balance",
			);
			const body = await res.json();
			assert.strictEqual(body.error.code, "insufficient_credits");
			console.log("  402 correctly returned for zero-balance consumer");
		} finally {
			dbQuery(
				`UPDATE wallets SET balance = ${originalBalance} WHERE owner_id = '${consumerId}'`,
			);
		}
	});
});
