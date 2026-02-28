/**
 * Platform settlement — service fee calculation and wallet operations.
 *
 * Each side pays a 3% service fee on cross-user routing:
 *   Consumer pays:  baseCost × 1.03
 *   Provider earns: baseCost × 0.97
 *
 * Self-use (consumer = credential owner) incurs no wallet operations.
 */

import type { Settlement } from "../../shared/types";
import { WalletDao } from "./wallet-dao";

export const SERVICE_FEE_RATE = 0.03;

export function calculateSettlement(
	baseCost: number,
	isSelfUse: boolean,
): Settlement {
	if (isSelfUse || baseCost <= 0) {
		return { consumerCharged: 0, providerEarned: 0, platformFee: 0 };
	}
	const consumerCharged = baseCost * (1 + SERVICE_FEE_RATE);
	const providerEarned = baseCost * (1 - SERVICE_FEE_RATE);
	const platformFee = consumerCharged - providerEarned;
	return { consumerCharged, providerEarned, platformFee };
}

export async function settleWallets(
	db: D1Database,
	consumerId: string,
	credentialOwnerId: string,
	settlement: Settlement,
): Promise<void> {
	if (settlement.consumerCharged <= 0) return;
	const wallets = new WalletDao(db);
	await wallets.debit(consumerId, settlement.consumerCharged);
	await wallets.credit(credentialOwnerId, settlement.providerEarned);
}
