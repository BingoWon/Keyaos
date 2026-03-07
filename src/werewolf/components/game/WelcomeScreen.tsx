import {
	FingerprintSimple,
	GearSix,
	GithubLogo,
	Sparkle,
	UsersFour,
	Wrench,
} from "@phosphor-icons/react";
import { DevModeButton } from "@wolf/components/DevTools";
import { AccountModal } from "@wolf/components/game/AccountModal";
import { AuthModal } from "@wolf/components/game/AuthModal";
import { CustomCharacterModal } from "@wolf/components/game/CustomCharacterModal";
import { GameSetupModal } from "@wolf/components/game/GameSetupModal";
import { LocaleSwitcher } from "@wolf/components/game/LocaleSwitcher";
import {
	LOW_CREDIT_THRESHOLD,
	LowCreditModal,
} from "@wolf/components/game/LowCreditModal";
import { ResetPasswordModal } from "@wolf/components/game/ResetPasswordModal";
import { SharePanel } from "@wolf/components/game/SharePanel";
import { UserProfileModal } from "@wolf/components/game/UserProfileModal";
import { WerewolfIcon } from "@wolf/components/icons/FlatIcons";
import { Button } from "@wolf/components/ui/button";
import { Dialog, DialogContent } from "@wolf/components/ui/dialog";
import { useCredits } from "@wolf/hooks/useCredits";
import { useCustomCharacters } from "@wolf/hooks/useCustomCharacters";
import { useAppLocale } from "@wolf/i18n/useAppLocale";
import {
	hasDashscopeKey,
	hasZenmuxKey,
	isCustomKeyEnabled,
} from "@wolf/lib/api-keys";
import {
	getShanghaiDateKey,
	isSpringCampaignActive,
	SPRING_CAMPAIGN_CODE,
	SPRING_CAMPAIGN_DAILY_QUOTA,
} from "@wolf/lib/spring-campaign";
import {
	FREE_ROUNDS_PROMO_ENABLED,
	REFERRAL_BONUS_ENABLED,
	SPRING_CAMPAIGN_ENABLED,
} from "@wolf/lib/welfare-config";
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
import { toast } from "sonner";

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

	const {
		user,
		session: _session,
		credits,
		referralCode,
		totalReferrals,
		loading: creditsLoading,
		consumeCredit,
		redeemCode,
		signOut,
		isPasswordRecovery,
		clearPasswordRecovery,
		fetchCredits,
		springCampaign,
	} = useCredits();
	const [isSetupOpen, setIsSetupOpen] = useState(false);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const paperRef = useRef<HTMLDivElement | null>(null);
	const sealButtonRef = useRef<HTMLButtonElement | null>(null);
	const isStartingRef = useRef(false);
	const [isAuthOpen, setIsAuthOpen] = useState(false);
	const [isShareOpen, setIsShareOpen] = useState(false);
	const [isAccountOpen, setIsAccountOpen] = useState(false);
	const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
	const [isSpringFestivalOpen, setIsSpringFestivalOpen] = useState(false);
	const [isCustomCharacterOpen, setIsCustomCharacterOpen] = useState(false);
	const [isLowCreditOpen, setIsLowCreditOpen] = useState(false);
	const [userProfileDefaultTab, setUserProfileDefaultTab] = useState<
		string | undefined
	>(undefined);
	const selectionStorageKey = useMemo(() => {
		return user?.id
			? `${CUSTOM_CHARACTER_SELECTION_STORAGE_KEY}:${user.id}`
			: CUSTOM_CHARACTER_SELECTION_STORAGE_KEY;
	}, [user?.id]);

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

	const customCharacters = useCustomCharacters(user);
	const [difficulty, _setDifficulty] = useAtom(difficultyAtom);
	const [playerCount, setPlayerCount] = useAtom(playerCountAtom);
	const [preferredRole, setPreferredRole] = useAtom(preferredRoleAtom);
	const springCampaignRemainingQuota = springCampaign?.remainingQuota ?? 0;
	const springCampaignTotalQuota = springCampaign?.totalQuota ?? 0;
	const springCampaignActiveNow =
		SPRING_CAMPAIGN_ENABLED &&
		(springCampaign?.active ?? isSpringCampaignActive());
	const springCampaignDateToday = springCampaignActiveNow
		? getShanghaiDateKey()
		: null;
	const isSpringCampaignForToday =
		springCampaignActiveNow &&
		springCampaign?.quotaDate === springCampaignDateToday;
	const effectiveSpringRemainingQuota = springCampaignActiveNow
		? isSpringCampaignForToday
			? springCampaignRemainingQuota
			: SPRING_CAMPAIGN_DAILY_QUOTA
		: 0;
	const effectiveSpringTotalQuota = springCampaignActiveNow
		? isSpringCampaignForToday
			? springCampaignTotalQuota
			: SPRING_CAMPAIGN_DAILY_QUOTA
		: 0;
	const hasSpringQuota =
		springCampaignActiveNow && effectiveSpringRemainingQuota > 0;
	const mayHaveUnclaimedSpringQuota =
		springCampaignActiveNow && !isSpringCampaignForToday;
	const springFestivalSeenKey = `wolfcha:${SPRING_CAMPAIGN_CODE}:welcome_seen`;

	useEffect(() => {
		if (
			!SPRING_CAMPAIGN_ENABLED ||
			!springCampaign?.active ||
			!springCampaign.justClaimed
		)
			return;
		toast.success(t("welcome.springCampaign.toast.claimed.title"), {
			description: t("welcome.springCampaign.toast.claimed.description"),
		});
	}, [springCampaign?.active, springCampaign?.justClaimed, t]);

	useEffect(() => {
		if (!springCampaignActiveNow) return;
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		const popupDebugMode = params.get("spring_popup_debug") === "1";
		const seen = window.localStorage.getItem(springFestivalSeenKey);
		if (!popupDebugMode && seen === "1") return;
		if (!popupDebugMode) {
			window.localStorage.setItem(springFestivalSeenKey, "1");
		}
		setIsSpringFestivalOpen(true);
	}, [springCampaignActiveNow, springFestivalSeenKey]);

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

	const [customKeyEnabled, setCustomKeyEnabled] = useState(() =>
		isCustomKeyEnabled(),
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onStorage = (e: StorageEvent) => {
			if (e.key !== "wolfcha_custom_key_enabled") return;
			setCustomKeyEnabled(isCustomKeyEnabled());
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

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
		return (
			!!humanName.trim() && !isLoading && !isTransitioning && !creditsLoading
		);
	}, [humanName, isLoading, isTransitioning, creditsLoading]);

	const isAnyModalOpen =
		isSetupOpen ||
		isAuthOpen ||
		(REFERRAL_BONUS_ENABLED && isShareOpen) ||
		isAccountOpen ||
		isUserProfileOpen ||
		(SPRING_CAMPAIGN_ENABLED && isSpringFestivalOpen) ||
		isCustomCharacterOpen ||
		isLowCreditOpen ||
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

	const handleCreditFailure = () => {
		setIsTransitioning(false);
		onAbort?.();
		if (REFERRAL_BONUS_ENABLED) {
			setIsShareOpen(true);
		} else {
			setUserProfileDefaultTab("payAsYouGo");
			setIsUserProfileOpen(true);
		}
		toast.error(t("welcome.toast.creditFail.title"), {
			description: t("welcome.toast.creditFail.description"),
		});
	};

	const handleConfirm = async () => {
		if (!canConfirm) {
			return;
		}
		if (isStartingRef.current) {
			return;
		}

		if (!user) {
			setIsAuthOpen(true);
			toast(t("welcome.toast.signInFirst"));
			return;
		}

		const hasUserKey =
			customKeyEnabled && (hasZenmuxKey() || hasDashscopeKey());

		if (
			!hasUserKey &&
			credits !== null &&
			credits <= LOW_CREDIT_THRESHOLD &&
			!hasSpringQuota &&
			!mayHaveUnclaimedSpringQuota
		) {
			setIsLowCreditOpen(true);
			return;
		}

		isStartingRef.current = true;

		const seal = sealButtonRef.current;
		if (seal) createParticles(seal);

		setIsTransitioning(true);

		window.setTimeout(() => {
			// 传递开发模式配置
			const roles =
				devTab === "roles" && devRoleOverrideEnabled && roleConfigValid
					? (fixedRoles as Role[])
					: undefined;
			const preset =
				devTab === "preset" && devPreset ? (devPreset as DevPreset) : undefined;

			// Get selected custom characters
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
		}, 800);

		if (hasUserKey) {
			isStartingRef.current = false;
			return;
		}

		void consumeCredit()
			.then((consumed) => {
				if (consumed) return;
				handleCreditFailure();
			})
			.catch(() => {
				handleCreditFailure();
			})
			.finally(() => {
				isStartingRef.current = false;
			});
	};

	const handleOpenPayAsYouGo = () => {
		setUserProfileDefaultTab("payAsYouGo");
		setIsUserProfileOpen(true);
	};

	const handleStartGameFromLowCreditModal = () => {
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
		}, 800);

		const hasUserKey =
			customKeyEnabled && (hasZenmuxKey() || hasDashscopeKey());
		if (hasUserKey) {
			isStartingRef.current = false;
			return;
		}

		void consumeCredit()
			.then((consumed) => {
				if (consumed) return;
				handleCreditFailure();
			})
			.catch(() => {
				handleCreditFailure();
			})
			.finally(() => {
				isStartingRef.current = false;
			});
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
				<AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
				<AccountModal open={isAccountOpen} onOpenChange={setIsAccountOpen} />
				<UserProfileModal
					open={isUserProfileOpen}
					onOpenChange={(open) => {
						setIsUserProfileOpen(open);
						if (!open) setUserProfileDefaultTab(undefined);
					}}
					email={user?.email}
					credits={credits ?? undefined}
					springCampaign={springCampaign}
					referralCode={referralCode}
					totalReferrals={totalReferrals}
					onChangePassword={() => setIsAccountOpen(true)}
					onShareInvite={() => setIsShareOpen(true)}
					onSignOut={signOut}
					onRedeemCode={redeemCode}
					onCustomKeyEnabledChange={setCustomKeyEnabled}
					onCreditsChange={fetchCredits}
					defaultTab={userProfileDefaultTab}
				/>
				<LowCreditModal
					open={isLowCreditOpen}
					onOpenChange={setIsLowCreditOpen}
					credits={credits ?? 0}
					onStartGame={handleStartGameFromLowCreditModal}
					onOpenPayAsYouGo={handleOpenPayAsYouGo}
				/>
				<ResetPasswordModal
					open={isPasswordRecovery}
					onOpenChange={(open) => !open && clearPasswordRecovery()}
					onSuccess={clearPasswordRecovery}
				/>
				{REFERRAL_BONUS_ENABLED && (
					<SharePanel
						open={isShareOpen}
						onOpenChange={setIsShareOpen}
						referralCode={referralCode}
						totalReferrals={totalReferrals}
					/>
				)}
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

				{SPRING_CAMPAIGN_ENABLED && (
					<Dialog
						open={isSpringFestivalOpen}
						onOpenChange={setIsSpringFestivalOpen}
					>
						<DialogContent className="max-w-[560px] overflow-hidden border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-0">
							<motion.div
								initial={{
									opacity: 0,
									y: 18,
									scale: 0.92,
									rotateX: -14,
									filter: "blur(8px)",
								}}
								animate={{
									opacity: 1,
									y: 0,
									scale: 1,
									rotateX: 0,
									filter: "blur(0px)",
								}}
								transition={{ duration: 0.55, ease: "easeOut" }}
								style={{ transformOrigin: "top center", perspective: 1100 }}
								className="relative"
							>
								<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_40%)]" />
								<div className="bg-gradient-to-r from-[#8b1a1a] via-[#b4232b] to-[#8b1a1a] px-6 py-5 text-white">
									<div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/80">
										<Sparkle size={14} weight="fill" />
										{t("welcome.springCampaign.modal.badge")}
									</div>
									<h3 className="mt-2 text-2xl font-semibold tracking-wide">
										{t("welcome.springCampaign.modal.title")}
									</h3>
									<p className="mt-1 text-sm text-white/90">
										{t("welcome.springCampaign.modal.subtitle")}
									</p>
								</div>
								<div className="space-y-3 px-6 py-5 text-sm">
									<p className="text-[var(--text-primary)]">
										{t("welcome.springCampaign.modal.line1")}
									</p>
									<p className="text-[var(--text-secondary)]">
										{t("welcome.springCampaign.modal.line2")}
									</p>
									<p className="text-[var(--text-secondary)]">
										{t("welcome.springCampaign.modal.line3")}
									</p>
									<div className="rounded-lg border border-[var(--border-color)] bg-white/60 px-3 py-2 text-xs text-[var(--text-secondary)]">
										{t("welcome.springCampaign.modal.note")}
									</div>
									<Button
										type="button"
										className="w-full bg-[#b4232b] text-white hover:bg-[#9f1f26]"
										onClick={() => setIsSpringFestivalOpen(false)}
									>
										{t("welcome.springCampaign.modal.action")}
									</Button>
								</div>
							</motion.div>
						</DialogContent>
					</Dialog>
				)}

				{/* AI Provider showcase cards */}
				<div
					className="wc-sponsor-cards"
					aria-label={t("welcome.sponsor.showcaseLabel")}
				>
					<ProviderCard
						href="https://openai.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--top-left"
						rotate="4deg"
						delay={0.15}
						logoSrc="/game/models/openai.svg"
						logoAlt="OpenAI"
						name="OpenAI"
						note={t("welcome.sponsor.cards.openai")}
					/>

					<ProviderCard
						href="https://anthropic.com"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--right-bottom"
						rotate="-4deg"
						delay={0.6}
						logoSrc="/game/models/claude.svg"
						logoAlt="Anthropic"
						name="Anthropic"
						note={t("welcome.sponsor.cards.anthropic")}
					/>

					<ProviderCard
						href="https://deepmind.google"
						className="wc-sponsor-card wc-sponsor-card--with-logo wc-sponsor-card--watcha"
						rotate="5deg"
						delay={0.45}
						logoSrc="/game/models/gemini.svg"
						logoAlt="Google"
						name="Google"
						note={t("welcome.sponsor.cards.google")}
					/>
				</div>

				<div className="wc-welcome-actions absolute top-5 right-5 z-20 flex items-center gap-2">
					<div className="flex items-center gap-2">
						<LocaleSwitcher className="shrink-0" />
						<Button asChild variant="outline" className="h-8 text-xs gap-2">
							<a
								href="https://github.com/oil-oil/wolfcha"
								target="_blank"
								rel="noopener noreferrer"
							>
								<GithubLogo size={16} />
								<span className="hidden sm:inline">GitHub</span>
							</a>
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsSetupOpen(true)}
							className="h-8 text-xs gap-2"
						>
							<GearSix size={16} />
							<span className="hidden sm:inline">{t("welcome.settings")}</span>
						</Button>
					</div>
				</div>

				<motion.div
					initial={{ opacity: 0, y: 14, scale: 0.99, filter: "blur(10px)" }}
					animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
					transition={{ duration: 0.65, ease: "easeOut" }}
					className="relative z-10 w-full max-w-[460px] px-6"
				>
					<div ref={paperRef} className="wc-contract-paper">
						<div className="wc-contract-borders" aria-hidden="true" />

						{locale === "zh" && FREE_ROUNDS_PROMO_ENABLED && (
							<a
								href="https://my.feishu.cn/share/base/form/shrcnqLuGo3qyh64vFp2JhCN9CF"
								target="_blank"
								rel="noopener noreferrer"
								className="wc-promo-tag-container"
								aria-label="赠送次数"
							>
								<span className="wc-paper-clip" aria-hidden="true" />
								<span className="wc-promo-ticket">
									<span className="wc-shine-effect" aria-hidden="true" />
									<span className="wc-promo-title">赠送次数</span>
									<span className="wc-promo-subtitle">Free Rounds</span>
								</span>
							</a>
						)}

						{/* Mobile: inline provider stamps at top of paper */}
						<div className="wc-paper-sponsors sm:hidden">
							<a
								href="https://openai.com"
								target="_blank"
								rel="noopener noreferrer"
								className="wc-paper-stamp"
								style={{ "--stamp-rotate": "4deg" } as React.CSSProperties}
							>
								<img
									src="/game/models/openai.svg"
									alt="OpenAI"
									className="wc-paper-stamp__logo"
								/>
								<span className="wc-paper-stamp__name">OpenAI</span>
							</a>
							<a
								href="https://anthropic.com"
								target="_blank"
								rel="noopener noreferrer"
								className="wc-paper-stamp"
								style={{ "--stamp-rotate": "-3deg" } as React.CSSProperties}
							>
								<img
									src="/game/models/claude.svg"
									alt="Anthropic"
									className="wc-paper-stamp__logo"
								/>
								<span className="wc-paper-stamp__name">Anthropic</span>
							</a>
							<a
								href="https://deepmind.google"
								target="_blank"
								rel="noopener noreferrer"
								className="wc-paper-stamp"
								style={{ "--stamp-rotate": "6deg" } as React.CSSProperties}
							>
								<img
									src="/game/models/gemini.svg"
									alt="Google"
									className="wc-paper-stamp__logo"
								/>
								<span className="wc-paper-stamp__name">Google</span>
							</a>
						</div>

						<div className="mt-2 text-center">
							<div className="wc-contract-title">WOLFCHA</div>
							<div className="wc-contract-subtitle">
								{t("welcome.subtitle")}
							</div>
						</div>

						<div className="mt-5">
							{springCampaignActiveNow ? (
								<div className="relative rotate-[-1deg]">
									<div
										className="pointer-events-none absolute -top-2 left-6 h-4 w-20 rotate-[-6deg] rounded-sm border border-black/10 bg-white/60 shadow-sm"
										aria-hidden="true"
									/>
									<div className="rounded-xl border border-[var(--border-color)] bg-white/60 px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
										<div className="flex items-center justify-between gap-3">
											<p className="text-sm font-semibold text-[var(--text-primary)]">
												{t("welcome.springCampaign.title")}
											</p>
											<p className="text-xs text-[var(--text-muted)]">
												{t("welcome.springCampaign.range")}
											</p>
										</div>
										<p className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">
											{user
												? t("welcome.springCampaign.claimedStatus", {
														count: springCampaignActiveNow
															? effectiveSpringRemainingQuota
															: SPRING_CAMPAIGN_DAILY_QUOTA,
														total: springCampaignActiveNow
															? effectiveSpringTotalQuota
															: SPRING_CAMPAIGN_DAILY_QUOTA,
													})
												: t("welcome.springCampaign.signInHint")}
										</p>
									</div>
								</div>
							) : null}
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
						{user && (
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
