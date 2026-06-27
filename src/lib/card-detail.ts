import { cdnImage } from "../components/holo-card/cdn-image";
import type { CrossLink } from "../components/islands/cross-links";
import type { FocusCardData, PokemonSet } from "../server/card-mappers";
import {
	type CorpusIndex,
	hydrateCard,
	setsById,
} from "../store/corpus/corpus-engine";
import type { CardRouteParams } from "./card-route";
import { resolveCard, type SlugIndex } from "./slug";

/** Resolved card-detail payload for the overlay (mirrors getCardForRouteFn). */
export interface CardRouteData {
	card: FocusCardData;
	crossLinks: CrossLink[];
}

/** Parse a `cardOverlay` history-state value ("series/set/slug") into params. */
export function parseCardOverlayParam(
	value: string | undefined,
): CardRouteParams | null {
	if (!value) return null;
	const [series, set, card] = value.split("/");
	if (!series || !set || !card) return null;
	return { series, set, card };
}

type DetailFetcher = (params: CardRouteParams) => Promise<CardRouteData | null>;

// Server-only corpus-server is imported dynamically (mirrors its own pattern) so
// this client/test-reachable module never pulls the server handler graph at the
// top level. The createServerFn stub it returns RPCs to our server on call.
const defaultFetcher: DetailFetcher = async (params) => {
	const { getCardForRouteFn } = await import("../server/corpus-server");
	return (await getCardForRouteFn({ data: params })) as CardRouteData | null;
};

// Client-side cache of the per-card RPC result, keyed by the slug triple. Caching
// the PROMISE dedupes concurrent opens/prefetches; a same-session re-open is then
// instant (no round trip). Evict on failure so a transient error doesn't poison.
const cache = new Map<string, Promise<CardRouteData | null>>();
// Resolved values mirror of `cache`, for synchronous reads during render: lets a
// re-opened or hover-prefetched card paint full detail on the FIRST frame (no
// loading flash). `undefined` = not resolved yet; a value (incl. null) = settled.
const valueCache = new Map<string, CardRouteData | null>();
const keyOf = (p: CardRouteParams) => `${p.series}/${p.set}/${p.card}`;

/** Fetch (and cache) the card-detail payload for the overlay. */
export function getCardDetail(
	params: CardRouteParams,
	fetcher: DetailFetcher = defaultFetcher,
): Promise<CardRouteData | null> {
	const key = keyOf(params);
	let p = cache.get(key);
	if (!p) {
		p = fetcher(params)
			.then((v) => {
				valueCache.set(key, v);
				return v;
			})
			.catch((e) => {
				cache.delete(key);
				throw e;
			});
		cache.set(key, p);
	}
	return p;
}

/**
 * Synchronous peek at the resolved detail for a card: the value (possibly null)
 * once the RPC has settled, else `undefined`. Used during render so a warm card
 * skips the optimistic/loading state entirely.
 */
export function peekCardDetail(
	params: CardRouteParams,
): CardRouteData | null | undefined {
	return valueCache.get(keyOf(params));
}

/** Warm the card-detail RPC on hover/focus. Fire-and-forget; errors swallowed. */
export function prefetchCardDetail(params: CardRouteParams): void {
	void getCardDetail(params).catch(() => {});
}

/** Warm the focus-size card art (1x + 2x) on hover/focus so the modal paints fast. */
export function prefetchFocusImage(imageUrl: string): void {
	if (typeof Image === "undefined") return;
	for (const dpr of [1, 2]) {
		const img = new Image();
		img.src = cdnImage(imageUrl, { w: 734, dpr });
	}
}

/**
 * Build a card the overlay can render IMMEDIATELY from the in-memory corpus —
 * no network. Carries everything the holo art + header need (image, name, set,
 * number, rarity, types); the battle stats / prices / setLogo are left absent
 * (all optional — consumers guard them) and fill in once the RPC resolves.
 * Null when the corpus/sets/slug index haven't loaded or the slug is unknown.
 */
export function optimisticCardFromCorpus(
	params: CardRouteParams,
	slugIndex: SlugIndex | null,
	index: CorpusIndex | null,
	sets: PokemonSet[] | null,
): FocusCardData | null {
	if (!slugIndex || !index || !sets) return null;
	const id = resolveCard(slugIndex, params.series, params.set, params.card);
	const corpusCard = id ? index.byId.get(id) : undefined;
	if (!corpusCard) return null;
	const holo = hydrateCard(corpusCard, setsById(sets));
	return {
		id: holo.id,
		imageUrl: holo.imageUrl,
		name: holo.name,
		rarity: holo.rarity,
		subtypes: holo.subtypes,
		types: holo.types,
		supertype: corpusCard.supertype,
		setId: holo.setId,
		setName: holo.setName,
		setSeries: holo.setSeries,
		setReleaseDate: holo.setReleaseDate,
		cardNumber: holo.cardNumber,
		nationalPokedexNumbers: holo.nationalPokedexNumbers,
	};
}

export function __resetCardDetailCacheForTests(): void {
	cache.clear();
	valueCache.clear();
}
