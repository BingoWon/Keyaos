import type { ReactNode } from "react";

interface PromoBannerProps {
    title: ReactNode;
    description: ReactNode;
}

export function PromoBanner({ title, description }: PromoBannerProps) {
    return (
        <div className="mt-4 rounded-xl border border-brand-200/60 bg-gradient-to-br from-brand-50 via-brand-50/60 to-accent-50/50 px-4 py-3 dark:border-brand-500/15 dark:from-brand-500/[0.08] dark:via-brand-500/[0.04] dark:to-accent-500/[0.04]">
            <h2 className="text-[15px] font-semibold text-brand-900 dark:text-brand-100">
                {title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-brand-700/90 dark:text-brand-300/90">
                {description}
            </p>
        </div>
    );
}
