import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { OwnedCardsGrid } from "../../components/vault/owned-cards-grid";

export const Route = createFileRoute("/vault/cards")({
	component: VaultCards,
});

function VaultCards() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">
					Loading your collection…
				</p>
			}
		>
			<OwnedCardsGrid />
		</ClientOnly>
	);
}
