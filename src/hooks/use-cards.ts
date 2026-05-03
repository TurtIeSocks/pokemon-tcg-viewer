import type { HoloCardData } from "pokemon-holo-cards";
import { useCallback, useEffect, useRef, useState } from "react";

interface CacheEntry {
	cards: HoloCardData[];
	page: number;
	totalCount: number;
}

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
}

// Generic paginated card loader, keyed by an arbitrary string (set id, pokédex
// number, name, etc). Caller supplies the fetcher; this hook handles caching,
// in-flight dedup, throttling, and resize-storm suppression.
export function useCards(
	selectedKey: string | null,
	fetcher: CardFetcher,
): UseCardsResult {
	const [cache, setCache] = useState<Record<string, CacheEntry>>({});
	const [loading, setLoading] = useState(false);

	const cacheRef = useRef(cache);
	useEffect(() => {
		cacheRef.current = cache;
	}, [cache]);

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

	const loadMore = useCallback(async (key: string) => {
		if (inFlightRef.current.has(key)) return;
		if (Date.now() < loadSuppressedUntilRef.current) return;

		const lastFetchAt = lastFetchAtRef.current.get(key) ?? 0;
		if (Date.now() - lastFetchAt < FETCH_THROTTLE_MS) return;

		const current = cacheRef.current[key];
		if (current && current.cards.length >= current.totalCount) return;

		const nextPage = (current?.page ?? 0) + 1;
		inFlightRef.current.add(key);
		lastFetchAtRef.current.set(key, Date.now());
		setLoading(true);
		try {
			const { cards: fetched, totalCount } = await fetcherRef.current(
				key,
				nextPage,
				PAGE_SIZE,
			);
			setCache((prev) => {
				const existing = prev[key] ?? {
					cards: [],
					page: 0,
					totalCount: 0,
				};
				const seen = new Set(existing.cards.map((c) => c.id));
				const deduped = fetched.filter((c) => !seen.has(c.id));
				return {
					...prev,
					[key]: {
						cards: [...existing.cards, ...deduped],
						page: nextPage,
						totalCount,
					},
				};
			});
		} catch (e) {
			console.error(e);
		} finally {
			inFlightRef.current.delete(key);
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedKey && !cacheRef.current[selectedKey]) {
			loadMore(selectedKey);
		}
	}, [selectedKey, loadMore]);

	const cards = selectedKey ? (cache[selectedKey]?.cards ?? []) : [];

	return { cards, loading, loadMore };
}
