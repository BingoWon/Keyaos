/**
 * useCredits — stub for Keyaos.
 * Keyaos uses its own billing system; wolfcha credit logic is not needed.
 * Returns all fields expected by WelcomeScreen and UserProfileModal.
 */

import type { SpringCampaignSnapshot } from "@wolf/lib/spring-campaign";
import { useCallback, useState } from "react";

export function useCredits() {
	const [credits] = useState(Infinity);

	return {
		user: null as null,
		session: null as null,
		credits,
		referralCode: null as string | null,
		totalReferrals: 0,
		loading: false,
		consumeCredit: useCallback(async () => true, []),
		redeemCode: useCallback(
			async (_code: string) => ({ success: false, error: "Not supported" }),
			[],
		),
		signOut: useCallback(async () => {}, []),
		isPasswordRecovery: false,
		clearPasswordRecovery: useCallback(() => {}, []),
		fetchCredits: useCallback(async () => {}, []),
		refreshCredits: useCallback(async () => {}, []),
		claimDailyBonus: useCallback(async () => false, []),
		claimSpringBonus: useCallback(async () => false, []),
		springCampaign: null as SpringCampaignSnapshot | null,
		springSnapshot: null as SpringCampaignSnapshot | null,
		creditLoading: false,
	};
}
