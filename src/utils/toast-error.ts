import type { TFunction } from "i18next";
import toast from "react-hot-toast";

interface ApiErrorBody {
	error?: { message?: string; code?: string };
}

/**
 * Show a toast for an API error response, resolving the message via i18n.
 *
 * Lookup order:
 *   1. `errors.<code>` i18n key (user-friendly, localized)
 *   2. `error.message` from the response (English fallback)
 *   3. `common.error` generic fallback
 */
export function toastApiError(
	data: ApiErrorBody,
	t: TFunction,
	tid?: string,
): void {
	const code = data.error?.code;
	const localized = code ? t(`errors.${code}`, { defaultValue: "" }) : "";
	const message = localized || data.error?.message || t("common.error");
	toast.error(message, tid ? { id: tid } : undefined);
}
