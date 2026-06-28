import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import type { VirtuosoGridHandle } from "react-virtuoso";
import { GenerationBar } from "../../components/pokedex/generation-bar";
import { PokedexGrid } from "../../components/pokedex/pokedex-grid";
import { filterPokedex } from "../../lib/pokedex";
import { getPokedexFn } from "../../server/corpus-server";

export const Route = createFileRoute("/pokemon/")({
	loader: () => getPokedexFn(),
	head: ({ loaderData }) => ({
		meta: [
			{ title: "Pokédex · every Pokémon TCG card by species" },
			{
				name: "description",
				content: `Browse ${loaderData?.length ?? ""} Pokémon species and jump to every TCG card of each.`,
			},
			{ property: "og:title", content: "Pokédex · Pokémon TCG by species" },
		],
	}),
	component: PokedexPage,
});

function PokedexPage() {
	const rows = Route.useLoaderData();
	const [query, setQuery] = useState("");
	const gridRef = useRef<VirtuosoGridHandle>(null);
	const filtered = useMemo(() => filterPokedex(rows, query), [rows, query]);

	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex shrink-0 flex-col gap-3">
				<input
					type="search"
					aria-label="Search species by name or dex number"
					placeholder="Search species…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="w-full rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 font-sans text-sm text-[var(--ink)] placeholder:text-[var(--faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
				/>
				<GenerationBar
					rows={filtered}
					onJump={(index) =>
						index >= 0 &&
						gridRef.current?.scrollToIndex({ index, align: "start" })
					}
				/>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid ref={gridRef} rows={filtered} />
			</div>
		</div>
	);
}
