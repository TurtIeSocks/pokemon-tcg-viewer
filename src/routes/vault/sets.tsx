import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SetTile } from "../../components/shell/set-tile";
import { Button } from "../../components/ui/button";
import { getNavTreeFn } from "../../server/nav-tree";
import { useEnsureCorpus } from "../../store/corpus/use-ensure-corpus";
import { useOwnedCountBySet } from "../../store/userland/selectors";

export const Route = createFileRoute("/vault/sets")({
	loader: () => getNavTreeFn(),
	component: VaultSets,
});

/** Exported for tests; wrap in a router context when rendering standalone. */
export function VaultSetsInner() {
	useEnsureCorpus();
	const tree = Route.useLoaderData();
	const counts = useOwnedCountBySet();
	const [showAll, setShowAll] = useState(false);

	const visibleTree = tree
		.map((series) => ({
			...series,
			sets: showAll
				? series.sets
				: series.sets.filter((s) => (counts.get(s.id) ?? 0) > 0),
		}))
		.filter((series) => series.sets.length > 0);

	const totalOwned = tree.reduce(
		(acc, s) =>
			acc + s.sets.filter((set) => (counts.get(set.id) ?? 0) > 0).length,
		0,
	);

	return (
		<div className="space-y-6">
			{/* Toggle */}
			<div className="flex items-center gap-2">
				<Button
					variant={!showAll ? "default" : "outline"}
					size="sm"
					onClick={() => setShowAll(false)}
					aria-pressed={!showAll}
				>
					Owned sets
				</Button>
				<Button
					variant={showAll ? "default" : "outline"}
					size="sm"
					onClick={() => setShowAll(true)}
					aria-pressed={showAll}
				>
					All sets
				</Button>
			</div>

			{/* Empty state */}
			{!showAll && totalOwned === 0 ? (
				<div className="py-12 text-center space-y-3">
					<p className="text-muted-foreground">
						You don't own any cards yet — your sets will appear here once you
						add some.
					</p>
					<Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
						Browse all sets
					</Button>
				</div>
			) : (
				<div className="space-y-8">
					{visibleTree.map((series) => (
						<section key={series.slug}>
							<h2 className="mb-3 text-lg font-semibold">{series.name}</h2>
							<div className="grid [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-4">
								{series.sets.map((set) => (
									<SetTile
										key={set.id}
										seriesSlug={series.slug}
										set={set}
										ownedCount={counts.get(set.id) ?? 0}
										vaultLink
									/>
								))}
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}

function VaultSets() {
	return (
		<ClientOnly
			fallback={
				<p className="py-12 text-center text-muted-foreground">Loading sets…</p>
			}
		>
			<VaultSetsInner />
		</ClientOnly>
	);
}
