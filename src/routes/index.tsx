import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
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
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col px-4">
			<div className="relative flex flex-col items-center overflow-hidden py-16 text-center">
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

					<Eyebrow className="mt-5">Browse · collect · admire the holo</Eyebrow>

					<h1
						className="mt-4 text-5xl font-semibold tracking-[-0.01em] text-balance md:text-6xl"
						style={{ fontFamily: "var(--font-display)" }}
					>
						Pokémon TCG
						<br />
						Holo Playground
					</h1>

					<p className="mt-3 text-base text-[var(--ink-muted)]">
						Search the catalog · admire the holo
					</p>

					{/* Glass pill search form */}
					<form action="/search" method="get" className="mt-6 w-full max-w-md">
						<div className="relative flex items-center rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[box-shadow] focus-within:border-[var(--primary)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_var(--primary-wash)]">
							<Search
								className="pointer-events-none ml-4 mr-1 size-4 shrink-0 text-[var(--faint)]"
								aria-hidden="true"
							/>
							<input
								type="search"
								name="q"
								placeholder="Search cards by name…"
								aria-label="Search cards by name"
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
	);
}

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{
				title:
					"Pokémon TCG Holo Playground — browse & admire holographic cards",
			},
			{
				name: "description",
				content:
					"Browse the full Pokémon Trading Card Game catalog by series and set, search any card, and view interactive holographic renders.",
			},
		],
	}),
	component: HomeHero,
});
