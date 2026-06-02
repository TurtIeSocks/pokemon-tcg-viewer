import {
	createFileRoute,
	type LinkProps,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import type { HoloCardData } from "../components/holo-card";
import { CardGridIsland } from "../components/islands/card-grid-island";
import {
	CardSelectionProvider,
	useCardSelection,
} from "../components/islands/card-selection";
import { SearchControls } from "../components/islands/search-controls";
import { ViewModeToggle } from "../components/islands/view-mode-toggle";
import { BulkAddMenu } from "../components/vault/bulk-add-menu";
import { buildCorpusQuery } from "../lib/card-query";
import { cardModalLinkProps } from "../lib/card-route";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../lib/list-search";
import { toSerializedQuery } from "../lib/serialized-query";
import { searchCardsFn } from "../server/corpus-server";
import { deriveFacets, type SetFacets } from "../server/set-facets";
import { useStore } from "../store";
import { queryCorpus, setsById } from "../store/corpus/corpus-engine";
import { useCorpusRuntime, useSlugIndex } from "../store/corpus/corpus-runtime";
import { useRecentsStore } from "../store/recents";

export const Route = createFileRoute("/search")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0 };
		const all = await searchCardsFn({ data: q });
		return { q, cards: all.slice(0, 40), total: all.length };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.q
					? `"${loaderData.q}" — Pokémon TCG search`
					: "Search — Pokémon TCG",
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
	const { q, cards, total } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const addRecentSearch = useRecentsStore((s) => s.addRecentSearch);
	// Record the active query so the home page's recent-searches list populates.
	// addRecentSearch trims/dedupes/caps internally; the effect is client-only
	// (skips SSR/prerender). The legacy search page did this pre-migration.
	useEffect(() => {
		addRecentSearch(q);
	}, [q, addRecentSearch]);
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({
			search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
			// In-page filter/view change: keep it instant, don't crossfade.
			viewTransition: false,
		});

	// Options derived from the SSR seed (corpus refines as the user filters live).
	const options = deriveFacets(cards);

	// Corpus + sets for BulkAddMenu cardIds derivation.
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
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
				options={options}
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
	const { active, selected, toggleActive } = useCardSelection();

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">
					{q ? `Results for "${q}"` : "Search"}
				</h1>
				{q ? (
					<span className="text-sm text-muted-foreground">{total} cards</span>
				) : null}
				<div className="ml-auto flex items-center gap-2">
					{q ? (
						<>
							<button
								type="button"
								aria-pressed={active}
								onClick={toggleActive}
								className="rounded border px-3 py-1.5 text-sm hover:bg-secondary"
							>
								{active ? "Done selecting" : "Select cards"}
							</button>
							<BulkAddMenu
								cardIds={bulkCardIds}
								ruleQuery={toSerializedQuery(search, {})}
								selectedCardIds={active ? [...selected] : undefined}
							/>
						</>
					) : null}
					<ViewModeToggle
						value={search.view}
						disabled={!q}
						onChange={(view) => onChange({ view })}
					/>
				</div>
			</div>
			<div className="mb-4 shrink-0">
				<SearchControls
					value={search}
					options={options}
					onChange={onChange}
					placeholder="Search all cards"
				/>
			</div>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					key={q || "empty"}
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
