import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SetTile } from "../../components/shell/set-tile";
import { getNavTreeFn } from "../../server/nav-tree";
import { loadCorpus } from "../../store/corpus/corpus-runtime";
import { useOwnedCountBySet } from "../../store/userland/selectors";

export const Route = createFileRoute("/vault/sets")({
	loader: () => getNavTreeFn(),
	component: VaultSets,
});

function VaultSets() {
	const tree = Route.useLoaderData();
	useEffect(() => {
		void loadCorpus();
	}, []);
	const counts = useOwnedCountBySet();
	return (
		<div className="space-y-8">
			{tree.map((series) => (
				<section key={series.slug}>
					<h2 className="mb-3 text-lg font-semibold">{series.name}</h2>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{series.sets.map((set) => (
							<SetTile
								key={set.id}
								seriesSlug={series.slug}
								set={set}
								ownedCount={counts.get(set.id) ?? 0}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
