import {
	createFileRoute,
	notFound,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { CardListPage } from "../../components/card/card-list-page";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../lib/list-search";
import { useCorpusCardHref } from "../../lib/use-corpus-card-href";
import {
	getNamedCardsFn,
	resolveCardRoutesFn,
} from "../../server/corpus-server";
import { deriveFacets } from "../../server/set-facets";

export const Route = createFileRoute("/trainer/$name")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const all = await getNamedCardsFn({
			data: { supertype: "Trainer", name: params.name },
		});
		if (all.length === 0) throw notFound();
		const cards = all.slice(0, 60);
		// Resolve the seed cards' /$series/$set/$card links server-side so they work
		// in the first paint (cards span many sets; the URL can't supply them).
		const routes = await resolveCardRoutesFn({
			data: { items: cards.map((c) => ({ id: c.id, setId: c.setId })) },
		});
		return {
			display: all[0].name,
			cards,
			total: all.length,
			facets: deriveFacets(all),
			routes,
		};
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? "Trainer";
		return {
			meta: [
				{ title: `${d} · every Pokémon TCG card` },
				{
					name: "description",
					content: `Browse all ${loaderData?.total ?? ""} printings of the ${d} Trainer card across every set.`,
				},
				{ property: "og:title", content: `${d} · Pokémon TCG cards` },
			],
		};
	},
	component: TrainerNamePage,
});

function TrainerNamePage() {
	const { cards, total, facets, routes } = Route.useLoaderData();
	const search = Route.useSearch();
	const { name } = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	const cardHref = useCorpusCardHref(
		{ to: "/trainer/$name", params: { name }, search },
		routes,
	);
	return (
		<CardListPage
			cards={cards}
			total={total}
			options={facets}
			search={search}
			onChange={(patch) =>
				navigate({
					search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
					viewTransition: false,
				})
			}
			context={{ supertype: "Trainer", nameSlug: name }}
			cardHref={cardHref}
			lockSupertype
			gridKey={name}
		/>
	);
}
