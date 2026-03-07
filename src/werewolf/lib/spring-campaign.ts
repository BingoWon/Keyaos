/**
 * Spring campaign — stub. Campaign is permanently disabled.
 * Retained only so WelcomeScreen/UserProfileModal compile without changes.
 */

export const SPRING_CAMPAIGN_CODE = "spring_noop";
export const SPRING_CAMPAIGN_DAILY_QUOTA = 0;

export type SpringCampaignSnapshot = {
	active: boolean;
	claimedToday: boolean;
	justClaimed: boolean;
	dailyQuota: number;
	totalQuota: number;
};

export function isSpringCampaignActive(): boolean {
	return false;
}

export function getShanghaiDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}
