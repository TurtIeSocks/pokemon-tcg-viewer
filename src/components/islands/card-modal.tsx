import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../server/card-mappers";
import { useStore } from "../../store";
import { CardMeta } from "../card/card-detail";
import { toHoloCardData } from "../card/to-holo";
import { HoloCard } from "../holo-card";
import { CardPrices } from "./card-prices";
import { type CrossLink, CrossLinkOverlay } from "./cross-link-overlay";

export function CardModal({
	card,
	crossLinks,
	onClose,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
}) {
	const holo = toHoloCardData(card);
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex flex-col items-center gap-3">
						<div className="w-full max-w-[320px]">
							<ClientOnly
								fallback={
									<img
										src={card.imageUrl}
										alt={card.name}
										className="w-full rounded-xl"
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
						</div>
						<CollectionButton card={holo} />
					</div>
					<div className="min-w-0 space-y-5">
						<CardMeta card={card} />
						<CardPrices card={card} />
						<CrossLinkOverlay links={crossLinks} />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function CollectionButton({
	card,
}: {
	card: ReturnType<typeof toHoloCardData>;
}) {
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);
	return (
		<Button
			className="w-full max-w-[320px]"
			variant={owned ? "default" : "outline"}
			onClick={() => (owned ? remove(card.id) : add(card))}
		>
			{owned ? "✓ In collection — remove" : "+ Add to collection"}
		</Button>
	);
}
