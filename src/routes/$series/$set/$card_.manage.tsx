import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardPageView } from "../../../components/card/card-cockpit";
import { TAB_MASK } from "../../../lib/card-route";
import { getCardForRouteFn } from "../../../server/corpus-server";

export const Route = createFileRoute("/$series/$set/$card_/manage")({
	loader: async ({ params }) => {
		const result = await getCardForRouteFn({
			data: {
				series: params.series,
				set: params.set,
				card: params.card,
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
