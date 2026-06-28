import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { ListSearch } from "../lib/card-query";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
import { findSet } from "../lib/nav-tree";
import { slugify } from "../lib/slug";
import type { SearchMode } from "../store/corpus/fuzzy";
import { cacheControl } from "./cache-headers";
import { nameByDex } from "./pokemon-dex";
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

/** All cards in a set, natural (number) order. */
export const getSetCardsFn = createServerFn({ method: "GET" })
	.inputValidator((setId: unknown) => nonEmptyString(setId, "setId"))
	.handler(async ({ data: setId }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({ setId, relevance: false });
	});

/**
 * Global name search, relevance order. `mode` (default "fuzzy") controls
 * whether typo-tolerant fuzzy matching is used so the server seed + total
 * match the client grid when the search page is in a non-fuzzy mode.
 */
export const searchCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as { query?: unknown; mode?: unknown };
		const m = o.mode;
		const mode: SearchMode =
			m === "exact" || m === "contains" || m === "fuzzy" ? m : "fuzzy";
		return { query: nonEmptyString(o.query, "query"), mode };
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({
			query: data.query,
			setId: null,
			relevance: true,
			mode: data.mode,
		});
	});

/** All cards for a national-dex number, across sets. */
export const getDexCardsFn = createServerFn({ method: "GET" })
	.inputValidator((dex: unknown) => boundedInt(dex, "dex", 1, MAX_DEX))
	.handler(async ({ data: dex }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({ dexNumber: dex, setId: null, relevance: false });
	});

/** All cards of one supertype (Trainer/Energy category browse), across sets. */
export const getSupertypeCardsFn = createServerFn({ method: "GET" })
	.inputValidator((s: unknown) => supertypeName(s))
	.handler(async ({ data: supertype }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({
			setId: null,
			filters: { supertypes: [supertype] },
			chronological: true,
			relevance: false,
		});
	});

/** All printings of one named card within a supertype, across sets. */
export const getNamedCardsFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as { supertype?: unknown; name?: unknown };
		return {
			supertype: supertypeName(o.supertype),
			name: nonEmptyString(o.name, "name"),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({
			setId: null,
			filters: { supertypes: [data.supertype] },
			nameSlug: data.name,
			chronological: true,
			relevance: false,
		});
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
		};
		return {
			series: nonEmptyString(o.series, "series"),
			set: nonEmptyString(o.set, "set"),
			card: nonEmptyString(o.card, "card"),
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

		const tree = await loadNavTree();
		const set = findSet(tree, data.series, data.set);
		if (!set) return null;
		const cardId = await resolveCardInSet(set.id, data.card);
		if (!cardId) return null;

		// Card fetch + species list are independent once we have the id.
		const [card, list] = await Promise.all([
			getCardByIdCached(cardId),
			getPokemonListCached(),
		]);

		const crossLinks: RouteCrossLink[] = [];
		for (const dex of card.nationalPokedexNumbers ?? []) {
			const name = nameByDex(list, dex);
			if (name) {
				crossLinks.push({
					label: `View all ${name.replace(/-/g, " ")}`,
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

		return { card, crossLinks };
	});
