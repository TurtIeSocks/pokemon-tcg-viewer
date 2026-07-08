import { Link, type LinkProps } from "@tanstack/react-router";
import { useIsOwned } from "../../store/userland/selectors";
import { HoloCard, type HoloCardData, holoCardProps } from "../holo-card";
import { CardMiniNav } from "../holo-card/card-mini-nav";
import { groupCardsByEra } from "../pokemon-timeline/group-cards-by-era";
import "../pokemon-timeline/pokemon-timeline.css";

interface PokemonTimelineProps {
	cards: HoloCardData[];
	cardHref: (card: HoloCardData) => LinkProps;
	onEndReached?: () => void;
}

/**
 * One timeline cell. Subscribes to its own card's ownership (S3) so adding/removing
 * one card re-renders only that cell — not the whole timeline (which previously read
 * a parent-level useOwnedIndex and re-rendered every card on any collection change).
 */
function TimelineCard({
	card,
	cardHref,
}: {
	card: HoloCardData;
	cardHref: (card: HoloCardData) => LinkProps;
}) {
	const owned = useIsOwned(card.id);
	return (
		<Link {...cardHref(card)} className="block">
			<HoloCard
				{...holoCardProps(card)}
				owned={owned}
				miniNav={<CardMiniNav card={card} />}
				style={{ width: 300 }}
			/>
		</Link>
	);
}

export function PokemonTimeline({
	cards,
	cardHref,
	onEndReached,
}: PokemonTimelineProps) {
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
							<TimelineCard key={card.id} card={card} cardHref={cardHref} />
						))}
					</div>
				</section>
			))}
			{onEndReached && (
				<div className="pokemon-timeline-load-more">
					<button
						type="button"
						className="pokemon-timeline-load-more-button"
						onClick={onEndReached}
					>
						Load more
					</button>
				</div>
			)}
		</div>
	);
}
