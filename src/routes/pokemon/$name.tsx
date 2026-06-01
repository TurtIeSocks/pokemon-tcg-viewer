import {
	createFileRoute,
	notFound,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { CardGridIsland } from "../../components/islands/card-grid-island";
import { SearchControls } from "../../components/islands/search-controls";
import { ViewModeToggle } from "../../components/islands/view-mode-toggle";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../lib/list-search";
import {
	fetchCardsByPokedex,
	getPokemonListCached,
} from "../../server/card-data";
import { dexByName } from "../../server/pokemon-dex";
import { deriveFacets } from "../../server/set-facets";

function titleCase(slug: string): string {
	return slug
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

export const Route = createFileRoute("/pokemon/$name")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const list = await getPokemonListCached();
		const dex = dexByName(list, params.name);
		if (dex === null) throw notFound();
		const res = await fetchCardsByPokedex(dex, 1, 60);
		return {
			display: titleCase(params.name),
			dex,
			cards: res.cards,
			total: res.totalCount,
		};
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? "Pokémon";
		return {
			meta: [
				{ title: `${d} — every Pokémon TCG card` },
				{
					name: "description",
					content: `Browse all ${loaderData?.total ?? ""} ${d} cards across every set.`,
				},
				{ property: "og:title", content: `${d} — Pokémon TCG cards` },
			],
		};
	},
	component: PokemonPage,
});

function PokemonPage() {
	const { display, dex, cards, total } = Route.useLoaderData();
	const search = Route.useSearch();
	const params = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Parameters<typeof listSearchToUrl>[0]) =>
		navigate({ search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }) });
	const options = deriveFacets(cards);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">
					{display}{" "}
					<span className="ml-2 text-sm text-muted-foreground">
						{total} cards
					</span>
				</h1>
				<div className="ml-auto">
					<ViewModeToggle
						value={search.view}
						disabled={false}
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
					search={search}
					context={{ dexNumber: dex }}
					seedCards={cards}
					seedTotal={total}
					cardHref={() => ({
						to: "/pokemon/$name",
						params: { name: params.name },
						search,
					})}
				/>
			</div>
		</div>
	);
}
