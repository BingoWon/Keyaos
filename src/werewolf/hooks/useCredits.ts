/**
 * useCredits — no-op stub for Keyaos.
 * Keyaos uses its own billing system; wolfcha credit logic is not needed.
 */

import { useCallback, useState } from "react";

export function useCredits() {
	const [credits] = useState(Infinity);
	const [creditLoading] = useState(false);

	return {
		credits,
		creditLoading,
		refreshCredits: useCallback(async () => {}, []),
		redeemCode: useCallback(
			async (_code: string) => ({ success: false, error: "Not supported" }),
			[],
		),
		claimDailyBonus: useCallback(async () => false, []),
		claimSpringBonus: useCallback(async () => false, []),
		springSnapshot: null as null,
	};
}
