import {
	Dialog,
	DialogPanel,
	Transition,
	TransitionChild,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { Fragment, type ReactNode } from "react";

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	children: ReactNode;
	size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

const SIZE_MAP = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
	"2xl": "max-w-2xl",
	"3xl": "max-w-3xl",
	"4xl": "max-w-4xl",
} as const;

export function Modal({
	open,
	onClose,
	title,
	children,
	size = "lg",
}: ModalProps) {
	return (
		<Transition show={open} as={Fragment}>
			<Dialog onClose={onClose} className="relative z-[60]">
				{/* Backdrop — frosted glass */}
				<TransitionChild
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-black/40 backdrop-blur-xl" />
				</TransitionChild>

				{/* Panel */}
				<div className="fixed inset-0 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4">
						<TransitionChild
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 scale-95 translate-y-4"
							enterTo="opacity-100 scale-100 translate-y-0"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 scale-100 translate-y-0"
							leaveTo="opacity-0 scale-95 translate-y-4"
						>
							<DialogPanel
								className={`w-full ${SIZE_MAP[size]} max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900 dark:ring-white/5`}
							>
								{title && (
									<div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
										<h3 className="text-base font-semibold text-gray-900 dark:text-white">
											{title}
										</h3>
										<button
											type="button"
											onClick={onClose}
											className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
										>
											<XMarkIcon className="size-5" />
										</button>
									</div>
								)}
								<div
									className={`overflow-y-auto px-6 pb-6 overscroll-contain ${title ? "" : "pt-6"}`}
								>
									{children}
								</div>
							</DialogPanel>
						</TransitionChild>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
}
