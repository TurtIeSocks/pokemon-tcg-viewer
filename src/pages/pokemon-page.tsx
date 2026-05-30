import { useMemo } from "react";
import { getCardsByName } from "../api";
import { CardGrid } from "../components/card-grid";
import { CardSearch } from "../components/card-search";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import "../components/header.css";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import {
	useFilterParam,
	useNameQueryParam,
	useViewModeParam,
} from "../hooks/use-url-selection";
import "./pokemon-page.css";

function renderOverlay(card: HoloCardData) {
	return (
		<>
			<CrossLinkOverlay
				links={[
					{ label: `Go to ${card.setName}`, to: `/?setId=${card.setId}` },
				]}
			/>
			<CollectionToggle card={card} />
		</>
	);
}

export function PokemonPage() {
	const filterValues = useFilterValues();
	const [query, setQuery] = useNameQueryParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	// Encode the query so a literal "|" in user input can't collide with the
	// filterSig delimiter below (which would alias two distinct searches to
	// one cache entry).
	const baseKey = query === "" ? null : `q:${encodeURIComponent(query)}`;
	const cacheKey = baseKey
		? filterSig === "|||"
			? baseKey
			: `${baseKey}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (query === "") {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsByName(query, page, pageSize, {
				types,
				rarity,
				supertype,
				subtypes,
			});
		},
		[query, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

	return (
		<>
			<header className="header">
				<h1>Pokémon TCG Holo Playground</h1>
				<div className="set-meta">
					<div>
						<div className="set-name">Search cards</div>
						<div className="set-sub">
							{query === ""
								? "Search any card by name — Pokémon, Trainer, or Energy"
								: `"${query}" · ${cards.length} cards loaded`}
						</div>
					</div>
					<ViewModeToggle
						value={view}
						onChange={setView}
						disabled={query === ""}
					/>
				</div>
			</header>
			<CardSearch value={query} onChange={setQuery} />
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
