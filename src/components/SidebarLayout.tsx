import { BaseSidebarLayout } from "./BaseSidebarLayout";
import { NavigationList } from "./NavigationList";

export function SidebarLayout() {
	return (
		<BaseSidebarLayout
			navigation={(onClose) => <NavigationList onNavigate={onClose} />}
			mobileTitle="Keyaos"
		/>
	);
}
