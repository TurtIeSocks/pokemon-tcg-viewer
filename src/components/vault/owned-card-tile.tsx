import { Link } from "@tanstack/react-router";
import { cardManageLinkPropsFor, cardRouteParams } from "../../lib/card-route";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import type { CardRow } from "../../store/userland/card-rows";
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
	const slugIndex = useSlugIndex();
	const p = slugIndex ? cardRouteParams(slugIndex, row.card) : null;

	const inner = (
		<>
			<HoloCardIsland
				imageUrl={row.card.imageUrl}
				imageUrlSmall={row.card.imageUrlSmall}
				name={row.card.name}
				rarity={row.card.rarity}
				subtypes={row.card.subtypes}
				supertype={row.card.supertype}
				setId={row.card.setId}
				series={row.card.setSeries}
				variants={row.card.variants}
				cardNumber={row.card.cardNumber}
			/>
			{row.count > 1 && (
				<span className="absolute bottom-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-[var(--r-pill)] bg-[var(--success)] px-1.5 text-xs font-bold text-[var(--primary-ink)]">
					×{row.count}
				</span>
			)}
		</>
	);

	if (p) {
		return (
			<Link
				{...cardManageLinkPropsFor(p)}
				className="relative block w-full text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-wash)]"
				aria-label={`Manage copies of ${row.card.name}`}
			>
				{inner}
			</Link>
		);
	}

	// Corpus not yet loaded — render a non-interactive wrapper so the tile
	// still displays; will become a link once the slug index resolves.
	return <div className="relative w-full text-left">{inner}</div>;
}
