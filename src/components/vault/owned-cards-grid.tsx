import { useEffect } from "react";
import { useStore } from "../../store";
import { loadCorpus } from "../../store/corpus/corpus-runtime";
import { useOwnedCardViews } from "../../store/userland/selectors";
import { CollectionToggle } from "../collection-toggle";
import { HoloCardIsland } from "../islands/holo-card-island";

export function OwnedCardsGrid() {
	const loadSets = useStore((s) => s.loadSets);
	useEffect(() => {
		void loadCorpus();
		void loadSets();
	}, [loadSets]);

	const cards = useOwnedCardViews();

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
