import { ClientOnly, Link, type LinkProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { cardModalLinkProps } from "../../lib/card-route";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import { useStore } from "../../store";
import { loadCorpus, useSlugIndex } from "../../store/corpus/corpus-runtime";
import { useRecentsStore } from "../../store/recents";
import { HoloCardIsland } from "./holo-card-island";

function RecentsInner() {
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);

	// Recents store only id/setId/name — resolving the card-detail link needs the
	// corpus + sets slug index, so load them when there are cards to link. Both
	// are idempotent + IndexedDB-cached, so a returning visitor pays nothing.
	const slugIndex = useSlugIndex();
	useEffect(() => {
		if (recentlyViewed.length === 0) return;
		void loadCorpus();
		void useStore.getState().loadSets();
	}, [recentlyViewed.length]);

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
						{recentlyViewed.map((card) => {
							// Real card-detail link once the slug index is ready; until then
							// fall back to a name search so the tile is never a dead click.
							const linkProps: LinkProps = (slugIndex &&
								cardModalLinkProps(slugIndex, card)) || {
								to: "/search",
								search: { ...LIST_SEARCH_DEFAULTS, q: card.name },
							};
							return (
								<Link
									key={card.id}
									{...linkProps}
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
							);
						})}
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
