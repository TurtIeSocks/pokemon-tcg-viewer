import type React from "react";
import { useNavigate } from "react-router";
import { useStore } from "../../store";
import { HoloCard, type HoloCardData } from "../holo-card";
import { groupCardsByEra } from "./group-cards-by-era";
import "./pokemon-timeline.css";

interface PokemonTimelineProps {
	cards: HoloCardData[];
	loading: boolean;
	hasMore: boolean;
	onLoadMore: () => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

export function PokemonTimeline({
	cards,
	loading,
	hasMore,
	onLoadMore,
	renderOverlay,
}: PokemonTimelineProps) {
	const navigate = useNavigate();
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
						{era.yearLabel && (
							<span className="pokemon-timeline-era-years">
								{era.yearLabel}
							</span>
						)}
						<span className="pokemon-timeline-era-count">
							{era.count} {era.count === 1 ? "card" : "cards"}
						</span>
					</header>
					<div className="pokemon-timeline-era-cards">
						{era.cards.map((card) => (
							<HoloCard
								key={card.id}
								imageUrl={card.imageUrl}
								name={card.name}
								rarity={card.rarity}
								subtypes={card.subtypes}
								supertype={card.supertype}
								setId={card.setId}
								series={card.setSeries}
								variants={card.variants}
								cardNumber={card.cardNumber}
								owned={!!owned[card.id]}
								hoverOverlay={renderOverlay?.(card)}
								onClick={(e) => {
									if (e.defaultPrevented) return;
									navigate(`/card/${card.id}`);
								}}
								style={{ width: 300 }}
							/>
						))}
					</div>
				</section>
			))}
			{hasMore && !loading && (
				<div className="pokemon-timeline-load-more">
					<button
						type="button"
						className="pokemon-timeline-load-more-button"
						onClick={onLoadMore}
					>
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
