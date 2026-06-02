import { createFileRoute } from "@tanstack/react-router";
import { SetTile } from "../../components/shell/set-tile";
import { getNavTreeFn } from "../../server/nav-tree";
import { useEnsureCorpus } from "../../store/corpus/use-ensure-corpus";
import { useOwnedCountBySet } from "../../store/userland/selectors";

export const Route = createFileRoute("/vault/sets")({
	loader: () => getNavTreeFn(),
	component: VaultSets,
});

function VaultSets() {
	useEnsureCorpus();
	const tree = Route.useLoaderData();
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
