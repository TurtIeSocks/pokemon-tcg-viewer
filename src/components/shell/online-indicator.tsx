import { useOnlineStatus } from "@/lib/use-online-status";
import { m } from "@/paraglide/messages";

/**
 * Always-visible offline pill. Renders nothing while online; when the browser
 * reports offline it shows a small glass pill above the mobile bottom nav (and
 * bottom-left on desktop). Distinct from the sync-status line in the account
 * menu, which is cloud/account-specific and hidden in the dropdown.
 */
export function OnlineIndicator() {
	const online = useOnlineStatus();
	if (online) return null;
	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-(--r-pill) border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-(--ink) shadow-(--shadow) backdrop-blur-xl md:bottom-4"
		>
			<span className="size-2 rounded-full bg-(--faint)" aria-hidden="true" />
			{m.offline_indicator()}
		</div>
	);
}
