import { motion } from "framer-motion";

interface GameBackgroundProps {
	isNight: boolean;
	isBlinking?: boolean;
}

function CornerDeco({ className }: { className: string }) {
	return (
		<svg
			className={`wc-corner-deco ${className}`}
			width="80"
			height="80"
			viewBox="0 0 80 80"
		>
			{/* 严格对齐 style-unification-preview.html 的角纹样式 */}
			<path d="M10,10 L70,10" stroke="#8a1c1c" strokeWidth="2" fill="none" />
			<path d="M10,10 L10,70" stroke="#8a1c1c" strokeWidth="2" fill="none" />
			<circle cx="10" cy="10" r="4" fill="#c5a059" />
			<circle cx="70" cy="10" r="2" fill="#c5a059" opacity="0.5" />
			<circle cx="10" cy="70" r="2" fill="#c5a059" opacity="0.5" />
		</svg>
	);
}

export function GameBackground({
	isNight,
	isBlinking = false,
}: GameBackgroundProps) {
	const fadeDuration = isBlinking ? 0 : 1.5;
	return (
		<div className="absolute inset-0 z-0 overflow-hidden">
			{/* Day Background */}
			<motion.div
				className="absolute inset-0"
				initial={false}
				animate={{ opacity: isNight ? 0 : 1 }}
				transition={{ duration: fadeDuration }}
				style={{
					backgroundColor: "var(--bg-day-main)",
					backgroundImage: `
						radial-gradient(circle at 50% 50%, rgba(197, 160, 89, 0.05), transparent 70%),
						url("/game/noise-64.png")
					`,
					backgroundSize: "auto, 64px 64px",
					backgroundRepeat: "no-repeat, repeat",
				}}
			>
				<div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(to bottom right, var(--bg-day-from), var(--bg-day-via), var(--bg-day-to))",
						opacity: 0.8,
						mixBlendMode: "overlay",
					}}
				/>
			</motion.div>

			{/* Night Background */}
			<motion.div
				className="absolute inset-0"
				style={{
					backgroundColor: "var(--bg-dark)",
					backgroundImage: `
						radial-gradient(circle at 50% 50%, rgba(138, 28, 28, 0.05), transparent 60%),
						url("/game/noise-64.png")
					`,
					backgroundSize: "auto, 64px 64px",
					backgroundRepeat: "no-repeat, repeat",
				}}
				initial={false}
				animate={{ opacity: isNight ? 1 : 0 }}
				transition={{ duration: fadeDuration }}
			/>

			{/* 夜晚雾气效果 — shrunk from 4× viewport to 1.4× */}
			{!isBlinking && (
				<motion.div
					className="absolute inset-[-10%] pointer-events-none"
					style={{
						background: `
							radial-gradient(circle at 50% 50%, rgba(138, 28, 28, 0.05), transparent 60%),
							radial-gradient(circle at 20% 30%, rgba(0, 0, 0, 0.4), transparent 50%)
						`,
					}}
					initial={false}
					animate={{
						opacity: isNight ? 0.8 : 0,
						scale: isNight ? [1, 1.03, 1] : 1,
					}}
					transition={{
						opacity: { duration: fadeDuration },
						scale: { duration: 14, repeat: Infinity, ease: "easeInOut" },
					}}
				/>
			)}

			{/* 白天柔和光晕 — static radial-gradients (no blur, no animate-pulse) */}
			{!isBlinking && (
				<motion.div
					className="absolute inset-0 pointer-events-none"
					initial={false}
					animate={{ opacity: isNight ? 0 : 0.3 }}
					transition={{ duration: fadeDuration }}
					style={{
						background: `
							radial-gradient(circle at 25% 25%, rgba(255,255,255,0.18), transparent 50%),
							radial-gradient(circle at 75% 66%, rgba(217,194,120,0.12), transparent 55%)
						`,
					}}
				/>
			)}

			{/* 夜晚血红光晕 — static radial-gradients (no blur, no animate-pulse) */}
			{!isBlinking && (
				<motion.div
					className="absolute inset-0 pointer-events-none"
					initial={false}
					animate={{ opacity: isNight ? 0.4 : 0 }}
					transition={{ duration: fadeDuration }}
					style={{
						background: `
							radial-gradient(circle at 33% 33%, rgba(138,28,28,0.15), transparent 50%),
							radial-gradient(circle at 66% 75%, rgba(197,160,89,0.08), transparent 50%)
						`,
					}}
				/>
			)}

			{/* 装饰角纹 - 参考 style-unification-preview.html */}
			<motion.div
				initial={false}
				animate={{ opacity: isNight ? 0.3 : 0.15 }}
				transition={{ duration: fadeDuration }}
			>
				<CornerDeco className="wc-corner-deco--tl" />
				<CornerDeco className="wc-corner-deco--tr" />
				<CornerDeco className="wc-corner-deco--bl" />
				<CornerDeco className="wc-corner-deco--br" />
			</motion.div>
		</div>
	);
}
