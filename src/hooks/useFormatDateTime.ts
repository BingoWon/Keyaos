import { useTranslation } from "react-i18next";

export function useFormatDateTime() {
	const { i18n } = useTranslation();

	return (timestamp: number | string | Date) => {
		const date = new Date(timestamp);
		if (i18n.language === "zh") {
			const yyyy = date.getFullYear();
			const MM = String(date.getMonth() + 1).padStart(2, "0");
			const dd = String(date.getDate()).padStart(2, "0");
			const hh = String(date.getHours()).padStart(2, "0");
			const mm = String(date.getMinutes()).padStart(2, "0");
			return `${yyyy}-${MM}-${dd} ${hh}:${mm}`;
		}

		return date.toLocaleString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};
}
