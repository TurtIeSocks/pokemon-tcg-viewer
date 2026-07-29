import { createServerFn } from "@tanstack/react-start";
import {
	isSupportedLanguage,
	REGION_BASE_LANGUAGE,
	regionForLanguage,
} from "../lib/languages";
import {
	fetchCardById,
	getAllSetsCached,
	getPokemonListCached,
} from "./card-data-fetch";
import type {
	FocusCardData,
	PokemonListEntry,
	PokemonSet,
} from "./card-mappers";
import { nonEmptyString } from "./validate";

// createServerFn wrappers — the ONLY client-facing card-data surface. The raw
// fetchers live in ./card-data-fetch (server-only). Input validators reject
// malformed RPC input rather than passing it straight through to a fetch.

/**
 * Parse+normalize the optional `{ lang }` input into a region base language:
 * absent/unsupported/omitted -> "en" (west), matching today's no-arg callers
 * byte-for-byte. A supported Asian language resolves to its region's base
 * language ("ja") so `fetchAllSets` reads the Asian-region catalog.
 */
function parseSetsLangInput(input: unknown): string {
	if (input == null) return "en";
	const o = input as { lang?: unknown };
	if (typeof o.lang === "string" && isSupportedLanguage(o.lang))
		return REGION_BASE_LANGUAGE[regionForLanguage(o.lang)];
	return "en";
}

export const getSetsFn = createServerFn({ method: "GET" })
	.inputValidator(parseSetsLangInput)
	.handler(
		({ data: baseLang }): Promise<PokemonSet[]> => getAllSetsCached(baseLang),
	);

export const getCardByIdFn = createServerFn({ method: "GET" })
	.inputValidator((id: unknown) => nonEmptyString(id, "card id"))
	.handler(({ data: id }): Promise<FocusCardData> => fetchCardById(id));

export const getPokemonListFn = createServerFn({ method: "GET" }).handler(
	(): Promise<PokemonListEntry[]> => getPokemonListCached(),
);
