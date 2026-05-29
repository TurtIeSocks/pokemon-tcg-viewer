import { useMemo } from "react";
import { getCardsByPokedexNumber } from "../api";
import { CardGrid } from "../components/card-grid";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import "../components/header.css";
import type { HoloCardData } from "../components/holo-card";
import { PokemonFilter } from "../components/pokemon-filter";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import {
	useFilterParam,
	usePokedexParam,
	useViewModeParam,
} from "../hooks/use-url-selection";
import "./pokemon-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<CrossLinkOverlay
			links={[{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` }]}
		/>
	);
}

export function PokemonPage() {
	const filterValues = useFilterValues();
	const [pokedexNumber, setPokedexNumber] = usePokedexParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const baseKey = pokedexNumber === null ? null : String(pokedexNumber);
	const cacheKey = baseKey
		? filterSig === "|||"
			? baseKey
			: `${baseKey}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (pokedexNumber === null) {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsByPokedexNumber(pokedexNumber, page, pageSize, {
				types,
				rarity,
				supertype,
				subtypes,
			});
		},
		[pokedexNumber, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

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
					<ViewModeToggle
						value={view}
						onChange={setView}
						disabled={pokedexNumber === null}
					/>
				</div>
			</header>
			<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />
			<FilterChipRow
				types={filterValues.types}
				rarities={filterValues.rarities}
				supertypes={filterValues.supertypes}
				subtypes={filterValues.subtypes}
			/>
			{view === "grid" ? (
				<CardGrid
					setId={cacheKey}
					cards={cards}
					onEndReached={loadMore}
					renderOverlay={renderOverlay}
				/>
			) : (
				<PokemonTimeline
					cards={cards}
					loading={loading}
					hasMore={hasMore}
					onLoadMore={() => {
						if (cacheKey) loadMore(cacheKey);
					}}
					renderOverlay={renderOverlay}
				/>
			)}
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
