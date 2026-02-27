import {
	DocumentArrowUpIcon,
	MicrophoneIcon,
	PhotoIcon,
	VideoCameraIcon,
} from "@heroicons/react/20/solid";
import { Icon } from "@iconify/react";
import type { Modality } from "../../worker/core/db/schema";

/** Canonical display order */
const MODALITY_ORDER: Modality[] = ["text", "image", "file", "audio", "video"];

function TextIcon({ size }: { size: number }) {
	return <Icon icon="solar:text-square-bold" width={size} height={size} />;
}

const ICON_MAP: Record<
	Modality,
	React.FC<{ className?: string; style?: React.CSSProperties }>
> = {
	text: ({ style }) => <TextIcon size={(style?.width as number) ?? 16} />,
	image: PhotoIcon,
	file: DocumentArrowUpIcon,
	audio: MicrophoneIcon,
	video: VideoCameraIcon,
};

function ModalityDot({ modality, size }: { modality: Modality; size: number }) {
	const IconComp = ICON_MAP[modality];
	return (
		<span className="group/tip relative inline-flex">
			<IconComp className="shrink-0" style={{ width: size, height: size }} />
			<span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/tip:opacity-100 dark:bg-gray-700">
				{modality}
			</span>
		</span>
	);
}

function renderRow(modalities: Modality[], size: number) {
	return MODALITY_ORDER.filter((m) => modalities.includes(m)).map((m) => (
		<ModalityDot key={m} modality={m} size={size} />
	));
}

// ─── Inline badges (for Models page / Dashboard cards) ──

/** Compact Input→Output badge pair. Hidden when both are text-only. */
export function ModalityBadges({
	input,
	output,
	size = 16,
}: {
	input?: Modality[];
	output?: Modality[];
	size?: number;
}) {
	const inp = input ?? ["text"];
	const out = output ?? ["text"];

	const isDefault =
		inp.length === 1 &&
		inp[0] === "text" &&
		out.length === 1 &&
		out[0] === "text";
	if (isDefault) return null;

	return (
		<span className="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
			<span className="inline-flex items-center gap-0.5">
				{renderRow(inp, size)}
			</span>
			<span className="text-[10px] text-gray-300 dark:text-gray-600 select-none">
				→
			</span>
			<span className="inline-flex items-center gap-0.5">
				{renderRow(out, size)}
			</span>
		</span>
	);
}

// ─── Table cell (for Providers page columns) ────────────

/** Render a single modality cell for table columns. Shows sorted icons. */
export function ModalityCell({
	modalities,
	size = 16,
}: {
	modalities?: Modality[];
	size?: number;
}) {
	const mods = modalities ?? ["text"];
	return (
		<span className="inline-flex items-center gap-0.5 text-gray-400 dark:text-gray-500">
			{renderRow(mods, size)}
		</span>
	);
}
