import { useEffect, useMemo } from "react";
import { Outlet } from "react-router";
import { getCardsByName, getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import type { HoloCardData } from "../components/holo-card";
import { PokemonTimeline } from "../components/pokemon-timeline";
import { SearchBar } from "../components/search-bar/search-bar";
import { ViewModeToggle } from "../components/view-mode-toggle";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import {
	useFilterParam,
	useNameQueryParam,
	useSetIdParam,
	useViewModeParam,
} from "../hooks/use-url-selection";
import { pickNewestSetId } from "../utils/pick-newest-set";
import { pokemonNameByDex } from "../utils/pokemon-name";

export function BrowsePage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const [query] = useNameQueryParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const searching = query !== "";

	// Default to the newest set when nothing is selected and we're not searching.
	useEffect(() => {
		if (searching || sets.length === 0) return;
		const exists = selectedSetId && sets.some((s) => s.id === selectedSetId);
		if (!exists) {
			const newest = pickNewestSetId(sets);
			if (newest) setSelectedSetId(newest, { replace: true });
		}
	}, [searching, sets, selectedSetId, setSelectedSetId]);

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const baseKey = searching
		? `q:${encodeURIComponent(query)}`
		: selectedSetId
			? selectedSetId
			: null;
	const cacheKey = baseKey
		? filterSig === "|||"
			? baseKey
			: `${baseKey}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (searching) {
				return getCardsByName(query, page, pageSize, {
					types,
					rarity,
					supertype,
					subtypes,
				});
			}
			if (selectedSetId) {
				return getCardsBySet(selectedSetId, page, pageSize, {
					types,
					rarity,
					supertype,
					subtypes,
				});
			}
			return Promise.resolve({ cards: [], totalCount: 0 });
		},
		[searching, query, selectedSetId, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);

	function renderOverlay(card: HoloCardData) {
		if (searching) {
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
		const links = (card.nationalPokedexNumbers ?? []).flatMap((n) => {
			const name = pokemonNameByDex(pokemonList, n);
			return name
				? [{ label: `View all ${name}`, to: `/?q=${encodeURIComponent(name)}` }]
				: [];
		});
		return (
			<>
				<CrossLinkOverlay links={links} />
				<CollectionToggle card={card} />
			</>
		);
	}

	return (
		<div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
			<SearchBar />
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					{searching ? `Results for "${query}"` : "Browse set"} · {cards.length}{" "}
					loaded
				</p>
				{searching && (
					<ViewModeToggle value={view} onChange={setView} disabled={false} />
				)}
			</div>
			{view === "timeline" && searching ? (
				<PokemonTimeline
					cards={cards}
					loading={loading}
					hasMore={hasMore}
					onLoadMore={() => cacheKey && loadMore(cacheKey)}
					renderOverlay={renderOverlay}
				/>
			) : (
				<CardGrid
					setId={cacheKey}
					cards={cards}
					onEndReached={loadMore}
					renderOverlay={renderOverlay}
				/>
			)}
			{loading && (
				<div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-card px-4 py-2 text-sm shadow-lg">
					Loading…
				</div>
			)}
			<Outlet />
		</div>
	);
}
