// src/routes/profile.tsx
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CollectorAvatar } from "@/components/profile/collector-avatar";
import { ProfileFormDialog } from "@/components/profile/profile-form-dialog";
import { SetTile } from "@/components/shell/set-tile";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { BezelPanel, GlassPanel } from "@/components/ui/glass";
import { Stagger } from "@/components/ui/motion";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Stat } from "@/components/ui/stat";
import type { NavTree } from "../lib/nav-tree";
import { getNavTreeFn } from "../server/nav-tree";
import { useEnsureCorpus } from "../store/corpus/use-ensure-corpus";
import { useOwnedCountBySet } from "../store/userland/selectors";
import { useCollectionStats } from "../store/userland/stats";
import { useUserland } from "../store/userland/userland-store";

export const Route = createFileRoute("/profile")({
	loader: () => getNavTreeFn(),
	head: () => ({ meta: [{ title: "Your profile · Cardstack" }] }),
	component: ProfilePage,
});

const USD = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0,
});

/** Format a "collecting since" epoch as a year, or "—" when empty. */
function sinceYear(ms: number | null): string {
	return ms === null ? "—" : String(new Date(ms).getFullYear());
}

/** Exported for tests; pass tree directly to bypass Route.useLoaderData(). */
export function ProfilePageInner({ tree }: { tree: NavTree }) {
	useEnsureCorpus();
	const profile = useUserland((s) => s.profile);
	const stats = useCollectionStats();
	const countBySet = useOwnedCountBySet();
	const [editOpen, setEditOpen] = useState(false);

	const displayName = profile?.displayName || "Collector";
	const preset = profile?.avatarPreset ?? "dusk";

	const favorite =
		profile?.favoriteSetId != null
			? tree
					.flatMap((series) => series.sets.map((set) => ({ series, set })))
					.find(({ set }) => set.id === profile.favoriteSetId)
			: undefined;

	return (
		<Stagger className="space-y-0">
			{/* Hero */}
			<div className="space-y-1.5">
				<Eyebrow>Your profile</Eyebrow>
			</div>
			<BezelPanel className="mt-2">
				<div className="flex flex-wrap items-center gap-5">
					<CollectorAvatar
						displayName={displayName}
						preset={preset}
						className="text-3xl size-18"
					/>
					<div className="flex-1 space-y-1">
						<h1 className="font-display text-[clamp(1.6rem,3.5vw,2.25rem)] font-semibold leading-none tracking-tight text-[var(--ink)]">
							{displayName}
						</h1>
						<p className="text-[15px] text-[var(--ink-muted)]">
							{profile?.bio || "No bio yet. Add the cards you chase."}
						</p>
					</div>
					<Button variant="soft" size="sm" onClick={() => setEditOpen(true)}>
						Edit profile
					</Button>
				</div>
			</BezelPanel>

			{/* Collector stats */}
			<section className="mt-8">
				<BezelPanel>
					<div className="flex flex-wrap items-center gap-7">
						<ProgressRing pct={stats.completionPct} size={88} stroke={8}>
							<div className="flex flex-col items-center leading-none">
								<span className="font-mono text-[21px] font-medium tabular-nums text-[var(--ink)]">
									{stats.completionPct}%
								</span>
								<span className="mt-0.5 text-[9.5px] uppercase tracking-[0.10em] text-[var(--faint)]">
									complete
								</span>
							</div>
						</ProgressRing>
						<div className="flex flex-1 flex-wrap gap-8">
							<Stat
								value={stats.cardsOwned.toLocaleString()}
								label="cards owned"
							/>
							<Stat
								value={stats.setsTouched.toLocaleString()}
								label="sets touched"
							/>
							{stats.estValue !== null && (
								<Stat
									value={USD.format(stats.estValue / 100)}
									label="est. value"
								/>
							)}
							<Stat
								value={sinceYear(stats.collectingSince)}
								label="collecting since"
							/>
						</div>
					</div>
				</BezelPanel>
			</section>

			{/* Favorite set */}
			<section className="mt-8 space-y-3.5">
				<h2 className="font-display text-[21px] font-medium text-[var(--ink)]">
					Favorite set
				</h2>
				{favorite ? (
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						<SetTile
							seriesSlug={favorite.series.slug}
							set={favorite.set}
							ownedCount={countBySet.get(favorite.set.id) ?? 0}
							vaultLink
						/>
					</div>
				) : (
					<GlassPanel className="py-10 text-center space-y-3">
						<p className="text-[var(--ink-muted)]">
							No favorite set yet. Pick the one you'd show off first.
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditOpen(true)}
						>
							Pick favorite set
						</Button>
					</GlassPanel>
				)}
			</section>

			<ProfileFormDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				profile={profile}
			/>
		</Stagger>
	);
}

function ProfilePageLoaded() {
	const tree = Route.useLoaderData();
	return <ProfilePageInner tree={tree} />;
}

function ProfilePage() {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-7xl px-4 py-5">
				<ClientOnly
					fallback={
						<div className="space-y-1.5">
							<Eyebrow>Your profile</Eyebrow>
							<h1 className="font-display text-3xl font-semibold text-[var(--ink)]">
								Collector
							</h1>
						</div>
					}
				>
					<ProfilePageLoaded />
				</ClientOnly>
			</div>
		</div>
	);
}
