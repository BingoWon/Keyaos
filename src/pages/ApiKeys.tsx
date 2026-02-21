import { PlusIcon } from "@heroicons/react/20/solid";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../components/PageLoader";
import { useFetch } from "../hooks/useFetch";
import { useFormatDateTime } from "../hooks/useFormatDateTime";
import { useAuth } from "@clerk/clerk-react";
import toast from "react-hot-toast";

interface ApiKeyInfo {
	id: string; // sk-keyaos-...
	name: string;
	is_active: number;
	created_at: number;
}

export function ApiKeys() {
	const { t } = useTranslation();
	const { getToken } = useAuth();
	const formatDateTime = useFormatDateTime();

	const {
		data: apiKeys,
		loading,
		refetch: fetchApiKeys,
	} = useFetch<ApiKeyInfo[]>("/api/api-keys");

	const [isAddOpen, setIsAddOpen] = useState(false);
	const [newName, setNewName] = useState("");

	const handleAdd = async (e: React.FormEvent) => {
		e.preventDefault();
		const tid = toast.loading(t("common.loading"));
		try {
			const token = await getToken();
			const res = await fetch("/api/api-keys", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ name: newName }),
			});
			const result = await res.json();
			if (res.ok) {
				setIsAddOpen(false);
				setNewName("");
				fetchApiKeys();
				toast.success(t("common.success"), { id: tid });
			} else {
				toast.error(result.error?.message || res.statusText, { id: tid });
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
			const token = await getToken();
			const res = await fetch(`/api/api-keys/${id}`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
			});
			if (res.ok) {
				fetchApiKeys();
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
						{t("api_keys.title")}
					</h1>
					<p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
						{t("api_keys.subtitle")}
					</p>
				</div>
				<div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
					<button
						type="button"
						onClick={() => setIsAddOpen(true)}
						className="inline-flex items-center gap-x-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
					>
						<PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />
						{t("api_keys.add_new")}
					</button>
				</div>
			</div>

			{isAddOpen && (
				<div className="mt-6 rounded-lg bg-gray-50 p-4 dark:bg-white/5 border border-gray-200 dark:border-white/10">
					<form
						onSubmit={handleAdd}
						className="flex flex-col sm:flex-row gap-4 items-end"
					>
						<div className="w-full sm:flex-1">
							<label
								htmlFor="name"
								className="block text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								{t("api_keys.name")}
							</label>
							<input
								type="text"
								id="name"
								required
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
								placeholder="e.g. Test Key"
							/>
						</div>
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
								className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
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
										<th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 dark:text-white">
											{t("api_keys.name")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.token")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.status")}
										</th>
										<th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
											{t("api_keys.created_at")}
										</th>
										<th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
											<span className="sr-only">{t("common.actions")}</span>
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
									) : !apiKeys?.length ? (
										<tr>
											<td
												colSpan={5}
												className="py-4 text-center text-sm text-gray-500"
											>
												{t("api_keys.no_data")}
											</td>
										</tr>
									) : (
										apiKeys.map((k) => (
											<tr key={k.id}>
												<td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white">
													{k.name}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500 dark:text-gray-400">
													{k.id}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm">
													{k.is_active ? (
														<span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
															Active
														</span>
													) : (
														<span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
															Inactive
														</span>
													)}
												</td>
												<td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
													{formatDateTime(k.created_at)}
												</td>
												<td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
													<button
														type="button"
														onClick={() => handleDelete(k.id)}
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
