import { Link, type LinkProps } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { prefetchCardDetail } from "../../lib/card-detail";
import {
	buildCorpusQuery,
	type ListContext,
	type ListSearch,
} from "../../lib/card-query";
import { cardRouteParams } from "../../lib/card-route";
import { useStore } from "../../store";
import {
	loadCorpus,
	makeCorpusFetcher,
	type OwnedFilter,
	useCorpusRuntime,
	useSlugIndex,
} from "../../store/corpus/corpus-runtime";
import { loadDetail } from "../../store/corpus/detail-runtime";
import {
	useActiveI18nKey,
	useDisplayLanguage,
	useEnsureI18n,
} from "../../store/corpus/i18n-active-hooks";
import { setsForRegion } from "../../store/sets-slice";
import { useOwnedCardIdSet } from "../../store/userland/selectors";
import { CollectionToggle } from "../collection-toggle";
import { cardThumbSrc, type HoloCardData, holoCardProps } from "../holo-card";
import { useCardSelection } from "./card-selection";
import { FlipCard } from "./flip-card";
import { HoloCardIsland } from "./holo-card-island";
import { PokemonTimeline } from "./pokemon-timeline";

export interface GridCard extends HoloCardData {
	slug?: string;
}

interface CardGridIslandProps {
	search: ListSearch;
	context: ListContext;
	/** SSR-rendered first page; shown until the corpus takes over. */
	seedCards: GridCard[];
	seedTotal: number;
	/** Build the card-route link props for a card (per-page slug scheme). */
	cardHref: (card: HoloCardData) => LinkProps;
}

const PAGE = 40;

export function CardGridIsland({
	search,
	context,
	seedCards,
	seedTotal,
	cardHref,
}: CardGridIslandProps) {
	const corpusReady = useCorpusRuntime((s) => s.index !== null);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	// Gate on sets too: the corpus hydrates cards from the sets list, and the
	// per-query cache is keyed only by the corpus index — querying before sets
	// arrive would cache cards with raw set IDs and no date sort until the next
	// corpus reload. Gate on the ACTIVE region's sets (not the bare west-only
	// `sets` field) so an asia grid waits for the asia sets, not the western
	// ones. Both load on mount; sets is the smaller fetch so this rarely blocks.
	// If sets fails, the grid stays on the correct SSR seed.
	const setsReady = useStore(
		(s) => setsForRegion(s, activeRegion) !== undefined,
	);
	const ready = corpusReady && setsReady;
	const [cards, setCards] = useState<HoloCardData[]>(seedCards);
	const [total, setTotal] = useState(seedTotal);
	const pageRef = useRef(1);
	const loadingMoreRef = useRef(false);

	const slugIndex = useSlugIndex();
	const ownedCardIds = useOwnedCardIdSet();
	const ownedFilter: OwnedFilter | undefined =
		search.owned === "all" ? undefined : { mode: search.owned, ownedCardIds };

	// Lazily load the active display-language overlay (no-op for en) and re-fetch
	// the grid when the language (or its loaded overlay version) changes so
	// localized names/images replace EN — including once the overlay finishes
	// downloading after a switch.
	useEnsureI18n();
	const i18nKey = useActiveI18nKey();
	const displayLang = useDisplayLanguage();

	// Stable key for the active query; changing it resets pagination.
	// Include owned mode + count so toggling the filter / adding a card refetches,
	// and the active-language key so a switch (or overlay load) re-derives rows.
	const queryKey = useMemo(
		() =>
			JSON.stringify([
				search,
				context,
				search.owned !== "all" ? ownedCardIds.size : null,
				i18nKey,
			]),
		[search, context, ownedCardIds, i18nKey],
	);

	useEffect(() => {
		// Skip in test environments — loadCorpus is a network-dependent singleton
		// whose inFlight promise leaks across test files via module state.
		if (typeof process !== "undefined" && process.env.NODE_ENV === "test")
			return;
		void loadCorpus();
		// The client corpus hydrates cards with set metadata (name, series for the
		// holo era, release date for ordering) from useStore.sets. Load it too, or
		// the live grid falls back to raw set IDs and loses date sorting. loadSets
		// is freshness-gated + idempotent; the legacy SPA boot that called it was
		// removed during the migration, orphaning the slice.
		void useStore.getState().loadSets();
		// Hydrate the offline card-detail blob from IDB on boot. No-op when the
		// feature is disabled (the user has not opted in).
		void loadDetail();
	}, []);

	// (Re)load page 1 from the corpus whenever the query or readiness changes.
	// queryKey is the serialized identity of [search, context]; depending on the
	// raw objects (fresh refs every parent render) would re-fire on every render.
	// The `cancelled` guard drops a stale resolve when the query changes mid-flight
	// so fast filter edits can't let an older result win (last-write race).
	// biome-ignore lint/correctness/useExhaustiveDependencies: queryKey encodes search+context+owned; ownedFilter derived from same.
	useEffect(() => {
		if (!ready) return;
		let cancelled = false;
		const fetcher = makeCorpusFetcher(
			buildCorpusQuery(search, context),
			ownedFilter,
		);
		pageRef.current = 1;
		loadingMoreRef.current = false;
		void fetcher(queryKey, 1, PAGE).then((r) => {
			if (cancelled) return;
			setCards(r.cards);
			setTotal(r.totalCount);
		});
		return () => {
			cancelled = true;
		};
	}, [ready, queryKey]);

	const loadMore = () => {
		// Virtuoso's endReached can fire repeatedly; the ref gate keeps a single
		// page request in flight so pages aren't skipped or appended twice.
		if (!ready || loadingMoreRef.current) return;
		if (cards.length >= total) return;
		loadingMoreRef.current = true;
		const next = pageRef.current + 1;
		const fetcher = makeCorpusFetcher(
			buildCorpusQuery(search, context),
			ownedFilter,
		);
		void fetcher(queryKey, next, PAGE)
			.then((r) => {
				pageRef.current = next;
				setCards((cur) => [...cur, ...r.cards]);
			})
			.finally(() => {
				loadingMoreRef.current = false;
			});
	};

	const {
		active: selectActive,
		selected,
		toggle: toggleCard,
	} = useCardSelection();

	const renderCard = (card: HoloCardData) => {
		const isSelected = selected.has(card.id);

		// Warm the detail RPC (data only) on hover/focus so the click-to-modal is
		// near-instant. The full-res image is deliberately NOT prefetched here, to
		// avoid pulling a ~84KB hires for every card skimmed; it loads on open over
		// a cached thumbnail. Skip in select mode (a click toggles selection).
		const params = slugIndex ? cardRouteParams(slugIndex, card) : null;
		const onPrefetch =
			selectActive || !params
				? undefined
				: () => prefetchCardDetail(params, displayLang);

		const cardContent = (
			<FlipCard imageUrl={cardThumbSrc(card)}>
				<HoloCardIsland
					{...holoCardProps(card)}
					onPrefetch={onPrefetch}
					hoverOverlay={
						selectActive ? undefined : <CollectionToggle card={card} />
					}
				/>
				{selectActive && (
					<div
						aria-hidden="true"
						className={`absolute inset-0 rounded-lg transition-opacity ${isSelected ? "bg-primary/40 opacity-100" : "opacity-0"}`}
					>
						{isSelected && (
							<div className="flex h-full items-center justify-center">
								<Check className="size-10 text-white drop-shadow" />
							</div>
						)}
					</div>
				)}
			</FlipCard>
		);

		if (selectActive) {
			return (
				<button
					type="button"
					className="block w-full cursor-pointer"
					aria-pressed={isSelected}
					aria-label={`${isSelected ? "Deselect" : "Select"} ${card.name}`}
					onClick={() => toggleCard(card.id)}
				>
					{cardContent}
				</button>
			);
		}

		return (
			<Link {...cardHref(card)} className="block">
				{cardContent}
			</Link>
		);
	};

	if (search.view === "timeline") {
		return (
			<div className="h-full overflow-y-auto">
				<PokemonTimeline
					cards={cards}
					cardHref={cardHref}
					onEndReached={cards.length < total ? loadMore : undefined}
				/>
			</div>
		);
	}

	// Test/no-layout fallback: render a plain list so the grid is assertable and
	// SSR-equivalent when Virtuoso can't measure (happy-dom). Virtuoso requires a
	// non-zero-height container to paint items; in happy-dom the container always
	// measures 0 so the item list stays empty. We detect the test environment via
	// ResizeObserver stub or NODE_ENV so production is never affected.
	const isTestEnv =
		(typeof window !== "undefined" && !("ResizeObserver" in window)) ||
		(typeof process !== "undefined" && process.env.NODE_ENV === "test");
	if (isTestEnv) {
		return (
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((c) => (
					<li key={c.id}>{renderCard(c)}</li>
				))}
			</ul>
		);
	}

	return (
		<VirtuosoGrid
			className="h-full"
			totalCount={cards.length}
			endReached={loadMore}
			listClassName="grid grid-cols-2 gap-3 m-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			itemContent={(index) => {
				const card = cards[index];
				return card ? renderCard(card) : null;
			}}
		/>
	);
}
