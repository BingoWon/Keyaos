import { formatPrice } from "../../utils/format";

interface DualPriceProps {
	original: number;
	platform?: number;
}

export function DualPrice({ original, platform }: DualPriceProps) {
	if (platform != null && platform < original) {
		return (
			<>
				<span className="text-[0.85em] line-through opacity-35">{formatPrice(original)}</span>{" "}
				{formatPrice(platform)}
			</>
		);
	}
	return <>{formatPrice(original)}</>;
}
