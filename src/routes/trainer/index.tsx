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
import { m } from "../../paraglide/messages";
import { getSupertypeCardsFn } from "../../server/corpus-server";
import { deriveFacets } from "../../server/set-facets";

const CONTEXT = { supertype: "Trainer" } as const;

export const Route = createFileRoute("/trainer/")({
	validateSearch: validateListSearch,
	search: { middlewares: [stripSearchParams(LIST_SEARCH_DEFAULTS)] },
	loader: async () => {
		const all = await getSupertypeCardsFn({ data: "Trainer" });
		return {
			cards: all.slice(0, 60),
			total: all.length,
			facets: deriveFacets(all),
		};
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: m.trainer_meta_title() },
			{
				name: "description",
				content: m.trainer_meta_description({ count: loaderData?.total ?? "" }),
			},
			{ property: "og:title", content: m.trainer_meta_og_title() },
		],
	}),
	component: TrainersPage,
});

function TrainersPage() {
	const { cards, total, facets } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const cardHref = useCorpusCardHref({ to: "/trainer", search });
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
				supertypes: ["Trainer"],
			}}
			lockSupertype
			showCardFilter
			gridKey="Trainer"
		/>
	);
}
