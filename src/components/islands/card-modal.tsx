import { ClientOnly } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../server/card-mappers";
import { CardMeta } from "../card/card-detail";
import { HoloCard } from "../holo-card";

/**
 * Dialog-over-grid presentation of a card. The static CardMeta is the SSR/
 * crawlable fallback; the interactive HoloCard upgrades on the client. Closing
 * navigates back to the set grid (passed by the route).
 */
export function CardModal({ card, onClose }: { card: FocusCardData; onClose: () => void }) {
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-3xl">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="grid gap-6 md:grid-cols-[auto_1fr]">
					<ClientOnly
						fallback={
							<img
								src={card.imageUrl}
								alt={card.name}
								className="w-full max-w-[320px] rounded-xl"
							/>
						}
					>
						<HoloCard
							imageUrl={card.imageUrl}
							name={card.name}
							rarity={card.rarity}
							subtypes={card.subtypes}
							supertype={card.supertype}
							setId={card.setId}
							series={card.setSeries}
							cardNumber={card.cardNumber}
							size="focus"
						/>
					</ClientOnly>
					<CardMeta card={card} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
