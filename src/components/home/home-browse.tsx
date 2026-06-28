import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { SetTile } from "@/components/shell/set-tile";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Stagger } from "@/components/ui/motion";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { NavTree } from "../../lib/nav-tree";
import {
	loadCorpus,
	useCorpusRuntime,
} from "../../store/corpus/corpus-runtime";

// SSR fallback for the catalog card count; swapped for the live corpus count
// once it loads on the client. Kept roughly in sync with the deployed corpus.
const CARD_COUNT_FALLBACK = 20359;
const LATEST_COUNT = 8;

/**
 * Evergreen "explore the catalog" body below the home hero — a credibility stat
 * line, a browse-by-era pill cloud, and a grid of the newest sets. Always present
 * and server-rendered (nav tree comes from the root loader), so the home page has
 * a real body in every state, recents or not. Distinct from the Vault Overview:
 * this is all-sets *discovery* (browse links), not owned-set completion.
 */
export function HomeBrowse({ tree }: { tree: NavTree }) {
	// The card count is the only corpus-dependent value; everything else is
	// tree-derived + SSR'd. Load the corpus lazily (idempotent, IDB-cached).
	useEffect(() => {
		void loadCorpus();
	}, []);
	const cardCount =
		useCorpusRuntime((s) => s.index)?.cards.length ?? CARD_COUNT_FALLBACK;

	const setCount = tree.reduce((n, s) => n + s.sets.length, 0);
	const eraCount = tree.length;

	// Newest sets: flatten the whole tree and sort by era year desc, so the grid
	// is always full even when the most recent series has only a set or two.
	const latest = tree
		.flatMap((series) => series.sets.map((set) => ({ series, set })))
		.sort((a, b) => b.series.year - a.series.year)
		.slice(0, LATEST_COUNT);

	return (
		<div className="w-full">
			<Stagger className="space-y-0">
				{/* Proof strip — catalog scale + the free/no-account promise. */}
				<div className="flex flex-col items-center border-t border-[var(--hairline)] pt-8 text-center">
					<Eyebrow>Explore the catalog</Eyebrow>
					<p className="mt-3 flex flex-wrap justify-center gap-x-2 font-mono text-sm tabular-nums text-[var(--ink-muted)]">
						<span>{cardCount.toLocaleString()} cards</span>
						<Dot />
						<span>{setCount} sets</span>
						<Dot />
						<span>{eraCount} eras</span>
						<Dot />
						<span className="text-[var(--primary)]">
							always free, no account
						</span>
					</p>
				</div>

				{/* Browse by era — one pill per series, linking to its newest set. */}
				<HomeSection title="Browse by era">
					<div className="flex flex-wrap justify-center gap-2">
						{tree.map((series) => {
							const target = series.sets.at(-1);
							if (!target) return null;
							return (
								<Button key={series.slug} variant="soft" size="sm" asChild>
									<Link
										to="/$series/$set"
										params={{ series: series.slug, set: target.slug }}
										search={LIST_SEARCH_DEFAULTS}
									>
										{series.name}
									</Link>
								</Button>
							);
						})}
					</div>
				</HomeSection>

				{/* Browse by card type — the non-Pokémon supertypes get their own pages. */}
				<HomeSection title="Browse by card type">
					<div className="flex flex-wrap justify-center gap-2">
						<Button variant="soft" size="sm" asChild>
							<Link to="/pokemon">Pokémon</Link>
						</Button>
						<Button variant="soft" size="sm" asChild>
							<Link to="/trainer" search={LIST_SEARCH_DEFAULTS}>
								Trainers
							</Link>
						</Button>
						<Button variant="soft" size="sm" asChild>
							<Link to="/energy" search={LIST_SEARCH_DEFAULTS}>
								Energy
							</Link>
						</Button>
					</div>
				</HomeSection>

				{/* Latest sets — the newest releases as browse-variant tiles. */}
				<HomeSection title="Latest sets">
					<div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
						{latest.map(({ series, set }) => (
							<SetTile key={set.id} seriesSlug={series.slug} set={set} />
						))}
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
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="mt-8 space-y-4 border-t border-[var(--hairline)] pt-8">
			<h2 className="text-center font-display text-[21px] font-medium text-[var(--ink)]">
				{title}
			</h2>
			{children}
		</section>
	);
}

/** Faint middot separator for the proof strip. */
function Dot() {
	return (
		<span aria-hidden="true" className="text-[var(--faint)]">
			·
		</span>
	);
}
