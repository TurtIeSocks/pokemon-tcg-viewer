import { createServerFn } from "@tanstack/react-start";
import { buildSetCardSlugs } from "../lib/card-slugs";
import { boundedInt, nonEmptyString } from "./validate";

// National Pokédex upper bound — matches the species-list fetch limit.
const MAX_DEX = 1025;

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

/** Global name search, relevance order. */
export const searchCardsFn = createServerFn({ method: "GET" })
	.inputValidator((query: unknown) => nonEmptyString(query, "query"))
	.handler(async ({ data: query }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({ query, setId: null, relevance: true });
	});

/** All cards for a national-dex number, across sets. */
export const getDexCardsFn = createServerFn({ method: "GET" })
	.inputValidator((dex: unknown) => boundedInt(dex, "dex", 1, MAX_DEX))
	.handler(async ({ data: dex }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		return queryCorpusServer({ dexNumber: dex, setId: null, relevance: false });
	});

/**
 * Resolve a card slug within a set → card id (or null). Server fn so the $card
 * route loader never imports the raw resolver (which pulls node:zlib).
 */
export const resolveCardInSetFn = createServerFn({ method: "GET" })
	.inputValidator((input: unknown) => {
		const o = (input ?? {}) as { setId?: unknown; cardSlug?: unknown };
		return {
			setId: nonEmptyString(o.setId, "setId"),
			cardSlug: nonEmptyString(o.cardSlug, "cardSlug"),
		};
	})
	.handler(async ({ data }) => {
		const { queryCorpusServer } = await import("./corpus-loader");
		const all = await queryCorpusServer({
			setId: data.setId,
			relevance: false,
		});
		return buildSetCardSlugs(all).idBySlug.get(data.cardSlug) ?? null;
	});
