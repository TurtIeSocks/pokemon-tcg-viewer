import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { CardListPage } from "../../components/card/card-list-page";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "../../lib/list-search";
import { toSerializedQuery } from "../../lib/serialized-query";
import { useCorpusCardHref } from "../../lib/use-corpus-card-href";
import { getSupertypeCardsFn } from "../../server/corpus-server";
import { deriveFacets } from "../../server/set-facets";

const CONTEXT = { supertype: "Energy" } as const;

export const Route = createFileRoute("/energy/")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async () => {
		const all = await getSupertypeCardsFn({ data: "Energy" });
		return {
			cards: all.slice(0, 60),
			total: all.length,
			facets: deriveFacets(all),
		};
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: "Energy cards · every Pokémon TCG Energy" },
			{
				name: "description",
				content: `Browse all ${loaderData?.total ?? ""} Energy cards (Basic and Special) across every Pokémon TCG set.`,
			},
			{ property: "og:title", content: "Energy cards · Pokémon TCG" },
		],
	}),
	component: EnergiesPage,
});

function EnergiesPage() {
	const { cards, total, facets } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const cardHref = useCorpusCardHref({ to: "/energy", search });
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
			context={CONTEXT}
			cardHref={cardHref}
			ruleQuery={{
				...toSerializedQuery(search, CONTEXT),
				supertypes: ["Energy"],
			}}
			lockSupertype
			gridKey="Energy"
		/>
	);
}
