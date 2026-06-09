import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { VaultPageHeader } from "@/components/vault/vault-page-header";
import { OwnedCardsGrid } from "../../components/vault/owned-cards-grid";
import { VaultBackupControls } from "../../components/vault/vault-backup-controls";

export const Route = createFileRoute("/vault/cards")({
	component: VaultCards,
});

function VaultCards() {
	return (
		<div className="space-y-8">
			<VaultPageHeader
				title="All Cards"
				subtitle="Browse and manage every card you own."
				actions={
					<ClientOnly fallback={null}>
						<VaultBackupControls />
					</ClientOnly>
				}
			/>

			<ClientOnly
				fallback={
					<p className="py-12 text-center text-muted-foreground">
						Loading your collection…
					</p>
				}
			>
				<OwnedCardsGrid />
			</ClientOnly>
		</div>
	);
}
