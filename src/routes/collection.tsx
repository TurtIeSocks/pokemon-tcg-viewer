import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useStore } from "../store";
import { HoloCardIsland } from "../components/islands/holo-card-island";
import { CollectionToggle } from "../components/collection-toggle";

export const Route = createFileRoute("/collection")({
	head: () => ({ meta: [{ title: "Your Collection — Pokémon TCG" }] }),
	component: CollectionPage,
});

function CollectionInner() {
	const owned = useStore((s) => s.owned);
	const cards = Object.values(owned).map((o) => o.card);
	if (cards.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground">
				Your binder is empty. Add cards from any set.
			</p>
		);
	}
	return (
		<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{cards.map((card) => (
				<li key={card.id}>
					<HoloCardIsland
						imageUrl={card.imageUrl}
						imageUrlSmall={card.imageUrlSmall}
						name={card.name}
						rarity={card.rarity}
						subtypes={card.subtypes}
						supertype={card.supertype}
						setId={card.setId}
						series={card.setSeries}
						variants={card.variants}
						cardNumber={card.cardNumber}
						hoverOverlay={<CollectionToggle card={card} />}
					/>
				</li>
			))}
		</ul>
	);
}

function CollectionPage() {
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-4 text-2xl font-bold">Your Collection</h1>
			<ClientOnly
				fallback={
					<p className="py-12 text-center text-muted-foreground">
						Loading your collection…
					</p>
				}
			>
				<CollectionInner />
			</ClientOnly>
		</div>
	);
}
