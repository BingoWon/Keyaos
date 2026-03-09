import {
	FingerprintSimple,
	GearSix,
	GithubLogo,
	SpeakerSimpleHigh,
	SpeakerSimpleSlash,
	Sparkle,
	UsersFour,
	Wrench,
} from "@phosphor-icons/react";
import { DevModeButton } from "@wolf/components/DevTools";
import { CustomCharacterModal } from "@wolf/components/game/CustomCharacterModal";
import { GameSetupModal } from "@wolf/components/game/GameSetupModal";
import { GateModal } from "@wolf/components/game/GateModal";
import { LocaleSwitcher } from "@wolf/components/game/LocaleSwitcher";
import { WerewolfIcon } from "@wolf/components/icons/FlatIcons";
import { Button } from "@wolf/components/ui/button";
import { useCustomCharacters } from "@wolf/hooks/useCustomCharacters";
import { type GateReason, useGameGate } from "@wolf/hooks/useGameGate";
import { useAppLocale } from "@wolf/i18n/useAppLocale";
import {
	difficultyAtom,
	playerCountAtom,
	preferredRoleAtom,
} from "@wolf/store/settings";
import type { DevPreset, Role, StartGameOptions } from "@wolf/types/game";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProviderCardProps = {
	href: string;
	className: string;
	rotate: string;
	delay: number;
	logoSrc?: string;
	logoAlt?: string;
	name?: string;
	note?: string;
};

const CUSTOM_CHARACTER_SELECTION_STORAGE_KEY =
	"wolfcha_custom_character_selection";

function ProviderCard({
	href,
	className,
	rotate,
	delay,
	logoSrc,
	logoAlt,
	name,
	note,
}: ProviderCardProps) {
	const ariaLabel = [name, note].filter(Boolean).join(" · ");

	return (
		<motion.a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ delay, duration: 0.5 }}
			className={className}
			style={{ "--card-rotate": rotate } as React.CSSProperties}
			aria-label={ariaLabel || undefined}
			title={ariaLabel || undefined}
		>
			<span className="wc-sponsor-card__border" aria-hidden="true" />
			<div className="wc-sponsor-card__content">
				{logoSrc && (
					<img
						src={logoSrc}
						alt={logoAlt ?? ""}
						className="wc-sponsor-card__logo"
					/>
				)}
				{name && <div className="wc-sponsor-card__name">{name}</div>}
				{note && <div className="wc-sponsor-card__note">{note}</div>}
			</div>
		</motion.a>
	);
}

function buildDefaultRoles(playerCount: number): Role[] {
	switch (playerCount) {
		case 8:
			return [
				"Werewolf",
				"Werewolf",
				"Werewolf",
				"Seer",
				"Witch",
				"Hunter",
				"Villager",
				"Villager",
			];
		case 9:
			return [
				"Werewolf",
				"Werewolf",
				"Werewolf",
				"Seer",
				"Witch",
				"Hunter",
				"Villager",
				"Villager",
				"Villager",
			];
		case 11:
			return [
				"Werewolf",
				"Werewolf",
				"Werewolf",
				"WhiteWolfKing",
				"Seer",
				"Witch",
				"Hunter",
				"Guard",
				"Idiot",
				"Villager",
				"Villager",
			];
		case 12:
			return [
				"Werewolf",
				"Werewolf",
				"Werewolf",
				"WhiteWolfKing",
				"Seer",
				"Witch",
				"Hunter",
				"Guard",
				"Idiot",
				"Villager",
				"Villager",
				"Villager",
			];
		default:
			return [
				"Werewolf",
				"Werewolf",
				"WhiteWolfKing",
				"Seer",
				"Witch",
				"Hunter",
				"Guard",
				"Villager",
				"Villager",
				"Villager",
			];
	}
}

function getRoleCountConfig(playerCount: number) {
	const werewolfCount = playerCount >= 11 ? 3 : 2;
	const whiteWolfKingCount = 1;
	const wolfCount = werewolfCount + whiteWolfKingCount;
	const guardCount = playerCount >= 10 ? 1 : 0;
	const idiotCount = playerCount >= 11 ? 1 : 0;
	const seerCount = 1;
	const witchCount = 1;
	const hunterCount = 1;
	const godCount =
		seerCount + witchCount + hunterCount + guardCount + idiotCount;
	const villagerCount = Math.max(0, playerCount - wolfCount - godCount);
	return {
		werewolfCount,
		whiteWolfKingCount,
		wolfCount,
		guardCount,
		seerCount,
		witchCount,
		hunterCount,
		idiotCount,
		villagerCount,
	};
}

interface WelcomeScreenProps {
	humanName: string;
	setHumanName: (name: string) => void;
	onStart: (options?: StartGameOptions) => void | Promise<void>;
	onAbort?: () => void;
	isLoading: boolean;
	isGenshinMode: boolean;
	onGenshinModeChange: (value: boolean) => void;
	isSpectatorMode: boolean;
	onSpectatorModeChange: (value: boolean) => void;
	bgmVolume: number;
	isSoundEnabled: boolean;
	isAiVoiceEnabled: boolean;
	isAutoAdvanceDialogueEnabled: boolean;
	onBgmVolumeChange: (value: number) => void;
	onSoundEnabledChange: (value: boolean) => void;
	onAiVoiceEnabledChange: (value: boolean) => void;
	onAutoAdvanceDialogueEnabledChange: (value: boolean) => void;
}

export function WelcomeScreen({
	humanName,
	setHumanName,
	onStart,
	onAbort,
	isLoading,
	isGenshinMode,
	onGenshinModeChange,
	isSpectatorMode,
	onSpectatorModeChange,
	bgmVolume,
	isSoundEnabled,
	isAiVoiceEnabled,
	isAutoAdvanceDialogueEnabled,
	onBgmVolumeChange,
	onSoundEnabledChange,
	onAiVoiceEnabledChange,
	onAutoAdvanceDialogueEnabledChange,
}: WelcomeScreenProps) {
	const t = useTranslations();
	const { locale } = useAppLocale();
	const gate = useGameGate();

	const [isSetupOpen, setIsSetupOpen] = useState(false);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const paperRef = useRef<HTMLDivElement | null>(null);
	const sealButtonRef = useRef<HTMLButtonElement | null>(null);
	const isStartingRef = useRef(false);
	const [isCustomCharacterOpen, setIsCustomCharacterOpen] = useState(false);
	const [gateReason, setGateReason] = useState<GateReason>(null);

	const selectionStorageKey = useMemo(() => {
		return gate.isSignedIn
			? `${CUSTOM_CHARACTER_SELECTION_STORAGE_KEY}:keyaos`
			: CUSTOM_CHARACTER_SELECTION_STORAGE_KEY;
	}, [gate.isSignedIn]);

	const readSelectionFromStorage = useCallback(() => {
		if (typeof window === "undefined") return new Set<string>();
		try {
			const raw = window.localStorage.getItem(selectionStorageKey);
			if (!raw) return new Set<string>();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set<string>();
			return new Set(
				parsed.filter((item): item is string => typeof item === "string"),
			);
		} catch {
			return new Set<string>();
		}
	}, [selectionStorageKey]);

	const selectionStorageKeyRef = useRef<string | null>(null);
	const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(
		() => readSelectionFromStorage(),
	);

	const customCharacters = useCustomCharacters();
	const [difficulty, _setDifficulty] = useAtom(difficultyAtom);
	const [playerCount, setPlayerCount] = useAtom(playerCountAtom);
	const [preferredRole, setPreferredRole] = useAtom(preferredRoleAtom);

	useEffect(() => {
		selectionStorageKeyRef.current = selectionStorageKey;
		setSelectedCharacterIds(readSelectionFromStorage());
	}, [readSelectionFromStorage, selectionStorageKey]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (selectionStorageKeyRef.current !== selectionStorageKey) return;
		const ids = Array.from(selectedCharacterIds);
		window.localStorage.setItem(selectionStorageKey, JSON.stringify(ids));
	}, [selectedCharacterIds, selectionStorageKey]);

	useEffect(() => {
		if (customCharacters.loading) return;
		const validIds = new Set(
			customCharacters.characters.map((char) => char.id),
		);
		const filtered = new Set(
			Array.from(selectedCharacterIds).filter((id) => validIds.has(id)),
		);
		if (filtered.size !== selectedCharacterIds.size) {
			setSelectedCharacterIds(filtered);
		}
	}, [
		customCharacters.characters,
		customCharacters.loading,
		selectedCharacterIds,
	]);

	// 调试面板状态
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const [_isDevModeEnabled, setIsDevModeEnabled] = useState(false);
	const [isDevConsoleOpen, setIsDevConsoleOpen] = useState(false);
	const [devTab, setDevTab] = useState<"preset" | "roles">("preset");
	const [devPreset, setDevPreset] = useState<DevPreset | "">("");
	const showDevTools =
		process.env.NODE_ENV !== "production" &&
		(process.env.NEXT_PUBLIC_SHOW_DEVTOOLS ?? "true") === "true";

	const roleOptions: Role[] = [
		"Villager",
		"Werewolf",
		"WhiteWolfKing",
		"Seer",
		"Witch",
		"Hunter",
		"Guard",
		"Idiot",
	];
	const roleLabels = useMemo<Record<Role, string>>(
		() => ({
			Villager: t("roles.villager"),
			Werewolf: t("roles.werewolf"),
			WhiteWolfKing: t("roles.whiteWolfKing"),
			Seer: t("roles.seer"),
			Witch: t("roles.witch"),
			Hunter: t("roles.hunter"),
			Guard: t("roles.guard"),
			Idiot: t("roles.idiot"),
		}),
		[t],
	);

	const [devRoleOverrideEnabled, setDevRoleOverrideEnabled] = useState(false);
	const [fixedRoles, setFixedRoles] = useState<(Role | "")[]>(() =>
		buildDefaultRoles(10),
	);

	useEffect(() => {
		setFixedRoles(buildDefaultRoles(playerCount));
	}, [playerCount]);

	const roleConfigValid = useMemo(() => {
		if (fixedRoles.length !== playerCount) return false;
		if (fixedRoles.some((r) => !r)) return false;

		const counts: Record<Role, number> = {
			Villager: 0,
			Werewolf: 0,
			Seer: 0,
			Witch: 0,
			Hunter: 0,
			Guard: 0,
			Idiot: 0,
			WhiteWolfKing: 0,
		};
		for (const r of fixedRoles) {
			counts[r as Role] += 1;
		}

		const expected = getRoleCountConfig(playerCount);
		return (
			counts.Werewolf === expected.werewolfCount &&
			counts.WhiteWolfKing === expected.whiteWolfKingCount &&
			counts.Seer === expected.seerCount &&
			counts.Witch === expected.witchCount &&
			counts.Hunter === expected.hunterCount &&
			counts.Guard === expected.guardCount &&
			counts.Idiot === expected.idiotCount &&
			counts.Villager === expected.villagerCount
		);
	}, [fixedRoles, playerCount]);

	const roleConfigHint = useMemo(() => {
		const expected = getRoleCountConfig(playerCount);
		const godLabel =
			expected.guardCount > 0
				? t("welcome.roleConfig.godLabelFull")
				: t("welcome.roleConfig.godLabelNoGuard");
		return t("welcome.roleConfig.hint", {
			wolfCount: expected.wolfCount,
			godLabel,
			villagerCount: expected.villagerCount,
		});
	}, [playerCount, t]);

	const canConfirm = useMemo(() => {
		return !!humanName.trim() && !isLoading && !isTransitioning && !gate.loading;
	}, [humanName, isLoading, isTransitioning, gate.loading]);

	const isAnyModalOpen =
		isSetupOpen ||
		isCustomCharacterOpen ||
		!!gateReason ||
		isDevConsoleOpen;

	useEffect(() => {
		const paper = paperRef.current;
		if (!paper) return;

		if (typeof window === "undefined") return;
		if ("ontouchstart" in window) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

		let rafId: number | null = null;
		let lastX = 0;
		let lastY = 0;

		const update = () => {
			rafId = null;
			const xAxis = (window.innerWidth / 2 - lastX) / 60;
			const yAxis = (window.innerHeight / 2 - lastY) / 60;
			paper.style.setProperty("--wc-tilt-x", `${xAxis}`);
			paper.style.setProperty("--wc-tilt-y", `${yAxis}`);
		};

		const onMove = (e: MouseEvent) => {
			lastX = e.clientX;
			lastY = e.clientY;
			if (rafId !== null) return;
			rafId = window.requestAnimationFrame(update);
		};

		const onLeave = () => {
			paper.style.setProperty("--wc-tilt-x", "0");
			paper.style.setProperty("--wc-tilt-y", "0");
		};

		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseleave", onLeave);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseleave", onLeave);
			if (rafId !== null) window.cancelAnimationFrame(rafId);
		};
	}, []);

	const createParticles = (element: HTMLElement) => {
		const rect = element.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		for (let i = 0; i < 18; i += 1) {
			const particle = document.createElement("div");
			particle.className = "wc-particle";
			document.body.appendChild(particle);

			const size = Math.random() * 7 + 2;
			particle.style.width = `${size}px`;
			particle.style.height = `${size}px`;
			particle.style.left = `${centerX}px`;
			particle.style.top = `${centerY}px`;

			const angle = Math.random() * Math.PI * 2;
			const velocity = Math.random() * 90 + 40;
			const tx = Math.cos(angle) * velocity;
			const ty = Math.sin(angle) * velocity - 90;

			particle.animate(
				[
					{ transform: "translate(0, 0) scale(1)", opacity: 1 },
					{ transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 },
				],
				{
					duration: 900 + Math.random() * 450,
					easing: "cubic-bezier(0, .9, .57, 1)",
					fill: "forwards",
				},
			);

			window.setTimeout(() => particle.remove(), 1600);
		}
	};

	const handleConfirm = async () => {
		if (!canConfirm || isStartingRef.current) return;

		const blocked = gate.check();
		if (blocked) {
			setGateReason(blocked);
			return;
		}

		isStartingRef.current = true;
		const seal = sealButtonRef.current;
		if (seal) createParticles(seal);
		setIsTransitioning(true);

		window.setTimeout(() => {
			const roles =
				devTab === "roles" && devRoleOverrideEnabled && roleConfigValid
					? (fixedRoles as Role[])
					: undefined;
			const preset =
				devTab === "preset" && devPreset ? (devPreset as DevPreset) : undefined;

			const selectedCustomChars = customCharacters.characters
				.filter((c) => selectedCharacterIds.has(c.id))
				.map((c) => ({
					id: c.id,
					display_name: c.display_name,
					gender: c.gender,
					age: c.age,
					mbti: c.mbti,
					basic_info: c.basic_info,
					style_label: c.style_label,
					avatar_seed: c.avatar_seed,
				}));

			void onStart({
				fixedRoles: roles,
				devPreset: preset,
				difficulty,
				playerCount,
				customCharacters: selectedCustomChars,
				preferredRole: preferredRole || undefined,
			});
			isStartingRef.current = false;
		}, 800);
	};

	return (
		<>
			<div className="wc-contract-screen selection:bg-[var(--color-accent)] selection:text-white">
				<div className="wc-contract-fog" aria-hidden="true" />
				<div className="wc-contract-vignette" aria-hidden="true" />

				<GameSetupModal
					open={isSetupOpen}
					onOpenChange={setIsSetupOpen}
					playerCount={playerCount}
					onPlayerCountChange={setPlayerCount}
					preferredRole={preferredRole}
					onPreferredRoleChange={setPreferredRole}
					isGenshinMode={isGenshinMode}
					onGenshinModeChange={onGenshinModeChange}
					isSpectatorMode={isSpectatorMode}
					onSpectatorModeChange={onSpectatorModeChange}
					bgmVolume={bgmVolume}
					isSoundEnabled={isSoundEnabled}
					isAiVoiceEnabled={isAiVoiceEnabled}
					isAutoAdvanceDialogueEnabled={isAutoAdvanceDialogueEnabled}
					onBgmVolumeChange={onBgmVolumeChange}
					onSoundEnabledChange={onSoundEnabledChange}
					onAiVoiceEnabledChange={onAiVoiceEnabledChange}
					onAutoAdvanceDialogueEnabledChange={
						onAutoAdvanceDialogueEnabledChange
					}
				/>
				<GateModal
					reason={gateReason}
					onClose={() => setGateReason(null)}
				/>
				<CustomCharacterModal
					open={isCustomCharacterOpen}
					onOpenChange={setIsCustomCharacterOpen}
					characters={customCharacters.characters}
					loading={customCharacters.loading}
					canAddMore={customCharacters.canAddMore}
					remainingSlots={customCharacters.remainingSlots}
					selectedIds={selectedCharacterIds}
					onSelectionChange={setSelectedCharacterIds}
					onCreateCharacter={customCharacters.createCharacter}
					onUpdateCharacter={customCharacters.updateCharacter}
					onDeleteCharacter={customCharacters.deleteCharacter}
				/>

				{/* AI Provider showcase cards — left 3, right 2 */}
				<div
					className="wc-sponsor-cards"
					aria-label={t("welcome.sponsor.showcaseLabel")}
				>
					{/* Left column — large, small, medium */}
					<ProviderCard
						href="https://openai.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--left-top"
						rotate="-2deg"
						delay={0.15}
						logoSrc="/game/models/openai.svg"
						logoAlt="OpenAI"
						name="OpenAI"
						note={t("welcome.sponsor.cards.openai")}
					/>
					<ProviderCard
						href="https://anthropic.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--left-mid"
						rotate="7deg"
						delay={0.4}
						logoSrc="/game/models/claude.svg"
						logoAlt="Anthropic"
						name="Anthropic"
						note={t("welcome.sponsor.cards.anthropic")}
					/>
					<ProviderCard
						href="https://deepmind.google"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--left-bottom"
						rotate="-5deg"
						delay={0.6}
						logoSrc="/game/models/gemini.svg"
						logoAlt="Google"
						name="Google"
						note={t("welcome.sponsor.cards.google")}
					/>

					{/* Right column — medium-large, small */}
					<ProviderCard
						href="https://www.deepseek.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-top"
						rotate="4deg"
						delay={0.25}
						logoSrc="/game/models/deepseek.svg"
						logoAlt="DeepSeek"
						name="DeepSeek"
						note={t("welcome.sponsor.cards.deepseek")}
					/>
					<ProviderCard
						href="https://tongyi.aliyun.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-bottom"
						rotate="-6deg"
						delay={0.5}
						logoSrc="/game/models/qwen.svg"
						logoAlt="Qwen"
						name="Qwen"
						note={t("welcome.sponsor.cards.qwen")}
					/>
				</div>

				<div className="wc-welcome-actions absolute top-5 right-5 z-20 flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onSoundEnabledChange(!isSoundEnabled)}
						className="h-8 w-8 p-0 shrink-0"
						title={t(isSoundEnabled ? "welcome.mute" : "welcome.unmute")}
						aria-label={t(isSoundEnabled ? "welcome.mute" : "welcome.unmute")}
					>
						{isSoundEnabled ? (
							<SpeakerSimpleHigh size={16} />
						) : (
							<SpeakerSimpleSlash size={16} />
						)}
					</Button>
					<LocaleSwitcher className="shrink-0" />
					<Button asChild variant="outline" className="h-8 text-xs gap-2">
						<a
							href="https://github.com/oil-oil/wolfcha"
							target="_blank"
							rel="noopener noreferrer"
						>
							<GithubLogo size={16} />
							GitHub
						</a>
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsSetupOpen(true)}
						className="h-8 text-xs gap-2"
					>
						<GearSix size={16} />
						{t("welcome.settings")}
					</Button>
				</div>

				<motion.div
					initial={{ opacity: 0, y: 14, scale: 0.99, filter: "blur(10px)" }}
					animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
					transition={{ duration: 0.65, ease: "easeOut" }}
					className="relative z-10"
				>
					<div ref={paperRef} className="wc-contract-paper">
						<div className="wc-contract-borders" aria-hidden="true" />

						{/* Mobile: inline provider stamps at top of paper */}
						<div className="wc-paper-sponsors sm:hidden">
							{[
								{
									href: "https://openai.com",
									logo: "openai",
									name: "OpenAI",
									rotate: "4deg",
								},
								{
									href: "https://anthropic.com",
									logo: "claude",
									name: "Anthropic",
									rotate: "-3deg",
								},
								{
									href: "https://deepmind.google",
									logo: "gemini",
									name: "Google",
									rotate: "5deg",
								},
								{
									href: "https://www.deepseek.com",
									logo: "deepseek",
									name: "DeepSeek",
									rotate: "-4deg",
								},
								{
									href: "https://tongyi.aliyun.com",
									logo: "qwen",
									name: "Qwen",
									rotate: "3deg",
								},
							].map((p) => (
								<a
									key={p.name}
									href={p.href}
									target="_blank"
									rel="noopener noreferrer"
									className="wc-paper-stamp"
									style={{ "--stamp-rotate": p.rotate } as React.CSSProperties}
								>
									<img
										src={`/game/models/${p.logo}.svg`}
										alt={p.name}
										className="wc-paper-stamp__logo"
									/>
									<span className="wc-paper-stamp__name">{p.name}</span>
								</a>
							))}
						</div>

						<div className="mt-2 text-center">
							<div className="wc-contract-title">WOLFCHA</div>
							<div className="wc-contract-subtitle">
								{t("welcome.subtitle")}
							</div>
						</div>

						<div className="mt-7 text-center wc-contract-body">
							<div className="wc-contract-oath">
								{t("welcome.oath.line1")}
								<br />
								{t("welcome.oath.line2")}
								<br />
								{t("welcome.oath.line3")}
							</div>

							<div className="mt-4">
								<div className="wc-contract-label">
									{t("welcome.signature.label")}
								</div>
								<div className="relative mt-2">
									<input
										type="text"
										value={mounted ? humanName : ""}
										onChange={(e) => setHumanName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key !== "Enter") return;
											if (e.nativeEvent.isComposing) return;
											if (isAnyModalOpen) return;
											e.preventDefault();
											void handleConfirm();
										}}
										placeholder={t("welcome.signature.placeholder")}
										className="wc-signature-input"
										autoComplete="off"
										disabled={isLoading || isTransitioning}
									/>
									<AnimatePresence>
										{mounted && !!humanName.trim() && (
											<motion.div
												initial={{ scale: 0.8, opacity: 0 }}
												animate={{ scale: 1, opacity: 1 }}
												exit={{ scale: 0.8, opacity: 0 }}
												className="wc-signature-ok"
											>
												<Sparkle weight="fill" size={18} />
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							</div>
						</div>

						{/* Custom Character Entry */}
						{gate.isSignedIn && (
							<button
								type="button"
								onClick={() => setIsCustomCharacterOpen(true)}
								className="mt-6 mx-auto flex items-center gap-2 px-3 py-1.5 rounded-md border-2 border-dashed border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
							>
								<UsersFour size={14} />
								<span>{t("customCharacter.entryButton")}</span>
								{selectedCharacterIds.size > 0 && (
									<span className="px-1.5 py-0.5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-medium">
										{selectedCharacterIds.size}
									</span>
								)}
								{customCharacters.characters.length > 0 &&
									selectedCharacterIds.size === 0 && (
										<span className="px-1.5 py-0.5 rounded-full bg-[var(--text-muted)]/20 text-[var(--text-muted)] text-[10px] font-medium">
											{customCharacters.characters.length}
										</span>
									)}
							</button>
						)}

						<div className="mt-4 flex flex-col items-center gap-3">
							<div className="wc-seal-hint">
								{canConfirm
									? t("welcome.sealHint.ready")
									: t("welcome.sealHint.waiting")}
							</div>
							<button
								ref={sealButtonRef}
								type="button"
								className="wc-wax-seal"
								onClick={handleConfirm}
								disabled={!canConfirm}
							>
								<FingerprintSimple
									weight="fill"
									size={44}
									className="wc-wax-seal-icon"
								/>
							</button>
						</div>

						<div className="wc-corner-mark" aria-hidden="true">
							<WerewolfIcon
								size={30}
								className="text-[var(--color-wolf)] opacity-30"
							/>
						</div>
					</div>
				</motion.div>

				<AnimatePresence>
					{isTransitioning && (
						<motion.div
							className="wc-transition-overlay"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.5, ease: "easeOut" }}
						>
							<motion.div
								className="wc-transition-text"
								initial={{
									opacity: 0,
									y: 10,
									scale: 1.05,
									filter: "blur(10px)",
								}}
								animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
								transition={{ delay: 0.18, duration: 0.55, ease: "easeOut" }}
							>
								<div className="wc-transition-title">
									{t("welcome.transition.title")}
								</div>
								<div className="wc-transition-subtitle">
									{t("welcome.transition.subtitle")}
								</div>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{showDevTools && (
				<>
					<DevModeButton
						onClick={() => {
							setIsDevModeEnabled(true);
							setIsDevConsoleOpen(true);
						}}
					/>

					<AnimatePresence>
						{isDevConsoleOpen && (
							<motion.div
								initial={{ opacity: 0, x: 300 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: 300 }}
								transition={{ type: "spring", stiffness: 300, damping: 30 }}
								className="wc-dev-console fixed right-0 top-0 bottom-0 w-[400px] z-[120] bg-gray-900/95 backdrop-blur-md border-l border-gray-700 shadow-2xl flex flex-col"
							>
								<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
									<div className="flex items-center gap-2">
										<Wrench size={20} className="text-yellow-400" />
										<span className="font-bold text-white">
											{t("welcome.dev.title")}
										</span>
									</div>
									<button
										onClick={() => setIsDevConsoleOpen(false)}
										className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
										type="button"
									>
										<span className="text-xl leading-none">×</span>
									</button>
								</div>

								<div className="flex border-b border-gray-700">
									<button
										type="button"
										onClick={() => setDevTab("preset")}
										className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
											devTab === "preset"
												? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
												: "text-gray-400 hover:text-white hover:bg-gray-800/30"
										}`}
									>
										{t("welcome.dev.tabs.preset")}
									</button>
									<button
										type="button"
										onClick={() => setDevTab("roles")}
										className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
											devTab === "roles"
												? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-800/50"
												: "text-gray-400 hover:text-white hover:bg-gray-800/30"
										}`}
									>
										{t("welcome.dev.tabs.roles")}
									</button>
								</div>

								<div className="flex-1 overflow-y-auto p-4 space-y-4">
									{devTab === "preset" && (
										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<div className="text-xs font-semibold text-gray-300">
													{t("welcome.dev.preset.title")}
												</div>
												<button
													type="button"
													onClick={() => setDevPreset("")}
													className="text-xs text-gray-400 hover:text-white"
												>
													{t("welcome.dev.preset.clear")}
												</button>
											</div>
											<select
												value={devPreset}
												onChange={(e) =>
													setDevPreset(e.target.value as DevPreset | "")
												}
												className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
											>
												<option value="">{t("welcome.dev.preset.none")}</option>
												<option value="MILK_POISON_TEST">
													{t("welcome.dev.preset.milkPoison")}
												</option>
												<option value="LAST_WORDS_TEST">
													{t("welcome.dev.preset.lastWords")}
												</option>
											</select>
										</div>
									)}

									{devTab === "roles" && (
										<div className="space-y-3">
											<div className="flex items-center justify-between">
												<div className="text-xs font-semibold text-gray-300">
													{t("welcome.dev.roles.title", { count: playerCount })}
												</div>
												<div
													className={`text-xs ${roleConfigValid ? "text-green-400" : "text-gray-400"}`}
												>
													{roleConfigValid
														? t("welcome.dev.roles.ready")
														: roleConfigHint}
												</div>
											</div>

											<div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700">
												<span className="text-xs text-gray-300">
													{t("welcome.dev.roles.overrideLabel")}
												</span>
												<button
													type="button"
													role="switch"
													aria-checked={devRoleOverrideEnabled}
													onClick={() =>
														setDevRoleOverrideEnabled((prev) => !prev)
													}
													className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
														devRoleOverrideEnabled
															? "bg-yellow-500"
															: "bg-gray-600"
													}`}
												>
													<span
														className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
															devRoleOverrideEnabled
																? "translate-x-[18px]"
																: "translate-x-[3px]"
														}`}
													/>
												</button>
											</div>

											<div className="grid grid-cols-2 gap-2">
												{fixedRoles.map((role, idx) => (
													<div key={idx} className="flex items-center gap-2">
														<span className="w-10 text-xs text-gray-400">
															{t("welcome.dev.roles.seat", { seat: idx + 1 })}
														</span>
														<select
															value={role}
															onChange={(e) => {
																const next = [...fixedRoles];
																next[idx] = e.target.value as Role;
																setFixedRoles(next);
															}}
															className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-yellow-400"
														>
															{roleOptions.map((r) => (
																<option key={r} value={r}>
																	{roleLabels[r]}
																</option>
															))}
														</select>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</>
			)}
		</>
	);
}
