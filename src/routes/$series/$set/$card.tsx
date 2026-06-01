import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CardModal } from "../../../components/islands/card-modal";
import { fetchCardById } from "../../../server/card-data";
import { resolveCardInSet } from "../../../server/card-resolve";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { useRecentsStore } from "../../../store/recents";

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
	const params = Route.useParams();
	const navigate = useNavigate();
	const addRecentlyViewed = useRecentsStore((s) => s.addRecentlyViewed);
	useEffect(() => {
		addRecentlyViewed({
			id: card.id,
			imageUrl: card.imageUrl,
			name: card.name,
			rarity: card.rarity,
			subtypes: card.subtypes,
			supertype: card.supertype,
			setId: card.setId,
			setName: card.setName,
			setSeries: card.setSeries,
			cardNumber: card.cardNumber,
			nationalPokedexNumbers: card.nationalPokedexNumbers,
		});
	}, [card, addRecentlyViewed]);
	return (
		<CardModal
			card={card}
			onClose={() =>
				navigate({
					to: "/$series/$set",
					params: { series: params.series, set: params.set },
					search: {
						q: "",
						types: [],
						rarity: [],
						supertype: [],
						subtypes: [],
						scope: "all",
					},
				})
			}
		/>
	);
}
