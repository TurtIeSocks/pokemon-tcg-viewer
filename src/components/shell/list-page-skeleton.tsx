import { Skeleton } from "@/components/ui/skeleton";

/** Local copy of the official TCG card back (downloaded to public/card-back.jpg). */
export const CARD_BACK_SRC = "/card-back.jpg";

// Must match CardGridIsland's grid so the skeleton -> cards swap doesn't reflow.
const GRID_CLASS =
	"grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

const SKELETON_KEYS = Array.from(
	{ length: 20 },
	(_, i) => `card-skeleton-${i}`,
);

/** A grid of pulsing card backs — the loading state for a card list. */
export function SkeletonGrid() {
	return (
		<ul className={GRID_CLASS}>
			{SKELETON_KEYS.map((key) => (
				<li key={key} className="animate-pulse">
					<img
						src={CARD_BACK_SRC}
						alt=""
						aria-hidden
						className="aspect-[5/7] w-full rounded-lg object-cover"
					/>
				</li>
			))}
		</ul>
	);
}

/**
 * Route pendingComponent for the card-list routes. Shown while a loader runs on
 * navigation so the previous page's cards don't linger: a title placeholder plus
 * a grid of card backs that the real cards then flip in over (see FlipCard).
 */
export function ListPageSkeleton() {
	return (
		<div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden px-4 py-5">
			<div className="mb-3 flex items-center gap-3">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-4 w-16" />
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<SkeletonGrid />
			</div>
		</div>
	);
}
