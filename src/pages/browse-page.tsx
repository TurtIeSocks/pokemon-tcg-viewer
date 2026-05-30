import { useMemo } from "react";
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
	useScopeParam,
	useSetIdParam,
	useViewModeParam,
} from "../hooks/use-url-selection";
import { pokemonNameByDex } from "../utils/pokemon-name";
import { Home } from "./home";

export function BrowsePage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const [selectedSetId] = useSetIdParam();
	const [query] = useNameQueryParam();
	const [scope] = useScopeParam();
	const [view, setView] = useViewModeParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	const searching = query !== "";
	const showHome = !selectedSetId && !searching;
	// Set-scoped when a set is selected, scope=set, and a query is present.
	const setScoped = searching && !!selectedSetId && scope === "set";

	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const baseKey = searching
		? setScoped
			? `set:${selectedSetId}|q:${encodeURIComponent(query)}`
			: `q:${encodeURIComponent(query)}`
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
			const filters = { types, rarity, supertype, subtypes };
			if (searching) {
				if (setScoped && selectedSetId) {
					return getCardsBySet(selectedSetId, page, pageSize, filters, query);
				}
				return getCardsByName(query, page, pageSize, filters);
			}
			if (selectedSetId) {
				return getCardsBySet(selectedSetId, page, pageSize, filters);
			}
			return Promise.resolve({ cards: [], totalCount: 0 });
		},
		[
			searching,
			setScoped,
			selectedSetId,
			query,
			types,
			rarity,
			supertype,
			subtypes,
		],
	);

	const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);
	const currentSet = sets.find((s) => s.id === selectedSetId);

	function renderOverlay(card: HoloCardData) {
		const links = (card.nationalPokedexNumbers ?? []).flatMap((n) => {
			const name = pokemonNameByDex(pokemonList, n);
			return name
				? [{ label: `View all ${name}`, to: `/?q=${encodeURIComponent(name)}` }]
				: [];
		});
		// In a set view, also offer a jump to the set page for searched results.
		if (searching && card.setId !== selectedSetId) {
			links.push({
				label: `Go to ${card.setName}`,
				to: `/?setId=${card.setId}`,
			});
		}
		return (
			<>
				<CrossLinkOverlay links={links} />
				<CollectionToggle card={card} />
			</>
		);
	}

	if (showHome) {
		return (
			<div className="h-full overflow-y-auto">
				<Home />
				<Outlet />
			</div>
		);
	}

	return (
		<div className="mx-auto flex h-full w-full min-h-0 max-w-7xl flex-col px-4">
			<div className="shrink-0 space-y-3 py-5">
				<SearchBar />
				<div className="flex items-center justify-between gap-3">
					{!searching && currentSet ? (
						<div className="flex min-w-0 items-center gap-3">
							<img
								src={currentSet.images.logo}
								alt=""
								className="h-8 object-contain"
							/>
							<div className="min-w-0">
								<div className="truncate font-semibold">{currentSet.name}</div>
								<div className="truncate text-xs text-muted-foreground">
									{currentSet.series} · {currentSet.total} cards ·{" "}
									{cards.length} loaded
								</div>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							Results for "{query}"
							{setScoped && currentSet ? ` in ${currentSet.name}` : ""} ·{" "}
							{cards.length} loaded
						</p>
					)}
					{searching && (
						<ViewModeToggle value={view} onChange={setView} disabled={false} />
					)}
				</div>
			</div>
			{view === "timeline" && searching ? (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PokemonTimeline
						cards={cards}
						loading={loading}
						hasMore={hasMore}
						onLoadMore={() => cacheKey && loadMore(cacheKey)}
						renderOverlay={renderOverlay}
					/>
				</div>
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
