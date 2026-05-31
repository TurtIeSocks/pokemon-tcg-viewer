import { createFileRoute } from "@tanstack/react-router";
import { fetchCardsByName } from "../server/card-data";

export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>): { q: string } => ({
		q: typeof search.q === "string" ? search.q : "",
	}),
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0 };
		const res = await fetchCardsByName(q, 1, 40);
		return { q, cards: res.cards, total: res.totalCount };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData?.q
					? `"${loaderData.q}" — Pokémon TCG search`
					: "Search — Pokémon TCG",
			},
			{
				name: "description",
				content: `Search results for ${loaderData?.q ?? ""}.`,
			},
		],
	}),
	component: SearchPage,
});

function SearchPage() {
	const { q, cards, total } = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{q ? `Results for "${q}"` : "Search"}
				{q ? (
					<span className="ml-2 text-sm text-muted-foreground">
						{total} cards
					</span>
				) : null}
			</h1>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((card) => (
					<li key={card.id} className="flex flex-col items-center gap-1">
						<img
							src={card.imageUrlSmall}
							alt={card.name}
							loading="lazy"
							className="w-full rounded"
						/>
						<span className="text-center text-xs">{card.name}</span>
						<span className="text-center text-[10px] text-muted-foreground">
							{card.setName}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
