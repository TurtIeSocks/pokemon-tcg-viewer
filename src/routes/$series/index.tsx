import { ClientOnly, createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { CardSelectionProvider } from "../../components/islands/card-selection";
import { SetTile } from "../../components/shell/set-tile";
import { cardIdsInSets } from "../../components/vault/bulk-add";
import { SelectAndBulkAdd } from "../../components/vault/select-and-bulk-add";
import { findSeries, getNavTreeFn } from "../../server/nav-tree";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { useEnsureCorpus } from "../../store/corpus/use-ensure-corpus";

export const Route = createFileRoute("/$series/")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const series = findSeries(tree, params.series);
		if (!series) throw notFound();
		// Cache-Control is set inside getNavTreeFn's handler (server-only module),
		// which this loader awaits — the route file stays free of the server-only
		// header API that import-protection blocks from client-bundled routes.
		return series;
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: `${loaderData?.name ?? "Series"} — Pokémon TCG sets` },
			{
				name: "description",
				content: `Browse every ${loaderData?.name ?? ""} set.`,
			},
		],
	}),
	component: SeriesPage,
});

function SeriesBulkMenu({ setIds }: { setIds: string[] }) {
	useEnsureCorpus();
	const index = useCorpusRuntime((s) => s.index);
	const cardIds = useMemo(
		() => (index ? cardIdsInSets(index, setIds) : []),
		[index, setIds],
	);
	if (!index) return null;
	return <SelectAndBulkAdd cardIds={cardIds} ruleQuery={null} />;
}

function SeriesPage() {
	const series = Route.useLoaderData();
	const setIds = useMemo(() => series.sets.map((s) => s.id), [series.sets]);
	return (
		<CardSelectionProvider>
			<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-6">
				<div className="mb-4 flex items-center gap-3">
					<h1 className="text-2xl font-bold">{series.name}</h1>
					<ClientOnly fallback={null}>
						<SeriesBulkMenu setIds={setIds} />
					</ClientOnly>
				</div>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{series.sets.map((set) => (
						<SetTile key={set.id} seriesSlug={series.slug} set={set} />
					))}
				</div>
			</div>
		</CardSelectionProvider>
	);
}
