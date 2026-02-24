import { useEffect, useRef } from "react";
import { useAuth } from "../auth";
import { BaseSidebarLayout } from "./BaseSidebarLayout";
import { NavigationList } from "./NavigationList";

export function SidebarLayout() {
	const { getToken } = useAuth();
	const hasPrefetched = useRef(false);

	useEffect(() => {
		if (!hasPrefetched.current) {
			hasPrefetched.current = true;
			getToken().then((activeToken) => {
				if (!activeToken) return;
				fetch("/v1/models", {
					headers: { Authorization: `Bearer ${activeToken}` },
				})
					.then((res) => res.json())
					.then((data) => {
						if (Array.isArray(data) && data.length === 0) {
							fetch("/api/models/sync", {
								method: "POST",
								headers: { Authorization: `Bearer ${activeToken}` },
							}).catch(() => {});
						}
					})
					.catch(() => {});
			});
		}
	}, [getToken]);

	return (
		<BaseSidebarLayout
			navigation={(onClose) => <NavigationList onNavigate={onClose} />}
			mobileTitle="Keyaos"
		/>
	);
}
