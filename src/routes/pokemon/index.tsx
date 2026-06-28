import {
	createFileRoute,
	stripSearchParams,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo } from "react";
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
	validatePokedexSearch,
} from "../../lib/pokedex";
import { getPokedexFn } from "../../server/corpus-server";

export const Route = createFileRoute("/pokemon/")({
	validateSearch: validatePokedexSearch,
	search: { middlewares: [stripSearchParams(POKEDEX_FILTER_DEFAULTS)] },
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
	const filter = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const onChange = (patch: Partial<PokedexFilter>) =>
		navigate({
			search: (prev) => ({ ...prev, ...patch }),
			// In-page filter/sort change: keep it instant, don't crossfade.
			viewTransition: false,
		});
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
					onChange={onChange}
				/>
			</div>
			<div className="shrink-0">
				<ResultsBar count={visible.length} unit="species">
					<SortControl
						mode={filter.sortMode}
						dir={filter.sortDir}
						options={POKEDEX_SORT_OPTIONS}
						onModeChange={(sortMode: PokedexSortMode) =>
							onChange({
								sortMode,
								sortDir: naturalPokedexDir(sortMode),
							})
						}
						onDirChange={(sortDir) => onChange({ sortDir })}
					/>
				</ResultsBar>
			</div>
			<div className="min-h-0 flex-1">
				<PokedexGrid rows={visible} />
			</div>
		</div>
	);
}
