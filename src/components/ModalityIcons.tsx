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

const ICON_MAP: Record<Modality, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
    text: ({ style }) => <TextIcon size={style?.width as number ?? 14} />,
    image: PhotoIcon,
    file: DocumentArrowUpIcon,
    audio: MicrophoneIcon,
    video: VideoCameraIcon,
};

const LABEL_MAP: Record<Modality, string> = {
    text: "text",
    image: "image",
    file: "file",
    audio: "audio",
    video: "video",
};

function ModalityDot({
    modality,
    size,
    muted = false,
}: {
    modality: Modality;
    size: number;
    muted?: boolean;
}) {
    const IconComp = ICON_MAP[modality];
    return (
        <span title={LABEL_MAP[modality]} className="inline-flex">
            <IconComp
                className={`shrink-0 ${muted ? "text-gray-300 dark:text-gray-600" : ""}`}
                style={{ width: size, height: size }}
            />
        </span>
    );
}

function renderRow(modalities: Modality[], size: number, muted = false) {
    return MODALITY_ORDER
        .filter((m) => modalities.includes(m))
        .map((m) => <ModalityDot key={m} modality={m} size={size} muted={muted} />);
}

// ─── Inline badges (for Models page collapsed cards) ────

/** Compact Input/Output badge pair. Hidden when both are text-only. */
export function ModalityBadges({
    input,
    output,
    size = 13,
}: {
    input?: Modality[];
    output?: Modality[];
    size?: number;
}) {
    const inp = input ?? ["text"];
    const out = output ?? ["text"];

    const isDefault =
        inp.length === 1 && inp[0] === "text" && out.length === 1 && out[0] === "text";
    if (isDefault) return null;

    return (
        <span className="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
            <span className="inline-flex items-center gap-px" title="Input modalities">
                {renderRow(inp, size)}
            </span>
            <span className="text-[10px] text-gray-300 dark:text-gray-600 select-none">→</span>
            <span className="inline-flex items-center gap-px" title="Output modalities">
                {renderRow(out, size)}
            </span>
        </span>
    );
}

// ─── Table cell (for Providers page columns) ────────────

/** Render a single modality cell for table columns. Shows sorted icons. */
export function ModalityCell({
    modalities,
    size = 14,
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
