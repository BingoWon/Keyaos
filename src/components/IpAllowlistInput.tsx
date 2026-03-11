import { GlobeAltIcon, PlusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { Input } from "./ui";

interface Props {
	value: string[];
	onChange: (ips: string[]) => void;
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export function IpAllowlistInput({ value, onChange }: Props) {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const [input, setInput] = useState("");
	const [fetching, setFetching] = useState(false);

	const addIp = useCallback(
		(ip: string) => {
			const trimmed = ip.trim();
			if (trimmed && !value.includes(trimmed)) {
				onChange([...value, trimmed]);
			}
			setInput("");
		},
		[value, onChange],
	);

	const addMyIp = async () => {
		setFetching(true);
		try {
			const res = await fetch("/api/my-ip", {
				headers: { Authorization: `Bearer ${await getToken()}` },
			});
			if (res.ok) {
				const { ip } = await res.json();
				if (ip) addIp(ip);
			}
		} catch {
			// ignore
		} finally {
			setFetching(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			if (input.trim()) addIp(input);
		}
	};

	const remove = (ip: string) => onChange(value.filter((v) => v !== ip));

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={t("api_keys.allowed_ips_placeholder")}
					className="flex-1"
				/>
				<button
					type="button"
					onClick={() => {
						if (input.trim()) addIp(input);
					}}
					disabled={!input.trim() || !IP_RE.test(input.trim())}
					className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5"
				>
					<PlusIcon className="size-3.5" />
					{t("common.add")}
				</button>
				<button
					type="button"
					onClick={addMyIp}
					disabled={fetching}
					className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/15"
				>
					<GlobeAltIcon className="size-3.5" />
					{fetching ? "…" : t("api_keys.my_ip")}
				</button>
			</div>

			{/* Tags */}
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((ip) => (
						<span
							key={ip}
							className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300"
						>
							{ip}
							<button
								type="button"
								onClick={() => remove(ip)}
								className="ml-0.5 rounded hover:bg-gray-200 dark:hover:bg-white/15"
							>
								<XMarkIcon className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}
