import { createFileRoute, notFound } from "@tanstack/react-router";
import type { HoloCardData } from "../../../components/holo-card";
import { fetchCards } from "../../../server/card-data";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";
import { deriveFacets } from "../../../server/set-facets";

export const Route = createFileRoute("/$series/$set/")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();

		// Fetch the whole set so facets are accurate and all cards are crawlable.
		// Use fetchCards directly (not getCardsBySetFn) to avoid the RPC hop when
		// called server-side from a route loader.
		const all: HoloCardData[] = [];
		let page = 1;
		let total = Number.POSITIVE_INFINITY;
		while (all.length < total && page <= 10) {
			const res = await fetchCards(`set.id:${set.id}`, page, 250, "number");
			all.push(...res.cards);
			total = res.totalCount;
			if (res.cards.length === 0) break;
			page++;
		}
		// TODO(Plan 05): setResponseHeaders Cache-Control via server fn — import protection
		// blocks @tanstack/react-start/server from client-bundled route files.
		return { set, cards: all, facets: deriveFacets(all) };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.set.name ?? "Set"} — Pokémon TCG cards` },
			{ name: "description", content: `All ${loaderData?.cards.length ?? 0} cards in ${loaderData?.set.name ?? ""}.` },
		],
	}),
	component: SetPage,
});

function SetPage() {
	const { set, cards, facets } = Route.useLoaderData();
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-y-auto px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">{cards.length} cards</span>
			</div>
			{/* Facets render as plain text chips for now; the interactive filter island is Plan 05. */}
			<div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
				{facets.supertypes.map((s) => <span key={s} className="rounded bg-secondary px-2 py-1">{s}</span>)}
				{facets.rarities.map((r) => <span key={r} className="rounded bg-secondary px-2 py-1">{r}</span>)}
			</div>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((card) => (
					<li key={card.id} className="flex flex-col items-center gap-1">
						<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
						<span className="text-center text-xs">{card.name}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
