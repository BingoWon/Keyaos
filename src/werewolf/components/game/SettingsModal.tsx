import { Button } from "@wolf/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@wolf/components/ui/dialog";
import { Slider } from "@wolf/components/ui/slider";
import { Switch } from "@wolf/components/ui/switch";
import { type AILogEntry, aiLogger } from "@wolf/lib/ai-logger";
import {
	clearApiKeys,
	getGeneratorModel,
	getSelectedModels,
	setGeneratorModel,
	setReviewModel,
	setSelectedModels,
	setSummaryModel,
} from "@wolf/lib/api-keys";
import { getCachedModels } from "@wolf/lib/keyaos-models";
import type { GameState, ModelRef } from "@wolf/types/game";
import { DEFAULT_PLAYER_MODELS, DEFAULT_UTILITY_MODEL } from "@wolf/types/game";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface SoundSettingsSectionProps {
	bgmVolume: number;
	isSoundEnabled: boolean;
	isAiVoiceEnabled: boolean;
	isAutoAdvanceDialogueEnabled?: boolean;
	onBgmVolumeChange: (value: number) => void;
	onSoundEnabledChange: (value: boolean) => void;
	onAiVoiceEnabledChange: (value: boolean) => void;
	onAutoAdvanceDialogueEnabledChange?: (value: boolean) => void;
}

interface SettingsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bgmVolume: number;
	isSoundEnabled: boolean;
	isAiVoiceEnabled: boolean;
	isAutoAdvanceDialogueEnabled: boolean;
	gameState: GameState;
	onBgmVolumeChange: (value: number) => void;
	onSoundEnabledChange: (value: boolean) => void;
	onAiVoiceEnabledChange: (value: boolean) => void;
	onAutoAdvanceDialogueEnabledChange: (value: boolean) => void;
	// Exit game functionality
	isGameInProgress?: boolean;
	onExitGame?: () => void;
}

export function SoundSettingsSection({
	bgmVolume,
	isSoundEnabled,
	isAiVoiceEnabled,
	isAutoAdvanceDialogueEnabled = false,
	onBgmVolumeChange,
	onSoundEnabledChange,
	onAiVoiceEnabledChange,
	onAutoAdvanceDialogueEnabledChange,
}: SoundSettingsSectionProps) {
	const t = useTranslations();
	const volumePercent = Math.round(bgmVolume * 100);

	return (
		<div className="space-y-5">
			<div className="space-y-3">
				<div className="flex items-center justify-between text-sm text-[var(--text-primary)]">
					<span>{t("settings.audio.bgmVolume")}</span>
					<span className="text-[var(--text-secondary)]">{volumePercent}%</span>
				</div>
				<Slider
					min={0}
					max={100}
					step={1}
					value={volumePercent}
					onValueChange={(value) => onBgmVolumeChange(value / 100)}
					disabled={!isSoundEnabled}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="text-sm font-medium text-[var(--text-primary)]">
						{t("settings.audio.masterSwitch")}
					</div>
					<div className="text-xs text-[var(--text-muted)]">
						{t("settings.audio.masterDescription")}
					</div>
				</div>
				<Switch
					checked={isSoundEnabled}
					onCheckedChange={onSoundEnabledChange}
				/>
			</div>

			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="text-sm font-medium text-[var(--text-primary)]">
						{t("settings.audio.aiVoice")}
					</div>
					<div className="text-xs text-[var(--text-muted)]">
						{t("settings.audio.aiVoiceDescription")}
					</div>
				</div>
				<Switch
					checked={isAiVoiceEnabled}
					onCheckedChange={onAiVoiceEnabledChange}
					disabled={!isSoundEnabled}
				/>
			</div>

			{onAutoAdvanceDialogueEnabledChange && (
				<div className="flex items-center justify-between gap-4">
					<div>
						<div className="text-sm font-medium text-[var(--text-primary)]">
							{t("settings.audio.autoAdvance")}
						</div>
						<div className="text-xs text-[var(--text-muted)]">
							{t("settings.audio.autoAdvanceDesc")}
						</div>
					</div>
					<Switch
						checked={isAutoAdvanceDialogueEnabled}
						onCheckedChange={onAutoAdvanceDialogueEnabledChange}
					/>
				</div>
			)}
		</div>
	);
}

export function ModelSettingsSection() {
	const t = useTranslations();
	const allModels: ModelRef[] = getCachedModels();
	const [utilityModel, setUtilityModel] = useState(() => getGeneratorModel());
	const [selected, setSelected] = useState<Set<string>>(
		() => new Set(getSelectedModels()),
	);
	const [search, setSearch] = useState("");
	const [expanded, setExpanded] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!expanded) return;
		const onClick = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			)
				setExpanded(false);
		};
		document.addEventListener("mousedown", onClick);
		return () => document.removeEventListener("mousedown", onClick);
	}, [expanded]);

	const sorted = useMemo(() => {
		const base = search
			? allModels.filter((m) =>
					m.model.toLowerCase().includes(search.toLowerCase()),
				)
			: allModels;
		return [...base].sort((a, b) => {
			const aSelected = selected.has(a.model) ? 0 : 1;
			const bSelected = selected.has(b.model) ? 0 : 1;
			return aSelected - bSelected;
		});
	}, [allModels, search, selected]);

	const handleUtilityChange = (model: string) => {
		setUtilityModel(model);
		setGeneratorModel(model);
		setSummaryModel(model);
		setReviewModel(model);
	};

	const toggleModel = (modelId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(modelId)) next.delete(modelId);
			else next.add(modelId);
			setSelectedModels([...next]);
			return next;
		});
	};

	const handleClearAll = () => {
		setSelected(new Set());
		setSelectedModels([]);
	};

	const handleReset = () => {
		const available = new Set(allModels.map((m) => m.model));
		const defaults = new Set(
			DEFAULT_PLAYER_MODELS.filter((m) => available.has(m)),
		);
		setSelected(defaults);
		setSelectedModels([...defaults]);

		const utilDefault = available.has(DEFAULT_UTILITY_MODEL)
			? DEFAULT_UTILITY_MODEL
			: (allModels[0]?.model ?? "");
		handleUtilityChange(utilDefault);
	};

	return (
		<div className="space-y-4">
			<div>
				<div className="text-sm font-medium text-[var(--text-primary)]">
					{t("settings.models.title")}
				</div>
				<div className="text-xs text-[var(--text-muted)]">
					{t("settings.models.description")}
				</div>
			</div>

			{/* Utility Model */}
			<div className="space-y-1.5">
				<label className="text-xs font-medium text-[var(--text-secondary)]">
					{t("settings.models.utilityModel")}
				</label>
				<select
					value={utilityModel}
					onChange={(e) => handleUtilityChange(e.target.value)}
					className="w-full rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
				>
					{allModels.map((m) => (
						<option key={m.model} value={m.model}>
							{m.model}
						</option>
					))}
				</select>
				<div className="text-[10px] text-[var(--text-muted)]">
					{t("settings.models.utilityModelDesc")}
				</div>
			</div>

			{/* Player Models */}
			<div className="space-y-1.5" ref={dropdownRef}>
				<div className="flex items-center justify-between">
					<label className="text-xs font-medium text-[var(--text-secondary)]">
						{t("settings.models.playerModels")}
					</label>
					<span className="text-[10px] text-[var(--text-muted)]">
						{selected.size === 0
							? t("settings.models.playerModelsNone")
							: t("settings.models.playerModelsSelected", {
									count: selected.size,
								})}
					</span>
				</div>

				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="w-full rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--color-accent)] transition-colors"
				>
					{selected.size === 0
						? t("settings.models.playerModelsDefault", {
								count: DEFAULT_PLAYER_MODELS.length,
							})
						: t("settings.models.playerModelsSelected", {
								count: selected.size,
							})}
				</button>

				{expanded && (
					<div className="rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
						<div className="p-2 border-b border-[var(--border-color)]">
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder={t("settings.models.playerModelsPlaceholder")}
								className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
							/>
						</div>
						<div className="flex gap-1 px-2 py-1.5 border-b border-[var(--border-color)]">
							<button
								type="button"
								onClick={handleClearAll}
								className="text-[10px] text-[var(--color-accent)] hover:underline"
							>
								{t("settings.models.clearAll")}
							</button>
							<span className="text-[10px] text-[var(--text-muted)]">·</span>
							<button
								type="button"
								onClick={handleReset}
								className="text-[10px] text-[var(--color-accent)] hover:underline"
							>
								{t("settings.models.reset")}
							</button>
						</div>
						<div className="max-h-40 overflow-y-auto">
							{sorted.map((m) => (
								<label
									key={m.model}
									className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
								>
									<input
										type="checkbox"
										checked={selected.has(m.model)}
										onChange={() => toggleModel(m.model)}
										className="rounded border-[var(--border-color)] accent-[var(--color-accent)]"
									/>
									<span className="truncate">{m.model}</span>
								</label>
							))}
							{sorted.length === 0 && (
								<div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">
									No models found
								</div>
							)}
						</div>
					</div>
				)}

				<div className="text-[10px] text-[var(--text-muted)]">
					{t("settings.models.playerModelsDesc")}
				</div>
			</div>
		</div>
	);
}

export function SettingsModal({
	open,
	onOpenChange,
	bgmVolume,
	isSoundEnabled,
	isAiVoiceEnabled,
	isAutoAdvanceDialogueEnabled,
	gameState,
	onBgmVolumeChange,
	onSoundEnabledChange,
	onAiVoiceEnabledChange,
	onAutoAdvanceDialogueEnabledChange,
	isGameInProgress = false,
	onExitGame,
}: SettingsModalProps) {
	const t = useTranslations();
	const [view, setView] = useState<"settings" | "exitConfirm">("settings");
	const [aiLogs, setAiLogs] = useState<AILogEntry[]>([]);
	const [modelResetKey, setModelResetKey] = useState(0);

	const handleResetAllSettings = useCallback(() => {
		// Reset model settings
		clearApiKeys();
		const models = getCachedModels();
		const available = new Set(models.map((m) => m.model));
		const defaults = DEFAULT_PLAYER_MODELS.filter((m) => available.has(m));
		setSelectedModels(defaults.length > 0 ? defaults : []);
		const util = available.has(DEFAULT_UTILITY_MODEL)
			? DEFAULT_UTILITY_MODEL
			: (models[0]?.model ?? "");
		setGeneratorModel(util);
		setSummaryModel(util);
		setReviewModel(util);
		setModelResetKey((k) => k + 1);

		// Reset sound settings
		onBgmVolumeChange(0.3);
		onSoundEnabledChange(true);
		onAiVoiceEnabledChange(false);
		onAutoAdvanceDialogueEnabledChange(false);

		toast(t("settings.models.resetAllConfirm"));
	}, [
		t,
		onBgmVolumeChange,
		onSoundEnabledChange,
		onAiVoiceEnabledChange,
		onAutoAdvanceDialogueEnabledChange,
	]);

	// Handle exit game confirmation
	const handleExitConfirm = useCallback(() => {
		onExitGame?.();
		onOpenChange(false);
		setView("settings");
	}, [onExitGame, onOpenChange]);

	const handleExitCancel = useCallback(() => {
		setView("settings");
	}, []);

	// Reset view to settings when modal closes
	useEffect(() => {
		if (!open) {
			// Use a small delay to avoid visual flicker during close animation
			const timer = window.setTimeout(() => setView("settings"), 200);
			return () => window.clearTimeout(timer);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;

		(async () => {
			try {
				const logs = await aiLogger.getLogs();
				if (!cancelled)
					setAiLogs(Array.isArray(logs) ? (logs as AILogEntry[]) : []);
			} catch {
				if (!cancelled) setAiLogs([]);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [open]);

	const _logJsonText = useMemo(() => {
		return JSON.stringify(aiLogs, null, 2);
	}, [aiLogs]);

	const handleCopyLog = useCallback(async () => {
		try {
			const freshLogs = await aiLogger.getLogs();
			const freshJsonText = JSON.stringify(freshLogs, null, 2);
			await navigator.clipboard.writeText(freshJsonText);
			toast(t("settings.toast.copySuccess"));
		} catch {
			toast(t("settings.toast.copyFail.title"), {
				description: t("settings.toast.copyFail.description"),
			});
		}
	}, [t]);

	const handleDownloadLog = useCallback(async () => {
		try {
			const freshLogs = await aiLogger.getLogs();
			const freshJsonText = JSON.stringify(freshLogs, null, 2);
			const blob = new Blob([freshJsonText], {
				type: "application/json;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const safeGameId = (gameState.gameId || "").replace(
				/[^a-zA-Z0-9_-]/g,
				"",
			);
			const ts = new Date().toISOString().replace(/[:.]/g, "-");
			a.href = url;
			a.download = `wolfcha-log-${safeGameId || "game"}-${ts}.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toast(t("settings.toast.exportSuccess"));
		} catch {
			toast(t("settings.toast.exportFail"));
		}
	}, [gameState.gameId, t]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[92vw] max-w-lg max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-serif text-[var(--text-primary)]">
						{view === "exitConfirm"
							? t("settings.game.exitConfirmTitle")
							: t("settings.title")}
					</DialogTitle>
					<DialogDescription className="text-[var(--text-muted)]">
						{view === "exitConfirm"
							? t("settings.game.exitConfirmDescription")
							: t("settings.description")}
					</DialogDescription>
				</DialogHeader>

				{view === "exitConfirm" ? (
					<div className="space-y-4">
						<div className="rounded-lg border-2 border-red-500/30 bg-red-500/10 p-4">
							<div className="text-sm text-[var(--text-primary)]">
								{t("settings.game.exitConfirmDescription")}
							</div>
						</div>
						<div className="flex gap-3">
							<Button
								type="button"
								variant="outline"
								onClick={handleExitCancel}
								className="flex-1"
							>
								{t("settings.game.exitCancelButton")}
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={handleExitConfirm}
								className="flex-1"
							>
								{t("settings.game.exitConfirmButton")}
							</Button>
						</div>
					</div>
				) : (
					<div className="space-y-6">
						<SoundSettingsSection
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

						<div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
							<ModelSettingsSection key={modelResetKey} />
						</div>

						<div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 space-y-3">
							<div>
								<div className="text-sm font-medium text-[var(--text-primary)]">
									{t("settings.logs.title")}
								</div>
								<div className="text-xs text-[var(--text-muted)]">
									{t("settings.logs.description")}
								</div>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										void handleCopyLog();
									}}
									className="flex-1"
								>
									{t("settings.logs.copy")}
								</Button>
								<Button
									type="button"
									variant="default"
									onClick={handleDownloadLog}
									className="flex-1"
								>
									{t("settings.logs.export")}
								</Button>
							</div>
						</div>

						<div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 flex items-center justify-between gap-3">
							<div>
								<div className="text-sm font-medium text-[var(--text-primary)]">
									{t("settings.models.resetAll")}
								</div>
								<div className="text-xs text-[var(--text-muted)]">
									{t("settings.models.resetAllDesc")}
								</div>
							</div>
							<Button
								type="button"
								variant="outline"
								onClick={handleResetAllSettings}
							>
								{t("settings.models.reset")}
							</Button>
						</div>

						{isGameInProgress && onExitGame && (
							<div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-3 flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-medium text-[var(--text-primary)]">
										{t("settings.game.exitGame")}
									</div>
									<div className="text-xs text-[var(--text-muted)]">
										{t("settings.game.exitGameDescription")}
									</div>
								</div>
								<Button
									type="button"
									variant="destructive"
									onClick={() => setView("exitConfirm")}
								>
									{t("settings.game.exitGame")}
								</Button>
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
