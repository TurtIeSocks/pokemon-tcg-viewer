import { useEffect, useMemo } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { CollectionToggle } from "../components/collection-toggle";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { FilterChipRow } from "../components/filter-chip-row";
import { Header } from "../components/header";
import type { HoloCardData } from "../components/holo-card";
import { SeriesTabs } from "../components/series-tabs";
import { SetTabs } from "../components/set-tabs";
import { type CardFetcher, useCards } from "../hooks/use-cards";
import { useFilterValues } from "../hooks/use-filter-values";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { useSets } from "../hooks/use-sets";
import { useFilterParam, useSetIdParam } from "../hooks/use-url-selection";
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

	const distinctSeries = useMemo(() => {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const s of sets) {
			if (!seen.has(s.series)) {
				seen.add(s.series);
				result.push(s.series);
			}
		}
		return result;
	}, [sets]);

	const selectedSeries = currentSet?.series ?? null;
	const setsInSeries = useMemo(
		() =>
			selectedSeries ? sets.filter((s) => s.series === selectedSeries) : [],
		[sets, selectedSeries],
	);

	function selectSeries(series: string) {
		if (series === selectedSeries) return;
		const firstInSeries = sets.find((s) => s.series === series);
		if (firstInSeries) setSelectedSetId(firstInSeries.id);
	}

	function renderOverlay(card: HoloCardData) {
		const dexNums = card.nationalPokedexNumbers ?? [];
		if (dexNums.length === 0) return <CollectionToggle card={card} />;
		const links = dexNums.map((n) => ({
			label: `View all ${pokemonNameByDex(pokemonList, n) ?? `#${n}`}`,
			to: `/pokemon?dex=${n}`,
		}));
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
			<SeriesTabs
				series={distinctSeries}
				selected={selectedSeries}
				onSelect={selectSeries}
			/>
			<SetTabs
				sets={setsInSeries}
				selectedSetId={selectedSetId}
				seriesLabel={selectedSeries}
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
