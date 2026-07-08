import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ClaimPromptBanner } from "@/components/vault/claim-prompt";
import { PastDueBanner } from "@/components/vault/past-due-banner";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/vault")({
	head: () => ({ meta: [{ title: m.vault_meta_title() }] }),
	component: VaultLayout,
});

function VaultLayout() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-5">
				<PastDueBanner />
				<ClaimPromptBanner />
				<Outlet />
			</div>
		</div>
	);
}
