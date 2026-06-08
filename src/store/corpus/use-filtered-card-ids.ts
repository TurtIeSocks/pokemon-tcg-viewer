import { useMemo } from "react";
import {
	buildCorpusQuery,
	type ListContext,
	type ListSearch,
} from "../../lib/card-query";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../index";
import { useOwnedCardIdSet } from "../userland/selectors";
import { type CorpusIndex, queryCorpus, setsById } from "./corpus-engine";
import { useCorpusRuntime } from "./corpus-runtime";

/**
 * Pure core of {@link useFilteredCardIds}: the card IDs matching `search` +
 * `context`, in the same order the grid renders them, with the owned/missing
 * view filter applied. Falls back to `seedIds` (the SSR full set) until the
 * corpus + sets are in memory — mirroring the grid, which shows the seed until
 * the corpus takes over.
 */
export function filterCardIds(
	index: CorpusIndex | null,
	sets: PokemonSet[] | null,
	search: ListSearch,
	context: ListContext,
	ownedCardIds: Set<string>,
	seedIds: string[],
): string[] {
	if (!index || !sets) return seedIds;
	const all = queryCorpus(
		index,
		buildCorpusQuery(search, context),
		setsById(sets),
	);
	const list =
		search.owned === "all"
			? all
			: all.filter((c) =>
					search.owned === "owned"
						? ownedCardIds.has(c.id)
						: !ownedCardIds.has(c.id),
				);
	return list.map((c) => c.id);
}

/**
 * Card IDs the active list filters resolve to — the bulk-add/"All" target. When
 * `search`/`context` are omitted (a list with no filters, e.g. a series page),
 * returns `seedIds` unchanged. Otherwise it runs the same corpus query the grid
 * uses, so "Add all" / "Add N cards to binder" act on exactly what's displayed,
 * not the unfiltered set.
 */
export function useFilteredCardIds(
	search: ListSearch | undefined,
	context: ListContext | undefined,
	seedIds: string[],
): string[] {
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	const ownedCardIds = useOwnedCardIdSet();

	// Stable serialized identity of the query; only the owned *size* matters when
	// an owned/missing filter is active (matches the grid's queryKey strategy).
	const key = useMemo(
		() =>
			JSON.stringify([
				search,
				context,
				search && search.owned !== "all" ? ownedCardIds.size : null,
			]),
		[search, context, ownedCardIds],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` encodes search+context+owned; index/sets are stable refs that only change on load.
	return useMemo(() => {
		if (!search || !context) return seedIds;
		return filterCardIds(index, sets, search, context, ownedCardIds, seedIds);
	}, [index, sets, key, seedIds]);
}
