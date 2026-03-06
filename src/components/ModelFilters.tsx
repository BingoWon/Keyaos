import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
	CheckIcon,
	ChevronDownIcon,
	DocumentArrowUpIcon,
	MicrophoneIcon,
	PhotoIcon,
	VideoCameraIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import { Icon } from "@iconify/react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import type { ProviderMeta } from "../types/provider";
import { type ColorToken, TOKENS } from "../utils/colors";
import type { ModelGroup } from "../utils/models";
import { getOrgName, getOrgSlug } from "../utils/orgMeta";
import { OrgLogo } from "./OrgLogo";
import { ProviderLogo } from "./ProviderLogo";

// ─── Types & helpers ─────────────────────────────────────

export interface ModelFiltersState {
	inputModalities: Set<Modality>;
	outputModalities: Set<Modality>;
	contextMin: number;
	orgs: Set<string>;
	providers: Set<string>;
}

export const EMPTY_FILTERS: ModelFiltersState = {
	inputModalities: new Set(),
	outputModalities: new Set(),
	contextMin: 0,
	orgs: new Set(),
	providers: new Set(),
};

export function isFiltersEmpty(f: ModelFiltersState): boolean {
	return (
		f.inputModalities.size === 0 &&
		f.outputModalities.size === 0 &&
		f.contextMin === 0 &&
		f.orgs.size === 0 &&
		f.providers.size === 0
	);
}

export function applyFilters(
	groups: ModelGroup[],
	f: ModelFiltersState,
): ModelGroup[] {
	return groups.filter((g) => {
		if (
			f.inputModalities.size > 0 &&
			!g.inputModalities.some((m) => f.inputModalities.has(m))
		)
			return false;
		if (
			f.outputModalities.size > 0 &&
			!g.outputModalities.some((m) => f.outputModalities.has(m))
		)
			return false;
		if (f.contextMin > 0) {
			const maxCtx = Math.max(...g.providers.map((p) => p.contextLength));
			if (maxCtx < f.contextMin) return false;
		}
		if (f.orgs.size > 0 && !f.orgs.has(getOrgSlug(g.id))) return false;
		if (
			f.providers.size > 0 &&
			!g.providers.some((p) => f.providers.has(p.provider_id))
		)
			return false;
		return true;
	});
}

// ─── Filter color themes (derived from global tokens + Headless UI variants) ─

interface FilterTheme {
	token: ColorToken;
	openBorder: string;
	openRing: string;
	tagX: string;
}

type FilterTokenName = "sky" | "teal" | "green" | "amber" | "rose";

const FILTER_EXTRAS: Record<FilterTokenName, Omit<FilterTheme, "token">> = {
	teal: {
		openBorder: "data-[open]:border-teal-400 dark:data-[open]:border-teal-500",
		openRing:
			"data-[open]:ring-1 data-[open]:ring-teal-400/30 dark:data-[open]:ring-teal-500/20",
		tagX: "hover:bg-teal-200/60 dark:hover:bg-teal-500/20",
	},
	green: {
		openBorder:
			"data-[open]:border-green-400 dark:data-[open]:border-green-500",
		openRing:
			"data-[open]:ring-1 data-[open]:ring-green-400/30 dark:data-[open]:ring-green-500/20",
		tagX: "hover:bg-green-200/60 dark:hover:bg-green-500/20",
	},
	sky: {
		openBorder: "data-[open]:border-sky-400 dark:data-[open]:border-sky-500",
		openRing:
			"data-[open]:ring-1 data-[open]:ring-sky-400/30 dark:data-[open]:ring-sky-500/20",
		tagX: "hover:bg-sky-200/60 dark:hover:bg-sky-500/20",
	},
	amber: {
		openBorder:
			"data-[open]:border-amber-400 dark:data-[open]:border-amber-500",
		openRing:
			"data-[open]:ring-1 data-[open]:ring-amber-400/30 dark:data-[open]:ring-amber-500/20",
		tagX: "hover:bg-amber-200/60 dark:hover:bg-amber-500/20",
	},
	rose: {
		openBorder: "data-[open]:border-rose-400 dark:data-[open]:border-rose-500",
		openRing:
			"data-[open]:ring-1 data-[open]:ring-rose-400/30 dark:data-[open]:ring-rose-500/20",
		tagX: "hover:bg-rose-200/60 dark:hover:bg-rose-500/20",
	},
};

function filterTheme(name: FilterTokenName): FilterTheme {
	return { token: TOKENS[name], ...FILTER_EXTRAS[name] };
}

const TEAL = filterTheme("teal");
const GREEN = filterTheme("green");
const SKY = filterTheme("sky");
const AMBER = filterTheme("amber");
const ROSE = filterTheme("rose");

// ─── Modality icons ──────────────────────────────────────

const MODALITY_ICON: Record<Modality, React.FC<{ className?: string }>> = {
	text: ({ className }) => (
		<Icon icon="solar:text-square-bold" className={className} />
	),
	image: PhotoIcon,
	file: DocumentArrowUpIcon,
	audio: MicrophoneIcon,
	video: VideoCameraIcon,
};

const ALL_MODALITIES: Modality[] = ["text", "image", "file", "audio", "video"];

// ─── Context steps ───────────────────────────────────────

const CONTEXT_STEPS = [
	{ value: 0, label: "Any" },
	{ value: 4_096, label: "4K" },
	{ value: 16_384, label: "16K" },
	{ value: 32_768, label: "32K" },
	{ value: 65_536, label: "64K" },
	{ value: 131_072, label: "128K" },
	{ value: 262_144, label: "256K" },
	{ value: 524_288, label: "512K" },
	{ value: 1_048_576, label: "1M" },
	{ value: 2_097_152, label: "2M" },
];

// ─── Main component ─────────────────────────────────────

interface Props {
	groups: ModelGroup[];
	providerMap: Map<string, ProviderMeta>;
	filters: ModelFiltersState;
	onChange: (f: ModelFiltersState) => void;
}

export function ModelFilters({
	groups,
	providerMap,
	filters,
	onChange,
}: Props) {
	const { t } = useTranslation();

	const orgOptions = useMemo(() => {
		const counts = new Map<string, number>();
		for (const g of groups) {
			const slug = getOrgSlug(g.id);
			counts.set(slug, (counts.get(slug) ?? 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([slug, count]) => ({ id: slug, name: getOrgName(slug), count }));
	}, [groups]);

	const providerOptions = useMemo(() => {
		const counts = new Map<string, number>();
		for (const g of groups) {
			const seen = new Set<string>();
			for (const p of g.providers) {
				if (!seen.has(p.provider_id)) {
					seen.add(p.provider_id);
					counts.set(p.provider_id, (counts.get(p.provider_id) ?? 0) + 1);
				}
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([id, count]) => ({
				id,
				name: providerMap.get(id)?.name ?? id,
				logoUrl: providerMap.get(id)?.logoUrl,
				count,
			}));
	}, [groups, providerMap]);

	const toggleModality = useCallback(
		(key: "inputModalities" | "outputModalities", m: Modality) => {
			const next = new Set(filters[key]);
			next.has(m) ? next.delete(m) : next.add(m);
			onChange({ ...filters, [key]: next });
		},
		[filters, onChange],
	);

	const toggleSet = useCallback(
		(key: "orgs" | "providers", val: string) => {
			const next = new Set(filters[key]);
			next.has(val) ? next.delete(val) : next.add(val);
			onChange({ ...filters, [key]: next });
		},
		[filters, onChange],
	);

	const setContextMin = useCallback(
		(v: number) => onChange({ ...filters, contextMin: v }),
		[filters, onChange],
	);

	const empty = isFiltersEmpty(filters);

	const contextIdx = CONTEXT_STEPS.findIndex(
		(s) => s.value === filters.contextMin,
	);
	const contextLabel = CONTEXT_STEPS[contextIdx >= 0 ? contextIdx : 0].label;

	// ─── Build active tags ───────────────────────────────
	const tags: {
		key: string;
		label: string;
		theme: FilterTheme;
		onRemove: () => void;
	}[] = [];
	for (const m of filters.inputModalities) {
		tags.push({
			key: `in:${m}`,
			label: `In: ${m}`,
			theme: TEAL,
			onRemove: () => toggleModality("inputModalities", m),
		});
	}
	for (const m of filters.outputModalities) {
		tags.push({
			key: `out:${m}`,
			label: `Out: ${m}`,
			theme: GREEN,
			onRemove: () => toggleModality("outputModalities", m),
		});
	}
	if (filters.contextMin > 0) {
		const preset = CONTEXT_STEPS.find((p) => p.value === filters.contextMin);
		tags.push({
			key: "ctx",
			label: `Context ≥ ${preset?.label ?? "?"}`,
			theme: SKY,
			onRemove: () => onChange({ ...filters, contextMin: 0 }),
		});
	}
	for (const slug of filters.orgs) {
		tags.push({
			key: `org:${slug}`,
			label: getOrgName(slug),
			theme: AMBER,
			onRemove: () => toggleSet("orgs", slug),
		});
	}
	for (const pid of filters.providers) {
		tags.push({
			key: `prov:${pid}`,
			label: providerMap.get(pid)?.name ?? pid,
			theme: ROSE,
			onRemove: () => toggleSet("providers", pid),
		});
	}

	return (
		<div className="space-y-2.5">
			{/* Filter buttons row */}
			<div className="flex flex-wrap items-center gap-2">
				<FilterPopover
					label={t("filters.input_modalities")}
					count={filters.inputModalities.size}
					theme={TEAL}
					width="w-44"
				>
					<div className="flex flex-col gap-1 p-2">
						{ALL_MODALITIES.map((m) => (
							<ModalityChip
								key={m}
								modality={m}
								icon={MODALITY_ICON[m]}
								active={filters.inputModalities.has(m)}
								theme={TEAL}
								onClick={() => toggleModality("inputModalities", m)}
							/>
						))}
					</div>
				</FilterPopover>

				<FilterPopover
					label={t("filters.output_modalities")}
					count={filters.outputModalities.size}
					theme={GREEN}
					width="w-44"
				>
					<div className="flex flex-col gap-1 p-2">
						{ALL_MODALITIES.map((m) => (
							<ModalityChip
								key={m}
								modality={m}
								icon={MODALITY_ICON[m]}
								active={filters.outputModalities.has(m)}
								theme={GREEN}
								onClick={() => toggleModality("outputModalities", m)}
							/>
						))}
					</div>
				</FilterPopover>

				<FilterPopover
					label={
						filters.contextMin > 0
							? `${t("filters.context_length")} ≥ ${contextLabel}`
							: t("filters.context_length")
					}
					count={filters.contextMin > 0 ? 1 : 0}
					theme={SKY}
					width="w-72"
				>
					<div className="px-4 pt-3 pb-4">
						<div className="mb-3 text-center">
							<span
								className={`inline-block rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${SKY.token.soft}`}
							>
								≥ {contextLabel}
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={CONTEXT_STEPS.length - 1}
							step={1}
							value={contextIdx >= 0 ? contextIdx : 0}
							onChange={(e) =>
								setContextMin(CONTEXT_STEPS[Number(e.target.value)].value)
							}
							className="context-slider w-full"
						/>
						<div className="mt-1.5 flex justify-between text-[10px] font-medium text-gray-400 dark:text-gray-500">
							<span>Any</span>
							<span>4K</span>
							<span>32K</span>
							<span>128K</span>
							<span>1M</span>
							<span>2M</span>
						</div>
					</div>
				</FilterPopover>

				<FilterPopover
					label={t("filters.organization")}
					count={filters.orgs.size}
					theme={AMBER}
					width="w-64"
				>
					<SearchableList
						items={orgOptions}
						selected={filters.orgs}
						onToggle={(id) => toggleSet("orgs", id)}
						theme={AMBER}
						renderIcon={(item) => <OrgLogo modelId={`${item.id}/`} size={16} />}
					/>
				</FilterPopover>

				<FilterPopover
					label={t("filters.provider")}
					count={filters.providers.size}
					theme={ROSE}
					width="w-64"
				>
					<SearchableList
						items={providerOptions}
						selected={filters.providers}
						onToggle={(id) => toggleSet("providers", id)}
						theme={ROSE}
						renderIcon={(item) =>
							item.logoUrl ? (
								<ProviderLogo src={item.logoUrl} name={item.name} size={16} />
							) : null
						}
					/>
				</FilterPopover>

				{!empty && (
					<button
						type="button"
						onClick={() => onChange(EMPTY_FILTERS)}
						className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors dark:text-gray-400 ${TOKENS.red.textHover}`}
					>
						<XMarkIcon className="size-3.5" />
						{t("filters.clear_all")}
					</button>
				)}
			</div>

			{/* Active filter tags */}
			{tags.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					{tags.map((tag) => (
						<span
							key={tag.key}
							className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ${tag.theme.token.soft}`}
						>
							{tag.label}
							<button
								type="button"
								onClick={tag.onRemove}
								className={`rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100 ${tag.theme.tagX}`}
							>
								<XMarkIcon className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Filter popover ──────────────────────────────────────

function FilterPopover({
	label,
	count,
	theme,
	width = "w-52",
	children,
}: {
	label: string;
	count: number;
	theme: FilterTheme;
	width?: string;
	children: React.ReactNode;
}) {
	return (
		<Popover className="relative">
			<PopoverButton
				className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-white/20 ${theme.openBorder} ${theme.openRing}`}
			>
				{label}
				{count > 0 && (
					<span
						className={`inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold leading-none ${theme.token.solid}`}
					>
						{count}
					</span>
				)}
				<ChevronDownIcon className="size-3.5 text-gray-400" />
			</PopoverButton>

			<PopoverPanel
				anchor="bottom start"
				transition
				className={`z-50 mt-1.5 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/10 dark:bg-gray-900 dark:ring-white/5 ${width}`}
			>
				{children}
			</PopoverPanel>
		</Popover>
	);
}

// ─── Modality chip ───────────────────────────────────────

function ModalityChip({
	modality,
	icon: IconComp,
	active,
	theme,
	onClick,
}: {
	modality: Modality;
	icon: React.FC<{ className?: string }>;
	active: boolean;
	theme: FilterTheme;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${active ? `${theme.token.solid} shadow-sm` : `${theme.token.soft} ${theme.token.softHover}`}`}
		>
			<IconComp className="size-4" />
			<span className="flex-1 text-left capitalize">{modality}</span>
			{active && <CheckIcon className="size-3.5" />}
		</button>
	);
}

// ─── Searchable list ─────────────────────────────────────

interface ListItem {
	id: string;
	name: string;
	count: number;
	[key: string]: unknown;
}

function SearchableList<T extends ListItem>({
	items,
	selected,
	onToggle,
	theme,
	renderIcon,
}: {
	items: T[];
	selected: Set<string>;
	onToggle: (id: string) => void;
	theme: FilterTheme;
	renderIcon: (item: T) => React.ReactNode;
}) {
	const [search, setSearch] = useState("");
	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
		);
	}, [items, search]);

	return (
		<div>
			{items.length > 6 && (
				<div className="border-b border-gray-100 px-2 pt-2 pb-1.5 dark:border-white/5">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search…"
						className="w-full rounded-md border-0 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 focus:ring-brand-400/40 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500"
					/>
				</div>
			)}
			<div className="max-h-56 overflow-y-auto overscroll-contain py-1">
				{filtered.length === 0 ? (
					<p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
						No match
					</p>
				) : (
					filtered.map((item) => {
						const active = selected.has(item.id);
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => onToggle(item.id)}
								className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
									active
										? theme.token.soft
										: "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
								}`}
							>
								<span
									className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
										active
											? theme.token.control
											: "border-gray-300 dark:border-white/20"
									}`}
								>
									{active && <CheckIcon className="size-3 text-white" />}
								</span>
								<span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate">
									{renderIcon(item)}
									<span className="truncate">{item.name}</span>
								</span>
								<span className="tabular-nums text-[10px] text-gray-400 dark:text-gray-500">
									{item.count}
								</span>
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}
