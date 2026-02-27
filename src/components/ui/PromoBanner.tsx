import type { ReactNode } from "react";

interface PromoBannerProps {
    title: ReactNode;
    description: ReactNode;
}

export function PromoBanner({ title, description }: PromoBannerProps) {
    return (
        <div className="mt-6 overflow-hidden rounded-xl border border-brand-200/60 bg-gradient-to-r from-brand-50/80 via-white to-brand-50/40 p-5 shadow-[0_1px_6px_-2px_rgba(0,0,0,0.05)] dark:border-brand-500/15 dark:from-brand-500/[0.07] dark:via-transparent dark:to-brand-500/[0.04]">
            <h2 className="text-[15px] font-semibold text-brand-900 dark:text-brand-100">
                {title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-brand-700/90 dark:text-brand-300/90">
                {description}
            </p>
        </div>
    );
}
