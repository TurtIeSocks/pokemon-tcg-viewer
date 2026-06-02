import { useState } from "react";
import type { CardRow } from "../../store/userland/card-rows";
import { CopyManager } from "../collection/copy-manager";
import { HoloCardIsland } from "../islands/holo-card-island";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../ui/dialog";

interface OwnedCardTileProps {
	row: CardRow;
}

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
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogTitle>{row.card.name} — Copies</DialogTitle>
					<DialogDescription>
						Add, edit, or remove individual copies you own.
					</DialogDescription>
					<CopyManager cardId={row.card.id} variants={row.card.variants} />
				</DialogContent>
			</Dialog>
		</>
	);
}
