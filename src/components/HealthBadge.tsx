import { useTranslation } from "react-i18next";

export type HealthStatus = "ok" | "degraded" | "dead" | "cooldown";

interface HealthBadgeProps {
	status: HealthStatus;
}

const HEALTH_VARIANTS: Record<HealthStatus, string> = {
	ok: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-400/10 dark:text-green-400",
	degraded:
		"border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-400/10 dark:text-yellow-500",
	cooldown:
		"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-400/10 dark:text-blue-400",
	dead: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-400/10 dark:text-red-400",
};

export function HealthBadge({ status }: HealthBadgeProps) {
	const { t } = useTranslation();

	return (
		<span
			className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs font-medium ${HEALTH_VARIANTS[status]}`}
		>
			{t(`credentials.status_${status}`)}
		</span>
	);
}
