import {
	createFileRoute,
	type LinkProps,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m } from "@/paraglide/messages";
import type { HoloCardData } from "../components/holo-card";
import { CardGridIsland } from "../components/islands/card-grid-island";
import { CardSelectionProvider } from "../components/islands/card-selection";
import { CardSortControl } from "../components/islands/card-sort-control";
import { SearchControls } from "../components/islands/search-controls";
import { ViewModeToggle } from "../components/islands/view-mode-toggle";
import { ResultsBar } from "../components/results-bar";
import { SelectAndBulkAdd } from "../components/vault/select-and-bulk-add";
import { buildCorpusQuery } from "../lib/card-query";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../lib/list-search";
import { toSerializedQuery } from "../lib/serialized-query";
import { useCorpusCardHref } from "../lib/use-corpus-card-href";
import { getPokemonListFn } from "../server/card-data";
import { resolveCardRoutesFn, searchCardsFn } from "../server/corpus-server";
import { nameByDex } from "../server/pokemon-dex";
import { deriveFacets, type SetFacets } from "../server/set-facets";
import { useStore } from "../store";
import { queryCorpus, setsById } from "../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../store/corpus/corpus-runtime";
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
		if (!q)
			return { q, cards: [], total: 0, facets: deriveFacets([]), routes: {} };
		// Species list runs in parallel with the search; it labels the Pokémon
		// filter options (dex number → species name).
		const [all, list] = await Promise.all([
			searchCardsFn({ data: { query: q, mode: deps.mode } }),
			getPokemonListFn(),
		]);
		const cards = all.slice(0, 40);
		const facets = deriveFacets(cards, (dex) => nameByDex(list, dex));
		// Resolve the seed cards' /$series/$set/$card links server-side (results
		// span many sets). Resolve-only — no second search query — so per-keystroke
		// search stays cheap. Client-paginated + live-grid cards use the client slug
		// index backstop (loaded by then).
		const routes = await resolveCardRoutesFn({
			data: { items: cards.map((c) => ({ id: c.id, setId: c.setId })) },
		});
		return { q, cards, total: all.length, facets, routes };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.q
					? m.search_meta_title_query({ query: loaderData.q })
					: m.search_meta_title_empty(),
			},
			{
				name: "description",
				content: m.search_meta_description({ query: loaderData?.q ?? "" }),
			},
		],
	}),
	component: SearchPage,
});

function SearchPage() {
	const { q, cards, total, facets, routes } = Route.useLoaderData();
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

	// Search results span many sets, so each card's detail link is looked up per
	// card. The loader's server-resolved `routes` map covers the SSR seed (correct
	// links in the first paint); the client slug index backstops paginated +
	// live-grid cards (pulled from the same corpus, loaded by then).
	const cardHref = useCorpusCardHref({ to: "/search", search }, routes);

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
	// Live filtered total from the grid; falls back to the loader total (only shown
	// when a query is present).
	const [liveTotal, setLiveTotal] = useState<number | null>(null);
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 shrink-0">
				<SearchControls
					value={search}
					options={options}
					onChange={onChange}
					placeholder={m.search_placeholder()}
					showYearFilter
					showCardFilter
				/>
			</div>
			<ResultsBar count={q ? (liveTotal ?? total) : null}>
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
					onTotalChange={setLiveTotal}
				/>
			</div>
		</div>
	);
}
