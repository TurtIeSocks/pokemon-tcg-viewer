import { useEffect, useMemo } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import { Header } from "../components/header";
import type { HoloCardData } from "../components/holo-card";
import { SeriesMenu } from "../components/series-menu";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import { useFilterParam, useSetIdParam } from "../hooks/use-url-selection";
import { groupSetsBySeries } from "../utils/group-sets-by-series";
import { pokemonNameByDex } from "../utils/pokemon-name";

export function SetsPage() {
	const sets = useSets();
	const pokemonList = usePokemonList();
	const filterValues = useFilterValues();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const [types] = useFilterParam("types");
	const [rarity] = useFilterParam("rarity");
	const [supertype] = useFilterParam("supertype");
	const [subtypes] = useFilterParam("subtypes");

	// Stable signature of the filter state so cache keys vary when filters
	// change. Each toggle yields a different string → fresh useCards entry,
	// while toggling back returns the cached results.
	const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
	const cacheKey = selectedSetId
		? filterSig === "|||"
			? selectedSetId
			: `${selectedSetId}|${filterSig}`
		: null;

	const fetcher: CardFetcher = useMemo(
		() => (_key, page, pageSize) => {
			if (!selectedSetId) {
				return Promise.resolve({ cards: [], totalCount: 0 });
			}
			return getCardsBySet(selectedSetId, page, pageSize, {
				types,
				rarity,
				supertype,
				subtypes,
			});
		},
		[selectedSetId, types, rarity, supertype, subtypes],
	);

	const { cards, loading, loadMore } = useCards(cacheKey, fetcher);

	useEffect(() => {
		if (sets.length === 0) return;
		const exists = selectedSetId && sets.some((s) => s.id === selectedSetId);
		if (!exists) {
			setSelectedSetId(sets[0].id, { replace: true });
		}
	}, [sets, selectedSetId, setSelectedSetId]);

	const currentSet = sets.find((s) => s.id === selectedSetId);

	const seriesGroups = useMemo(() => groupSetsBySeries(sets), [sets]);
	const selectedSeries = currentSet?.series ?? null;

	function renderOverlay(card: HoloCardData) {
		const dexNums = card.nationalPokedexNumbers ?? [];
		if (dexNums.length === 0) return <CollectionToggle card={card} />;
		const links = dexNums.flatMap((n) => {
			// Skip until the species name resolves; a "#N" fallback would make
			// a junk `?q=%23N` search.
			const name = pokemonNameByDex(pokemonList, n);
			if (!name) return [];
			return [
				{
					label: `View all ${name}`,
					to: `/pokemon?q=${encodeURIComponent(name)}`,
				},
			];
		});
		return (
			<>
				<CrossLinkOverlay links={links} />
				<CollectionToggle card={card} />
			</>
		);
	}

	return (
		<>
			<Header currentSet={currentSet} />
			<SeriesMenu
				groups={seriesGroups}
				selectedSeries={selectedSeries}
				selectedSetId={selectedSetId}
				onSelect={setSelectedSetId}
			/>
			<FilterChipRow
				types={filterValues.types}
				rarities={filterValues.rarities}
				supertypes={filterValues.supertypes}
				subtypes={filterValues.subtypes}
			/>
			<CardGrid
				setId={cacheKey}
				cards={cards}
				onEndReached={loadMore}
				renderOverlay={renderOverlay}
			/>
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
