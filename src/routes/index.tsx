import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Layers, Library, Search, Sparkles, Users, Zap } from "lucide-react";
import { useEffect } from "react";
import { HomeBrowse } from "../components/home/home-browse";
import {
	LaunchTileButton,
	LaunchTileLink,
} from "../components/home/launch-tile";
import { Eyebrow } from "../components/ui/eyebrow";
import { Stagger } from "../components/ui/motion";
import { bcp47 } from "../lib/bcp47";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
import { POKEDEX_FILTER_DEFAULTS } from "../lib/pokedex";
import { m } from "../paraglide/messages";
import { getLocale } from "../paraglide/runtime";
import { useCommandPalette } from "../store/command-palette";
import { loadCorpus, useCorpusRuntime } from "../store/corpus/corpus-runtime";
import { useActiveRegionNavTree } from "../store/corpus/region-nav-tree";

const BACKDROP = [
	{ key: "a", cls: "rotate-[-15deg]", delay: "0s" },
	{ key: "b", cls: "rotate-[-5deg] scale-125", delay: "0.6s" },
	{ key: "c", cls: "rotate-6 scale-110", delay: "1.1s" },
	{ key: "d", cls: "rotate-15", delay: "1.6s" },
];

// SSR fallback for the catalog card count; swapped for the live corpus count once
// it loads on the client. Kept roughly in sync with the deployed corpus.
const CARD_COUNT_FALLBACK = 20359;

/** Scroll the Browse-by-era shelf into view; honor reduced-motion for the sweep. */
function scrollToEras() {
	const el = document.getElementById("browse-by-era");
	if (!el) return;
	const reduce = window.matchMedia?.(
		"(prefers-reduced-motion: reduce)",
	).matches;
	el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function HomeHero() {
	// Nav tree comes from the root loader (SSR-fetched, west); follow the active
	// region so switching to an Asian language reshapes the browse launchpad.
	const tree = useActiveRegionNavTree(getRouteApi("__root__").useLoaderData());
	// Per-field selector (S3) — the Search launch card opens the ⌘K palette,
	// the same action the header/bottom-nav Search buttons dispatch.
	const openPalette = useCommandPalette((s) => s.setOpen);

	// Catalog scale, shown under the hero tagline. cardCount comes from the corpus
	// (loaded lazily, IDB-cached); sets/eras are tree-derived and SSR safe.
	useEffect(() => {
		void loadCorpus();
	}, []);
	const cardCount =
		useCorpusRuntime((s) => s.index)?.cards.length ?? CARD_COUNT_FALLBACK;
	const setCount = tree.reduce((n, s) => n + s.sets.length, 0);
	const eraCount = tree.length;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pb-12 sm:pb-16">
			{/* my-auto centers the content when it fits the viewport and collapses
			    to 0 (top-aligned, scrollable, no clipping) once it overflows. The
			    hero title stays a narrow centered column; the launch pad widens
			    below it as the page's centerpiece. */}
			<div className="my-auto flex w-full flex-col items-center">
				{/* Hero title + tagline */}
				<div className="relative flex w-full max-w-2xl flex-col items-center overflow-hidden py-10 text-center sm:py-14">
					{/* Floating card backdrop */}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 opacity-15"
					>
						{BACKDROP.map((c) => (
							<div
								key={c.key}
								style={{ animationDelay: c.delay }}
								className={`h-44 w-32 rounded-xl bg-[linear-gradient(115deg,#ffdb70_8%,#c680ff_34%,#63ceff_62%,#ff9ad0_88%)] shadow-[0_10px_40px_rgba(124,77,255,0.5)] animate-[float-card_6s_ease-in-out_infinite] motion-reduce:animate-none ${c.cls}`}
							/>
						))}
					</div>

					{/* Staggered hero content */}
					<Stagger className="relative flex flex-col items-center gap-0">
						<img src="/logo-64.png" alt="" className="size-14" />

						<Eyebrow className="mt-6">{m.home_eyebrow()}</Eyebrow>

						<h1
							className="mt-5 text-5xl font-semibold tracking-[-0.01em] text-balance md:text-6xl"
							style={{ fontFamily: "var(--font-display)" }}
						>
							{/* ponytail: placeholder wordmark; real hero headline TBD (workshop).
							    Brand name — not translated, like any other wordmark. */}
							Cardstack
						</h1>

						<p className="mt-4 max-w-md text-base text-(--ink-muted)">
							{m.home_tagline()}
						</p>

						{/* Catalog scale + the free/no-account promise. Plain interpolation
						    (not ICU plural) for the three counts — index.test.tsx pins the
						    existing "1 sets"/"1 eras" (ungrammatical but tested) output. */}
						<p className="mt-5 flex flex-wrap justify-center gap-x-2 font-mono text-sm tabular-nums text-(--ink-muted)">
							<span>
								{m.home_stat_cards({
									count: cardCount.toLocaleString(bcp47(getLocale())),
								})}
							</span>
							<span aria-hidden="true" className="text-(--faint)">
								·
							</span>
							<span>{m.home_stat_sets({ count: setCount })}</span>
							<span aria-hidden="true" className="text-(--faint)">
								·
							</span>
							<span>{m.home_stat_eras({ count: eraCount })}</span>
							<span aria-hidden="true" className="text-(--faint)">
								·
							</span>
							<span className="text-(--primary)">
								{m.home_stat_free_no_account()}
							</span>
						</p>
					</Stagger>
				</div>

				{/* Launch pad — six big glass cards, the page's primary navigation.
				    2 columns on mobile, 3 on desktop. Top row = Search / era-browse /
				    Vault; bottom row = the card-type trio (Pokémon, Trainers, Energy). */}
				<nav
					aria-label={m.home_explore_nav()}
					className="grid w-full max-w-3xl grid-cols-2 gap-3.5 sm:grid-cols-3"
				>
					<LaunchTileButton
						icon={Search}
						title={m.nav_search()}
						subtitle={m.home_search_subtitle()}
						onClick={() => openPalette(true)}
					/>
					<LaunchTileButton
						icon={Layers}
						title={m.home_browse_by_era()}
						subtitle={m.home_browse_by_era_subtitle()}
						onClick={scrollToEras}
					/>
					<LaunchTileLink
						to="/vault"
						icon={Library}
						title={m.nav_vault()}
						subtitle={m.home_vault_subtitle()}
					/>
					<LaunchTileLink
						to="/pokemon"
						search={POKEDEX_FILTER_DEFAULTS}
						icon={Sparkles}
						title={m.home_supertype_pokemon()}
						subtitle={m.home_pokemon_subtitle()}
					/>
					<LaunchTileLink
						to="/trainer"
						search={LIST_SEARCH_DEFAULTS}
						icon={Users}
						title={m.home_supertype_trainers()}
						subtitle={m.home_trainers_subtitle()}
					/>
					<LaunchTileLink
						to="/energy"
						search={LIST_SEARCH_DEFAULTS}
						icon={Zap}
						title={m.home_supertype_energy()}
						subtitle={m.home_energy_subtitle()}
					/>
				</nav>

				<HomeBrowse tree={tree} />
			</div>
		</div>
	);
}

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title: m.home_meta_title(),
			},
			{
				name: "description",
				content: m.home_meta_description(),
			},
		],
	}),
	component: HomeHero,
});
