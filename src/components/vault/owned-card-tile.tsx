import { useState } from "react";
import type { CardRow } from "../../store/userland/card-rows";
import { CopyManagerDialog } from "../collection/copy-manager-dialog";
import { HoloCardIsland } from "../islands/holo-card-island";

/** Props for {@link OwnedCardTile}. */
interface OwnedCardTileProps {
	/** Aggregated row containing the card metadata and copy count. */
	row: CardRow;
}

/** Clickable card tile that opens the CopyManager dialog; shows a copy-count badge when > 1. */
export function OwnedCardTile({ row }: OwnedCardTileProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				className="relative w-full text-left"
				onClick={() => setOpen(true)}
				aria-label={`Manage copies of ${row.card.name}`}
			>
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
					<span className="absolute bottom-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-1.5 text-xs font-bold text-white">
						×{row.count}
					</span>
				)}
			</button>
			<CopyManagerDialog
				cardId={row.card.id}
				variants={row.card.variants}
				name={row.card.name}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}
