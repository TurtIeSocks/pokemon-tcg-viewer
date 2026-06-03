import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../server/card-mappers";
import { CardDetail } from "../card/card-detail";
import { CardCollectionManager } from "../collection/card-collection-manager";
import type { CrossLink } from "./cross-links";

interface CardModalProps {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
	/**
	 * When true, renders the manage (collection) face instead of card detail.
	 * Both faces pop one history entry on back/close via `onClose`.
	 */
	manage?: boolean;
}

/** In-app card overlay: the shared CardDetail (or manage) body inside a Dialog. */
export function CardModal({
	card,
	crossLinks,
	onClose,
	manage,
}: CardModalProps) {
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				className="max-h-[90vh] max-w-4xl overflow-y-auto border-white/10 bg-[#0d0d0f] p-0 sm:max-w-4xl"
			>
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				{manage ? (
					<CardCollectionManager
						cardId={card.id}
						cardName={card.name}
						setName={card.setName}
						cardNumber={card.cardNumber}
						imageUrl={card.imageUrl}
						onBack={onClose}
					/>
				) : (
					<CardDetail card={card} crossLinks={crossLinks} />
				)}
			</DialogContent>
		</Dialog>
	);
}
