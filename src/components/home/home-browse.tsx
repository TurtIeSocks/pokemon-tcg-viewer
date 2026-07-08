import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { SetTile } from "@/components/shell/set-tile";
import { Stagger } from "@/components/ui/motion";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavTree } from "../../lib/nav-tree";
import { LaunchTileLink } from "./launch-tile";

const LATEST_COUNT = 8;

// Series that aren't the physical, "core" TCG. Their sets stay in the sidebar +
// Browse-by-era, but are hidden from "Latest sets" — they sort as newest by year
// yet aren't collectible cards. Pokémon TCG Pocket is a digital-only mobile game
// (Genetic Apex etc.). Match on the derived series slug; extend the set to add more.
const NON_CORE_SERIES = new Set(["pokemon-tcg-pocket"]);

/**
 * Evergreen "explore the catalog" body below the home hero — a browse-by-era
 * pill cloud and a grid of the newest sets. Always present
 * and server-rendered (nav tree comes from the root loader), so the home page has
 * a real body in every state, recents or not. Distinct from the Vault Overview:
 * this is all-sets *discovery* (browse links), not owned-set completion.
 */
export function HomeBrowse({ tree }: { tree: NavTree }) {
	// Newest sets: flatten the whole tree and sort by era year desc, so the grid
	// is always full even when the most recent series has only a set or two.
	// Non-core series (TCG Pocket) are dropped here only — they remain in the
	// sidebar + the Browse-by-era cards below.
	const latest = tree
		.filter((series) => !NON_CORE_SERIES.has(series.slug))
		.flatMap((series) => series.sets.map((set) => ({ series, set })))
		.sort((a, b) => b.series.year - a.series.year)
		.slice(0, LATEST_COUNT);

	return (
		<div className="w-full">
			<Stagger className="space-y-0">
				{/* Latest sets — the newest releases as browse-variant tiles. */}
				<HomeSection title="Latest sets">
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
						{latest.map(({ series, set }) => (
							<SetTile key={set.id} seriesSlug={series.slug} set={set} />
						))}
					</div>
				</HomeSection>

				{/* Browse by era — a glass launch card per series, linking to its newest
				    set. Anchored: the launch pad's "Browse by era" card scrolls here. */}
				<HomeSection id="browse-by-era" title="Browse by era">
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
						{tree.map((series) => {
							const target = series.sets.at(-1);
							if (!target) return null;
							const count = series.sets.length;
							return (
								<LaunchTileLink
									key={series.slug}
									to="/$series/$set"
									params={{ series: series.slug, set: target.slug }}
									search={LIST_SEARCH_DEFAULTS}
									icon={Layers}
									title={series.name}
									subtitle={`${count} ${count === 1 ? "set" : "sets"}`}
								/>
							);
						})}
					</div>
				</HomeSection>
			</Stagger>
		</div>
	);
}

/**
 * A titled home-browse shelf — like the Vault's section, but center-aligned to
 * match the centered hero above (Vault sections left-align under a page header).
 */
function HomeSection({
	id,
	title,
	children,
}: {
	id?: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className="mt-8 scroll-mt-20 space-y-4 border-t border-[var(--hairline)] pt-8"
		>
			<h2 className="text-center font-display text-[21px] font-medium text-[var(--ink)]">
				{title}
			</h2>
			{children}
		</section>
	);
}
