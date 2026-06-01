import { createFileRoute, notFound } from "@tanstack/react-router";
import { SetTile } from "../../components/shell/set-tile";
import { findSeries, getNavTreeFn } from "../../server/nav-tree";

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

function SeriesPage() {
	const series = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-6">
			<h1 className="mb-4 text-2xl font-bold">{series.name}</h1>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
				{series.sets.map((set) => (
					<SetTile key={set.id} seriesSlug={series.slug} set={set} />
				))}
			</div>
		</div>
	);
}
