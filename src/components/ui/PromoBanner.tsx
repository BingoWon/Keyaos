import type { ReactNode } from "react";

interface PromoBannerProps {
    title: ReactNode;
    description: ReactNode;
}

export function PromoBanner({ title, description }: PromoBannerProps) {
    return (
        <div className="relative mt-4 overflow-hidden rounded-xl px-4 py-3">
            {/* Light: Brand Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-500 to-accent-400 dark:hidden" />
            {/* Dark: Surface Gradient */}
            <div
                className="absolute inset-0 hidden dark:block"
                style={{
                    background: [
                        "radial-gradient(circle at 25% 20%, rgba(127,57,173,0.25), transparent 55%)",
                        "radial-gradient(circle at 80% 75%, rgba(208,144,96,0.18), transparent 55%)",
                        "linear-gradient(180deg, rgba(27,7,54,0.92), rgba(18,4,33,0.78))",
                    ].join(", "),
                }}
            />
            <div className="relative">
                <h2 className="text-[15px] font-semibold text-white">
                    {title}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-white/80">
                    {description}
                </p>
            </div>
        </div>
    );
}
