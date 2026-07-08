import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { VaultPageHeader } from "@/components/vault/vault-page-header";
import { m } from "@/paraglide/messages";
import { OwnedCardsGrid } from "../../components/vault/owned-cards-grid";
import { VaultBackupControls } from "../../components/vault/vault-backup-controls";

export const Route = createFileRoute("/vault/cards")({
	component: VaultCards,
});

function VaultCards() {
	return (
		<div className="space-y-8">
			<VaultPageHeader
				title={m.vault_all_cards_title()}
				subtitle={m.vault_all_cards_subtitle()}
				actions={
					<ClientOnly fallback={null}>
						<VaultBackupControls />
					</ClientOnly>
				}
			/>

			<ClientOnly
				fallback={
					<p className="py-12 text-center text-muted-foreground">
						{m.vault_pulling_cards()}
					</p>
				}
			>
				<OwnedCardsGrid />
			</ClientOnly>
		</div>
	);
}
