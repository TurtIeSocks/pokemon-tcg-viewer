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
				title="All cards"
				subtitle="Every card you own, yours to sort and track."
				actions={
					<ClientOnly fallback={null}>
						<VaultBackupControls />
					</ClientOnly>
				}
			/>

			<ClientOnly
				fallback={
					<p className="py-12 text-center text-muted-foreground">
						Pulling your cards…
					</p>
				}
			>
				<OwnedCardsGrid />
			</ClientOnly>
		</div>
	);
}
