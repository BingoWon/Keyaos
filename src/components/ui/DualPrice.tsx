import { formatPrice } from "../../utils/format";

interface DualPriceProps {
	original: number;
	platform?: number;
}

export function DualPrice({ original, platform }: DualPriceProps) {
	if (platform != null && platform < original) {
		return (
			<>
				<span className="text-gray-400 line-through dark:text-gray-500">
					{formatPrice(original)}
				</span>{" "}
				<span className="font-semibold text-brand-600 dark:text-brand-400">
					{formatPrice(platform)}
				</span>
			</>
		);
	}
	return (
		<span className="text-gray-600 dark:text-gray-400">
			{formatPrice(original)}
		</span>
	);
}
