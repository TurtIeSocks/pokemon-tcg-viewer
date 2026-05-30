import { type FocusCardData, getCardById } from "../api";

// Session-scoped warm cache of card-detail fetches, keyed by card id. Hover /
// focus on a grid card populates this; the card route loader consumes it so
// the click resolves with no visible network wait. Also primes the SW / edge
// cache as a side effect.
const cache = new Map<string, Promise<FocusCardData>>();
const order: string[] = [];
const MAX_PREFETCH = 100;

export function prefetchCard(id: string): Promise<FocusCardData> {
	const existing = cache.get(id);
	if (existing) return existing;

	const p = getCardById(id).catch((e) => {
		// Drop failures so a later real navigation can retry.
		cache.delete(id);
		throw e;
	});
	cache.set(id, p);
	order.push(id);
	while (order.length > MAX_PREFETCH) {
		const evicted = order.shift();
		if (evicted && evicted !== id) cache.delete(evicted);
	}
	return p;
}

export function getPrefetched(id: string): Promise<FocusCardData> | undefined {
	return cache.get(id);
}

// Warm both the detail data and the large focus image for a grid card.
export function warmCard(card: { id: string; imageUrl: string }): void {
	prefetchCard(card.id).catch(() => {});
	if (typeof Image !== "undefined") {
		const img = new Image();
		img.src = card.imageUrl;
	}
}
