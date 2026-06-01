import { Link, type LinkProps } from "@tanstack/react-router";
import { useStore } from "../../store";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";
import { groupCardsByEra } from "../pokemon-timeline/group-cards-by-era";
import "../pokemon-timeline/pokemon-timeline.css";

interface PokemonTimelineProps {
	cards: HoloCardData[];
	cardHref: (card: HoloCardData) => LinkProps;
	onEndReached?: () => void;
}

export function PokemonTimeline({ cards, cardHref, onEndReached }: PokemonTimelineProps) {
	const owned = useStore((s) => s.owned);

	if (cards.length === 0) {
		return (
			<div className="pokemon-timeline-empty">
				<p>No cards match these filters.</p>
			</div>
		);
	}

	const eras = groupCardsByEra(cards);
	return (
		<div className="pokemon-timeline">
			{eras.map((era) => (
				<section key={era.series} className="pokemon-timeline-era">
					<header className="pokemon-timeline-era-header">
						<h2 className="pokemon-timeline-era-name">{era.series}</h2>
						{era.yearLabel && <span className="pokemon-timeline-era-years">{era.yearLabel}</span>}
						<span className="pokemon-timeline-era-count">{era.count} {era.count === 1 ? "card" : "cards"}</span>
					</header>
					<div className="pokemon-timeline-era-cards">
						{era.cards.map((card) => (
							<Link key={card.id} {...cardHref(card)} className="block">
								<HoloCard
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
									owned={!!owned[card.id]}
									hoverOverlay={<CollectionToggle card={card} />}
									style={{ width: 300 }}
								/>
							</Link>
						))}
					</div>
				</section>
			))}
			{onEndReached && (
				<div className="pokemon-timeline-load-more">
					<button type="button" className="pokemon-timeline-load-more-button" onClick={onEndReached}>
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
