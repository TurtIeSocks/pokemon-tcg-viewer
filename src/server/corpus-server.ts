import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { ListSearch } from "../lib/card-query";
import {
	isSupportedLanguage,
	regionForLanguage,
	type SupportedLanguage,
} from "../lib/languages";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
import { findSeries } from "../lib/nav-tree";
import { slugify } from "../lib/slug";
import type { SearchMode } from "../store/corpus/fuzzy";
import { cacheControl } from "./cache-headers";
import { buildPokedex, nameByDex } from "./pokemon-dex";
import { boundedInt, nonEmptyString, supertypeName } from "./validate";

// National Pokédex upper bound — matches the species-list fetch limit.
const MAX_DEX = 1025;

// Serializable cross-link returned by getCardForRouteFn. Deliberately NOT typed
// as the router's LinkProps (which CrossLink uses): LinkProps permits an Updater
// function for `hash`/`search`, and a server fn's return must be serializable —
// TanStack's type check rejects any function-valued field. These literal shapes
// carry only strings + the all-primitive ListSearch, and stay assignable to
// CrossLink at the consumer (CardCrossLinks).
interface RouteCrossLink {
	label: string;
	link:
		| { to: "/pokemon/$name"; params: { name: string } }
		| { to: "/trainer/$name"; params: { name: string } }
		| { to: "/energy/$name"; params: { name: string } }
		| {
				to: "/$series/$set";
				params: { series: string; set: string };
				search: ListSearch;
		  };
}

// createServerFn wrappers — the ONLY corpus entry points routes may use. The
// corpus loader (node:zlib, /corpus fetch) lives in ./corpus-loader and is
// imported *dynamically* inside each handler, so neither this module's client
// stub nor the dev bundle ever pulls node:zlib into the browser. A loader
// calling these runs the body server-side on SSR and RPCs to our server on
// client navigation.

/** Parse+normalize an optional `lang` field: unsupported/absent → "en" (west). */
function optionalLang(value: unknown): SupportedLanguage {
	return typeof value === "string" && isSupportedLanguage(value) ? value : "en";
}

/** All cards in a set, natural (number) order. */
export const getSetCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		// Back-compat: existing callers pass a bare setId string. New callers may
		// pass { setId, lang } to select the card's region.
		if (typeof input === "string" || input == null)
			return { setId: nonEmptyString(input, "setId"), lang: "en" };
		const o = input as { setId?: unknown; lang?: unknown };
		return {
			setId: nonEmptyString(o.setId, "setId"),
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const region = regionForLanguage(data.lang);
		return queryCorpusServer({ setId: data.setId, relevance: false }, region);
	});

/**
 * Global name search, relevance order. `mode` (default "fuzzy") controls
 * whether typo-tolerant fuzzy matching is used so the server seed + total
 * match the client grid when the search page is in a non-fuzzy mode.
 */
export const searchCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as {
			query?: unknown;
			mode?: unknown;
			lang?: unknown;
		};
		const m = o.mode;
		const mode: SearchMode =
			m === "exact" || m === "contains" || m === "fuzzy" ? m : "fuzzy";
		return {
			query: nonEmptyString(o.query, "query"),
			mode,
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const region = regionForLanguage(data.lang);
		return queryCorpusServer(
			{
				query: data.query,
				setId: null,
				relevance: true,
				mode: data.mode,
			},
			region,
		);
	});

/** All cards for a national-dex number, across sets. */
export const getDexCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		// Back-compat: existing callers pass a bare dex number. New callers may
		// pass { dex, lang } to select the card's region.
		if (typeof input === "number" || typeof input === "string")
			return { dex: boundedInt(input, "dex", 1, MAX_DEX), lang: "en" };
		const o = (input ?? {}) as { dex?: unknown; lang?: unknown };
		return {
			dex: boundedInt(o.dex, "dex", 1, MAX_DEX),
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const region = regionForLanguage(data.lang);
		return queryCorpusServer(
			{ dexNumber: data.dex, setId: null, relevance: false },
			region,
		);
	});

/** All cards of one supertype (Trainer/Energy category browse), across sets. */
export const getSupertypeCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		// Back-compat: existing callers pass a bare supertype string. New callers
		// may pass { supertype, lang } to select the card's region.
		if (typeof input === "string")
			return { supertype: supertypeName(input), lang: "en" };
		const o = (input ?? {}) as { supertype?: unknown; lang?: unknown };
		return {
			supertype: supertypeName(o.supertype),
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const region = regionForLanguage(data.lang);
		return queryCorpusServer(
			{
				setId: null,
				filters: { supertypes: [data.supertype] },
				chronological: true,
				relevance: false,
			},
			region,
		);
	});

/** All printings of one named card within a supertype, across sets. */
export const getNamedCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as {
			supertype?: unknown;
			name?: unknown;
			lang?: unknown;
		};
		return {
			supertype: supertypeName(o.supertype),
			name: nonEmptyString(o.name, "name"),
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const region = regionForLanguage(data.lang);
		return queryCorpusServer(
			{
				setId: null,
				filters: { supertypes: [data.supertype] },
				nameSlug: data.name,
				chronological: true,
				relevance: false,
			},
			region,
		);
	});

/**
 * Resolve everything the card-detail route needs in ONE round trip: nav tree →
 * set → card id → full card + cross-links. Replaces the old three-RPC waterfall
 * (getNavTreeFn → resolveCardInSetFn → getCardByIdFn) the loader used to run on
 * every click — on client navigation each createServerFn is its own HTTP hop, so
 * three serial hops (the last gated on an external API) made opening a card slow.
 * Here the nav tree, corpus, pokémon list, and card fetch are all memoized and
 * run in-process, server-side. Returns null (not a thrown notFound) so the
 * caller decides how to surface "not found".
 */
export const getCardForRouteFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as {
			series?: unknown;
			set?: unknown;
			card?: unknown;
			lang?: unknown;
		};
		return {
			series: nonEmptyString(o.series, "series"),
			set: nonEmptyString(o.set, "set"),
			card: nonEmptyString(o.card, "card"),
			// Optional display language; non-supported/absent → English detail.
			lang: optionalLang(o.lang),
		};
	})
	.handler(async ({ data }) => {
		// Card detail is effectively static (prices drift slowly). Let the CDN/edge
		// serve repeat opens across users + survive server cold starts — far beyond
		// the per-process memo in card-data-fetch. SWR keeps it instant while stale.
		setResponseHeader("Cache-Control", cacheControl("ssr"));

		const { loadNavTree } = await import("./nav-tree");
		const { resolveCardInSet } = await import("./card-resolve");
		const { getCardByIdCached, getPokemonListCached } = await import(
			"./card-data-fetch"
		);
		const { getServerCorpusCard } = await import("./corpus-loader");
		const { withCorpusImage } = await import("../lib/card-image");
		const { corpusCardToFocus } = await import("./card-mappers");
		const { OVERLAY_SET_IDS } = await import("../lib/corpus/overlay-sets");

		const region = regionForLanguage(data.lang);

		const tree = await loadNavTree(region);
		const series = findSeries(tree, data.series);
		const set = series?.sets.find((s) => s.slug === data.set);
		if (!series || !set) return null;
		const cardId = await resolveCardInSet(set.id, data.card, region);
		if (!cardId) return null;

		// Card fetch (in the requested language) + species list + the corpus card
		// are independent once we have the id. The corpus card reconciles the image
		// (below); a failure there must not break the card load, so tolerate
		// undefined (keeps the live-fetched image as the fallback).
		//
		// Overlay cards (the tcgcsv JP fill — sets in OVERLAY_SET_IDS) exist ONLY in
		// the corpus; TCGdex serves them with an empty cards[], so the live fetch
		// 404s. Swallow ONLY that 404 (a genuine "no source record"), never a real
		// fetch failure — those still surface as an error. A 404 for a NON-overlay
		// card keeps the not-found signal (return null → notFound below).
		const [liveCard, list, corpusCard] = await Promise.all([
			getCardByIdCached(cardId, data.lang).catch((e) => {
				if (e instanceof Response && e.status === 404) return null;
				throw e;
			}),
			getPokemonListCached(),
			getServerCorpusCard(cardId, region).catch(() => undefined),
		]);

		// Degrade an overlay card (no live detail record) to a corpus-synthesized
		// detail: image + name + number + rarity + set, no battle data. Any other
		// missing card is a genuine not-found.
		const card =
			liveCard ??
			(corpusCard && OVERLAY_SET_IDS.has(set.id)
				? corpusCardToFocus(corpusCard, {
						name: set.name,
						series: series.name,
						releaseDate: set.releaseDate,
						logo: set.logo,
					})
				: null);
		if (!card) return null;

		const crossLinks: RouteCrossLink[] = [];
		for (const dex of card.nationalPokedexNumbers ?? []) {
			const name = nameByDex(list, dex);
			if (name) {
				// Title-case the dex slug for display ("mr-mime" -> "Mr Mime") so the
				// species link reads like the proper-cased Trainer/Energy links below;
				// the route param keeps the raw slug.
				const display = name
					.replace(/-/g, " ")
					.replace(/\b\w/g, (c) => c.toUpperCase());
				crossLinks.push({
					label: `View all ${display}`,
					link: { to: "/pokemon/$name", params: { name } },
				});
			}
		}
		// Trainer/Energy cards recur by name (no dex); link to their per-name page.
		if (card.supertype === "Trainer" || card.supertype === "Energy") {
			crossLinks.push({
				label: `View all ${card.name}`,
				link: {
					to: card.supertype === "Trainer" ? "/trainer/$name" : "/energy/$name",
					params: { name: slugify(card.name) },
				},
			});
		}
		crossLinks.push({
			label: `Go to ${card.setName}`,
			link: {
				to: "/$series/$set",
				params: { series: data.series, set: data.set },
				search: LIST_SEARCH_DEFAULTS,
			},
		});

		// A card's TCGdex SetBrief carries no serie/releaseDate, so the live mapper
		// leaves setSeries/setReleaseDate empty. Join them from the nav tree here
		// (a fresh copy — never mutate the per-process cached card). withCorpusImage
		// then swaps in the authoritative corpus image (the tcgcsv JP overlay fill /
		// suppressed blank) so SSR emits the same image the grid shows — no
		// wrong-image flash before the client corpus loads.
		//
		// Presentation fields also come from the corpus when it has the card: the
		// live TCGdex detail flattens vintage "Rare Holo" → "Rare" and renames foil
		// families ("Shiny rare V"), which would drive the WRONG holo effect on the
		// focus card while the grid (corpus-fed) shows the right one. The corpus
		// also carries the TCGplayer printing variants the live detail lacks.
		const enriched = withCorpusImage(
			{
				...card,
				setSeries: series.name,
				setReleaseDate: set.releaseDate,
				rarity: corpusCard?.rarity ?? card.rarity,
				subtypes: corpusCard?.subtypes ?? card.subtypes,
				variants: corpusCard?.variants ?? card.variants,
			},
			corpusCard,
		);
		return { card: enriched, crossLinks };
	});

/**
 * National-dex directory: one light row per species that has at least one card.
 * Joins the cached species list with a single pass over the server corpus.
 * Highly cacheable (corpus is static) so let the edge serve repeats.
 */
export const getPokedexFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as { lang?: unknown };
		return { lang: optionalLang(o.lang) };
	})
	.handler(async ({ data }) => {
		setResponseHeader("Cache-Control", cacheControl("ssr"));
		const region = regionForLanguage(data.lang);
		const [{ queryCorpusServer }, { getPokemonListCached }] = await Promise.all(
			[import("./corpus-loader"), import("./card-data-fetch")],
		);
		const [cards, list] = await Promise.all([
			queryCorpusServer({ setId: null, relevance: false }, region),
			getPokemonListCached(),
		]);
		return buildPokedex(cards, list);
	});
