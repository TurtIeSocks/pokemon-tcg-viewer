import type { HoloCardData } from "pokemon-holo-cards";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCards } from "../api";

interface SetCache {
	cards: HoloCardData[];
	page: number;
	totalCount: number;
}

const PAGE_SIZE = 20;
const FETCH_THROTTLE_MS = 500;
const RESIZE_SUPPRESSION_MS = 500;

interface UseCardsResult {
	cards: HoloCardData[];
	loading: boolean;
	loadMore: (setId: string) => void;
}

export function useCards(selectedSetId: string | null): UseCardsResult {
	const [cache, setCache] = useState<Record<string, SetCache>>({});
	const [loading, setLoading] = useState(false);

	// Mirror cache to a ref so loadMore can read the latest state without re-binding.
	const cacheRef = useRef(cache);
	useEffect(() => {
		cacheRef.current = cache;
	}, [cache]);

	// Tracks setIds with a fetch currently in flight. Using a ref (not state)
	// avoids stale closures and StrictMode double-fetch in dev.
	const inFlightRef = useRef<Set<string>>(new Set());
	// Per-set last-fetch timestamp. Defends against Virtuoso firing endReached
	// rapidly while item heights are still settling.
	const lastFetchAtRef = useRef<Map<string, number>>(new Map());
	// Window-resize suppression: Virtuoso reflows layout during viewport
	// changes (devtools toggle, window resize) and can fire endReached as
	// items shift. Pause loadMore briefly to absorb the burst.
	const loadSuppressedUntilRef = useRef(0);

	useEffect(() => {
		const onResize = () => {
			loadSuppressedUntilRef.current = Date.now() + RESIZE_SUPPRESSION_MS;
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const loadMore = useCallback(async (setId: string) => {
		if (inFlightRef.current.has(setId)) return;

		// Skip if we're inside a resize-induced suppression window.
		if (Date.now() < loadSuppressedUntilRef.current) return;

		// Throttle: minimum interval between fetches per setId. Stops endReached
		// thrash if Virtuoso fires it again before layout has settled.
		const lastFetchAt = lastFetchAtRef.current.get(setId) ?? 0;
		if (Date.now() - lastFetchAt < FETCH_THROTTLE_MS) return;

		const current = cacheRef.current[setId];
		// End-of-list: we already have all the cards the API knows about.
		if (current && current.cards.length >= current.totalCount) return;

		const nextPage = (current?.page ?? 0) + 1;
		inFlightRef.current.add(setId);
		lastFetchAtRef.current.set(setId, Date.now());
		setLoading(true);
		try {
			const { cards: fetched, totalCount } = await getCards(
				setId,
				nextPage,
				PAGE_SIZE,
			);
			setCache((prev) => {
				const existing = prev[setId] ?? {
					cards: [],
					page: 0,
					totalCount: 0,
				};
				const seen = new Set(existing.cards.map((c) => c.id));
				const deduped = fetched.filter((c) => !seen.has(c.id));
				return {
					...prev,
					[setId]: {
						cards: [...existing.cards, ...deduped],
						page: nextPage,
						totalCount,
					},
				};
			});
		} catch (e) {
			console.error(e);
		} finally {
			inFlightRef.current.delete(setId);
			setLoading(false);
		}
	}, []);

	// Bootstrap the first page when switching to a set we haven't fetched yet.
	useEffect(() => {
		if (selectedSetId && !cacheRef.current[selectedSetId]) {
			loadMore(selectedSetId);
		}
	}, [selectedSetId, loadMore]);

	const cards = selectedSetId ? (cache[selectedSetId]?.cards ?? []) : [];

	return { cards, loading, loadMore };
}
