import type { DbGiftCard } from "../../core/db/schema";
import { WalletDao } from "./wallet-dao";

const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
const SEGMENT_LEN = 4;
const SEGMENTS = 4;

function generateCode(): string {
	const arr = new Uint8Array(SEGMENT_LEN * SEGMENTS);
	crypto.getRandomValues(arr);
	const parts: string[] = [];
	for (let s = 0; s < SEGMENTS; s++) {
		let seg = "";
		for (let i = 0; i < SEGMENT_LEN; i++) {
			seg += CODE_CHARS[arr[s * SEGMENT_LEN + i] % CODE_CHARS.length];
		}
		parts.push(seg);
	}
	return `KAOS-${parts.join("-")}`;
}

export class GiftCardDao {
	constructor(private db: D1Database) {}

	async redeem(
		code: string,
		ownerId: string,
	): Promise<{ ok: true; amount: number } | { ok: false; reason: string }> {
		const normalized = code.trim().toUpperCase();
		const card = await this.db
			.prepare("SELECT * FROM gift_cards WHERE code = ?")
			.bind(normalized)
			.first<DbGiftCard>();

		if (!card || card.redeemed_by) {
			return { ok: false, reason: "invalid_or_used" };
		}
		if (card.expires_at && card.expires_at < Date.now()) {
			return { ok: false, reason: "expired" };
		}

		const now = Date.now();
		const updateResult = await this.db
			.prepare(
				"UPDATE gift_cards SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_by IS NULL",
			)
			.bind(ownerId, now, normalized)
			.run();

		if (!updateResult.meta.changes) {
			return { ok: false, reason: "invalid_or_used" };
		}

		await new WalletDao(this.db).credit(ownerId, card.amount);
		return { ok: true, amount: card.amount };
	}

	async createBatch(
		createdBy: string,
		amount: number,
		count: number,
		expiresAt?: number,
	): Promise<{ batchId: string; codes: string[] }> {
		const batchId = crypto.randomUUID().slice(0, 8);
		const now = Date.now();
		const codes: string[] = [];
		const stmts: D1PreparedStatement[] = [];

		for (let i = 0; i < count; i++) {
			const code = generateCode();
			codes.push(code);
			stmts.push(
				this.db
					.prepare(
						"INSERT INTO gift_cards (code, amount, created_by, batch_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
					)
					.bind(code, amount, createdBy, batchId, expiresAt ?? null, now),
			);
		}

		await this.db.batch(stmts);
		return { batchId, codes };
	}

	async listAll(
		limit: number,
		offset: number,
	): Promise<{ rows: DbGiftCard[]; total: number }> {
		const [data, countRow] = await this.db.batch([
			this.db
				.prepare(
					"SELECT * FROM gift_cards ORDER BY created_at DESC LIMIT ? OFFSET ?",
				)
				.bind(limit, offset),
			this.db.prepare("SELECT COUNT(*) as cnt FROM gift_cards"),
		]);
		return {
			rows: (data.results as DbGiftCard[]) ?? [],
			total: (countRow.results?.[0] as { cnt: number })?.cnt ?? 0,
		};
	}

	async listBatch(batchId: string): Promise<DbGiftCard[]> {
		const result = await this.db
			.prepare(
				"SELECT * FROM gift_cards WHERE batch_id = ? ORDER BY created_at",
			)
			.bind(batchId)
			.all<DbGiftCard>();
		return result.results ?? [];
	}
}
