import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { CardDetail } from "../../../components/card/card-detail";
import { LIST_SEARCH_DEFAULTS } from "../../../lib/list-search";
import { getCardForRouteFn } from "../../../server/corpus-server";
import { useRecentsStore } from "../../../store/recents";

export const Route = createFileRoute("/$series/$set/$card")({
	loader: async ({ params }) => {
		// One server fn resolves tree → set → card id → card + cross-links, all
		// server-side and memoized. On client navigation this is a single RPC
		// instead of three serial ones (see getCardForRouteFn).
		const result = await getCardForRouteFn({
			data: { series: params.series, set: params.set, card: params.card },
		});
		if (!result) throw notFound();
		return result;
	},
	head: ({ loaderData }) => {
		const card = loaderData?.card;
		if (!card) return { meta: [{ title: "Card · Pokémon TCG" }] };
		const title = `${card.name} · ${card.setName} · Pokémon TCG`;
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

// Cold-load / shared / direct-navigation view: a dedicated full page (no modal).
// In-app clicks open the same card as an overlay over the grid via history
// state + a route mask (see card-overlay.tsx) — this route is what the masked
// URL falls back to on reload or when the link is shared.
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

	// Push — so browser-back from the manage page returns here.
	function handleManage() {
		void navigate({
			to: "/$series/$set/$card/manage",
			params: {
				series: params.series,
				set: params.set,
				card: params.card,
			},
		});
	}

	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="mb-3">
				<Link
					to="/$series/$set"
					params={{ series: params.series, set: params.set }}
					search={LIST_SEARCH_DEFAULTS}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← {card.setName}
				</Link>
			</div>
			<div className="rounded-2xl border border-white/10 bg-[var(--bg)]">
				<CardDetail
					card={card}
					crossLinks={crossLinks}
					onManage={handleManage}
				/>
			</div>
		</div>
	);
}
