import {
	ClientOnly,
	createFileRoute,
	Link,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BinderCard } from "@/components/binders/binder-card";
import { BinderFormDialog } from "@/components/binders/binder-form-dialog";
import { SetTile } from "@/components/shell/set-tile";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass";
import { Stagger } from "@/components/ui/motion";
import { VaultPageHeader } from "@/components/vault/vault-page-header";
import { VaultSection } from "@/components/vault/vault-section";
import { VaultSummaryHero } from "@/components/vault/vault-summary";
import type { NavTree } from "../../lib/nav-tree";
import { getNavTreeFn } from "../../server/nav-tree";
import { useEnsureCorpus } from "../../store/corpus/use-ensure-corpus";
import { useOwnedCountBySet } from "../../store/userland/selectors";
import type { Binder } from "../../store/userland/types";
import { useUserland } from "../../store/userland/userland-store";

export const Route = createFileRoute("/vault/")({
	loader: () => getNavTreeFn(),
	component: VaultOverview,
});

/** Max set tiles shown on overview; full list reachable via "View all sets →". */
const MAX_SET_TILES = 8;

/** Exported for tests; pass tree directly to bypass Route.useLoaderData(). */
export function VaultOverviewInner({ tree }: { tree: NavTree }) {
	useEnsureCorpus();
	const navigate = useNavigate();
	const [newBinderOpen, setNewBinderOpen] = useState(false);
	const countBySet = useOwnedCountBySet();
	// Subscribe to the binder id-list (structure), not the binder data — narrow
	// useShallow keeps the array stable across content edits, so editing a binder
	// re-renders only its own card (S3), not this list.
	const binderIds = useUserland(useShallow((s) => Object.keys(s.binders)));

	function handleBinderSaved(binder: Binder) {
		void navigate({
			to: "/vault/binders/$binderId",
			params: { binderId: binder.id },
		});
	}

	// Collect sets the user owns cards in, sorted by owned count desc
	const ownedSetEntries = tree
		.flatMap((series) =>
			series.sets
				.filter((set) => (countBySet.get(set.id) ?? 0) > 0)
				.map((set) => ({ series, set })),
		)
		.sort(
			(a, b) =>
				(countBySet.get(b.set.id) ?? 0) - (countBySet.get(a.set.id) ?? 0),
		)
		.slice(0, MAX_SET_TILES);

	const hasOwnedCards = countBySet.size > 0;

	return (
		<Stagger className="space-y-0">
			{/* Page head */}
			<VaultPageHeader
				title="Overview"
				subtitle="Every copy you own, joined live to the corpus."
			/>

			{/* Summary bezel */}
			<div className="mt-7">
				<VaultSummaryHero />
			</div>

			{/* Set completion */}
			<VaultSection
				title="Set completion"
				action={
					<Link
						to="/vault/sets"
						className="text-[12.5px] font-medium text-[var(--primary)] hover:underline"
					>
						View all sets →
					</Link>
				}
			>
				{hasOwnedCards ? (
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{ownedSetEntries.map(({ series, set }) => (
							<SetTile
								key={set.id}
								seriesSlug={series.slug}
								set={set}
								ownedCount={countBySet.get(set.id) ?? 0}
								vaultLink
							/>
						))}
					</div>
				) : (
					<GlassPanel className="py-10 text-center">
						<p className="text-[var(--ink-muted)]">
							No cards yet,{" "}
							<Link to="/" className="text-[var(--primary)] hover:underline">
								browse a set
							</Link>{" "}
							to start your collection.
						</p>
					</GlassPanel>
				)}
			</VaultSection>

			{/* Binders */}
			<VaultSection
				title="Binders"
				action={
					<Button
						variant="soft"
						size="sm"
						onClick={() => setNewBinderOpen(true)}
					>
						New binder
					</Button>
				}
			>
				{binderIds.length === 0 ? (
					<GlassPanel className="py-10 text-center space-y-3">
						<p className="text-[var(--ink-muted)]">
							No binders yet. Create one to organize your collection.
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setNewBinderOpen(true)}
						>
							New binder
						</Button>
					</GlassPanel>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{binderIds.map((id) => (
							<BinderCard key={id} binderId={id} />
						))}
					</div>
				)}
			</VaultSection>

			<BinderFormDialog
				open={newBinderOpen}
				onOpenChange={setNewBinderOpen}
				onSaved={handleBinderSaved}
			/>
		</Stagger>
	);
}

function VaultOverviewLoaded() {
	const tree = Route.useLoaderData();
	return <VaultOverviewInner tree={tree} />;
}

function VaultOverview() {
	return (
		<ClientOnly
			fallback={
				<div className="space-y-4 py-6">
					<VaultPageHeader
						title="Overview"
						subtitle="Every copy you own, joined live to the corpus."
					/>
				</div>
			}
		>
			<VaultOverviewLoaded />
		</ClientOnly>
	);
}
