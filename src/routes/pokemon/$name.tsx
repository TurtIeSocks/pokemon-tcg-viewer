import { createFileRoute, notFound } from "@tanstack/react-router";
import {
	fetchCardsByPokedex,
	getPokemonListCached,
} from "../../server/card-data";
import { dexByName } from "../../server/pokemon-dex";

function titleCase(slug: string): string {
	return slug
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

export const Route = createFileRoute("/pokemon/$name")({
	loader: async ({ params }) => {
		const list = await getPokemonListCached();
		const dex = dexByName(list, params.name);
		if (dex === null) throw notFound();
		const res = await fetchCardsByPokedex(dex, 1, 60);
		return {
			display: titleCase(params.name),
			cards: res.cards,
			total: res.totalCount,
		};
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? "Pokémon";
		return {
			meta: [
				{ title: `${d} — every Pokémon TCG card` },
				{
					name: "description",
					content: `Browse all ${loaderData?.total ?? ""} ${d} cards across every set.`,
				},
				{ property: "og:title", content: `${d} — Pokémon TCG cards` },
			],
		};
	},
	component: PokemonPage,
});

function PokemonPage() {
	const { display, cards, total } = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{display}{" "}
				<span className="ml-2 text-sm text-muted-foreground">
					{total} cards
				</span>
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
						<span className="text-center text-[10px] text-muted-foreground">
							{card.setName}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
