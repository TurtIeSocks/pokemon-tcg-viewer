import { useCallback } from "react";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import "../components/header.css";
import { PokemonFilter } from "../components/pokemon-filter";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokedexParam } from "../hooks/use-url-selection";
import "./pokemon-page.css";

// useCards keys by string, but the conceptual key here is a pokédex number.
// Stringifying at the boundary keeps the cache key human-readable in devtools.
const fetcher: CardFetcher = (key, page, pageSize) =>
	getCardsByPokedexNumber(Number(key), page, pageSize);

function renderOverlay(card: HoloCardData) {
	return (
		<CrossLinkOverlay
			links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
		/>
	);
}

export function PokemonPage() {
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const key = pokedexNumber === null ? null : String(pokedexNumber);
	const { cards, loading, loadMore } = useCards(key, fetcher);

	const handleEndReached = useCallback((k: string) => loadMore(k), [loadMore]);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Filter by Pokémon</div>
						<div className="set-sub">
							{pokedexNumber === null
								? "Pick a Pokémon to see every holo card across every set"
								: `National Pokédex #${pokedexNumber} · ${cards.length} cards loaded`}
						</div>
					</div>
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<CardGrid
				setId={key}
				cards={cards}
				onEndReached={handleEndReached}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
