import { useEffect, useMemo, useState } from "react";
import { getCardsBySet } from "../api";
import { CardGrid } from "../components/CardGrid";
import { Header } from "../components/Header";
import { SeriesTabs } from "../components/SeriesTabs";
import { SetTabs } from "../components/SetTabs";
import { useCards } from "../hooks/useCards";
import { useSets } from "../hooks/useSets";

export function SetsPage() {
	const sets = useSets();
	const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
	const { cards, loading, loadMore } = useCards(selectedSetId, getCardsBySet);

	useEffect(() => {
		if (!selectedSetId && sets.length > 0) {
			setSelectedSetId(sets[0].id);
		}
	}, [sets, selectedSetId]);

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
