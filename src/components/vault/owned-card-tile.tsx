import { Link } from "@tanstack/react-router";
import { cardManageLinkPropsFor } from "../../lib/card-route";
import { isReversePrinting } from "../../lib/card-variants";
import { faceLanguageFor } from "../../lib/languages";
import { m } from "../../paraglide/messages";
import { useCardRouteParamsForRegion } from "../../store/corpus/corpus-runtime";
import { useDisplayLanguage } from "../../store/corpus/i18n-active-hooks";
import type { CardRow } from "../../store/userland/card-rows";
import { holoCardProps } from "../holo-card";
import { CardMiniNav } from "../holo-card/card-mini-nav";
import { HoloCardIsland } from "../islands/holo-card-island";

/** Props for {@link OwnedCardTile}. */
interface OwnedCardTileProps {
	/** Aggregated row containing the card metadata and copy count. */
	row: CardRow;
}

/**
 * Clickable card tile that navigates to the card modal on the manage face.
 * Shows a copy-count badge when count > 1.
 */
export function OwnedCardTile({ row }: OwnedCardTileProps) {
	const displayLanguage = useDisplayLanguage();
	// A Japanese-lineage card has no English face (and vice versa) -- resolve
	// the link's language by the card's region, not blindly by the active
	// display language, so an owned asia card opens in its own face.
	const linkLanguage = faceLanguageFor(row.card, displayLanguage);
	// Resolve the route via the CARD's own region (not the active browse
	// region's slug index): an owned card can belong to a region the viewer
	// isn't currently browsing (e.g. an owned asia card while activeRegion is
	// "west"), and the active-region slug index would never resolve it, always
	// leaving the tile a non-interactive div. See cardRouteParamsForRegion.
	const p = useCardRouteParamsForRegion(row.card, row.card.region ?? "west");

	const inner = (
		<>
			{/* The tile shows the PRIMARY stack's printing — a collection of
			    reverse holos renders as the reverse holos you actually own. Always
			    owned (full color, owned glow); the mini-nav owned button reads as
			    "manage" and opens the stack manager, matching the tile's own link. */}
			<HoloCardIsland
				{...holoCardProps(row.card)}
				owned
				reverse={isReversePrinting(row.primary)}
				miniNav={<CardMiniNav card={row.card} />}
			/>
			{row.count > 1 && (
				<span className="absolute bottom-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-(--r-pill) bg-(--success) px-1.5 text-xs font-bold text-(--primary-ink)">
					×{row.count}
				</span>
			)}
		</>
	);

	if (p) {
		return (
			<Link
				{...cardManageLinkPropsFor(p, linkLanguage)}
				className="relative block w-full text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary-wash)"
				aria-label={m.vault_manage_stacks_of({ name: row.card.name })}
			>
				{inner}
			</Link>
		);
	}

	// Corpus not yet loaded — render a non-interactive wrapper so the tile
	// still displays; will become a link once the slug index resolves.
	return <div className="relative w-full text-left">{inner}</div>;
}
