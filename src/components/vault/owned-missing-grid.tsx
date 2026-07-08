"use client";

import { Link } from "@tanstack/react-router";
import { cardModalLinkPropsFor } from "../../lib/card-route";
import { faceLanguageFor } from "../../lib/languages";
import { useCardRouteParamsForRegion } from "../../store/corpus/corpus-runtime";
import { useDisplayLanguage } from "../../store/corpus/i18n-active-hooks";
import { type HoloCardData, holoCardProps } from "../holo-card";
import { CardMiniNav } from "../holo-card/card-mini-nav";
import { HoloCardIsland } from "../islands/holo-card-island";

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
}

/**
 * One cell of the owned/missing grid. Renders the unified interactive HoloCard:
 * grayscale when unowned (driven by `owned`), the shared glass mini-nav (owned
 * toggle / expand / binder), and a whole-card link to the detail modal. The
 * mini-nav's owned button is the single source of truth for add/remove — it
 * supersedes the old per-grid `onToggleOwned` wiring, so binder progress and set
 * completion update through the same store write every other card grid uses.
 *
 * Resolves the modal link via the card's OWN region (not the active browse
 * region) so a cross-region member — e.g. an asia card in a binder while
 * browsing the west catalog — is still clickable once that region has loaded.
 */
function OwnedMissingCard({
	card,
	owned,
}: {
	card: HoloCardData;
	owned: boolean;
}) {
	const displayLanguage = useDisplayLanguage();
	// A Japanese-lineage card has no English face (and vice versa) — resolve the
	// link's language by the card's region, not the active display language.
	const linkLanguage = faceLanguageFor(card, displayLanguage);
	const p = useCardRouteParamsForRegion(card, card.region ?? "west");

	const inner = (
		<HoloCardIsland
			{...holoCardProps(card)}
			owned={owned}
			dimUnowned
			miniNav={<CardMiniNav card={card} />}
		/>
	);

	if (p) {
		return (
			<li>
				<Link
					{...cardModalLinkPropsFor(p, linkLanguage)}
					className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary-wash)"
				>
					{inner}
				</Link>
			</li>
		);
	}

	// Corpus/region not yet loaded — render a non-interactive wrapper so the tile
	// still displays; the mini-nav's expand button remains as a navigation path.
	return <li>{inner}</li>;
}

/**
 * Grid of interactive cards showing owned (full color) and missing (grayscale)
 * states. Every card carries the unified glass mini-nav, so binder-detail, the
 * shared-binder snapshot, and the vault set page all behave like the browse grid.
 * No virtualization — suitable for binder- and set-sized lists.
 */
export function OwnedMissingGrid({
	cards,
	ownedCardIds,
	mode = "all",
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
			className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			aria-label="Card grid"
		>
			{visible.map((card) => (
				<OwnedMissingCard
					key={card.id}
					card={card}
					owned={ownedCardIds.has(card.id)}
				/>
			))}
		</ul>
	);
}
