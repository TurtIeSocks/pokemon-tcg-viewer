import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Layers, Library, Search, Sparkles, Users, Zap } from "lucide-react";
import { useEffect } from "react";
import { HomeBrowse } from "../components/home/home-browse";
import {
	LaunchTileButton,
	LaunchTileLink,
} from "../components/home/launch-tile";
import { HomeRecents } from "../components/islands/home-recents";
import { Eyebrow } from "../components/ui/eyebrow";
import { Stagger } from "../components/ui/motion";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";
import { POKEDEX_FILTER_DEFAULTS } from "../lib/pokedex";
import { useCommandPalette } from "../store/command-palette";
import { loadCorpus, useCorpusRuntime } from "../store/corpus/corpus-runtime";
import { useActiveRegionNavTree } from "../store/corpus/region-nav-tree";

const BACKDROP = [
	{ key: "a", cls: "-rotate-[15deg]", delay: "0s" },
	{ key: "b", cls: "-rotate-[5deg] scale-125", delay: "0.6s" },
	{ key: "c", cls: "rotate-[6deg] scale-110", delay: "1.1s" },
	{ key: "d", cls: "rotate-[15deg]", delay: "1.6s" },
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

						<Eyebrow className="mt-6">Browse · Collect · Own it</Eyebrow>

						<h1
							className="mt-5 text-5xl font-semibold tracking-[-0.01em] text-balance md:text-6xl"
							style={{ fontFamily: "var(--font-display)" }}
						>
							{/* ponytail: placeholder wordmark; real hero headline TBD (workshop) */}
							Cardstack
						</h1>

						<p className="mt-4 max-w-md text-base text-[var(--ink-muted)]">
							Track your whole Pokémon TCG collection. Local-first and
							open-source, so it's actually yours. No account to start, no
							judgment about the fourth Charizard.
						</p>

						{/* Catalog scale + the free/no-account promise. */}
						<p className="mt-5 flex flex-wrap justify-center gap-x-2 font-mono text-sm tabular-nums text-[var(--ink-muted)]">
							<span>{cardCount.toLocaleString()} cards</span>
							<span aria-hidden="true" className="text-[var(--faint)]">
								·
							</span>
							<span>{setCount} sets</span>
							<span aria-hidden="true" className="text-[var(--faint)]">
								·
							</span>
							<span>{eraCount} eras</span>
							<span aria-hidden="true" className="text-[var(--faint)]">
								·
							</span>
							<span className="text-[var(--primary)]">
								always free, no account
							</span>
						</p>
					</Stagger>
				</div>

				{/* Launch pad — six big glass cards, the page's primary navigation.
				    2 columns on mobile, 3 on desktop. Top row = Search / era-browse /
				    Vault; bottom row = the card-type trio (Pokémon, Trainers, Energy). */}
				<nav
					aria-label="Explore"
					className="grid w-full max-w-3xl grid-cols-2 gap-3.5 sm:grid-cols-3"
				>
					<LaunchTileButton
						icon={Search}
						title="Search"
						subtitle="Find any card. ⌘K"
						onClick={() => openPalette(true)}
					/>
					<LaunchTileButton
						icon={Layers}
						title="Browse by era"
						subtitle="From Base Set to the latest."
						onClick={scrollToEras}
					/>
					<LaunchTileLink
						to="/vault"
						icon={Library}
						title="Your Vault"
						subtitle="Your collection and binders."
					/>
					<LaunchTileLink
						to="/pokemon"
						search={POKEDEX_FILTER_DEFAULTS}
						icon={Sparkles}
						title="Pokémon"
						subtitle="Browse every Pokémon card."
					/>
					<LaunchTileLink
						to="/trainer"
						search={LIST_SEARCH_DEFAULTS}
						icon={Users}
						title="Trainers"
						subtitle="Supporters, items, and stadiums."
					/>
					<LaunchTileLink
						to="/energy"
						search={LIST_SEARCH_DEFAULTS}
						icon={Zap}
						title="Energy"
						subtitle="Basic and special Energy."
					/>
				</nav>

				<div className="mt-6 w-full max-w-2xl">
					<HomeRecents />
				</div>

				<HomeBrowse tree={tree} />
			</div>
		</div>
	);
}

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title: "Cardstack: track your Pokémon TCG collection, local-first",
			},
			{
				name: "description",
				content:
					"Cardstack tracks your whole Pokémon TCG collection. Local-first and open-source, so your data stays yours. Browse the full catalog free, no account needed.",
			},
		],
	}),
	component: HomeHero,
});
