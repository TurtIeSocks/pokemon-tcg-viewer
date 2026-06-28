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
import { getNamedCardsFn } from "../../server/corpus-server";
import { deriveFacets } from "../../server/set-facets";

export const Route = createFileRoute("/trainer/$name")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async ({ params }) => {
		const all = await getNamedCardsFn({
			data: { supertype: "Trainer", name: params.name },
		});
		if (all.length === 0) throw notFound();
		return {
			display: all[0].name,
			cards: all.slice(0, 60),
			total: all.length,
			facets: deriveFacets(all),
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
	const { cards, total, facets } = Route.useLoaderData();
	const search = Route.useSearch();
	const { name } = Route.useParams();
	const navigate = useNavigate({ from: Route.fullPath });
	const cardHref = useCorpusCardHref({
		to: "/trainer/$name",
		params: { name },
		search,
	});
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
