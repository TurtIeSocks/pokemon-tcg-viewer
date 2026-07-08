import { ClientOnly, Link, type LinkProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { cardModalLinkProps } from "../../lib/card-route";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { SlugIndex } from "../../lib/slug";
import { useStore } from "../../store";
import { loadCorpus, useSlugIndex } from "../../store/corpus/corpus-runtime";
import { useRecentsStore } from "../../store/recents";
import { useIsOwned } from "../../store/userland/selectors";
import { type HoloCardData, holoCardProps } from "../holo-card";
import { CardMiniNav } from "../holo-card/card-mini-nav";
import { HoloCardIsland } from "./holo-card-island";

const LABEL_CLS =
	"text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]";

/**
 * One "recently viewed" tile. Subscribes to its own card's ownership (S3) so the
 * unowned-grayscale signal + unified mini-nav match every other card grid. The
 * tile is wide enough to seat the mini-nav pill in its lower third.
 */
function RecentCard({
	card,
	slugIndex,
}: {
	card: HoloCardData;
	slugIndex: SlugIndex | null;
}) {
	const owned = useIsOwned(card.id);
	// Real card-detail link once the slug index is ready; until then fall back to
	// a name search so the tile is never a dead click.
	const linkProps: LinkProps = (slugIndex &&
		cardModalLinkProps(slugIndex, card)) || {
		to: "/search",
		search: { ...LIST_SEARCH_DEFAULTS, q: card.name },
	};
	return (
		<Link {...linkProps} style={{ width: 128 }} className="shrink-0">
			<HoloCardIsland
				{...holoCardProps(card)}
				owned={owned}
				miniNav={<CardMiniNav card={card} />}
			/>
		</Link>
	);
}

function RecentsInner() {
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);
	const clearRecentlyViewed = useRecentsStore((s) => s.clearRecentlyViewed);

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
		<div className="space-y-5 border-t border-[var(--border)] py-6">
			{recentSearches.length > 0 && (
				<section>
					<div className="mb-2 flex items-center justify-between">
						<h2 className={LABEL_CLS}>Recent searches</h2>
						<button
							type="button"
							onClick={clearRecentSearches}
							className="text-[10.5px] text-[var(--faint)] transition-colors hover:text-[var(--ink-muted)]"
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
								className="rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--ink-muted)] transition-colors hover:border-[var(--primary-wash)] hover:bg-[var(--primary-wash)] hover:text-[var(--primary)]"
							>
								{q}
							</Link>
						))}
					</div>
				</section>
			)}
			{recentlyViewed.length > 0 && (
				<section>
					<div className="mb-2 flex items-center justify-between">
						<h2 className={LABEL_CLS}>Recently viewed</h2>
						<button
							type="button"
							onClick={clearRecentlyViewed}
							className="text-[10.5px] text-[var(--faint)] transition-colors hover:text-[var(--ink-muted)]"
						>
							Clear
						</button>
					</div>
					<div className="flex gap-3 overflow-x-auto pb-2">
						{recentlyViewed.map((card) => (
							<RecentCard key={card.id} card={card} slugIndex={slugIndex} />
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
