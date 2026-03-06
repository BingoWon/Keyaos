import {
	AdjustmentsHorizontalIcon,
	ChevronDownIcon,
	XMarkIcon,
} from "@heroicons/react/20/solid";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Modality } from "../../worker/core/db/schema";
import type { ProviderMeta } from "../types/provider";
import type { ModelGroup } from "../utils/models";
import { getOrgName, getOrgSlug } from "../utils/orgMeta";
import { OrgLogo } from "./OrgLogo";
import { ProviderLogo } from "./ProviderLogo";

// ─── Types ───────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────

const ALL_MODALITIES: Modality[] = ["text", "image", "file", "audio", "video"];

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

const COLLAPSED_LIMIT = 5;

// ─── Component ───────────────────────────────────────────

interface ModelFiltersProps {
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
}: ModelFiltersProps) {
	const { t } = useTranslation();
	const [mobileOpen, setMobileOpen] = useState(false);

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

	const activeCount =
		filters.inputModalities.size +
		filters.outputModalities.size +
		(filters.contextMin > 0 ? 1 : 0) +
		filters.orgs.size +
		filters.providers.size;

	const contextIdx = CONTEXT_STEPS.findIndex(
		(s) => s.value === filters.contextMin,
	);
	const contextLabel = CONTEXT_STEPS[contextIdx >= 0 ? contextIdx : 0].label;

	const panel = (
		<div className="space-y-5">
			{activeCount > 0 && (
				<button
					type="button"
					onClick={() => onChange(EMPTY_FILTERS)}
					className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
				>
					<XMarkIcon className="size-3.5" />
					{t("filters.clear_all")}
				</button>
			)}

			<Section title={t("filters.input_modalities")}>
				{ALL_MODALITIES.map((m) => (
					<Checkbox
						key={m}
						label={<span className="capitalize">{m}</span>}
						checked={filters.inputModalities.has(m)}
						onChange={() => toggleModality("inputModalities", m)}
					/>
				))}
			</Section>

			<Section title={t("filters.output_modalities")}>
				{ALL_MODALITIES.map((m) => (
					<Checkbox
						key={m}
						label={<span className="capitalize">{m}</span>}
						checked={filters.outputModalities.has(m)}
						onChange={() => toggleModality("outputModalities", m)}
					/>
				))}
			</Section>

			<Section title={t("filters.context_length")}>
				<div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
					≥ {contextLabel}
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
					className="w-full accent-brand-600"
				/>
				<div className="mt-0.5 flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
					<span>Any</span>
					<span>2M</span>
				</div>
			</Section>

			<Section title={t("filters.organization")}>
				<CheckboxList
					items={orgOptions}
					selected={filters.orgs}
					onToggle={(id) => toggleSet("orgs", id)}
					renderIcon={(item) => <OrgLogo modelId={`${item.id}/`} size={14} />}
					t={t}
				/>
			</Section>

			<Section title={t("filters.provider")}>
				<CheckboxList
					items={providerOptions}
					selected={filters.providers}
					onToggle={(id) => toggleSet("providers", id)}
					renderIcon={(item) =>
						item.logoUrl ? (
							<ProviderLogo src={item.logoUrl} name={item.name} size={14} />
						) : null
					}
					t={t}
				/>
			</Section>
		</div>
	);

	return (
		<>
			{/* Mobile toggle */}
			<button
				type="button"
				onClick={() => setMobileOpen((v) => !v)}
				className="lg:hidden mb-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
			>
				<AdjustmentsHorizontalIcon className="size-4" />
				{t("filters.title")}
				{activeCount > 0 && (
					<span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
						{activeCount}
					</span>
				)}
			</button>

			{/* Mobile panel */}
			{mobileOpen && <div className="lg:hidden mb-4">{panel}</div>}

			{/* Desktop sidebar */}
			<aside className="hidden lg:block w-56 shrink-0 sticky top-24">
				{panel}
			</aside>
		</>
	);
}

// ─── Sub-components ──────────────────────────────────────

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<h3 className="mb-2 text-[11px] font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500">
				{title}
			</h3>
			{children}
		</div>
	);
}

function Checkbox({
	label,
	checked,
	onChange,
}: {
	label: React.ReactNode;
	checked: boolean;
	onChange: () => void;
}) {
	return (
		<label className="flex items-center gap-2 py-0.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white">
			<input
				type="checkbox"
				checked={checked}
				onChange={onChange}
				className="size-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500/30 dark:border-white/20 dark:bg-white/5"
			/>
			{label}
		</label>
	);
}

interface ListItem {
	id: string;
	name: string;
	count: number;
	[key: string]: unknown;
}

function CheckboxList<T extends ListItem>({
	items,
	selected,
	onToggle,
	renderIcon,
	t,
}: {
	items: T[];
	selected: Set<string>;
	onToggle: (id: string) => void;
	renderIcon: (item: T) => React.ReactNode;
	t: (key: string, opts?: Record<string, unknown>) => string;
}) {
	const [expanded, setExpanded] = useState(false);
	const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT);
	const hasMore = items.length > COLLAPSED_LIMIT;

	return (
		<div>
			{visible.map((item) => (
				<label
					key={item.id}
					className="flex items-center gap-2 py-0.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
				>
					<input
						type="checkbox"
						checked={selected.has(item.id)}
						onChange={() => onToggle(item.id)}
						className="size-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500/30 dark:border-white/20 dark:bg-white/5"
					/>
					<span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate">
						{renderIcon(item)}
						<span className="truncate">{item.name}</span>
					</span>
					<span className="text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
						{item.count}
					</span>
				</label>
			))}
			{hasMore && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="mt-1 flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
				>
					<ChevronDownIcon
						className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
					/>
					{expanded
						? t("filters.show_less")
						: t("filters.show_more", {
								count: items.length - COLLAPSED_LIMIT,
							})}
				</button>
			)}
		</div>
	);
}
