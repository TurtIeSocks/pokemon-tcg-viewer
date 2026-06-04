import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Eyebrow } from "@/components/ui/eyebrow";
import { OwnedCardsGrid } from "../../components/vault/owned-cards-grid";
import { VaultBackupControls } from "../../components/vault/vault-backup-controls";

export const Route = createFileRoute("/vault/cards")({
	component: VaultCards,
});

function VaultCards() {
	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="space-y-1.5">
					<Eyebrow>Your vault</Eyebrow>
					<h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)]">
						All cards
					</h1>
				</div>
				<ClientOnly fallback={null}>
					<VaultBackupControls />
				</ClientOnly>
			</div>

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
