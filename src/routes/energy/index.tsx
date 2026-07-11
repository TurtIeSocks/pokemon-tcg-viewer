import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { CardListPage } from "../../components/card/card-list-page";
import {
	LIST_SEARCH_DEFAULTS,
	useListSearchOnChange,
	validateListSearch,
} from "../../lib/list-search";
import { toSerializedQuery } from "../../lib/serialized-query";
import { useCorpusCardHref } from "../../lib/use-corpus-card-href";
import { m } from "../../paraglide/messages";
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
			{ title: m.energy_meta_title() },
			{
				name: "description",
				content: m.energy_meta_description({ count: loaderData?.total ?? "" }),
			},
			{ property: "og:title", content: m.energy_meta_og_title() },
		],
	}),
	component: EnergiesPage,
});

function EnergiesPage() {
	const { cards, total, facets } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = useListSearchOnChange(navigate);
	const cardHref = useCorpusCardHref({ to: "/energy", search });
	return (
		<CardListPage
			cards={cards}
			total={total}
			options={facets}
			search={search}
			onChange={onChange}
			context={CONTEXT}
			cardHref={cardHref}
			ruleQuery={{
				...toSerializedQuery(search, CONTEXT),
				supertypes: ["Energy"],
			}}
			lockSupertype
			showCardFilter
			gridKey="Energy"
		/>
	);
}
