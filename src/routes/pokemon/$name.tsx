import {
	createFileRoute,
	type LinkProps,
	notFound,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import type { HoloCardData } from "../../components/holo-card";
import { CardGridIsland } from "../../components/islands/card-grid-island";
import { CardSelectionProvider } from "../../components/islands/card-selection";
import { CardSortControl } from "../../components/islands/card-sort-control";
import { SearchControls } from "../../components/islands/search-controls";
import { ViewModeToggle } from "../../components/islands/view-mode-toggle";
import { ResultsBar } from "../../components/results-bar";
import { SelectAndBulkAdd } from "../../components/vault/select-and-bulk-add";
import {
	type CardRouteParams,
	cardModalLinkPropsForCard,
} from "../../lib/card-route";
import {
	LIST_SEARCH_DEFAULTS,
	useListSearchOnChange,
	validateListSearch,
} from "../../lib/list-search";
import { toSerializedQuery } from "../../lib/serialized-query";
import { titleCaseSlug } from "../../lib/slug";
import { m } from "../../paraglide/messages";
import { getPokemonListFn } from "../../server/card-data";
import { getDexCardRoutesFn, getDexCardsFn } from "../../server/corpus-server";
import { resolveDex } from "../../server/pokemon-dex";
import { deriveFacets, type SetFacets } from "../../server/set-facets";

export const Route = createFileRoute("/pokemon/$name")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const list = await getPokemonListFn();
		// The param is EITHER a species slug ("charizard") OR a national-dex id
		// ("6", leading zeros ok). Resolve both to the canonical { dex, name } so a
		// numeric URL still shows the species name, and everything below keys off dex.
		const resolved = resolveDex(list, params.name);
		if (!resolved) throw notFound();
		const { dex, name } = resolved;
		// Resolve card links server-side: cards span many sets, so the page can't
		// derive /$series/$set/$card from the URL. Runs in parallel with the card
		// fetch; both hit the same in-memory server corpus.
		const [all, routes] = await Promise.all([
			getDexCardsFn({ data: dex }),
			getDexCardRoutesFn({ data: dex }),
		]);
		return {
			display: titleCaseSlug(name),
			dex,
			cards: all.slice(0, 60),
			total: all.length,
			routes,
		};
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? m.pokemon_name_fallback();
		return {
			meta: [
				{ title: m.pokemon_name_meta_title({ name: d }) },
				{
					name: "description",
					content: m.pokemon_name_meta_description({
						count: loaderData?.total ?? "",
						name: d,
					}),
				},
				{
					property: "og:title",
					content: m.pokemon_name_meta_og_title({ name: d }),
				},
			],
		};
	},
	component: PokemonPage,
});

function PokemonPage() {
	const { dex, cards, total, routes } = Route.useLoaderData();
	const search = Route.useSearch();
	const params = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = useListSearchOnChange(navigate);
	const options = deriveFacets(cards);

	// Cards for one Pokémon span many sets, so the URL can't supply the set —
	// the loader resolves each card's /$series/$set/$card params server-side
	// (`routes`), keyed by id, so links work in the first paint. The same-route
	// fallback is defensive; every dex card is present in `routes`.
	const cardHref = useCallback(
		(card: HoloCardData): LinkProps => {
			const p: CardRouteParams | undefined = routes[card.id];
			return p
				? cardModalLinkPropsForCard(p, card)
				: { to: "/pokemon/$name", params: { name: params.name }, search };
		},
		[routes, params.name, search],
	);

	return (
		<CardSelectionProvider>
			<PokemonPageInner
				dex={dex}
				cards={cards}
				total={total}
				search={search}
				onChange={onChange}
				options={options}
				cardHref={cardHref}
			/>
		</CardSelectionProvider>
	);
}

interface PokemonPageInnerProps {
	dex: number;
	cards: HoloCardData[];
	total: number;
	search: ReturnType<typeof Route.useSearch>;
	onChange: ReturnType<typeof useListSearchOnChange>;
	options: SetFacets;
	cardHref: (card: HoloCardData) => LinkProps;
}

function PokemonPageInner({
	dex,
	cards,
	total,
	search,
	onChange,
	options,
	cardHref,
}: PokemonPageInnerProps) {
	// Live filtered total from the grid; falls back to the loader total.
	const [liveTotal, setLiveTotal] = useState<number | null>(null);
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 shrink-0">
				<SearchControls value={search} options={options} onChange={onChange} />
			</div>
			<ResultsBar count={liveTotal ?? total}>
				<SelectAndBulkAdd
					cardIds={cards.map((c) => c.id)}
					ruleQuery={toSerializedQuery(search, { dexNumber: dex })}
					search={search}
					context={{ dexNumber: dex }}
				/>
				<ViewModeToggle
					value={search.view}
					disabled={false}
					onChange={(view) => onChange({ view })}
				/>
				<CardSortControl value={search} onChange={onChange} />
			</ResultsBar>
			<div className="min-h-0 flex-1">
				<CardGridIsland
					key={dex}
					search={search}
					context={{ dexNumber: dex }}
					seedCards={cards}
					seedTotal={total}
					cardHref={cardHref}
					onTotalChange={setLiveTotal}
				/>
			</div>
		</div>
	);
}
