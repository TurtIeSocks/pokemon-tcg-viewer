import { Link } from "@tanstack/react-router";
import { VirtuosoGrid } from "react-virtuoso";
import type { HoloCardData } from "../holo-card";
import { CollectionToggle } from "../collection-toggle";
import { HoloCardIsland } from "./holo-card-island";

export interface GridCard extends HoloCardData {
	slug: string;
}

interface SetGridIslandProps {
	series: string;
	set: string;
	cards: GridCard[];
}

/**
 * Client-side interactive grid. Mounted by the set route under <ClientOnly>, so
 * it never runs on the server (Virtuoso measures the DOM). The SSR-rendered
 * static list remains the crawlable payload; this replaces it after hydration.
 */
export function SetGridIsland({ series, set, cards }: SetGridIslandProps) {
	return (
		<VirtuosoGrid
			style={{ height: "100%" }}
			totalCount={cards.length}
			listClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			itemContent={(index) => {
				const card = cards[index];
				if (!card) return null;
				return (
					<Link
						to="/$series/$set/$card"
						params={{ series, set, card: card.slug }}
						className="block"
					>
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
					</Link>
				);
			}}
		/>
	);
}
