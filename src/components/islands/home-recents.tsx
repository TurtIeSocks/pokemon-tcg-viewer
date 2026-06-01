import { ClientOnly, Link } from "@tanstack/react-router";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { useRecentsStore } from "../../store/recents";
import { HoloCardIsland } from "./holo-card-island";

function RecentsInner() {
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);

	if (recentSearches.length === 0 && recentlyViewed.length === 0) return null;

	return (
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
							<Link
								key={q}
								to="/search"
								search={{ ...LIST_SEARCH_DEFAULTS, q }}
								className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
							>
								{q}
							</Link>
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
							<Link
								key={card.id}
								to="/search"
								search={(prev) => ({
									q: card.name,
									types: prev.types ?? [],
									rarity: prev.rarity ?? [],
									supertype: prev.supertype ?? [],
									subtypes: prev.subtypes ?? [],
									view: "grid" as const,
								})}
								style={{ width: 96 }}
								className="shrink-0"
							>
								<HoloCardIsland
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
								/>
							</Link>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

/** Client-only recents (localStorage). Renders nothing on the server. */
export function HomeRecents() {
	return (
		<ClientOnly fallback={null}>
			<RecentsInner />
		</ClientOnly>
	);
}
