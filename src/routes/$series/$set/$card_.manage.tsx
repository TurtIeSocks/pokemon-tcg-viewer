import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardPageView } from "../../../components/card/card-cockpit";
import { TAB_MASK } from "../../../lib/card-route";
import {
	isSupportedLanguage,
	type SupportedLanguage,
} from "../../../lib/languages";
import { getCardForRouteFn } from "../../../server/corpus-server";

export const Route = createFileRoute("/$series/$set/$card_/manage")({
	// `?lang=ja` rides in from the card detail (shared link into the manager
	// preserves search), so a cold load / reload of this canonical URL still
	// resolves against the correct region's catalog.
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
	component: ManagePage,
});

// Cold-load / direct-navigation view for the collection manager. In-app
// clicks open this face as an overlay (via cardTab history state + URL
// mask) — this route is the fallback when that URL is loaded directly or
// shared.
function ManagePage() {
	const { card, crossLinks } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	return (
		<CardPageView
			card={card}
			crossLinks={crossLinks}
			tab="collection"
			onTabChange={(tab) => void navigate({ to: TAB_MASK[tab], params })}
			series={params.series}
			set={params.set}
		/>
	);
}
