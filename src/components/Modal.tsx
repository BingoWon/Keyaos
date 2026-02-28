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
	/** Max width class (default: max-w-lg) */
	size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_MAP = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
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
								className={`w-full ${SIZE_MAP[size]} rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-gray-900 dark:ring-white/5`}
							>
								{/* Header */}
								{title && (
									<div className="mb-5 flex items-center justify-between">
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

								{/* Content */}
								{children}
							</DialogPanel>
						</TransitionChild>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
}
