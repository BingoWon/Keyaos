interface LogoProps {
	size?: "sm" | "lg";
}

export function Logo({ size = "sm" }: LogoProps) {
	const boxSize = size === "lg" ? "h-12 w-12 text-2xl" : "h-8 w-8 text-xl";
	const textSize = size === "lg" ? "text-3xl" : "text-xl";

	return (
		<div className="flex items-center gap-x-2">
			<div
				className={`${boxSize} rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg`}
			>
				K
			</div>
			<span className={`${textSize} font-bold dark:text-white tracking-tight`}>
				Keyaos
			</span>
		</div>
	);
}
