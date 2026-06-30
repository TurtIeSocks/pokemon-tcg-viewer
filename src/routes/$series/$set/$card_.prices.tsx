import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardPageView } from "../../../components/card/card-cockpit";
import { TAB_MASK } from "../../../lib/card-route";
import { getCardForRouteFn } from "../../../server/corpus-server";

export const Route = createFileRoute("/$series/$set/$card_/prices")({
	loader: async ({ params }) => {
		const result = await getCardForRouteFn({
			data: { series: params.series, set: params.set, card: params.card },
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
