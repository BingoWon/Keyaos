import { useTranslation } from "react-i18next";

export type HealthStatus = "ok" | "degraded" | "dead";

interface HealthBadgeProps {
	status: HealthStatus;
}

const HEALTH_VARIANTS: Record<HealthStatus, string> = {
	ok: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-400/10 dark:text-green-400",
	degraded:
		"bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-500",
	dead: "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400",
};

export function HealthBadge({ status }: HealthBadgeProps) {
	const { t } = useTranslation();

	return (
		<span
			className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${HEALTH_VARIANTS[status]}`}
		>
			{t(`upstream_keys.status_${status}`)}
		</span>
	);
}
