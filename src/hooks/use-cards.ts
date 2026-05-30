import { useCallback, useEffect, useRef, useState } from "react";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { shouldRefetch } from "../store/freshness";

const PAGE_SIZE = 20;
const FETCH_THROTTLE_MS = 500;
const RESIZE_SUPPRESSION_MS = 500;

export type CardFetcher = (
	key: string,
	page: number,
	pageSize: number,
) => Promise<{ cards: HoloCardData[]; totalCount: number }>;

interface UseCardsResult {
	cards: HoloCardData[];
	loading: boolean;
	loadMore: (key: string) => void;
	hasMore: boolean;
}

// Paginated card loader keyed by an arbitrary string (set id, pokédex number,
// filtered variants of those). Pages are persisted in the Zustand store
// (cards-slice) so revisits render instantly and revalidate in the background.
// This hook owns the orchestration: in-flight dedup, throttling, resize-storm
// suppression, and the stale-while-revalidate trigger.
export function useCards(
	selectedKey: string | null,
	fetcher: CardFetcher,
): UseCardsResult {
	const entry = useStore((s) =>
		selectedKey ? s.cardsCache[selectedKey] : undefined,
	);
	const appendCardsPage = useStore((s) => s.appendCardsPage);
	const touchCardsKey = useStore((s) => s.touchCardsKey);

	const [loading, setLoading] = useState(false);

	const fetcherRef = useRef(fetcher);
	useEffect(() => {
		fetcherRef.current = fetcher;
	}, [fetcher]);

	const inFlightRef = useRef<Set<string>>(new Set());
	const lastFetchAtRef = useRef<Map<string, number>>(new Map());
	const loadSuppressedUntilRef = useRef(0);

	useEffect(() => {
		const onResize = () => {
			loadSuppressedUntilRef.current = Date.now() + RESIZE_SUPPRESSION_MS;
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const fetchPage = useCallback(
		async (key: string, page: number) => {
			if (inFlightRef.current.has(key)) return;
			inFlightRef.current.add(key);
			lastFetchAtRef.current.set(key, Date.now());
			setLoading(true);
			try {
				const { cards, totalCount } = await fetcherRef.current(
					key,
					page,
					PAGE_SIZE,
				);
				appendCardsPage(key, cards, page, totalCount, Date.now());
			} catch (e) {
				console.error(e);
			} finally {
				inFlightRef.current.delete(key);
				setLoading(false);
			}
		},
		[appendCardsPage],
	);

	const loadMore = useCallback(
		(key: string) => {
			if (Date.now() < loadSuppressedUntilRef.current) return;
			const last = lastFetchAtRef.current.get(key) ?? 0;
			if (Date.now() - last < FETCH_THROTTLE_MS) return;
			const cur = useStore.getState().cardsCache[key];
			if (cur && cur.cards.length >= cur.totalCount) return;
			const nextPage = (cur?.page ?? 0) + 1;
			void fetchPage(key, nextPage);
		},
		[fetchPage],
	);

	// Initial load + stale-while-revalidate on key change.
	useEffect(() => {
		if (!selectedKey) return;
		const cur = useStore.getState().cardsCache[selectedKey];
		if (!cur) {
			void fetchPage(selectedKey, 1);
			return;
		}
		touchCardsKey(selectedKey);
		if (shouldRefetch({ lastFetchedAt: cur.fetchedAt, kind: "cards" })) {
			void fetchPage(selectedKey, 1);
		}
	}, [selectedKey, fetchPage, touchCardsKey]);

	const cards = entry?.cards ?? [];
	const hasMore = !!entry && entry.cards.length < entry.totalCount;

	return { cards, loading, loadMore, hasMore };
}
