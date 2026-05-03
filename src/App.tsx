import { CardZoomModal } from "pokemon-holo-cards";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { CardGrid } from "./components/CardGrid";
import { Header } from "./components/Header";
import { SeriesTabs } from "./components/SeriesTabs";
import { SetTabs } from "./components/SetTabs";
import { useCards } from "./hooks/useCards";
import { useSets } from "./hooks/useSets";

export default function App() {
	const sets = useSets();
	const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
	const { cards, loading, loadMore } = useCards(selectedSetId);

	// Default to the first set once sets arrive.
	useEffect(() => {
		if (!selectedSetId && sets.length > 0) {
			setSelectedSetId(sets[0].id);
		}
	}, [sets, selectedSetId]);

	const currentSet = sets.find((s) => s.id === selectedSetId);

	// Distinct series in chronological order (sets are sorted by releaseDate).
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

	// Derived from selectedSetId — never tracked separately to avoid drift.
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
		<div className="app">
			<CardZoomModal />
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
		</div>
	);
}
