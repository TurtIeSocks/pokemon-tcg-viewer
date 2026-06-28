import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PokedexControls } from "../../components/pokedex/pokedex-controls";
import { PokedexGrid } from "../../components/pokedex/pokedex-grid";
import { ResultsBar } from "../../components/results-bar";
import { SortControl } from "../../components/sort-control";
import {
	applyPokedexFilter,
	naturalPokedexDir,
	POKEDEX_FILTER_DEFAULTS,
	POKEDEX_SORT_OPTIONS,
	type PokedexFilter,
	type PokedexSortMode,
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
			<div className="shrink-0">
				<ResultsBar count={visible.length} unit="species">
					<SortControl
						mode={filter.sortMode}
						dir={filter.sortDir}
						options={POKEDEX_SORT_OPTIONS}
						onModeChange={(sortMode: PokedexSortMode) =>
							setFilter((f) => ({
								...f,
								sortMode,
								sortDir: naturalPokedexDir(sortMode),
							}))
						}
						onDirChange={(sortDir) => setFilter((f) => ({ ...f, sortDir }))}
					/>
				</ResultsBar>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid rows={visible} />
			</div>
		</div>
	);
}
