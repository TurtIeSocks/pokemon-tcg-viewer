import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { CardGridIsland } from "../components/islands/card-grid-island";
import { SearchControls } from "../components/islands/search-controls";
import { ViewModeToggle } from "../components/islands/view-mode-toggle";
import { ListPageSkeleton } from "../components/shell/list-page-skeleton";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../lib/list-search";
import { searchCardsFn } from "../server/corpus-server";
import { deriveFacets } from "../server/set-facets";
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
	pendingComponent: ListPageSkeleton,
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
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });

	// Options derived from the SSR seed (corpus refines as the user filters live).
	const options = deriveFacets(cards);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">
					{q ? `Results for "${q}"` : "Search"}
				</h1>
				{q ? (
					<span className="text-sm text-muted-foreground">{total} cards</span>
				) : null}
				<div className="ml-auto">
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
					showScope={false}
					onChange={onChange}
				/>
			</div>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					key={q || "empty"}
					search={search}
					context={{}}
					seedCards={cards}
					seedTotal={total}
					cardHref={() => ({ to: "/search", search })}
				/>
			</div>
		</div>
	);
}
