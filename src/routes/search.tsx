import {
	createFileRoute,
	type LinkProps,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { HoloCardData } from "../components/holo-card";
import { CardGridIsland } from "../components/islands/card-grid-island";
import { CardSelectionProvider } from "../components/islands/card-selection";
import { CardSortControl } from "../components/islands/card-sort-control";
import { SearchControls } from "../components/islands/search-controls";
import { ViewModeToggle } from "../components/islands/view-mode-toggle";
import { ResultsBar } from "../components/results-bar";
import { SelectAndBulkAdd } from "../components/vault/select-and-bulk-add";
import { buildCorpusQuery } from "../lib/card-query";
import { cardModalLinkProps } from "../lib/card-route";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../lib/list-search";
import { toSerializedQuery } from "../lib/serialized-query";
import { getPokemonListFn } from "../server/card-data";
import { searchCardsFn } from "../server/corpus-server";
import { nameByDex } from "../server/pokemon-dex";
import { deriveFacets, type SetFacets } from "../server/set-facets";
import { useStore } from "../store";
import { queryCorpus, setsById } from "../store/corpus/corpus-engine";
import { useCorpusRuntime, useSlugIndex } from "../store/corpus/corpus-runtime";
import { useRecentsStore } from "../store/recents";
import { setsForRegion } from "../store/sets-slice";

export const Route = createFileRoute("/search")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loaderDeps: ({ search }) => ({ q: search.q, mode: search.mode }),
	// Search-as-you-type re-runs the loader on every keystroke (q is a loaderDep).
	// The app-wide RoutePending swap (defaultPendingMs 150ms) would replace this
	// whole route mid-type, unmounting the search box and stealing focus + flashing
	// the page. `Infinity` is TanStack's sentinel that disables the pending timeout
	// (router-core checks `pendingMs !== Infinity`), so stale-while-revalidate keeps
	// the current results mounted while the next search resolves — no flash, no blur.
	// ponytail: per-keystroke server RPC remains (the live grid already searches the
	// in-memory corpus); add a debounce or drop q from loaderDeps if it becomes a cost.
	pendingMs: Number.POSITIVE_INFINITY,
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0, facets: deriveFacets([]) };
		// Species list runs in parallel with the search; it labels the Pokémon
		// filter options (dex number → species name).
		const [all, list] = await Promise.all([
			searchCardsFn({ data: { query: q, mode: deps.mode } }),
			getPokemonListFn(),
		]);
		const cards = all.slice(0, 40);
		const facets = deriveFacets(cards, (dex) => nameByDex(list, dex));
		return { q, cards, total: all.length, facets };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.q
					? `"${loaderData.q}" · Pokémon TCG search`
					: "Search · Pokémon TCG",
			},
			{
				name: "description",
				content: `Search results for ${loaderData?.q ?? ""}.`,
			},
		],
	}),
	component: SearchPage,
});

function SearchPage() {
	const { q, cards, total, facets } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const addRecentSearch = useRecentsStore((s) => s.addRecentSearch);
	// Record the active query so the home page's recent-searches list populates.
	// addRecentSearch trims/dedupes/caps internally; the effect is client-only
	// (skips SSR/prerender). The legacy search page did this pre-migration.
	useEffect(() => {
		addRecentSearch(q);
	}, [q, addRecentSearch]);
	// Push a search-param patch to the URL (re-runs the loader). viewTransition off:
	// in-page filter/view changes shouldn't crossfade.
	const applyPatch = useCallback(
		(patch: Parameters<typeof listSearchToUrl>[0]) =>
			navigate({
				search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
				viewTransition: false,
			}),
		[navigate],
	);
	// Debounce search-as-you-type: the q loader re-runs a server-fn RPC on every URL
	// change, while the live grid already filters the in-memory corpus instantly — so
	// only the URL/loader waits for a typing pause (filter/view/sort apply at once).
	// The uncontrolled search input shows each keystroke live regardless.
	const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (qTimer.current) clearTimeout(qTimer.current);
		},
		[],
	);
	const onChange = useCallback(
		(patch: Parameters<typeof listSearchToUrl>[0]) => {
			const isTyping = "q" in patch && Object.keys(patch).length === 1;
			if (!isTyping) return applyPatch(patch);
			if (qTimer.current) clearTimeout(qTimer.current);
			qTimer.current = setTimeout(() => applyPatch(patch), 250);
		},
		[applyPatch],
	);

	// Corpus + sets for BulkAddMenu cardIds derivation. Search is scoped to the
	// active-region catalog, so this reads that region's sets (not always west).
	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));
	const bulkCardIds = useMemo(() => {
		if (!index || !sets) return [];
		return queryCorpus(index, buildCorpusQuery(search, {}), setsById(sets)).map(
			(c) => c.id,
		);
	}, [index, sets, search]);

	// Search results span many sets, so each card's detail link is resolved from
	// the client corpus (same slugs the detail route uses). Falls back to a no-op
	// until the corpus + sets load — the live grid pulls cards from that same
	// corpus, so server-side enrichment of the SSR seed alone wouldn't cover it.
	const slugIndex = useSlugIndex();
	const cardHref = useCallback(
		(card: HoloCardData): LinkProps =>
			(slugIndex ? cardModalLinkProps(slugIndex, card) : null) ?? {
				to: "/search",
				search,
			},
		[slugIndex, search],
	);

	return (
		<CardSelectionProvider>
			<SearchPageInner
				q={q}
				total={total}
				cards={cards}
				search={search}
				onChange={onChange}
				options={facets}
				bulkCardIds={bulkCardIds}
				cardHref={cardHref}
			/>
		</CardSelectionProvider>
	);
}

interface SearchPageInnerProps {
	q: string;
	total: number;
	cards: HoloCardData[];
	search: ReturnType<typeof Route.useSearch>;
	onChange: (patch: Parameters<typeof listSearchToUrl>[0]) => void;
	options: SetFacets;
	bulkCardIds: string[];
	cardHref: (card: HoloCardData) => LinkProps;
}

function SearchPageInner({
	q,
	total,
	cards,
	search,
	onChange,
	options,
	bulkCardIds,
	cardHref,
}: SearchPageInnerProps) {
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 shrink-0">
				<SearchControls
					value={search}
					options={options}
					onChange={onChange}
					placeholder="Search all cards"
					showYearFilter
					showPokemonFilter
				/>
			</div>
			<ResultsBar count={q ? total : null}>
				{q ? (
					<SelectAndBulkAdd
						cardIds={bulkCardIds}
						ruleQuery={toSerializedQuery(search, {})}
					/>
				) : null}
				<ViewModeToggle
					value={search.view}
					disabled={!q}
					onChange={(view) => onChange({ view })}
				/>
				<CardSortControl value={search} onChange={onChange} />
			</ResultsBar>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					search={search}
					context={{}}
					seedCards={cards}
					seedTotal={total}
					cardHref={cardHref}
				/>
			</div>
		</div>
	);
}
