import { createServerFn } from "@tanstack/react-start";
import {
	fetchAllSets,
	fetchCardById,
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

export const getSetsFn = createServerFn({ method: "GET" }).handler(
	(): Promise<PokemonSet[]> => fetchAllSets(),
);

export const getCardByIdFn = createServerFn({ method: "GET" })
	.inputValidator((id: unknown) => nonEmptyString(id, "card id"))
	.handler(({ data: id }): Promise<FocusCardData> => fetchCardById(id));

export const getPokemonListFn = createServerFn({ method: "GET" }).handler(
	(): Promise<PokemonListEntry[]> => getPokemonListCached(),
);
