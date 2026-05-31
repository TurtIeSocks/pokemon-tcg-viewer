import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { HoloCardData } from "../../components/holo-card";
import {
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "../../store/corpus/corpus-runtime";

interface CorpusSearchIslandProps {
	query: string;
	ssrCards: HoloCardData[];
}

/**
 * Upgrades /search from SSR API results to instant corpus results once the
 * in-memory index has loaded. Until then it shows the SSR results (no flash of
 * empty). Client-only (corpus lives in IndexedDB + memory).
 */
function CorpusSearchInner({ query, ssrCards }: CorpusSearchIslandProps) {
	const ready = useCorpusRuntime((s) => s.index !== null);
	const [cards, setCards] = useState<HoloCardData[]>(ssrCards);

	useEffect(() => {
		void loadCorpus();
	}, []);

	useEffect(() => {
		if (!ready || !query) return;
		const fetcher = makeCorpusFetcher({ query, relevance: true });
		void fetcher(`search:${query}`, 1, 60).then((r) => setCards(r.cards));
	}, [ready, query]);

	return (
		<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{cards.map((card) => (
				<li key={card.id} className="flex flex-col items-center gap-1">
					<img
						src={card.imageUrlSmall}
						alt={card.name}
						loading="lazy"
						className="w-full rounded"
					/>
					<span className="text-center text-xs">{card.name}</span>
					<span className="text-center text-[10px] text-muted-foreground">
						{card.setName}
					</span>
				</li>
			))}
		</ul>
	);
}

export function CorpusSearchIsland(props: CorpusSearchIslandProps) {
	return (
		<ClientOnly
			fallback={
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{props.ssrCards.map((card) => (
						<li key={card.id} className="flex flex-col items-center gap-1">
							<img
								src={card.imageUrlSmall}
								alt={card.name}
								loading="lazy"
								className="w-full rounded"
							/>
							<span className="text-center text-xs">{card.name}</span>
						</li>
					))}
				</ul>
			}
		>
			<CorpusSearchInner {...props} />
		</ClientOnly>
	);
}
