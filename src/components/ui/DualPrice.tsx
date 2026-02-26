import { formatPrice } from "../../utils/format";

interface DualPriceProps {
	original: number;
	platform?: number;
}

export function DualPrice({ original, platform }: DualPriceProps) {
	if (platform != null && platform < original) {
		return (
			<>
				<span className="line-through opacity-40">{formatPrice(original)}</span>{" "}
				<span className="font-semibold">{formatPrice(platform)}</span>
			</>
		);
	}
	return <>{formatPrice(original)}</>;
}
