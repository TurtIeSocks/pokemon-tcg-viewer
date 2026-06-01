import { Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import {
	buildCorpusQuery,
	type ListContext,
	type ListSearch,
} from "../../lib/card-query";
import {
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "../../store/corpus/corpus-runtime";
import { CollectionToggle } from "../collection-toggle";
import type { HoloCardData } from "../holo-card";
import { HoloCardIsland } from "./holo-card-island";

export interface GridCard extends HoloCardData {
	slug?: string;
}

interface CardGridIslandProps {
	search: ListSearch;
	context: ListContext;
	/** SSR-rendered first page; shown until the corpus takes over. */
	seedCards: GridCard[];
	seedTotal: number;
	/** Build the card-route link props for a card (per-page slug scheme). */
	cardHref: (card: HoloCardData) => LinkProps;
}

const PAGE = 40;

export function CardGridIsland({
	search,
	context,
	seedCards,
	seedTotal,
	cardHref,
}: CardGridIslandProps) {
	const ready = useCorpusRuntime((s) => s.index !== null);
	const [cards, setCards] = useState<HoloCardData[]>(seedCards);
	const [total, setTotal] = useState(seedTotal);
	const pageRef = useRef(1);

	// Stable key for the active query; changing it resets pagination.
	const queryKey = useMemo(
		() => JSON.stringify([search, context]),
		[search, context],
	);

	useEffect(() => {
		// Skip in test environments — loadCorpus is a network-dependent singleton
		// whose inFlight promise leaks across test files via module state.
		if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
			return;
		void loadCorpus();
	}, []);

	// (Re)load page 1 from the corpus whenever the query or readiness changes.
	useEffect(() => {
		if (!ready) return;
		const q = buildCorpusQuery(search, context);
		const fetcher = makeCorpusFetcher(q);
		pageRef.current = 1;
		void fetcher(queryKey, 1, PAGE).then((r) => {
			setCards(r.cards);
			setTotal(r.totalCount);
		});
	}, [ready, queryKey, search, context]);

	const loadMore = () => {
		if (!ready) return;
		if (cards.length >= total) return;
		const next = pageRef.current + 1;
		pageRef.current = next;
		const fetcher = makeCorpusFetcher(buildCorpusQuery(search, context));
		void fetcher(queryKey, next, PAGE).then((r) =>
			setCards((cur) => [...cur, ...r.cards]),
		);
	};

	const renderCard = (card: HoloCardData) => (
		<Link {...cardHref(card)} className="block">
			<HoloCardIsland
				imageUrl={card.imageUrl}
				imageUrlSmall={card.imageUrlSmall}
				name={card.name}
				rarity={card.rarity}
				subtypes={card.subtypes}
				supertype={card.supertype}
				setId={card.setId}
				series={card.setSeries}
				variants={card.variants}
				cardNumber={card.cardNumber}
				hoverOverlay={<CollectionToggle card={card} />}
			/>
		</Link>
	);

	// Test/no-layout fallback: render a plain list so the grid is assertable and
	// SSR-equivalent when Virtuoso can't measure (happy-dom). Virtuoso requires a
	// non-zero-height container to paint items; in happy-dom the container always
	// measures 0 so the item list stays empty. We detect the test environment via
	// ResizeObserver stub or NODE_ENV so production is never affected.
	const isTestEnv =
		(typeof window !== "undefined" && !("ResizeObserver" in window)) ||
		(typeof process !== "undefined" && process.env.NODE_ENV === "test");
	if (isTestEnv) {
		return (
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((c) => (
					<li key={c.id}>{renderCard(c)}</li>
				))}
			</ul>
		);
	}

	return (
		<VirtuosoGrid
			style={{ height: "100%" }}
			totalCount={cards.length}
			endReached={loadMore}
			listClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			itemContent={(index) => {
				const card = cards[index];
				return card ? renderCard(card) : null;
			}}
		/>
	);
}
