import type { CrossLink } from "../components/islands/cross-links";
import type { FocusCardData, PokemonSet } from "../server/card-mappers";
import { getCardForRouteFn } from "../server/corpus-server";
import {
	type CorpusIndex,
	hydrateCard,
	type I18nOverlay,
	setsById,
} from "../store/corpus/corpus-engine";
import type { DetailCard } from "../store/corpus/corpus-types";
import type { CardRouteParams } from "./card-route";
import type { SupportedLanguage } from "./languages";
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

type DetailFetcher = (
	params: CardRouteParams,
	lang: SupportedLanguage,
) => Promise<CardRouteData | null>;

// STATIC import of the server fn (matches how routes + the old card-overlay
// already pull it). Do NOT switch this to a dynamic `import("../server/...")`:
// corpus-server is also statically imported by the route bundle, so a dynamic
// import here forces it into its own chunk that the main bundle both statically
// and dynamically imports — a cross-chunk circular import whose eval order left
// createServerFn in the TDZ ("undefined is not a function") and crashed
// hydration in prod. createServerFn's client stub RPCs to the server; the
// handler body (node:zlib, external fetches) is stripped from the client bundle.
const defaultFetcher: DetailFetcher = async (params, lang) =>
	(await getCardForRouteFn({
		data: { ...params, lang },
	})) as CardRouteData | null;

// Client-side cache of the per-card RPC result, keyed by the slug triple. Caching
// the PROMISE dedupes concurrent opens/prefetches; a same-session re-open is then
// instant (no round trip). Evict on failure so a transient error doesn't poison.
const cache = new Map<string, Promise<CardRouteData | null>>();
// Resolved values mirror of `cache`, for synchronous reads during render: lets a
// re-opened or hover-prefetched card paint full detail on the FIRST frame (no
// loading flash). `undefined` = not resolved yet; a value (incl. null) = settled.
const valueCache = new Map<string, CardRouteData | null>();
// Lang is part of the key: switching language re-fetches the translated detail
// instead of reusing the previous locale's payload.
const keyOf = (p: CardRouteParams, lang: SupportedLanguage) =>
	`${lang}/${p.series}/${p.set}/${p.card}`;

/** Fetch (and cache) the card-detail payload for the overlay, in `lang`. */
export function getCardDetail(
	params: CardRouteParams,
	lang: SupportedLanguage = "en",
	fetcher: DetailFetcher = defaultFetcher,
): Promise<CardRouteData | null> {
	const key = keyOf(params, lang);
	let p = cache.get(key);
	if (!p) {
		p = fetcher(params, lang)
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
 * Synchronous peek at the resolved detail for a card in `lang`: the value
 * (possibly null) once the RPC has settled, else `undefined`. Used during
 * render so a warm card skips the optimistic/loading state entirely.
 */
export function peekCardDetail(
	params: CardRouteParams,
	lang: SupportedLanguage = "en",
): CardRouteData | null | undefined {
	return valueCache.get(keyOf(params, lang));
}

/** Warm the card-detail RPC on hover/focus. Fire-and-forget; errors swallowed. */
export function prefetchCardDetail(
	params: CardRouteParams,
	lang: SupportedLanguage = "en",
): void {
	void getCardDetail(params, lang).catch(() => {});
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
	detailById?: Map<string, DetailCard> | null,
	i18n?: I18nOverlay | null,
): FocusCardData | null {
	if (!slugIndex || !index || !sets) return null;
	const id = resolveCard(slugIndex, params.series, params.set, params.card);
	const corpusCard = id ? index.byId.get(id) : undefined;
	if (!corpusCard) return null;
	const holo = hydrateCard(corpusCard, setsById(sets), i18n);
	const detail = detailById?.get(corpusCard.id);
	return {
		...detail, // battle/flavor fields when offline detail is present; else nothing
		id: holo.id,
		imageUrl: holo.imageUrl,
		// Carry the language-invariant tail so the detail view can re-derive a
		// localized image (the corpus card has it; FocusCardData now keeps it).
		imageBase: corpusCard.imageBase,
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
