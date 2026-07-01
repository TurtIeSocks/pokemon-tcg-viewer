import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CardPageView } from "../../../components/card/card-cockpit";
import { TAB_MASK } from "../../../lib/card-route";
import {
	isSupportedLanguage,
	type SupportedLanguage,
} from "../../../lib/languages";
import { getCardForRouteFn } from "../../../server/corpus-server";
import { useRecentsStore } from "../../../store/recents";

export const Route = createFileRoute("/$series/$set/$card")({
	// `?lang=de` rides in from the grid (the masked overlay preserves search), so
	// a cold load / reload / shared link of this canonical URL still localizes.
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
		// One server fn resolves tree → set → card id → card + cross-links, all
		// server-side and memoized. On client navigation this is a single RPC
		// instead of three serial ones (see getCardForRouteFn).
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

	const onTabChange = (tab: keyof typeof TAB_MASK) =>
		void navigate({
			to: TAB_MASK[tab],
			params,
			search: (prev) => ({ lang: prev.lang ?? null }),
		});

	return (
		<CardPageView
			card={card}
			crossLinks={crossLinks}
			tab="details"
			onTabChange={onTabChange}
			series={params.series}
			set={params.set}
		/>
	);
}
