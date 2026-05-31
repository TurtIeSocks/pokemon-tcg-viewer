import { createFileRoute, notFound } from "@tanstack/react-router";
import { CardDetail } from "../../../components/card/card-detail";
import { fetchCardById } from "../../../server/card-data";
import { resolveCardInSet } from "../../../server/card-resolve";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";

export const Route = createFileRoute("/$series/$set/$card")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();
		const cardId = await resolveCardInSet(set.id, params.card);
		if (!cardId) throw notFound();
		const card = await fetchCardById(cardId);
		return { card };
	},
	head: ({ loaderData }) => {
		const card = loaderData?.card;
		if (!card) return { meta: [{ title: "Card — Pokémon TCG" }] };
		const title = `${card.name} · ${card.setName} — Pokémon TCG`;
		const desc = `${card.name} (${card.rarity ?? "card"}) from ${card.setName}, #${card.cardNumber}.`;
		return {
			meta: [
				{ title },
				{ name: "description", content: desc },
				{ property: "og:title", content: title },
				{ property: "og:description", content: desc },
				{ property: "og:image", content: card.imageUrl },
				{ property: "og:type", content: "article" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:image", content: card.imageUrl },
			],
		};
	},
	component: CardPage,
});

function CardPage() {
	const { card } = Route.useLoaderData();
	return (
		<div className="h-full overflow-y-auto">
			<CardDetail card={card} />
		</div>
	);
}
