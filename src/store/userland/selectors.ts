// src/store/userland/selectors.ts
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import type { Region } from "../../lib/languages";
import type { PokemonSet } from "../../server/card-mappers";
import {
	type CorpusIndex,
	hydrateCard,
	type I18nOverlay,
	resolveCardAcrossRegions,
	setsById,
} from "../corpus/corpus-engine";
import {
	ensureRegionsForOwned,
	useCorpusRuntime,
} from "../corpus/corpus-runtime";
import { useActiveI18n } from "../corpus/i18n-active-hooks";
import { useStore } from "../index";
import { allLoadedSets } from "../sets-slice";
import {
	type BinderProgress,
	binderMembers,
	computeBinderProgress,
	type RegionCorpus,
} from "./binder-progress";
import {
	buildCardRows,
	type CardRow,
	type SortDir,
	type SortKey,
	sortCardRows,
} from "./card-rows";
import { groupByCardId, sumQuantity } from "./group";
import type { Stack } from "./types";
import { loadUserland, useUserland } from "./userland-store";

// --- Pure helpers (unit-tested) ---

/** Distinct owned cardIds from the items map. */
export function ownedCardIdSet(items: Record<string, Stack>): Set<string> {
	return new Set(Object.values(items).map((i) => i.cardId));
}

/**
 * Reactive set of distinct owned cardIds — a fresh Set built from the memoized
 * owned-index keys on each render (cheap; consumers depend on contents, not identity).
 */
export function useOwnedCardIdSet(): Set<string> {
	return new Set(useOwnedIndex().keys());
}

// groupByCardId + sumQuantity moved to ./group to break the card-rows↔selectors
// import cycle; re-exported here so existing `from "./selectors"` importers keep working.
export { groupByCardId, sumQuantity };

/**
 * Join owned stacks with corpus card data; returns one HoloCardData per distinct cardId.
 * Each cardId is resolved against every currently-loaded region index
 * (`resolveCardAcrossRegions`), so an owned card that only exists in the
 * `asia` index still renders. Only a card absent from every loaded index is
 * skipped (its region hasn't loaded yet).
 */
export function joinOwnedViews(
	items: Stack[],
	indices: Partial<Record<Region, CorpusIndex>>,
	setsById: Map<string, PokemonSet>,
	i18n?: I18nOverlay | null,
): HoloCardData[] {
	const seen = new Set<string>();
	const out: HoloCardData[] = [];
	for (const item of items) {
		if (seen.has(item.cardId)) continue;
		seen.add(item.cardId);
		const card = resolveCardAcrossRegions(item.cardId, indices);
		if (card) out.push(hydrateCard(card, setsById, i18n));
	}
	return out;
}

// --- Hooks ---
/** Idempotently hydrate the userland cache. Safe to call from many components. */
function useEnsureUserland(): void {
	useEffect(() => {
		void loadUserland();
	}, []);
}

/**
 * Side-effect only: lazily loads the asia corpus when `items` references a
 * cardId the west index can't resolve (e.g. a returning user's Asian
 * printings, synced before they ever switched display language). Runs in an
 * effect keyed on the `items` reference — not inline in a selector/useMemo
 * body — so it fires once per actual collection change instead of once per
 * render. It subscribes only to the boolean "is west loaded", so an asia load
 * it triggers (which never toggles that boolean) cannot re-fire the effect.
 */
function useEnsureOwnedRegions(items: Record<string, Stack>): void {
	// Re-run once the west baseline is present: ensureRegionsForOwned no-ops until
	// then (it can't distinguish "id unresolved" from "west not loaded yet"), so
	// without this the owned-Asian detection would either miss (early return) or,
	// before the guard, eagerly load asia for every collector.
	const westLoaded = useCorpusRuntime((s) => s.indices.west !== undefined);
	// biome-ignore lint/correctness/useExhaustiveDependencies: westLoaded is a deliberate re-trigger sentinel — ensureRegionsForOwned reads the west index via getState and no-ops until it is present, so we must re-run when west flips from absent to loaded even though the effect body never references the value.
	useEffect(() => {
		void ensureRegionsForOwned(ownedCardIdSet(items));
	}, [items, westLoaded]);
}

/**
 * Shared store reads for the corpus-join hooks: triggers userland hydration and
 * returns both the active-region `index` (for single-region lookups like
 * binder rule matching) and the full `indices` map (for cross-region owned
 * resolution), plus `sets`. Consumers read `items`/`binder` themselves and
 * apply their own `useMemo` join on top.
 */
function useCorpusJoinInputs() {
	useEnsureUserland();
	const index = useCorpusRuntime((s) => s.index);
	const indices = useCorpusRuntime((s) => s.indices);
	// Owned cards can belong to ANY loaded region (ids are globally unique), so
	// join against every loaded region's sets, not the bare west-only `sets` --
	// otherwise an owned Asian card renders with a raw set-id name. allLoadedSets
	// is memoized, so a plain subscription stays ref-stable.
	const sets = useStore(allLoadedSets);
	return { index, indices, sets };
}

const REGION_ORDER = ["west", "asia"] as const satisfies readonly Region[];

/**
 * Every loaded region paired with its own set list, for cross-region binder
 * rule matching (see `binderMembers`). Memoized on the store refs, so the array
 * is stable until a region's corpus or sets actually change.
 */
function useRegionCorpora(): RegionCorpus[] {
	const indices = useCorpusRuntime((s) => s.indices);
	const setsByRegion = useStore((s) => s.setsByRegion);
	const westSets = useStore((s) => s.sets);
	return useMemo(() => {
		const out: RegionCorpus[] = [];
		for (const region of REGION_ORDER) {
			const index = indices[region];
			if (!index) continue;
			const list =
				setsByRegion[region] ?? (region === "west" ? westSets : null);
			out.push({ index, setsMap: setsById(list ?? []) });
		}
		return out;
	}, [indices, setsByRegion, westSets]);
}

// Module-level single-entry memo for the grouped owned index. `groupByCardId` is
// O(stacks); running it in a per-component `useMemo` made it the expensive-selector
// trap — useIsOwned/useOwnedCount render inside CollectionToggle (one per card in
// the virtualized grid), so every stack write re-derived the whole index N×(×2).
// Keying on the `items` reference (which only changes on a write) collapses that to
// a single derive per write, shared across every subscriber. This is the skill's
// "compute once via a shared memoized selector" remedy for the S3 expensive bound.
let ownedIndexCache: {
	items: Record<string, Stack>;
	index: Map<string, Stack[]>;
} | null = null;
function ownedIndexOf(items: Record<string, Stack>): Map<string, Stack[]> {
	if (!ownedIndexCache || ownedIndexCache.items !== items) {
		ownedIndexCache = { items, index: groupByCardId(Object.values(items)) };
	}
	return ownedIndexCache.index;
}

/** Hook: returns all stacks grouped by cardId; triggers hydration as a side-effect. */
export function useOwnedIndex(): Map<string, Stack[]> {
	useEnsureUserland();
	// Selector returns the shared memoized Map — stable ref while `items` is
	// unchanged, so consumers only re-render when the collection actually changes.
	return useUserland((s) => ownedIndexOf(s.items));
}

/**
 * Hook: true if the user owns at least one stack of the given card. S3 — the
 * selector returns a primitive boolean, so a card tile re-renders only when *its
 * own* ownership flips, not on every unrelated stack write.
 */
export function useIsOwned(cardId: string): boolean {
	useEnsureUserland();
	return useUserland((s) => ownedIndexOf(s.items).has(cardId));
}

/**
 * Hook: total cards owned for the given card across its stacks (0 if none). S3 —
 * returns a primitive number, isolating the tile's re-render to its own count.
 */
export function useOwnedCount(cardId: string): number {
	useEnsureUserland();
	return useUserland((s) => {
		const stacks = ownedIndexOf(s.items).get(cardId);
		return stacks ? sumQuantity(stacks) : 0;
	});
}

/** Distinct owned cards joined with the corpus. [] until corpus + sets load. */
export function useOwnedCardViews(): HoloCardData[] {
	const items = useUserland((s) => s.items);
	const { indices, sets } = useCorpusJoinInputs();
	const i18n = useActiveI18n();
	useEnsureOwnedRegions(items);
	return useMemo(() => {
		if (!indices.west || !sets) return [];
		return joinOwnedViews(Object.values(items), indices, setsById(sets), i18n);
	}, [items, indices, sets, i18n]);
}

/**
 * Tally distinct owned cardIds into per-set counts, resolving each id against
 * every currently-loaded region index so an asia-only owned card still counts
 * toward its set.
 */
export function tallyOwnedBySet(
	cardIds: Iterable<string>,
	indices: Partial<Record<Region, CorpusIndex>>,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const id of cardIds) {
		const setId = resolveCardAcrossRegions(id, indices)?.setId;
		if (!setId) continue;
		counts.set(setId, (counts.get(setId) ?? 0) + 1);
	}
	return counts;
}

/** Owned distinct-card count per setId. Empty until the corpus loads. */
export function useOwnedCountBySet(): Map<string, number> {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	const indices = useCorpusRuntime((s) => s.indices);
	useEnsureOwnedRegions(items);
	return useMemo(() => {
		if (!indices.west) return new Map<string, number>();
		return tallyOwnedBySet(ownedCardIdSet(items), indices);
	}, [items, indices]);
}

/** All owned cards grouped by cardId, sorted by key+dir. [] until corpus + sets load. */
export function useOwnedCardRows(key: SortKey, dir: SortDir): CardRow[] {
	const items = useUserland((s) => s.items);
	const { indices, sets } = useCorpusJoinInputs();
	const i18n = useActiveI18n();
	useEnsureOwnedRegions(items);
	return useMemo(() => {
		if (!indices.west || !sets) return [];
		return sortCardRows(
			buildCardRows(Object.values(items), indices, setsById(sets), i18n),
			key,
			dir,
		);
	}, [items, indices, sets, key, dir, i18n]);
}

/** Hook: compute progress for a binder by id; null until corpus + sets + userland load. */
export function useBinderProgress(binderId: string): BinderProgress | null {
	useEnsureUserland();
	const binder = useUserland((s) => s.binders[binderId] ?? null);
	const items = useUserland((s) => s.items);
	const regions = useRegionCorpora();
	useEnsureOwnedRegions(items);
	return useMemo(() => {
		if (!binder || regions.length === 0) return null;
		return computeBinderProgress(binder, regions, ownedCardIdSet(items));
	}, [binder, items, regions]);
}

/** Hook: compute the member card-id set for a binder by id; null until a corpus loads. */
export function useBinderMembers(binderId: string): Set<string> | null {
	useEnsureUserland();
	const binder = useUserland((s) => s.binders[binderId] ?? null);
	const regions = useRegionCorpora();
	return useMemo(() => {
		if (!binder || regions.length === 0) return null;
		return binderMembers(binder, regions);
	}, [binder, regions]);
}
