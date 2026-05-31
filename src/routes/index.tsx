import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeRecents } from "../components/islands/home-recents";

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

				<img src="/logo-64.png" alt="" className="relative size-14" />
				<h1 className="relative mt-3 text-2xl font-bold">
					Pokémon TCG Holo Playground
				</h1>
				<p className="relative mt-1 text-sm text-muted-foreground">
					Search the catalog · admire the holo
				</p>

				{/* Native GET form: works without JS, TanStack intercepts when hydrated. */}
				<form action="/search" method="get" className="relative mt-5 w-full max-w-md">
					<input
						type="search"
						name="q"
						placeholder="Search cards by name…"
						aria-label="Search cards by name"
						className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
					/>
				</form>

				<div className="relative mt-4 flex flex-wrap justify-center gap-2">
					{POPULAR.map((name) => (
						<Link
							key={name}
							to="/search"
							search={{ q: name }}
							className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/80"
						>
							{name}
						</Link>
					))}
				</div>
			</div>

			<HomeRecents />
		</div>
	);
}

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Pokémon TCG Holo Playground — browse & admire holographic cards" },
			{
				name: "description",
				content:
					"Browse the full Pokémon Trading Card Game catalog by series and set, search any card, and view interactive holographic renders.",
			},
		],
	}),
	component: HomeHero,
});
