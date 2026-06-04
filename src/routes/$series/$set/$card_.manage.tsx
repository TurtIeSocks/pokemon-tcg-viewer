import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardCollectionManager } from "../../../components/collection/card-collection-manager";
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
// clicks open this face as an overlay (via cardManage history state + URL
// mask) — this route is the fallback when that URL is loaded directly or
// shared.
function ManagePage() {
	const { card } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();

	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="rounded-2xl border border-white/10 bg-[var(--bg)]">
				<CardCollectionManager
					cardId={card.id}
					cardName={card.name}
					setName={card.setName}
					cardNumber={card.cardNumber}
					imageUrl={card.imageUrl}
					card={card}
					onBack={() =>
						navigate({
							to: "/$series/$set/$card",
							params: {
								series: params.series,
								set: params.set,
								card: params.card,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
