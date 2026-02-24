import { Switch } from "@headlessui/react";

export function ToggleSwitch({
	enabled,
	onChange,
	label,
}: {
	enabled: boolean;
	onChange: (value: boolean) => void;
	label?: string;
}) {
	return (
		<span className="inline-flex items-center">
			<Switch
				checked={enabled}
				onChange={onChange}
				className="group relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-800 data-[checked]:bg-indigo-600 dark:bg-gray-700"
			>
				<span className="pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-4" />
			</Switch>
			{label && (
				<span
					className={`ml-2 text-xs font-medium ${enabled ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"}`}
				>
					{label}
				</span>
			)}
		</span>
	);
}
