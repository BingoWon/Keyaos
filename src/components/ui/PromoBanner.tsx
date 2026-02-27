import type { ReactNode } from "react";

interface PromoBannerProps {
    title: ReactNode;
    description: ReactNode;
}

export function PromoBanner({ title, description }: PromoBannerProps) {
    return (
        <div className="mt-6 overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-white p-5 sm:p-5 border border-brand-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:from-brand-500/10 dark:to-transparent dark:border-brand-500/20">
            <div className="flex items-start">
                <div className="flex-1">
                    <h2 className="text-[15px] font-semibold text-brand-900 dark:text-brand-100">
                        {title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-brand-700 dark:text-brand-300">
                        {description}
                    </p>
                </div>
            </div>
        </div>
    );
}
