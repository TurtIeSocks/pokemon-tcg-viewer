import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PokedexControls } from "../../components/pokedex/pokedex-controls";
import { PokedexGrid } from "../../components/pokedex/pokedex-grid";
import {
	applyPokedexFilter,
	POKEDEX_FILTER_DEFAULTS,
	type PokedexFilter,
	pokedexTypeOptions,
} from "../../lib/pokedex";
import { getPokedexFn } from "../../server/corpus-server";

export const Route = createFileRoute("/pokemon/")({
	loader: () => getPokedexFn(),
	head: ({ loaderData }) => ({
		meta: [
			{ title: "Pokédex · every Pokémon TCG card by species" },
			{
				name: "description",
				content: `Browse ${loaderData?.length ?? ""} Pokémon species and find every TCG card of each.`,
			},
			{ property: "og:title", content: "Pokédex · Pokémon TCG by species" },
		],
	}),
	component: PokedexPage,
});

function PokedexPage() {
	const rows = Route.useLoaderData();
	const [filter, setFilter] = useState<PokedexFilter>(POKEDEX_FILTER_DEFAULTS);
	const typeOptions = useMemo(() => pokedexTypeOptions(rows), [rows]);
	const visible = useMemo(
		() => applyPokedexFilter(rows, filter),
		[rows, filter],
	);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 shrink-0">
				<PokedexControls
					value={filter}
					typeOptions={typeOptions}
					onChange={(patch) => setFilter((f) => ({ ...f, ...patch }))}
				/>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid rows={visible} />
			</div>
		</div>
	);
}
