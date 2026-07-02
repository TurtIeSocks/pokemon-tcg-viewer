"use client";

import { cn } from "@/lib/utils";
import { cardThumbSrc, type HoloCardData } from "../holo-card";

/** Filter mode for the grid. */
export type OwnedMissingMode = "all" | "owned" | "missing";

/** Props for {@link OwnedMissingGrid}. */
interface OwnedMissingGridProps {
	/** Cards to render (already-hydrated corpus cards). */
	cards: HoloCardData[];
	/** Set of cardIds the user owns at least one copy of. */
	ownedCardIds: Set<string>;
	/**
	 * Which cards to show.
	 * - "all" (default): show every card in the list.
	 * - "owned": only show cards the user owns.
	 * - "missing": only show cards the user does not own.
	 */
	mode?: OwnedMissingMode;
	/**
	 * When provided, each card becomes an interactive button that calls this
	 * handler with the card's id. When absent, the grid is purely presentational.
	 */
	onToggleOwned?: (cardId: string) => void;
}

/**
 * Presentational grid of card images showing owned (color) and missing
 * (greyscale + reduced opacity) states.  Reused by binder-detail, and
 * later F3/E3.  No virtualization — suitable for binder-sized lists.
 */
export function OwnedMissingGrid({
	cards,
	ownedCardIds,
	mode = "all",
	onToggleOwned,
}: OwnedMissingGridProps) {
	const visible = cards.filter((c) => {
		const owned = ownedCardIds.has(c.id);
		if (mode === "owned") return owned;
		if (mode === "missing") return !owned;
		return true;
	});

	if (visible.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				{mode === "owned"
					? "You don't own any cards in this binder yet."
					: mode === "missing"
						? "You own every card in this binder!"
						: "No cards in this binder."}
			</p>
		);
	}

	return (
		<ul
			className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
			aria-label="Binder card grid"
		>
			{visible.map((card) => {
				const owned = ownedCardIds.has(card.id);
				const src = cardThumbSrc(card);
				const cardInner = (
					<>
						<div className="relative aspect-[2.5/3.5]">
							<img
								src={src}
								alt={card.name}
								className={cn(
									"h-full w-full rounded object-cover",
									!owned && "grayscale opacity-60",
								)}
								loading="lazy"
							/>
							{/* Owned / missing indicator dot */}
							<span
								role="img"
								aria-label={owned ? "owned" : "missing"}
								className={cn(
									"absolute bottom-1 right-1 h-3 w-3 rounded-full border border-white/80",
									owned ? "bg-[var(--success)]" : "bg-[var(--faint)]",
								)}
							/>
						</div>
						<p className="truncate text-center text-xs text-muted-foreground leading-tight">
							{card.name}
						</p>
					</>
				);
				return (
					<li key={card.id} className="flex flex-col gap-1">
						{onToggleOwned ? (
							<button
								type="button"
								aria-label={`${owned ? "Remove" : "Add"} ${card.name}`}
								className="flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity motion-reduce:transition-none text-left w-full"
								onClick={() => onToggleOwned(card.id)}
							>
								{cardInner}
							</button>
						) : (
							cardInner
						)}
					</li>
				);
			})}
		</ul>
	);
}
