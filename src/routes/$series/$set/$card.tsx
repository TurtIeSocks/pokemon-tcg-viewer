import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CardModal } from "../../../components/islands/card-modal";
import type { CrossLink } from "../../../components/islands/cross-link-overlay";
import { LIST_SEARCH_DEFAULTS } from "../../../lib/list-search";
import { getCardByIdFn, getPokemonListFn } from "../../../server/card-data";
import { resolveCardInSetFn } from "../../../server/corpus-server";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { nameByDex } from "../../../server/pokemon-dex";
import { useRecentsStore } from "../../../store/recents";

export const Route = createFileRoute("/$series/$set/$card")({
	loader: async ({ params }) => {
		// getPokemonListFn is independent of the tree→cardId→card chain, so kick it
		// off up front and await it only when building cross-links — no waterfall.
		const listPromise = getPokemonListFn();
		// No-op handler so a notFound() bail before the await can't raise an
		// unhandled rejection; the await below still surfaces a real failure.
		listPromise.catch(() => {});
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();
		const cardId = await resolveCardInSetFn({
			data: { setId: set.id, cardSlug: params.card },
		});
		if (!cardId) throw notFound();
		const card = await getCardByIdFn({ data: cardId });

		const list = await listPromise;
		const crossLinks: CrossLink[] = [];
		for (const dex of card.nationalPokedexNumbers ?? []) {
			const name = nameByDex(list, dex);
			if (name) {
				crossLinks.push({
					label: `View all ${name.replace(/-/g, " ")}`,
					link: { to: "/pokemon/$name", params: { name } },
				});
			}
		}
		crossLinks.push({
			label: `Go to ${card.setName}`,
			link: {
				to: "/$series/$set",
				params: { series: params.series, set: params.set },
				search: LIST_SEARCH_DEFAULTS,
			},
		});

		return { card, crossLinks };
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
	const { card, crossLinks } = Route.useLoaderData();
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
			crossLinks={crossLinks}
			onClose={() =>
				navigate({
					to: "/$series/$set",
					params: { series: params.series, set: params.set },
					search: LIST_SEARCH_DEFAULTS,
				})
			}
		/>
	);
}
