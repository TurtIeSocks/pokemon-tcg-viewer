import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SetTile } from "@/components/shell/set-tile";
import { Stagger } from "@/components/ui/motion";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavTree } from "../../lib/nav-tree";

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
						{tree.map((series) => (
							<EraTile key={series.slug} series={series} />
						))}
					</div>
				</HomeSection>
			</Stagger>
		</div>
	);
}

/**
 * A "browse by era" tile: the SetTile glass treatment (blurred backdrop, frosted
 * pane, hover sheen) with era content — the release year up top, the full series
 * name front and center (dramatic drop shadow so it pops off the glass), and the
 * set count along the bottom. Links to the era's newest set; backdrop reuses that
 * set's logo for a per-era color field.
 */
function EraTile({ series }: { series: NavTree[number] }) {
	const target = series.sets.at(-1);
	if (!target) return null;
	const count = series.sets.length;
	const logo = target.logo || undefined;
	return (
		<Link
			to="/$series/$set"
			params={{ series: series.slug, set: target.slug }}
			search={LIST_SEARCH_DEFAULTS}
			aria-label={`Browse ${series.name}`}
			className="group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0"
		>
			{/* Backdrop: the era's newest set logo, blurred → per-era color field. */}
			{logo ? (
				<img
					src={logo}
					alt=""
					aria-hidden="true"
					className="absolute inset-0 h-full w-full scale-[1.7] object-contain opacity-40 blur-2xl saturate-150 transition-opacity duration-300 group-hover:opacity-60"
				/>
			) : null}
			<span
				aria-hidden="true"
				className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/75"
			/>
			<span
				aria-hidden="true"
				className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)] backdrop-blur-xl"
			/>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
			/>
			{/* Content: year up top, monogram badge centered, set count at the base. */}
			<span className="relative z-10 flex h-full flex-col items-center justify-between gap-2 p-4">
				<span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white/65 tabular-nums drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
					{series.year}
				</span>
				<span className="flex flex-1 items-center justify-center px-1">
					<span className="text-balance text-center font-display text-xl font-bold text-white drop-shadow-[0_3px_20px_rgba(0,0,0,0.95)]">
						{series.name}
					</span>
				</span>
				<span className="text-sm font-medium text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
					{count} {count === 1 ? "set" : "sets"}
				</span>
			</span>
		</Link>
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
