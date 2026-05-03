import { useEffect, useMemo } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/card-grid";
import { Header } from "../components/header";
import { SeriesTabs } from "../components/series-tabs";
import { SetTabs } from "../components/set-tabs";
import { useCards } from "../hooks/use-cards";
import { useSets } from "../hooks/use-sets";
import { useSetIdParam } from "../hooks/use-url-selection";

export function SetsPage() {
	const sets = useSets();
	const [selectedSetId, setSelectedSetId] = useSetIdParam();
	const { cards, loading, loadMore } = useCards(selectedSetId, getCardsBySet);

	useEffect(() => {
		if (sets.length === 0) return;
		// If nothing is selected yet, or the URL setId points to a set that no
		// longer exists (e.g. removed from the API), fall back to the newest
		// set. Use replace:true so this default doesn't litter back history.
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
			<CardGrid setId={selectedSetId} cards={cards} onEndReached={loadMore} />
			{loading && <div className="loading-pill">Loading…</div>}
		</>
	);
}
