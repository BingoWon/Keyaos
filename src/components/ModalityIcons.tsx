import {
    ChatBubbleLeftIcon,
    DocumentTextIcon,
    PaperClipIcon,
    PhotoIcon,
    SpeakerWaveIcon,
    VideoCameraIcon,
} from "@heroicons/react/20/solid";
import type { Modality } from "../../worker/core/db/schema";

const ICON_MAP: Record<Modality, React.FC<{ className?: string }>> = {
    text: ChatBubbleLeftIcon,
    image: PhotoIcon,
    audio: SpeakerWaveIcon,
    video: VideoCameraIcon,
    file: PaperClipIcon,
};

const LABEL_MAP: Record<Modality, string> = {
    text: "Text",
    image: "Image",
    audio: "Audio",
    video: "Video",
    file: "File",
};

/** Compact modality icon strip — hidden when text-only (the default). */
export function ModalityIcons({
    input,
    output,
    size = 14,
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

    const extraInput = inp.filter((m) => m !== "text");
    const extraOutput = out.filter((m) => m !== "text");

    return (
        <span className="inline-flex items-center gap-0.5 text-gray-400 dark:text-gray-500" title={`In: ${inp.join(", ")} → Out: ${out.join(", ")}`}>
            {extraInput.map((m) => {
                const Icon = ICON_MAP[m];
                return <Icon key={`in-${m}`} className="shrink-0" style={{ width: size, height: size }} />;
            })}
            {extraOutput.length > 0 && (
                <>
                    <DocumentTextIcon className="shrink-0 text-gray-300 dark:text-gray-600" style={{ width: size - 2, height: size - 2 }} />
                    {extraOutput.map((m) => {
                        const Icon = ICON_MAP[m];
                        return <Icon key={`out-${m}`} className="shrink-0 text-blue-400 dark:text-blue-500" style={{ width: size, height: size }} />;
                    })}
                </>
            )}
        </span>
    );
}
