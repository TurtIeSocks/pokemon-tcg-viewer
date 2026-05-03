import { useCallback, useState } from "react";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/CardGrid";
import { PokemonFilter } from "../components/PokemonFilter";
import { type CardFetcher, useCards } from "../hooks/useCards";

// useCards keys by string, but the conceptual key here is a pokédex number.
// Stringifying at the boundary keeps the cache key human-readable in devtools.
const fetcher: CardFetcher = (key, page, pageSize) =>
	getCardsByPokedexNumber(Number(key), page, pageSize);

export function PokemonPage() {
	const [pokedexNumber, setPokedexNumber] = useState<number | null>(null);
	const key = pokedexNumber === null ? null : String(pokedexNumber);
	const { cards, loading, loadMore } = useCards(key, fetcher);

	const handleEndReached = useCallback(
		(k: string) => loadMore(k),
		[loadMore],
	);

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
			<CardGrid setId={key} cards={cards} onEndReached={handleEndReached} />
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
