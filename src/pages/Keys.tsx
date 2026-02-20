import { PlusIcon } from "@heroicons/react/20/solid";
import type React from "react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { HealthBadge, type HealthStatus } from "../components/HealthBadge";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useAuth } from "../stores/auth";

/** Providers that support automatic credit detection */
const AUTO_CREDIT_PROVIDERS = new Set(["openrouter"]);

interface KeyInfo {
	id: string;
	provider: string;
	credits: number;
	creditsSource: "auto" | "manual";
	health: HealthStatus;
	isActive: boolean;
	createdAt: number;
}

export function Keys() {
	const { t } = useTranslation();
	const { token } = useAuth();

	const { data, loading, refetch: fetchKeys } = useFetch<KeyInfo[]>("/keys");
	const keys = data || [];

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [newKey, setNewKey] = useState({
		provider: "openrouter",
		apiKey: "",
		credits: "",
	});
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editCredits, setEditCredits] = useState("");

	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};

	const needsManualCredits = !AUTO_CREDIT_PROVIDERS.has(newKey.provider);

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		const tid = toast.loading(t("common.loading"));
		try {
			const body: Record<string, unknown> = {
				provider: newKey.provider,
				apiKey: newKey.apiKey,
			};
			if (needsManualCredits) {
				body.credits = Number.parseFloat(newKey.credits) || 0;
			}

			const res = await fetch("/keys", {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			if (res.ok) {
				setIsAddOpen(false);
				setNewKey({ provider: "openrouter", apiKey: "", credits: "" });
				fetchKeys();
				toast.success(t("common.success"), { id: tid });
			} else {
				const err = await res.json();
				toast.error(err.error?.message || res.statusText, { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const handleUpdateCredits = async (id: string) => {
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/keys/${id}/credits`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({
					credits: Number.parseFloat(editCredits) || 0,
				}),
			});
			if (res.ok) {
				setEditingId(null);
				fetchKeys();
				toast.success(t("common.success"), { id: tid });
			} else {
				const err = await res.json();
				toast.error(err.error?.message || res.statusText, { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm(`${t("common.confirm")}?`)) return;
		const tid = toast.loading(t("common.loading"));
		try {
			const res = await fetch(`/keys/${id}`, {
				method: "DELETE",
				headers,
			});
			if (res.ok) {
				fetchKeys();
				toast.success(t("common.success"), { id: tid });
			} else {
				toast.error(t("common.error"), { id: tid });
			}
		} catch (err) {
			console.error(err);
			toast.error(t("common.error"), { id: tid });
		}
	};

	return (
		<div>
			<div className="sm:flex sm:items-center">
				<div className="sm:flex-auto">
					<h1 className="text-base font-semibold text-gray-900 dark:text-white">
						{t("keys.title")}
					</h1>
				</div>
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<button
						type="button"
						onClick={() => setIsAddOpen(true)}
						className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
					>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("keys.add_new")}
					</button>
				</div>
			</div>

			{isAddOpen && (
				<div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-white/5 border border-gray-200 dark:border-white/10">
					<form
						onSubmit={handleAdd}
						className="flex flex-col sm:flex-row gap-4 items-end"
					>
						<div className="w-full sm:w-auto">
							<label
								htmlFor="provider"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("keys.provider")}
							</label>
							<select
								id="provider"
								value={newKey.provider}
								onChange={(e) =>
									setNewKey({ ...newKey, provider: e.target.value })
								}
								className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
							>
								<option value="openrouter">OpenRouter</option>
								<option value="zenmux">ZenMux</option>
								<option value="deepinfra">DeepInfra</option>
							</select>
						</div>
						<div className="w-full sm:flex-1">
							<label
								htmlFor="apiKey"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("keys.key")}
							</label>
							<input
								type="password"
								id="apiKey"
								required
								value={newKey.apiKey}
								onChange={(e) =>
									setNewKey({ ...newKey, apiKey: e.target.value })
								}
								className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
								placeholder="sk-..."
							/>
						</div>
						{needsManualCredits && (
							<div className="w-full sm:w-32">
								<label
									htmlFor="credits"
									className="block text-sm font-medium text-gray-700 dark:text-gray-300"
								>
									Credits ($)
								</label>
								<input
									type="number"
									id="credits"
									required
									min="0"
									step="0.01"
									value={newKey.credits}
									onChange={(e) =>
										setNewKey({ ...newKey, credits: e.target.value })
									}
									className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
									placeholder="10.00"
								/>
							</div>
						)}
						<div className="flex gap-2 w-full sm:w-auto">
							<button
								type="button"
								onClick={() => setIsAddOpen(false)}
								className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-0 dark:hover:bg-white/20"
							>
								{t("common.cancel")}
							</button>
							<button
								type="submit"
								className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
							>
								{t("common.save")}
							</button>
						</div>
					</form>
				</div>
			)}

			<div className="mt-8 flow-root">
				<div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
					<div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
						<div className="overflow-hidden shadow-sm ring-1 ring-black/5 sm:rounded-lg dark:ring-white/10">
							<table className="min-w-full divide-y divide-gray-300 dark:divide-white/10">
								<thead className="bg-gray-50 dark:bg-white/5">
									<tr>
										<th
											scope="col"
											className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 dark:text-white"
										>
											{t("keys.provider")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("keys.credits")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("keys.health")}
										</th>
										<th
											scope="col"
											className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white"
										>
											{t("keys.created")}
										</th>
										<th
											scope="col"
											className="relative py-3.5 pl-3 pr-4 sm:pr-6"
										>
											<span className="sr-only">{t("keys.actions")}</span>
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-gray-900">
									{loading ? (
										<tr>
											<td colSpan={5} className="py-10">
												<PageLoader />
											</td>
										</tr>
									) : keys.length === 0 ? (
										<tr>
											<td
												colSpan={5}
												className="py-4 text-center text-sm text-gray-500 dark:text-gray-400"
											>
												{t("keys.no_keys")}
											</td>
										</tr>
									) : (
										keys.map((key) => (
											<tr
												key={key.id}
												className={key.isActive ? "" : "opacity-50"}
											>
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{key.provider}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm">
													{editingId === key.id ? (
														<div className="flex items-center gap-2">
															<input
																type="number"
																min="0"
																step="0.01"
																value={editCredits}
																onChange={(e) => setEditCredits(e.target.value)}
																className="w-20 rounded-md border-gray-300 py-1 px-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
															/>
															<button
																type="button"
																onClick={() => handleUpdateCredits(key.id)}
																className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 text-xs"
															>
																{t("common.save")}
															</button>
															<button
																type="button"
																onClick={() => setEditingId(null)}
																className="text-gray-500 hover:text-gray-700 dark:text-gray-400 text-xs"
															>
																{t("common.cancel")}
															</button>
														</div>
													) : (
														<span
															className={`font-mono ${key.credits > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}
														>
															${key.credits.toFixed(2)}
															{key.creditsSource === "manual" && (
																<button
																	type="button"
																	onClick={() => {
																		setEditingId(key.id);
																		setEditCredits(key.credits.toString());
																	}}
																	className="ml-2 text-gray-400 hover:text-indigo-500 text-xs"
																	title={t("common.edit")}
																>
																	✏️
																</button>
															)}
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
													<HealthBadge status={key.health} />
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{new Date(key.createdAt).toLocaleString()}
												</td>
												<td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
													<button
														type="button"
														onClick={() => handleDelete(key.id)}
														className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
													>
														{t("common.delete")}
													</button>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
