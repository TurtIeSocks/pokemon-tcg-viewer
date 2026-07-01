import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { HomeBrowse } from "../components/home/home-browse";
import { HomeRecents } from "../components/islands/home-recents";
import { Button } from "../components/ui/button";
import { Eyebrow } from "../components/ui/eyebrow";
import { Stagger } from "../components/ui/motion";
import { LIST_SEARCH_DEFAULTS } from "../lib/list-search";

const POPULAR = ["Pikachu", "Charizard", "Eevee", "Mewtwo", "Gengar"];

const BACKDROP = [
	{ key: "a", cls: "-rotate-[15deg]", delay: "0s" },
	{ key: "b", cls: "-rotate-[5deg] scale-125", delay: "0.6s" },
	{ key: "c", cls: "rotate-[6deg] scale-110", delay: "1.1s" },
	{ key: "d", cls: "rotate-[15deg]", delay: "1.6s" },
];

export function HomeHero() {
	// Nav tree comes from the root loader (already SSR-fetched + deduped); the
	// browse launchpad renders from it server-side, no loader added to "/".
	const tree = getRouteApi("__root__").useLoaderData();
	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pb-12 sm:pb-16">
			{/* my-auto centers the content when it fits the viewport and collapses
			    to 0 (top-aligned, scrollable, no clipping) once it overflows. The
			    hero + recents stay a narrow centered column; the browse launchpad
			    below widens to fill. */}
			<div className="my-auto flex w-full flex-col items-center">
				<div className="flex w-full max-w-2xl flex-col">
					<div className="relative flex w-full flex-col items-center overflow-hidden py-12 text-center sm:py-16">
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

							{/* Glass pill search form */}
							<form
								action="/search"
								method="get"
								className="mt-8 w-full max-w-md"
							>
								<div className="relative flex items-center rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[box-shadow] focus-within:border-[var(--primary)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_var(--primary-wash)]">
									<Search
										className="pointer-events-none ml-4 mr-1 size-4 shrink-0 text-[var(--faint)]"
										aria-hidden="true"
									/>
									<input
										type="search"
										name="q"
										placeholder="Search any card by name…"
										aria-label="Search any card by name"
										className="h-11 w-full bg-transparent px-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
									/>
								</div>
							</form>

							{/* Quick-search pills */}
							<div className="mt-4 flex flex-wrap justify-center gap-2">
								{POPULAR.map((name) => (
									<Button key={name} variant="soft" size="sm" asChild>
										<Link
											to="/search"
											search={{ ...LIST_SEARCH_DEFAULTS, q: name }}
										>
											{name}
										</Link>
									</Button>
								))}
							</div>
						</Stagger>
					</div>

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
