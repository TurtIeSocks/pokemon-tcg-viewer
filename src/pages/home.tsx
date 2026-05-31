import { useNavigate } from "react-router";
import { HoloCard } from "../components/holo-card";
import { SearchInput } from "../components/search-bar/search-input";
import { useNameQueryParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import { useRecentsStore } from "../store/recents";

const POPULAR_POKEMON = ["Pikachu", "Charizard", "Eevee", "Mewtwo", "Gengar"];

// Decorative holo cards behind the hero. Tailwind v4 keeps rotate/scale as
// their own properties, so they compose with the float-card `translate`
// animation without clobbering each other.
const BACKDROP = [
	{ transform: "-rotate-[15deg]", delay: "0s" },
	{ transform: "-rotate-[5deg] scale-125", delay: "0.6s" },
	{ transform: "rotate-[6deg] scale-110", delay: "1.1s" },
	{ transform: "rotate-[15deg]", delay: "1.6s" },
];

export function Home() {
	const navigate = useNavigate();
	const [, setQuery] = useNameQueryParam();
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);
	const owned = useStore((s) => s.owned);

	const hasRecents = recentSearches.length > 0 || recentlyViewed.length > 0;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col px-4">
			<div className="relative flex flex-col items-center overflow-hidden py-16 text-center">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 opacity-15"
				>
					{BACKDROP.map((c) => (
						<div
							key={c.transform}
							style={{ animationDelay: c.delay }}
							className={`h-44 w-32 rounded-xl bg-[linear-gradient(115deg,#ffdb70_8%,#c680ff_34%,#63ceff_62%,#ff9ad0_88%)] shadow-[0_10px_40px_rgba(124,77,255,0.5)] animate-[float-card_6s_ease-in-out_infinite] motion-reduce:animate-none ${c.transform}`}
						/>
					))}
				</div>

				<img
					src={`${import.meta.env.BASE_URL}logo-64.png`}
					alt=""
					className="relative size-14"
				/>
				<h1 className="relative mt-3 text-2xl font-bold">
					Pokémon TCG Holo Playground
				</h1>
				<p className="relative mt-1 text-sm text-muted-foreground">
					Search the catalog · admire the holo
				</p>
				<SearchInput autoFocus className="relative mt-5 w-full max-w-md" />
				<div className="relative mt-4 flex flex-wrap justify-center gap-2">
					{POPULAR_POKEMON.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => setQuery(name)}
							className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/80"
						>
							{name}
						</button>
					))}
				</div>
			</div>

			{hasRecents && (
				<div className="space-y-5 border-t border-border py-6">
					{recentSearches.length > 0 && (
						<section>
							<div className="mb-2 flex items-center justify-between">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Recent searches
								</h2>
								<button
									type="button"
									onClick={clearRecentSearches}
									className="text-xs text-muted-foreground hover:text-foreground"
								>
									Clear
								</button>
							</div>
							<div className="flex flex-wrap gap-2">
								{recentSearches.map((q) => (
									<button
										key={q}
										type="button"
										onClick={() => setQuery(q)}
										className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
									>
										{q}
									</button>
								))}
							</div>
						</section>
					)}
					{recentlyViewed.length > 0 && (
						<section>
							<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Recently viewed
							</h2>
							<div className="flex gap-3 overflow-x-auto pb-2">
								{recentlyViewed.map((card) => (
									<HoloCard
										key={card.id}
										imageUrl={card.imageUrl}
										imageUrlSmall={card.imageUrlSmall}
										name={card.name}
										rarity={card.rarity}
										subtypes={card.subtypes}
										supertype={card.supertype}
										setId={card.setId}
										series={card.setSeries}
										variants={card.variants}
										cardNumber={card.cardNumber}
										owned={!!owned[card.id]}
										onClick={(e) => {
											if (e.defaultPrevented) return;
											navigate(`/card/${card.id}`);
										}}
										style={{ width: 96 }}
									/>
								))}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
