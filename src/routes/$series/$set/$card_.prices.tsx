import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardPageView } from "../../../components/card/card-cockpit";
import { TAB_MASK } from "../../../lib/card-route";
import {
	isSupportedLanguage,
	type SupportedLanguage,
} from "../../../lib/languages";
import { getCardForRouteFn } from "../../../server/corpus-server";

export const Route = createFileRoute("/$series/$set/$card_/prices")({
	// `?lang=ja` rides in from the card detail so a cold load / reload of this
	// canonical URL resolves against the correct region's catalog (mirrors the
	// manage route).
	validateSearch: (
		search: Record<string, unknown>,
	): { lang: SupportedLanguage | null } => ({
		lang:
			typeof search.lang === "string" && isSupportedLanguage(search.lang)
				? search.lang
				: null,
	}),
	loaderDeps: ({ search }) => ({ lang: search.lang }),
	loader: async ({ params, deps }) => {
		const result = await getCardForRouteFn({
			data: {
				series: params.series,
				set: params.set,
				card: params.card,
				lang: deps.lang ?? "en",
			},
		});
		if (!result) throw notFound();
		return result;
	},
	component: PricesPage,
});

function PricesPage() {
	const { card, crossLinks } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	return (
		<CardPageView
			card={card}
			crossLinks={crossLinks}
			tab="pricing"
			onTabChange={(tab) => void navigate({ to: TAB_MASK[tab], params })}
			series={params.series}
			set={params.set}
		/>
	);
}
